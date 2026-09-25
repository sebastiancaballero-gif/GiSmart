import { fetchConSesion } from "@/lib/auth"

/**
 * Extremos de un cable, para el botón «Cable» (ribbon: Consultas → Red).
 *
 * Mismo reparto que las otras consultas: GISmart manda el UUID del cable, la
 * función `geo_fiber.fn_json_extremos_cable` del equipo de backend dice qué
 * elementos hay en sus dos puntas, y el mapa solo lo marca.
 *
 * Lo que devuelve: un GeoJSON con un punto por punta y, en cada una,
 * `id_elemento`, `nombre`, `tipo_elemento`, `color_resalte` y `tipo_rol`.
 * Según la definición del equipo, la punta PADRE es la entrada del cable y la
 * HIJO su salida. (PADRE es la mufa de su `id_elem_from` e HIJO la de su
 * `id_elem_to`, en los 180 cables que tienen sus dos puntas.)
 *
 * Si la respuesta viene en una lista de filas en vez de GeoJSON también se lee,
 * y lo que no se entiende se descarta en vez de romper.
 */

/** «Entrada» es la punta PADRE del cable y «Salida» la HIJO. */
export type RolDeExtremo = "entrada" | "salida"

/** Geometría de punto en GeoJSON (longitud, latitud), si la función la manda. */
export type PuntoGeoJSON = { type: "Point"; coordinates: [number, number] }

export type ExtremoDeCable = {
  /** Punta del cable, si la función la distingue. */
  rol: RolDeExtremo | null
  /** UUID del elemento en esa punta (mufa o cabecera). */
  id: string | null
  /** Tipo de elemento tal como lo nombra la base (CUB1, CUB2, CAB…). */
  tipo: string | null
  nombre: string | null
  color: string | null
  geometria: PuntoGeoJSON | null
}

export type ResultadoExtremos =
  | { estado: "ok"; extremos: ExtremoDeCable[] }
  /** `detalle`: el error tal como lo dio la base (solo fuera de producción). */
  | { estado: "error"; mensaje: string; detalle?: string }

export const ESPERA_MAXIMA_EXTREMOS_MS = 20_000

const COLOR_VALIDO = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null
}

/**
 * Punta del cable según lo que diga la función en `tipo_rol`: PADRE es la
 * entrada e HIJO la salida. Si algún día manda directamente ENTRADA o SALIDA,
 * se toman tal cual.
 */
function leerRol(valor: unknown): RolDeExtremo | null {
  const t = texto(valor)?.toUpperCase()
  if (!t) return null
  if (t === "PADRE" || t.startsWith("ENTRADA")) return "entrada"
  if (t.startsWith("HIJ") || t.startsWith("SALIDA")) return "salida"
  return null
}

function leerPunto(valor: unknown): PuntoGeoJSON | null {
  const g = valor as { type?: unknown; coordinates?: unknown } | null
  if (g?.type !== "Point" || !Array.isArray(g.coordinates)) return null
  const [x, y] = g.coordinates as unknown[]
  return typeof x === "number" && typeof y === "number" ? { type: "Point", coordinates: [x, y] } : null
}

function leerExtremo(fila: Record<string, unknown>, geometria: unknown): ExtremoDeCable | null {
  const id = texto(fila.id_elemento ?? fila.id_elem ?? fila.id_extremo ?? fila.uuid_elemento ?? fila.id)
  const nombre = texto(fila.nombre ?? fila.etiqueta ?? fila.nombre_elemento)
  const punto = leerPunto(geometria ?? fila.geom ?? fila.geometry ?? fila.geometria)
  // Sin UUID, sin nombre y sin posición no hay nada que marcar ni que decir.
  if (!id && !nombre && !punto) return null
  const color = fila.color_resalte ?? fila.color
  return {
    rol: leerRol(fila.tipo_rol ?? fila.rol),
    id,
    tipo: texto(fila.tipo_elemento ?? fila.tip_elem ?? fila.tipo),
    nombre,
    color: typeof color === "string" && COLOR_VALIDO.test(color) ? color : null,
    geometria: punto,
  }
}

/** Convierte lo que devuelve la función en la lista de extremos del cable. */
export function normalizarExtremos(datos: unknown): ExtremoDeCable[] {
  if (!datos || typeof datos !== "object") return []
  const objeto = datos as Record<string, unknown>
  const extremos: ExtremoDeCable[] = []
  const agregar = (fila: unknown, geometria: unknown = undefined) => {
    if (!fila || typeof fila !== "object") return
    const extremo = leerExtremo(fila as Record<string, unknown>, geometria)
    if (extremo) extremos.push(extremo)
  }

  if (Array.isArray(datos)) {
    datos.forEach((fila) => agregar(fila))
  } else if (Array.isArray(objeto.features)) {
    for (const f of objeto.features as { properties?: unknown; geometry?: unknown }[]) {
      agregar(f?.properties, f?.geometry)
    }
  } else if (Array.isArray(objeto.extremos)) {
    objeto.extremos.forEach((fila) => agregar(fila))
  }
  return extremos
}

/** Clasifica lo que responde `GET /api/cables/{id}/extremos`. */
export function clasificarRespuestaExtremos(status: number, cuerpo: unknown): ResultadoExtremos {
  if (status < 200 || status >= 300) {
    const { message: mensaje, detalle } = (cuerpo ?? {}) as { message?: unknown; detalle?: unknown }
    return {
      estado: "error",
      mensaje: typeof mensaje === "string" ? mensaje : `No se pudieron obtener los extremos de este cable (HTTP ${status}).`,
      ...(typeof detalle === "string" ? { detalle } : {}),
    }
  }
  return { estado: "ok", extremos: normalizarExtremos((cuerpo as { extremos?: unknown } | null)?.extremos ?? cuerpo) }
}

/**
 * Pide al servidor los extremos de un cable.
 *
 * Nunca lanza: los fallos vuelven como `estado: "error"` con el mensaje listo
 * para mostrar.
 */
export async function obtenerExtremosDeCable(
  idCable: string,
  esperaMaxima = ESPERA_MAXIMA_EXTREMOS_MS,
): Promise<ResultadoExtremos> {
  try {
    const res = await fetchConSesion(`/api/cables/${encodeURIComponent(idCable)}/extremos`, {
      signal: AbortSignal.timeout(esperaMaxima),
    })
    const cuerpo: unknown = await res.json().catch(() => null)
    return clasificarRespuestaExtremos(res.status, cuerpo)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        estado: "error",
        mensaje: `La base no respondió en ${esperaMaxima / 1000} segundos. Vuelve a intentarlo en un momento.`,
      }
    }
    return { estado: "error", mensaje: "Error de red al pedir los extremos del cable. Revisa la conexión." }
  }
}
