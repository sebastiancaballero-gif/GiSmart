import { fetchConSesion } from "@/lib/auth"

/**
 * Extremos de un cable, para el botón «Cable» (ribbon: Consultas → Red).
 *
 * Mismo reparto que las otras consultas: GISmart manda el UUID del cable, la
 * función `geo_fiber.fn_obtener_extremos_cable` del equipo de backend dice qué
 * elementos hay en sus dos puntas, y el mapa solo lo marca.
 *
 * Cuando se escribió esto la función todavía fallaba en la base (buscaba la
 * tabla de cabeceras en el esquema equivocado), así que no se conocía su
 * respuesta. La lectura acepta las formas más probables —GeoJSON como la
 * función de cables de la mufa, una lista de filas o un objeto con `origen` y
 * `destino`— y descarta lo que no entiende en vez de romper.
 */

export type RolDeExtremo = "origen" | "destino"

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

export type ResultadoExtremos = { estado: "ok"; extremos: ExtremoDeCable[] } | { estado: "error"; mensaje: string }

export const ESPERA_MAXIMA_EXTREMOS_MS = 20_000

const COLOR_VALIDO = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null
}

/**
 * Punta del cable según lo que diga la función. Acepta origen/destino y
 * también el vocabulario de la función de cables de la mufa: en la punta
 * «SALIENTE» el cable sale de la cubierta (es su origen) y en la «ENTRANTE»
 * llega a ella (es su destino).
 */
function leerRol(valor: unknown): RolDeExtremo | null {
  const t = texto(valor)?.toUpperCase()
  if (!t) return null
  if (/^(ORIG|INI|FROM|DESDE|SALI)/.test(t) || t === "A") return "origen"
  if (/^(DEST|FIN|TO$|HASTA|ENTRA)/.test(t) || t === "B") return "destino"
  return null
}

function leerPunto(valor: unknown): PuntoGeoJSON | null {
  const g = valor as { type?: unknown; coordinates?: unknown } | null
  if (g?.type !== "Point" || !Array.isArray(g.coordinates)) return null
  const [x, y] = g.coordinates as unknown[]
  return typeof x === "number" && typeof y === "number" ? { type: "Point", coordinates: [x, y] } : null
}

function leerExtremo(fila: Record<string, unknown>, rolPorClave: RolDeExtremo | null, geometria: unknown): ExtremoDeCable | null {
  const id = texto(fila.id_elemento ?? fila.id_elem ?? fila.id_extremo ?? fila.uuid_elemento ?? fila.id)
  const nombre = texto(fila.nombre ?? fila.etiqueta ?? fila.nombre_elemento)
  const punto = leerPunto(geometria ?? fila.geom ?? fila.geometry ?? fila.geometria)
  // Sin UUID, sin nombre y sin posición no hay nada que marcar ni que decir.
  if (!id && !nombre && !punto) return null
  const color = fila.color_resalte ?? fila.color
  return {
    rol:
      rolPorClave ??
      leerRol(fila.extremo ?? fila.tipo_extremo ?? fila.tipo_direccion ?? fila.rol ?? fila.lado ?? fila.posicion ?? fila.direccion),
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
  const agregar = (fila: unknown, rol: RolDeExtremo | null = null, geometria: unknown = undefined) => {
    if (!fila || typeof fila !== "object") return
    const extremo = leerExtremo(fila as Record<string, unknown>, rol, geometria)
    if (extremo) extremos.push(extremo)
  }

  if (Array.isArray(datos)) {
    datos.forEach((fila) => agregar(fila))
  } else if (Array.isArray(objeto.features)) {
    for (const f of objeto.features as { properties?: unknown; geometry?: unknown }[]) {
      agregar(f?.properties, null, f?.geometry)
    }
  } else if (Array.isArray(objeto.extremos)) {
    objeto.extremos.forEach((fila) => agregar(fila))
  } else if (objeto.origen || objeto.destino) {
    agregar(objeto.origen, "origen")
    agregar(objeto.destino, "destino")
  }
  return extremos
}

/** Clasifica lo que responde `GET /api/cables/{id}/extremos`. */
export function clasificarRespuestaExtremos(status: number, cuerpo: unknown): ResultadoExtremos {
  if (status < 200 || status >= 300) {
    const mensaje = (cuerpo as { message?: unknown } | null)?.message
    return {
      estado: "error",
      mensaje: typeof mensaje === "string" ? mensaje : "No se pudieron obtener los extremos de este cable.",
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
