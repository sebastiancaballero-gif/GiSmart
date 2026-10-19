import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import {
  armarDistribucion,
  idsParaDistribucion,
  type CubiertaDistribucion,
  type DivisorDistribucion,
  type FilaDeCacheDistribucion,
  type PuertoDistribucion,
} from "@/lib/map/distribucion-cable"
import { UUID, clienteSupabase, detalleSoloEnDesarrollo, faltaConfiguracion } from "@/lib/supabase-servidor"

/**
 * «Sección distribución» de un cable, para Gestión de hilos: de cada hilo, la
 * cubierta, el divisor, el puerto y la salida de donde sale, y a qué equipo
 * llega. Sale de la caché del trace (`tab_fiber.element_connection`); el armado
 * está en `lib/map/distribucion-cable.ts`.
 *
 * Son cuatro viajes a la base: los hilos del cable, su caché (los dos
 * sentidos), los puertos y divisores de los pasos que importan, y las
 * cubiertas con todos sus divisores (para numerar las salidas).
 */

/** Cuántos UUID van en una consulta: van en la URL, y PostgREST no devuelve más de 1000 filas. */
const IDS_POR_CONSULTA = 100

const sinRepetir = (lista: (string | null | undefined)[]) => [...new Set(lista.filter((v): v is string => !!v))]

/** Las filas con esos valores en `columna`, por lotes; si una consulta falla, lanza el error con el nombre de la tabla. */
async function filasPorId<T>(esquema: string, tabla: string, columnas: string, ids: string[], columna = "id"): Promise<T[]> {
  if (ids.length === 0) return []
  const cliente = clienteSupabase(esquema)
  if (!cliente) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.")
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) lotes.push(ids.slice(i, i + IDS_POR_CONSULTA))
  const respuestas = await Promise.all(lotes.map((lote) => cliente.from(tabla).select(columnas).in(columna, lote)))
  const filas: T[] = []
  for (const { data, error } of respuestas) {
    if (error) throw new Error(`${esquema}.${tabla} → ${error.code}: ${error.message}`)
    filas.push(...((data ?? []) as T[]))
  }
  return filas
}

const porId = <T extends { id: string }>(filas: T[]) => new Map(filas.map((f) => [f.id, f]))

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ message: "El identificador del cable no es válido." }, { status: 400 })
  if (!clienteSupabase("tab_fiber")) return faltaConfiguracion()

  try {
    const hilos = sinRepetir(
      (await filasPorId<{ id: string }>("tab_fiber", "hilo_cable", "id", [id], "id_cable")).map((h) => h.id),
    )
    const cache = await filasPorId<FilaDeCacheDistribucion>(
      "tab_fiber",
      "element_connection",
      "id_origen, direccion, path_secuencia, fecha_calculo",
      hilos,
      "id_origen",
    )

    const { puertos: idsPuertos, contenedores } = idsParaDistribucion(cache)
    const [puertos, divisoresDePasos] = await Promise.all([
      filasPorId<PuertoDistribucion>("tab_fiber", "puerto_equipo", "id, numero_puerto, id_equipo_pert, tipo_equipo_pert", idsPuertos),
      // El contenedor de un paso puede ser un divisor (hacia la fuente) o una cubierta (hacia abajo).
      filasPorId<DivisorDistribucion>("tab_fiber", "divisor_optico", "id, num_divisor, modelo_divisor, id_cubierta_ubica", contenedores),
    ])
    const otrosDivisores = sinRepetir(puertos.map((p) => p.id_equipo_pert)).filter((d) => !divisoresDePasos.some((x) => x.id === d))
    const divisores = [
      ...divisoresDePasos,
      ...(await filasPorId<DivisorDistribucion>("tab_fiber", "divisor_optico", "id, num_divisor, modelo_divisor, id_cubierta_ubica", otrosDivisores)),
    ]

    const idsCubiertas = sinRepetir([...divisores.map((d) => d.id_cubierta_ubica), ...contenedores])
    const [cubiertas, hermanos] = await Promise.all([
      filasPorId<CubiertaDistribucion>("geo_fiber", "cubierta_empalme", "id, etiqueta, funcion_cub", idsCubiertas),
      filasPorId<DivisorDistribucion>(
        "tab_fiber",
        "divisor_optico",
        "id, num_divisor, modelo_divisor, id_cubierta_ubica",
        sinRepetir(divisores.map((d) => d.id_cubierta_ubica)),
        "id_cubierta_ubica",
      ),
    ])
    const divisoresDeLaCubierta = new Map<string, DivisorDistribucion[]>()
    for (const d of hermanos) {
      if (!d.id_cubierta_ubica) continue
      divisoresDeLaCubierta.set(d.id_cubierta_ubica, [...(divisoresDeLaCubierta.get(d.id_cubierta_ubica) ?? []), d])
    }

    return NextResponse.json({
      hilos: armarDistribucion({
        hilos,
        cache,
        puertos: porId(puertos),
        divisores: porId([...divisores, ...hermanos]),
        cubiertas: porId(cubiertas),
        divisoresDeLaCubierta,
      }),
    })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error(`[distribucion ${id}] ${detalle}`)
    return NextResponse.json(
      { message: "No se pudo leer la sección distribución de este cable.", ...detalleSoloEnDesarrollo(detalle) },
      { status: 502 },
    )
  }
}
