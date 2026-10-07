import { fetchConSesion } from "@/lib/auth"

/**
 * Recorrido del trace (ribbon: Red de fibra → Trace) con la función
 * `tab_fiber.fn_trace_conectividad_fina(p_id_origen, p_direccion, p_usuario_id)`.
 *
 * El origen es el UUID de un puerto o de un hilo. `DOWNSTREAM` recorre hacia
 * el usuario y `UPSTREAM` hacia la OLT. La función devuelve los pasos en orden:
 * en qué equipo ocurre cada uno (OLT, ODF o cubierta), qué entra y qué sale
 * (puerto o hilo), el tipo de conexión y la atenuación.
 *
 * Cada paso trae `geojson_path`, pero hoy llega vacío. Para pintar el recorrido
 * la ruta busca el cable de cada hilo del recorrido (`tab_fiber.hilo_cable`):
 * esos cables son justo los que unen una cubierta con la siguiente. Si algún
 * día la función manda la geometría, también se pinta.
 */

export type DireccionTrace = "UPSTREAM" | "DOWNSTREAM"
export const DIRECCIONES_TRACE: readonly DireccionTrace[] = ["UPSTREAM", "DOWNSTREAM"]

/** Lo que entra o sale en un paso: un puerto o un hilo. */
export type ExtremoDePaso = { tipo: string | null; id: string | null }

/** Geometría GeoJSON (EPSG:4326) de un tramo, si la función la manda. */
export type GeometriaDeTramo = { type: string; coordinates: unknown }

export type PasoDeTrace = {
  paso: number
  contenedor: { id: string | null; tipo: string | null }
  origen: ExtremoDePaso
  destino: ExtremoDePaso
  conexion: string | null
  atenuacionDb: number | null
  atenuacionAcumulada: number | null
  geometria: GeometriaDeTramo | null
}

export type ResultadoTrace =
  | {
      estado: "ok"
      pasos: PasoDeTrace[]
      /** UUID de los cables por donde va el recorrido, en orden y sin repetir. */
      cables: string[]
    }
  | { estado: "error"; mensaje: string; detalle?: string }

/** Lo que puede tardar la función antes de darla por caída. */
export const ESPERA_MAXIMA_TRACE_MS = 30_000

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

/** `geojson_path` puede llegar como objeto o como texto; lo que no sea una geometría se ignora. */
function geometria(v: unknown): GeometriaDeTramo | null {
  let valor = v
  if (typeof valor === "string") {
    try {
      valor = JSON.parse(valor)
    } catch {
      return null
    }
  }
  if (!valor || typeof valor !== "object") return null
  const g = valor as Record<string, unknown>
  return typeof g.type === "string" && Array.isArray(g.coordinates) ? { type: g.type, coordinates: g.coordinates } : null
}

/** La lista de pasos: sola, o dentro de un objeto (`{ pasos: [...] }`, como la devuelve la ruta). */
function filasDe(datos: unknown): unknown[] {
  if (Array.isArray(datos)) return datos
  if (!datos || typeof datos !== "object") return []
  const objeto = datos as Record<string, unknown>
  for (const clave of ["pasos", "data", "resultado"]) {
    if (Array.isArray(objeto[clave])) return objeto[clave] as unknown[]
  }
  return []
}

/**
 * Lee los pasos tal como los devuelve la función (o como los reenvía la ruta,
 * ya leídos: la segunda lectura no pierde nada). Quedan ordenados por número de
 * paso; una fila sin número no es un paso.
 */
export function normalizarPasos(datos: unknown): PasoDeTrace[] {
  const pasos: PasoDeTrace[] = []
  for (const fila of filasDe(datos)) {
    if (!fila || typeof fila !== "object") continue
    const f = fila as Record<string, unknown>
    const n = numero(f.paso)
    if (n === null) continue
    // Ya leído por la ruta: se respeta tal cual.
    if (f.contenedor && typeof f.contenedor === "object") {
      const ya = f as unknown as PasoDeTrace
      pasos.push({ ...ya, paso: n, geometria: geometria(ya.geometria) })
      continue
    }
    const tipoOrigen = texto(f.tip_elemento_origen) ?? texto(f.tipo_elemento_origen)
    const tipoDestino = texto(f.tip_elemento_destino) ?? texto(f.tipo_elemento_destino)
    pasos.push({
      paso: n,
      contenedor: { id: texto(f.id_contenedor), tipo: texto(f.tipo_contenedor) },
      origen: { tipo: tipoOrigen, id: tipoOrigen === "HILO" ? texto(f.id_hilo_origen) : (texto(f.id_puerto_origen) ?? texto(f.id_hilo_origen)) },
      destino: { tipo: tipoDestino, id: tipoDestino === "HILO" ? texto(f.id_hilo_destino) : (texto(f.id_puerto_destino) ?? texto(f.id_hilo_destino)) },
      conexion: texto(f.tipo_conexion),
      atenuacionDb: numero(f.atenuacion_db),
      atenuacionAcumulada: numero(f.atenuacion_acumulada),
      geometria: geometria(f.geojson_path),
    })
  }
  return pasos.sort((a, b) => a.paso - b.paso)
}

/** Los hilos por los que pasa el recorrido, en orden y sin repetir. */
export function hilosDelRecorrido(pasos: PasoDeTrace[]): string[] {
  const hilos: string[] = []
  for (const p of pasos) {
    for (const extremo of [p.origen, p.destino]) {
      if (extremo.tipo === "HILO" && extremo.id && !hilos.includes(extremo.id)) hilos.push(extremo.id)
    }
  }
  return hilos
}

/** La atenuación total: la acumulada del último paso que la trae. */
export function atenuacionTotal(pasos: PasoDeTrace[]): number | null {
  for (let i = pasos.length - 1; i >= 0; i--) {
    if (pasos[i].atenuacionAcumulada !== null) return pasos[i].atenuacionAcumulada
  }
  return null
}

/** Clasifica lo que responde `POST /api/trace`. */
export function clasificarRespuestaTrace(status: number, cuerpo: unknown): ResultadoTrace {
  if (status < 200 || status >= 300) {
    const { message: mensaje, detalle } = (cuerpo ?? {}) as { message?: unknown; detalle?: unknown }
    return {
      estado: "error",
      mensaje: typeof mensaje === "string" ? mensaje : `No se pudo calcular el recorrido (HTTP ${status}).`,
      ...(typeof detalle === "string" ? { detalle } : {}),
    }
  }
  const cables = (cuerpo as { cables?: unknown } | null)?.cables
  return {
    estado: "ok",
    pasos: normalizarPasos(cuerpo),
    cables: Array.isArray(cables) ? cables.filter((c): c is string => typeof c === "string") : [],
  }
}

/** Pide el recorrido al servidor. Nunca lanza: los fallos vuelven como `estado: "error"`. */
export async function obtenerTrace(
  idOrigen: string,
  direccion: DireccionTrace,
  esperaMaxima = ESPERA_MAXIMA_TRACE_MS,
): Promise<ResultadoTrace> {
  try {
    const res = await fetchConSesion("/api/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: idOrigen, direccion }),
      signal: AbortSignal.timeout(esperaMaxima),
    })
    const cuerpo: unknown = await res.json().catch(() => null)
    return clasificarRespuestaTrace(res.status, cuerpo)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { estado: "error", mensaje: `La base no respondió en ${esperaMaxima / 1000} segundos. Vuelve a intentarlo.` }
    }
    return { estado: "error", mensaje: "Error de red al pedir el recorrido. Revisa la conexión." }
  }
}
