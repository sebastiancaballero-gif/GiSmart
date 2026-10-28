import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import { normalizarHilos } from "@/lib/map/hilos-cable"
import { nombreDeCubierta } from "@/lib/map/nombre-cubierta"
import {
  COLUMNAS_DIVISOR_TRAZA,
  TABLAS_TRAZA,
  armarTrazas,
  esTipoTraza,
  type DivisorDeTraza,
  type FilaDeTrazaBase,
} from "@/lib/map/traza-hilos"
import { UUID, clienteSupabase, detalleSoloEnDesarrollo, faltaConfiguracion, mensajeDeFuncion } from "@/lib/supabase-servidor"

/**
 * La traza de los hilos de un cable, para Gestión de hilos:
 * `GET /api/cables/{id}/trazas?tipo=FEEDER` (o `DISTRIBUCION`).
 *
 * Los hilos salen de `tab_fiber.fn_get_json_hilos_cable` (los mismos de la
 * grilla). Su traza, de las tablas que lee `tab_fiber.fn_get_json_hilos` (que
 * falla en la base): las trazas que pasan por esos hilos y sus atributos, más
 * los divisores, puertos y cubiertas con que se completa lo que llega sin dato
 * (ver `armarTrazas` en `lib/map/traza-hilos.ts`).
 */

/** Cuántos UUID van en una consulta: van en la URL. */
const IDS_POR_CONSULTA = 100

const sinRepetir = (lista: (string | null | undefined)[]) => [...new Set(lista.filter((v): v is string => !!v).map((v) => v.toLowerCase()))]

type Respuesta = { data: unknown; error: { code?: string; message: string } | null }

/** Las filas de una consulta hecha por lotes de UUID; si una falla, lanza el error con el nombre de la tabla. */
async function porLotes<T>(tabla: string, ids: string[], consulta: (lote: string[]) => PromiseLike<Respuesta>): Promise<T[]> {
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) lotes.push(ids.slice(i, i + IDS_POR_CONSULTA))
  const respuestas = await Promise.all(lotes.map(consulta))
  const filas: T[] = []
  for (const { data, error } of respuestas) {
    if (error) throw new Error(`${tabla} → ${error.code ? `${error.code}: ` : ""}${error.message}`)
    filas.push(...((data ?? []) as T[]))
  }
  return filas
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ message: "El identificador del cable no es válido." }, { status: 400 })
  const tipo = new URL(request.url).searchParams.get("tipo")?.toUpperCase()
  if (!esTipoTraza(tipo)) return NextResponse.json({ message: "El tipo de traza debe ser FEEDER o DISTRIBUCION." }, { status: 400 })

  const tab = clienteSupabase("tab_fiber")
  const geo = clienteSupabase("geo_fiber")
  if (!tab || !geo) return faltaConfiguracion()
  const { trazas: tablaTrazas, atributos: tablaAtributos, columnas } = TABLAS_TRAZA[tipo]

  try {
    const lista = await tab.rpc("fn_get_json_hilos_cable", { p_id_cable: id })
    if (lista.error) {
      const { code, message } = lista.error
      console.error(`[trazas ${id}] fn_get_json_hilos_cable: ${code} ${message}`)
      return NextResponse.json(
        {
          message: mensajeDeFuncion(code, {
            nombre: "hilos del cable",
            esquemaPermiso: "tab_fiber",
            porDefecto: "No se pudieron obtener los hilos de este cable.",
          }),
          funcion: "fn_get_json_hilos_cable",
          ...detalleSoloEnDesarrollo(`${code}: ${message}`),
        },
        { status: 502 },
      )
    }
    const hilos = normalizarHilos(lista.data).flatMap((h) => (h.uuid ? [h.uuid] : []))

    // Las trazas que pasan por algún hilo del cable (una traza recorre varios cables).
    const leidas = await porLotes<FilaDeTrazaBase>(`tab_fiber.${tablaTrazas}`, hilos, (lote) =>
      tab.from(tablaTrazas).select(columnas).overlaps("path_hilos", lote),
    )
    const trazas = [...new Map(leidas.map((t) => [t.id, t])).values()]
    const puertosDeInicio = sinRepetir(trazas.map((t) => t.id_puerto_inicio))
    const idsDivisores = sinRepetir(trazas.map((t) => (tipo === "FEEDER" ? t.id_divisor_fin : t.id_divisor_inicio)))

    const [atributos, divisores, puertos] = await Promise.all([
      // Enteras: un campo que agreguen aparece solo en la grilla.
      porLotes<Record<string, unknown>>(`tab_fiber.${tablaAtributos}`, puertosDeInicio, (lote) =>
        tab.from(tablaAtributos).select("*").in("id_puerto_ini", lote),
      ),
      porLotes<DivisorDeTraza>("tab_fiber.divisor_optico", idsDivisores, (lote) =>
        tab.from("divisor_optico").select(COLUMNAS_DIVISOR_TRAZA).in("id", lote),
      ),
      // El número del puerto del divisor: para la salida de inicio (solo distribución).
      tipo === "DISTRIBUCION"
        ? porLotes<{ id: string; numero_puerto: number | null }>("tab_fiber.puerto_equipo", puertosDeInicio, (lote) =>
            tab.from("puerto_equipo").select("id, numero_puerto").in("id", lote),
          )
        : Promise.resolve([]),
    ])

    const idsCubiertas = sinRepetir(divisores.map((d) => d.id_cubierta_ubica))
    const [cubiertas, hermanos] = await Promise.all([
      // Enteras: el nombre ha cambiado de columna varias veces (ver nombreDeCubierta).
      porLotes<Record<string, unknown>>("geo_fiber.cubierta_empalme", idsCubiertas, (lote) =>
        geo.from("cubierta_empalme").select("*").in("id", lote),
      ),
      tipo === "DISTRIBUCION"
        ? porLotes<DivisorDeTraza>("tab_fiber.divisor_optico", idsCubiertas, (lote) =>
            tab.from("divisor_optico").select(COLUMNAS_DIVISOR_TRAZA).in("id_cubierta_ubica", lote),
          )
        : Promise.resolve([]),
    ])

    const divisoresDeLaCubierta = new Map<string, DivisorDeTraza[]>()
    for (const d of hermanos) {
      const c = d.id_cubierta_ubica?.toLowerCase()
      if (c) divisoresDeLaCubierta.set(c, [...(divisoresDeLaCubierta.get(c) ?? []), d])
    }

    return NextResponse.json({
      tipo,
      hilos: armarTrazas({
        tipo,
        hilos,
        trazas,
        atributos: new Map(atributos.map((a) => [String(a.id_puerto_ini).toLowerCase(), a])),
        divisores: new Map(divisores.map((d) => [d.id.toLowerCase(), d])),
        hermanos: divisoresDeLaCubierta,
        puertos: new Map(puertos.map((p) => [p.id.toLowerCase(), p.numero_puerto])),
        nombres: new Map(cubiertas.map((c) => [String(c.id).toLowerCase(), nombreDeCubierta(c)])),
      }),
    })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error(`[trazas ${id} ${tipo}] ${detalle}`)
    return NextResponse.json(
      { message: "No se pudo leer la traza de los hilos de este cable.", ...detalleSoloEnDesarrollo(detalle) },
      { status: 502 },
    )
  }
}
