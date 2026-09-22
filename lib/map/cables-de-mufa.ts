import { fetchConSesion } from "@/lib/auth"

/**
 * Cables de entrada y salida de una cubierta, para el botón «Entradas y
 * salidas» (ribbon: Consultas → Red).
 *
 * Mismo reparto que la conectividad fina: GISmart manda el UUID de la
 * cubierta, la función `geo_fiber.fn_obtener_conectividad_cables` de Carlos
 * decide qué cable entra, cuál sale y de qué color se pinta, y el mapa solo lo
 * dibuja. Aurelio pidió usarla ya, aunque el sentido que calcula todavía no
 * esté bien.
 *
 * Hoy la función devuelve un GeoJSON con la geometría de cada cable; Aurelio
 * le pidió a Carlos que devuelva solo los UUID, que es más liviano. Por eso de
 * la respuesta solo se toman el UUID, la dirección y el color: la geometría se
 * busca en la capa de cables que ya está en el mapa, y el cambio de formato no
 * obliga a tocar nada aquí.
 */

export type SentidoDeCable = "entrada" | "salida"

export type CableDeMufa = {
  /** UUID del cable en `geo_fiber.cable_fibra`. */
  id: string
  sentido: SentidoDeCable
  /** Color que manda la función, o `null` si no manda uno válido. */
  color: string | null
}

export type ResultadoCables = { estado: "ok"; cables: CableDeMufa[] } | { estado: "error"; mensaje: string }

/** Cuánto se espera a la base antes de darse por vencido. */
export const ESPERA_MAXIMA_CABLES_MS = 20_000

const COLOR_VALIDO = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function leerSentido(valor: unknown): SentidoDeCable | null {
  if (typeof valor !== "string") return null
  const texto = valor.trim().toUpperCase()
  if (texto.startsWith("ENTRA")) return "entrada"
  if (texto.startsWith("SALI")) return "salida"
  return null
}

/**
 * Convierte lo que devuelve la función en una lista de cables.
 *
 * Acepta el GeoJSON de hoy (`features[].properties`) y también una lista de
 * filas u `{ cables: [...] }`, que es la forma más probable cuando la función
 * deje de mandar la geometría. Lo que no se entiende se descarta en vez de
 * romper: un cable sin UUID o sin dirección reconocible no se puede pintar.
 */
export function normalizarCablesDeMufa(datos: unknown): CableDeMufa[] {
  const objeto = datos as { features?: unknown; cables?: unknown } | null
  const filas: unknown[] = Array.isArray(datos)
    ? datos
    : Array.isArray(objeto?.features)
      ? objeto.features.map((f) => (f as { properties?: unknown } | null)?.properties)
      : Array.isArray(objeto?.cables)
        ? objeto.cables
        : []

  const cables: CableDeMufa[] = []
  for (const fila of filas) {
    if (!fila || typeof fila !== "object") continue
    const f = fila as Record<string, unknown>
    const id = f.id_cable ?? f.cable_id ?? f.id
    const sentido = leerSentido(f.tipo_direccion ?? f.sentido ?? f.direccion)
    if (typeof id !== "string" || !sentido) continue
    const color = f.color_resalte ?? f.color
    cables.push({ id, sentido, color: typeof color === "string" && COLOR_VALIDO.test(color) ? color : null })
  }
  return cables
}

/** Clasifica lo que responde `GET /api/mufas/{id}/cables`. */
export function clasificarRespuestaCables(status: number, cuerpo: unknown): ResultadoCables {
  if (status < 200 || status >= 300) {
    const mensaje = (cuerpo as { message?: unknown } | null)?.message
    return {
      estado: "error",
      mensaje: typeof mensaje === "string" ? mensaje : "No se pudieron obtener los cables de esta mufa.",
    }
  }
  return { estado: "ok", cables: normalizarCablesDeMufa(cuerpo) }
}

/**
 * Pide al servidor los cables de entrada y salida de una cubierta.
 *
 * Nunca lanza: los fallos vuelven como `estado: "error"` con el mensaje listo
 * para mostrar.
 */
export async function obtenerCablesDeMufa(
  idMufa: string,
  esperaMaxima = ESPERA_MAXIMA_CABLES_MS,
): Promise<ResultadoCables> {
  try {
    const res = await fetchConSesion(`/api/mufas/${encodeURIComponent(idMufa)}/cables`, {
      signal: AbortSignal.timeout(esperaMaxima),
    })
    const cuerpo: unknown = await res.json().catch(() => null)
    return clasificarRespuestaCables(res.status, cuerpo)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        estado: "error",
        mensaje: `La base no respondió en ${esperaMaxima / 1000} segundos. Vuelve a intentarlo en un momento.`,
      }
    }
    return { estado: "error", mensaje: "Error de red al pedir los cables de la mufa. Revisa la conexión." }
  }
}
