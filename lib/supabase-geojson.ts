import { NextResponse } from "next/server"
import { clienteSupabase, faltaConfiguracion } from "@/lib/supabase-servidor"

/**
 * Vistas que ya se comprobó que no existen, con el momento en que se vio.
 *
 * Sin esto, cada carga de una capa cuya vista falta pagaba primero la consulta
 * fallida —unos 150 ms contra Supabase— y solo después iba a la tabla. Se
 * recuerda un rato para ir directo, pero se olvida sola: así, al recrear la
 * vista, se vuelve a usar sin tener que reiniciar el servidor.
 */
const vistasAusentes = new Map<string, number>()
const MEMORIA_MS = 5 * 60_000

/**
 * PostgREST devuelve como mucho `max_rows` filas por consulta (1000 en este
 * proyecto: `hilo_cable` tiene más de 10 000 y llegan 1000) y corta sin
 * error. Las capas se leen por páginas, con el total que da la base, para que
 * el mapa no dibuje una red incompleta cuando pase de mil cubiertas o cables.
 * Hoy cada capa cabe en la primera página: sigue siendo una sola consulta.
 */
const POR_PAGINA = 1000
/** Tope de seguridad: 200 páginas son 200 000 elementos. */
const MAX_PAGINAS = 200

/**
 * Sirve una capa del mapa como GeoJSON FeatureCollection.
 *
 * Las tres capas (mufas, cables y cabeceras) se leen igual: misma validación de
 * variables de entorno, misma conversión de filas a features y los mismos
 * códigos de error. Esta función concentra ese trabajo para que cada ruta solo
 * declare de dónde lee.
 *
 * Camino normal: la vista `*_geojson`, que ya entrega la geometría convertida
 * (`st_asgeojson(geom)::json`), porque PostgREST devolvería una columna
 * `geometry` de PostGIS en WKB y OpenLayers no sabe leer eso.
 *
 * Camino de respaldo: si la vista no existe, se pide la tabla base con
 * `Accept: application/geo+json` y PostgREST arma el FeatureCollection él
 * mismo. Esto importa porque las vistas se borran junto con su tabla: cada vez
 * que se recreó una tabla, su capa dejó de cargar hasta volver a crear la
 * vista a mano. Con el respaldo, la capa sigue funcionando.
 */
export async function serveGeoJsonView({
  schema,
  view,
  table,
  entidad,
}: {
  schema: string
  view: string
  /** Tabla base, para el respaldo si la vista no está. */
  table: string
  /** Nombre en plural para los mensajes de error, p. ej. "las mufas". */
  entidad: string
}) {
  const supabase = clienteSupabase(schema)
  if (!supabase) return faltaConfiguracion({ features: [] })

  try {
    const clave = `${schema}.${view}`
    const ausenteDesde = vistasAusentes.get(clave)
    if (ausenteDesde !== undefined) {
      if (Date.now() - ausenteDesde < MEMORIA_MS) {
        return await servirDesdeTabla({ schema, view, table, entidad, avisar: false })
      }
      vistasAusentes.delete(clave)
    }

    // Se piden todas las columnas: la vista ya define qué se expone, y repetir
    // la lista acá solo servía para que la ruta se rompiera cada vez que
    // cambiaba el esquema (pasó al renombrarse `est_const` a `tipo_est_const`).
    // Por páginas, ordenadas por `id` para que no se repitan ni se salten filas.
    // `select()` recibe las columnas como string, así que Supabase no puede
    // inferir la forma de la fila: acá se trata como un registro genérico.
    const rows: Record<string, unknown>[] = []
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const desde = pagina * POR_PAGINA
      const { data, error, count } = await supabase
        .from(view)
        .select("*", { count: pagina === 0 ? "exact" : undefined })
        .order("id")
        .range(desde, desde + POR_PAGINA - 1)

      if (error) {
        if (pagina === 0 && esRelacionInexistente(error)) {
          vistasAusentes.set(clave, Date.now())
          return await servirDesdeTabla({ schema, view, table, entidad })
        }
        return fallo({ schema, relacion: view, entidad, error })
      }
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]))
      const total = pagina === 0 ? count : null
      if (!data || data.length === 0 || (total !== null && total !== undefined ? rows.length >= total : data.length < POR_PAGINA)) break
    }

    const features = rows
      .filter((row) => row.geom)
      .map(({ geom, ...properties }) => ({
        type: "Feature" as const,
        geometry: geom,
        properties,
      }))

    return NextResponse.json({ type: "FeatureCollection", features })
  } catch (e) {
    return NextResponse.json(
      {
        message: `No se pudo conectar con Supabase para cargar ${entidad}.`,
        ...(process.env.NODE_ENV === "production" ? {} : { detalle: e instanceof Error ? e.message : String(e) }),
        features: [],
      },
      { status: 502 },
    )
  }
}

/** PostgREST cuando la vista o la tabla no está: 42P01, o PGRST205 por la caché. */
function esRelacionInexistente(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205"
}

/**
 * Respaldo: pide la tabla base y deja que PostgREST arme el GeoJSON.
 *
 * Se usa `fetch` a pelo y no el cliente de Supabase porque hace falta fijar la
 * cabecera `Accept`, que es lo que activa este formato, y el cliente no la
 * expone por consulta.
 */
async function servirDesdeTabla({
  schema,
  view,
  table,
  entidad,
  avisar = true,
}: {
  schema: string
  view: string
  table: string
  entidad: string
  /** Solo la primera vez: repetirlo en cada carga llenaría el registro. */
  avisar?: boolean
}) {
  if (avisar) {
    console.warn(
      `[${schema}.${view}] la vista no existe; se lee ${schema}.${table} directamente. ` +
        `Conviene recrearla (ver docs/base-de-datos.md).`,
    )
  }

  const claveServicio = process.env.SUPABASE_SECRET_KEY as string
  // Por páginas, como la vista: el total sale de `Content-Range` («0-999/1834»).
  const features: unknown[] = []
  let total: number | null = null
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * POR_PAGINA
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=*&order=id`, {
      headers: {
        apikey: claveServicio,
        Authorization: `Bearer ${claveServicio}`,
        "Accept-Profile": schema,
        Accept: "application/geo+json",
        Range: `${desde}-${desde + POR_PAGINA - 1}`,
        ...(pagina === 0 ? { Prefer: "count=exact" } : {}),
      },
      cache: "no-store",
    })

    if (!res.ok) {
      const detalle = await res.text().catch(() => "")
      console.error(`[${schema}.${table}] respaldo GeoJSON: HTTP ${res.status} ${detalle.slice(0, 300)}`)
      return NextResponse.json(
        {
          message:
            `Falta la vista ${schema}.${view} y tampoco se puede leer la tabla ${schema}.${table}. ` +
            `Revisa docs/base-de-datos.md para recrearla.`,
          ...(process.env.NODE_ENV === "production" ? {} : { detalle: `${schema}.${table} → HTTP ${res.status}: ${detalle.slice(0, 300)}` }),
          features: [],
        },
        { status: 502 },
      )
    }

    const coleccion = (await res.json()) as { features?: unknown[] }
    const deEstaPagina = Array.isArray(coleccion.features) ? coleccion.features : []
    features.push(...deEstaPagina)
    if (pagina === 0) {
      const enRango = Number(res.headers.get("content-range")?.split("/")[1])
      total = Number.isFinite(enRango) ? enRango : null
    }
    if (deEstaPagina.length === 0 || (total !== null ? features.length >= total : deEstaPagina.length < POR_PAGINA)) break
  }

  return NextResponse.json({ type: "FeatureCollection", features })
}

function fallo({
  schema,
  relacion,
  entidad,
  error,
}: {
  schema: string
  relacion: string
  entidad: string
  error: { code?: string; message: string }
}) {
  // El detalle técnico de PostgREST viene en inglés y no le dice nada a quien
  // usa el visor: se registra en el servidor y al cliente va un mensaje
  // entendible. Ese detalle solo se devuelve en desarrollo, donde ahorra
  // tiempo al depurar; en producción nombra esquemas, vistas y permisos de la
  // base, y eso no tiene por qué salir del servidor.
  console.error(`[${schema}.${relacion}] ${error.message}`)
  return NextResponse.json(
    {
      message: `No hay datos disponibles de ${entidad} en este momento.`,
      ...(process.env.NODE_ENV === "production" ? {} : { detalle: `${schema}.${relacion} → ${error.code ? `${error.code}: ` : ""}${error.message}` }),
      features: [],
    },
    { status: 502 },
  )
}
