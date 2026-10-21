import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import {
  MAX_DIVISORES_EN_SERIE,
  armarDistribucion,
  entradasPorLeer,
  idsParaDistribucion,
  type CubiertaDistribucion,
  type DivisorDistribucion,
  type EquipoDistribucion,
  type FilaDeCacheDistribucion,
  type PuertoDistribucion,
  type TarjetaDistribucion,
} from "@/lib/map/distribucion-cable"
import { familiaDePuerto } from "@/lib/map/trace"
import { UUID, clienteSupabase, detalleSoloEnDesarrollo, faltaConfiguracion } from "@/lib/supabase-servidor"
import { nombreDeCubierta } from "@/lib/map/nombre-cubierta"
import { tarjetaDeFila } from "@/lib/map/tarjeta-bandeja"

/**
 * El recorrido de los hilos de un cable, para Gestión de hilos: de cada hilo,
 * la cubierta, el divisor, el puerto y la salida de donde sale («Sección
 * distribución»), el ODF y la OLT de donde le viene la señal («Sección
 * feeder») y a qué equipo llega. Sale de la caché del trace
 * (`tab_fiber.element_connection`); el armado está en
 * `lib/map/distribucion-cable.ts`.
 *
 * Los viajes a la base: los hilos del cable (junto con las entradas de los
 * divisores, las tarjetas y bandejas y los equipos, que son pocos y se leen
 * enteros), su caché (los dos sentidos), la caché desde la entrada de cada
 * divisor donde termina un hilo hacia la fuente (uno por divisor en serie,
 * casi siempre uno), los puertos y divisores de los pasos que importan, y las
 * cubiertas con todos sus divisores (para numerar las salidas).
 */

/** Cuántos UUID van en una consulta: van en la URL, y PostgREST no devuelve más de 1000 filas. */
const IDS_POR_CONSULTA = 100

const COLUMNAS_CACHE = "id_origen, direccion, path_secuencia, fecha_calculo"
const COLUMNAS_DIVISOR = "id, num_divisor, modelo_divisor, id_cubierta_ubica"

const sinRepetir = (lista: (string | null | undefined)[]) => [...new Set(lista.filter((v): v is string => !!v))]

/**
 * Las filas con esos valores en `columna`, por lotes, y con los filtros de
 * igualdad que se pidan; si una consulta falla, lanza el error con el nombre de
 * la tabla.
 */
async function filasPorId<T>(
  esquema: string,
  tabla: string,
  columnas: string,
  ids: string[],
  columna = "id",
  iguales: [string, string][] = [],
): Promise<T[]> {
  if (ids.length === 0) return []
  const cliente = clienteSupabase(esquema)
  if (!cliente) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.")
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) lotes.push(ids.slice(i, i + IDS_POR_CONSULTA))
  const respuestas = await Promise.all(
    lotes.map((lote) => {
      let consulta = cliente.from(tabla).select(columnas).in(columna, lote)
      for (const [c, v] of iguales) consulta = consulta.eq(c, v)
      return consulta
    }),
  )
  const filas: T[] = []
  for (const { data, error } of respuestas) {
    if (error) throw new Error(`${esquema}.${tabla} → ${error.code}: ${error.message}`)
    filas.push(...((data ?? []) as T[]))
  }
  return filas
}

/** Todas las filas de una tabla chica (de a 1000, el tope de la API), con filtros de igualdad. */
async function todas<T>(esquema: string, tabla: string, columnas: string, iguales: [string, string][] = []): Promise<T[]> {
  const cliente = clienteSupabase(esquema)
  if (!cliente) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.")
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    let consulta = cliente.from(tabla).select(columnas).order("id").range(desde, desde + 999)
    for (const [c, v] of iguales) consulta = consulta.eq(c, v)
    const { data, error } = await consulta
    if (error) throw new Error(`${esquema}.${tabla} → ${error.code}: ${error.message}`)
    filas.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return filas
  }
}

const porId = <T extends { id: string }>(filas: T[]) => new Map(filas.map((f) => [f.id, f]))

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ message: "El identificador del cable no es válido." }, { status: 400 })
  if (!clienteSupabase("tab_fiber")) return faltaConfiguracion()

  try {
    const [filasDeHilos, puertosDeEntrada, tarjetas, equipos] = await Promise.all([
      filasPorId<{ id: string }>("tab_fiber", "hilo_cable", "id", [id], "id_cable"),
      // La entrada de cada divisor (DIV_N1 y DIV_N2: por familia, como el trace).
      todas<{ id: string; id_equipo_pert: string | null; tipo_equipo_pert: string | null }>(
        "tab_fiber",
        "puerto_equipo",
        "id, id_equipo_pert, tipo_equipo_pert",
        [["dir_principal_senhal", "E"]],
      ),
      // Entera: sus columnas pasaron a llamarse id_equipo_pert y tipo_equipo_pert (ver tarjetaDeFila).
      todas<Record<string, unknown>>("tab_fiber", "tarjeta_bandeja_eqp", "*").then((filas): TarjetaDistribucion[] => filas.map(tarjetaDeFila)),
      todas<EquipoDistribucion>("tab_fiber", "equipo_red", "id, codigo, tipo_equipo"),
    ])
    const hilos = sinRepetir(filasDeHilos.map((h) => h.id))
    const entradas = new Map(
      puertosDeEntrada.flatMap((p) => (p.id_equipo_pert && familiaDePuerto(p.tipo_equipo_pert) === "DIV" ? [[p.id_equipo_pert, p.id] as const] : [])),
    )

    const cache = await filasPorId<FilaDeCacheDistribucion>("tab_fiber", "element_connection", COLUMNAS_CACHE, hilos, "id_origen")
    // Hacia la fuente, desde la entrada de cada divisor donde termina un hilo:
    // así se llega al ODF y a la OLT. Una vuelta por divisor en serie.
    const pedidas = new Set<string>()
    for (let vuelta = 0; vuelta < MAX_DIVISORES_EN_SERIE; vuelta++) {
      const faltan = entradasPorLeer(hilos, cache, entradas).filter((e) => !pedidas.has(e))
      if (faltan.length === 0) break
      for (const e of faltan) pedidas.add(e)
      cache.push(
        ...(await filasPorId<FilaDeCacheDistribucion>("tab_fiber", "element_connection", COLUMNAS_CACHE, faltan, "id_origen", [
          ["direccion", "UPSTREAM"],
        ])),
      )
    }

    const { puertos: idsPuertos, contenedores } = idsParaDistribucion(cache)
    const [puertos, divisoresDePasos] = await Promise.all([
      filasPorId<PuertoDistribucion>("tab_fiber", "puerto_equipo", "id, numero_puerto, nombre, id_equipo_pert, tipo_equipo_pert", idsPuertos),
      // El contenedor de un paso puede ser un divisor (hacia la fuente) o una cubierta (hacia abajo).
      filasPorId<DivisorDistribucion>("tab_fiber", "divisor_optico", COLUMNAS_DIVISOR, contenedores),
    ])
    const otrosDivisores = sinRepetir(puertos.map((p) => p.id_equipo_pert)).filter(
      (d) => !divisoresDePasos.some((x) => x.id === d) && !tarjetas.some((t) => t.id === d),
    )
    const divisores = [...divisoresDePasos, ...(await filasPorId<DivisorDistribucion>("tab_fiber", "divisor_optico", COLUMNAS_DIVISOR, otrosDivisores))]

    const idsCubiertas = sinRepetir([...divisores.map((d) => d.id_cubierta_ubica), ...contenedores])
    const [cubiertas, hermanos] = await Promise.all([
      // Todas las columnas: el nombre pasó de `etiqueta` a `salidas_div1` y
      // pedirlo por su nombre rompía esta pestaña (ver nombreDeCubierta).
      filasPorId<{ id: string; funcion_cub: string | null } & Record<string, unknown>>(
        "geo_fiber",
        "cubierta_empalme",
        "*",
        idsCubiertas,
      ).then((filas): CubiertaDistribucion[] =>
        filas.map((c) => ({ id: c.id, etiqueta: nombreDeCubierta(c), funcion_cub: c.funcion_cub })),
      ),
      filasPorId<DivisorDistribucion>(
        "tab_fiber",
        "divisor_optico",
        COLUMNAS_DIVISOR,
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
        entradas,
        tarjetas: porId(tarjetas),
        equipos: porId(equipos),
      }),
    })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error(`[distribucion ${id}] ${detalle}`)
    return NextResponse.json(
      { message: "No se pudo leer el recorrido de los hilos de este cable.", ...detalleSoloEnDesarrollo(detalle) },
      { status: 502 },
    )
  }
}
