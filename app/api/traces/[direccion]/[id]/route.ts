import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import {
  armarTablaHaciaArriba,
  direccionDeUrl,
  elementosDelRecorrido,
  geometria,
  hilosDelRecorrido,
  normalizarPasos,
  numero,
  type DatosDeElementos,
  type PasoDeTrace,
} from "@/lib/map/trace"
import { UUID, clienteSupabase, detalleSoloEnDesarrollo, faltaConfiguracion } from "@/lib/supabase-servidor"

/** Lo que se le dice a quien usa el mapa cuando la tabla de caché no se puede leer. */
function mensajeDeCache(codigo: string | undefined): string {
  switch (codigo) {
    case "42501":
      return "La base no permite leer la caché del trace: falta un permiso sobre tab_fiber.element_connection."
    case "42P01":
    case "PGRST205":
      return "La tabla de caché del trace (tab_fiber.element_connection) no existe en la base."
    case "42703":
      return "La tabla de caché del trace cambió de columnas. Hay que actualizar la consulta."
    default:
      return "No se pudo leer el recorrido en la caché del trace."
  }
}

type FilaDeHilo = { id: string; id_cable: string | null; numero_hilo: number | null; numero_buffer: number | null }

/** Las filas de una tabla con esos UUID; si la consulta falla, lanza el error con el nombre de la tabla. */
async function filasPorId<T>(esquema: string, tabla: string, columnas: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return []
  const cliente = clienteSupabase(esquema)
  if (!cliente) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.")
  const { data, error } = await cliente.from(tabla).select(columnas).in("id", ids)
  if (error) throw new Error(`${esquema}.${tabla} → ${error.code}: ${error.message}`)
  return (data ?? []) as T[]
}

const sinRepetir = (lista: (string | null | undefined)[]) => [...new Set(lista.filter((v): v is string => !!v))]

/**
 * Lo que hace falta para la tabla del trace hacia arriba: de cada puerto, su
 * divisor (y la cubierta donde está) o su tarjeta o bandeja (y el equipo y la
 * central); de cada hilo, su buffer y su cable. Va por tandas: cada una
 * necesita los UUID que trajo la anterior.
 */
async function datosDeElementos(pasos: PasoDeTrace[], hilos: FilaDeHilo[]): Promise<DatosDeElementos> {
  const puertosIds = elementosDelRecorrido(pasos).flatMap((e) => (e.tipo !== "HILO" && e.id ? [e.id] : []))
  const puertos = await filasPorId<{ id: string; numero_puerto: number | null; nombre: string | null; tipo_equipo_pert: string | null; id_equipo_pert: string | null }>(
    "tab_fiber", "puerto_equipo", "id, numero_puerto, nombre, tipo_equipo_pert, id_equipo_pert", puertosIds,
  )
  const deDivisor = (q: (typeof puertos)[number]) => q.tipo_equipo_pert === "DIV"
  const [cables, tarjetas, divisores] = await Promise.all([
    filasPorId<{ id: string; codigo: string | null; longitud_medida: number | null; longitud_calc: number | null }>(
      "geo_fiber", "cable_fibra", "id, codigo, longitud_medida, longitud_calc", sinRepetir(hilos.map((h) => h.id_cable)),
    ),
    filasPorId<{ id: string; num_slot: number | null; tipo_equipo: string | null; id_equipo: string | null }>(
      "tab_fiber", "tarjeta_bandeja_eqp", "id, num_slot, tipo_equipo, id_equipo", sinRepetir(puertos.filter((q) => !deDivisor(q)).map((q) => q.id_equipo_pert)),
    ),
    filasPorId<{ id: string; num_divisor: number | null; cod_divisor: string | null; id_cubierta_ubica: string | null }>(
      "tab_fiber", "divisor_optico", "id, num_divisor, cod_divisor, id_cubierta_ubica", sinRepetir(puertos.filter(deDivisor).map((q) => q.id_equipo_pert)),
    ),
  ])
  const [equipos, cubiertas] = await Promise.all([
    filasPorId<{ id: string; codigo: string | null; id_cabecera: string | null }>(
      "tab_fiber", "equipo_red", "id, codigo, id_cabecera", sinRepetir(tarjetas.map((x) => x.id_equipo)),
    ),
    filasPorId<{ id: string; etiqueta: string | null; funcion_cub: string | null }>(
      "geo_fiber", "cubierta_empalme", "id, etiqueta, funcion_cub", sinRepetir(divisores.map((d) => d.id_cubierta_ubica)),
    ),
  ])
  const cabeceras = await filasPorId<{ id: string; nombre: string | null }>(
    "geo_infra", "cabecera_central", "id, nombre", sinRepetir(equipos.map((e) => e.id_cabecera)),
  )

  const porId = <T extends { id: string }, R>(filas: T[], convertir: (f: T) => R) =>
    Object.fromEntries(filas.map((f) => [f.id, convertir(f)])) as Record<string, R>
  return {
    hilos: porId(hilos, (h) => ({ numero: numero(h.numero_hilo), buffer: numero(h.numero_buffer), idCable: h.id_cable })),
    cables: porId(cables, (c) => ({ codigo: c.codigo, largoM: numero(c.longitud_medida) ?? numero(c.longitud_calc) })),
    puertos: porId(puertos, (q) => ({ numero: numero(q.numero_puerto), nombre: q.nombre, tipoPert: q.tipo_equipo_pert, idPert: q.id_equipo_pert })),
    tarjetas: porId(tarjetas, (x) => ({ slot: numero(x.num_slot), tipoEquipo: x.tipo_equipo, idEquipo: x.id_equipo })),
    equipos: porId(equipos, (e) => ({ codigo: e.codigo, idCabecera: e.id_cabecera })),
    divisores: porId(divisores, (d) => ({ numero: numero(d.num_divisor), codigo: d.cod_divisor, idCubierta: d.id_cubierta_ubica })),
    cubiertas: porId(cubiertas, (c) => ({ etiqueta: c.etiqueta, funcion: c.funcion_cub })),
    cabeceras: porId(cabeceras, (c) => ({ nombre: c.nombre })),
  }
}

/**
 * Recorrido del trace desde un puerto o un hilo, como lo planteó el ingeniero:
 * `GET /api/traces/downstream/{id}` (hacia el usuario) o
 * `GET /api/traces/upstream/{id}` (hacia la OLT).
 *
 * No calcula nada: lee el recorrido ya calculado en la tabla de caché
 * `tab_fiber.element_connection` (ver lib/map/trace.ts), así no se llama la
 * función del trace cada vez. Devuelve la geometría del recorrido en `geomPath`
 * (la columna `geom_path`, GeoJSON en EPSG:4326), los pasos, el total de pasos,
 * la atenuación total y cuándo se calculó.
 *
 * Mientras `geom_path` llegue vacía devuelve además los cables del recorrido:
 * el cable de cada hilo según `tab_fiber.hilo_cable`, que el mapa resalta.
 *
 * Hacia arriba devuelve también `elementos`: la tabla que pidió el ingeniero
 * (cada puerto e hilo con dónde está y en qué contenedor, y la central). Si
 * sus datos no se pueden leer, el recorrido sale igual y `errorElementos`
 * dice por qué.
 */
export async function GET(request: Request, { params }: { params: Promise<{ direccion: string; id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { direccion: enUrl, id: crudo } = await params
  const direccion = direccionDeUrl(enUrl)
  if (!direccion) {
    return NextResponse.json({ message: "La dirección del trace tiene que ser downstream o upstream." }, { status: 400 })
  }
  let id = ""
  try {
    id = decodeURIComponent(crudo).trim()
  } catch {
    // Un % suelto en la URL: no es un UUID.
  }
  if (!UUID.test(id)) {
    return NextResponse.json({ message: "El origen tiene que ser el UUID de un puerto o de un hilo." }, { status: 400 })
  }

  const cliente = clienteSupabase("tab_fiber")
  if (!cliente) return faltaConfiguracion()

  try {
    // Una fila por origen y sentido; si algún día hubiera dos, vale la más reciente.
    const { data: filas, error } = await cliente
      .from("element_connection")
      .select("id_destino, total_pasos, atenuacion_total_db, path_secuencia, geom_path, fecha_calculo")
      .eq("id_origen", id)
      .eq("direccion", direccion)
      .order("fecha_calculo", { ascending: false })
      .limit(1)
    if (error) {
      console.error(`[element_connection ${id} ${direccion}] ${error.code} ${error.message}`)
      return NextResponse.json(
        {
          message: mensajeDeCache(error.code),
          ...detalleSoloEnDesarrollo(`element_connection → ${error.code}: ${error.message}`),
        },
        { status: 502 },
      )
    }

    const fila = filas?.[0]
    if (!fila) {
      return NextResponse.json({
        encontrado: false,
        geomPath: null,
        pasos: [],
        totalPasos: 0,
        cables: [],
        atenuacionTotal: null,
        calculadoEn: null,
        elementos: null,
        errorElementos: null,
      })
    }

    const pasos = normalizarPasos(fila.path_secuencia)
    const geomPath = geometria(fila.geom_path)
    const cables: string[] = []
    const haciaArriba = direccion === "UPSTREAM"
    // Los hilos hacen falta para pintar (sin la geometría de la tabla, se
    // pintan los cables de los hilos) y para la tabla de hacia arriba.
    const hilos = geomPath && !haciaArriba ? [] : hilosDelRecorrido(pasos)
    let filasDeHilo: FilaDeHilo[] = []
    if (hilos.length > 0) {
      const { data: hilosCable, error: errorHilos } = await cliente
        .from("hilo_cable")
        .select("id, id_cable, numero_hilo, numero_buffer")
        .in("id", hilos)
      if (errorHilos) {
        console.error(`[trace ${id}] hilo_cable: ${errorHilos.code} ${errorHilos.message}`)
        return NextResponse.json(
          {
            message: "Se encontró el recorrido, pero no se pudieron leer los cables de sus hilos para pintarlo.",
            ...detalleSoloEnDesarrollo(`hilo_cable → ${errorHilos.code}: ${errorHilos.message}`),
          },
          { status: 502 },
        )
      }
      filasDeHilo = (hilosCable ?? []) as FilaDeHilo[]
      const cablePorHilo = new Map(filasDeHilo.map((f) => [f.id, f.id_cable]))
      for (const hilo of geomPath ? [] : hilos) {
        const cable = cablePorHilo.get(hilo)
        if (typeof cable === "string" && !cables.includes(cable)) cables.push(cable)
      }
    }

    let elementos = null
    let errorElementos = null
    if (haciaArriba) {
      try {
        elementos = armarTablaHaciaArriba(pasos, await datosDeElementos(pasos, filasDeHilo))
      } catch (e) {
        const detalle = e instanceof Error ? e.message : String(e)
        console.error(`[trace ${id}] tabla de elementos: ${detalle}`)
        errorElementos = {
          message: "Se encontró el recorrido, pero no se pudieron leer los datos de sus elementos para la tabla.",
          ...detalleSoloEnDesarrollo(detalle),
        }
      }
    }

    return NextResponse.json({
      encontrado: true,
      geomPath,
      pasos,
      totalPasos: numero(fila.total_pasos) ?? new Set(pasos.map((p) => p.paso)).size,
      cables,
      atenuacionTotal: numero(fila.atenuacion_total_db),
      calculadoEn: typeof fila.fecha_calculo === "string" ? fila.fecha_calculo : null,
      elementos,
      errorElementos,
    })
  } catch (e) {
    return NextResponse.json(
      {
        message: "No se pudo conectar con Supabase para leer el recorrido.",
        ...detalleSoloEnDesarrollo(e instanceof Error ? e.message : String(e)),
      },
      { status: 502 },
    )
  }
}
