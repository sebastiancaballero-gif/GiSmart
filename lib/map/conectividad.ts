import { fetchConSesion } from "@/lib/auth"
import { ErrorDatosMufaCampo, parseMufaData, type MufaCampoJSON } from "@/lib/schematic/mufa-field-data"

/**
 * Consulta de la conectividad interna de una cubierta de empalme (mufa).
 *
 * Reparto acordado con Aurelio en septiembre de 2026:
 *
 *   1. Frontend (GISmart): el usuario elige una cubierta, se toma su UUID y se
 *      pide la conectividad.
 *   2. Backend (Carlos): recibe el UUID, llama a la función
 *      `get_json_conectividad_cubierta` y devuelve el JSON. Aquí es la ruta
 *      `GET /api/mufas/{id}/conectividad`.
 *   3. Esquemático (Dario, JointJS): recibe el JSON y lo dibuja. Si se abre en
 *      modo consulta, no deja editar.
 *
 * Antes las 185 mufas cargaban el mismo JSON de ejemplo y «Ver conexiones»
 * enseñaba el mismo diagrama inventado para todas.
 */

/**
 * Para qué se abre la conectividad: solo verla o poder cambiarla.
 *
 * Va aparte del JSON a propósito. La función de la base solo genera la
 * conectividad de la cubierta, sin saber para qué se va a usar; el mismo JSON
 * sirve para consultar o para editar. El esquemático necesita saberlo, así que
 * se le pasa como argumento separado.
 */
export type ModoConectividad = "consulta" | "escritura"

/** Lo que se sabe de la conectividad de una mufa después de preguntar. */
export type EstadoConectividad =
  /** Hay cables y el esquemático la puede dibujar. */
  | { estado: "disponible"; esquema: MufaCampoJSON }
  /**
   * Hay cables, pero el esquemático no la puede dibujar: su analizador la
   * rechaza. Pasa, por ejemplo, con una cubierta que solo tiene cables de
   * entrada o solo de salida. `motivo` es la razón que da, lista para mostrar.
   */
  | { estado: "no-dibujable"; esquema: MufaCampoJSON; motivo: string }
  /**
   * La base respondió, pero la cubierta no tiene cables registrados. Puede
   * traer el JSON igual (con bandejas y divisores), pero no hay conectividad
   * que dibujar.
   */
  | { estado: "sin-conectividad"; esquema: MufaCampoJSON | null }
  /** No se pudo preguntar: red, permisos o la función no respondió. */
  | { estado: "error"; mensaje: string }

/**
 * ¿Este JSON tiene conectividad que dibujar?
 *
 * La regla es la misma que aplica el esquemático de Dario: su analizador
 * rechaza un JSON sin cables («Datos de la mufa inválidos: no hay cables
 * declarados»). Que tenga cables tampoco basta para dibujarla: eso lo decide
 * `motivoNoDibujable`.
 */
export function tieneConectividad(esquema: MufaCampoJSON | null | undefined): boolean {
  return Array.isArray(esquema?.cables) && esquema.cables.length > 0
}

/**
 * Cuánto se espera a la base antes de darse por vencido. Sin límite, una
 * consulta que no vuelve dejaba el aviso «Consultando…» en pantalla para
 * siempre, sin poder cerrarlo ni volver a intentar.
 */
export const ESPERA_MAXIMA_MS = 20_000

/**
 * Pide al servidor la conectividad de una mufa y la clasifica.
 *
 * Nunca lanza: los fallos vuelven como `estado: "error"` con el mensaje listo
 * para mostrar.
 */
export async function obtenerConectividad(
  idMufa: string,
  esperaMaxima = ESPERA_MAXIMA_MS,
): Promise<EstadoConectividad> {
  try {
    const res = await fetchConSesion(`/api/mufas/${encodeURIComponent(idMufa)}/conectividad`, {
      signal: AbortSignal.timeout(esperaMaxima),
    })
    const cuerpo: unknown = await res.json().catch(() => null)
    return clasificarRespuesta(res.status, cuerpo)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        estado: "error",
        mensaje: `La base no respondió en ${esperaMaxima / 1000} segundos. Vuelve a consultarla en un momento.`,
      }
    }
    return { estado: "error", mensaje: "Error de red al pedir la conectividad. Revisa la conexión." }
  }
}

/**
 * Clasifica lo que responde `GET /api/mufas/{id}/conectividad`.
 *
 * Va aparte de `obtenerConectividad` para poder probarla sin navegador: las
 * pruebas le pasan la respuesta real de la ruta.
 */
export function clasificarRespuesta(status: number, cuerpo: unknown): EstadoConectividad {
  // 404: la función no devolvió nada para esta cubierta.
  if (status === 404) return { estado: "sin-conectividad", esquema: null }

  if (status < 200 || status >= 300) {
    const mensaje = (cuerpo as { message?: unknown } | null)?.message
    return {
      estado: "error",
      mensaje: typeof mensaje === "string" ? mensaje : "No se pudo obtener la conectividad de esta mufa.",
    }
  }

  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return { estado: "error", mensaje: "La base respondió algo que no es la conectividad de una mufa." }
  }

  const esquema = cuerpo as MufaCampoJSON
  if (!tieneConectividad(esquema)) return { estado: "sin-conectividad", esquema }
  const motivo = motivoNoDibujable(esquema)
  return motivo ? { estado: "no-dibujable", esquema, motivo } : { estado: "disponible", esquema }
}

/**
 * Consultas a la base, sin preguntar dos veces lo mismo a la vez.
 *
 * Cada llamada vuelve a preguntar: la función arma el JSON en el momento, así
 * que consultar otra vez una mufa trae lo que la base tenga ahora (si Carlos
 * cargó fusiones nuevas, se ven). Solo cuando ya hay una pregunta en camino
 * por esa misma mufa, por ejemplo con un doble click, se espera esa en vez de
 * lanzar otra.
 */
export function crearConsultor(
  obtener: (idMufa: string) => Promise<EstadoConectividad>,
): (idMufa: string) => Promise<EstadoConectividad> {
  const enCamino = new Map<string, Promise<EstadoConectividad>>()
  return (idMufa) => {
    const pendiente = enCamino.get(idMufa)
    if (pendiente) return pendiente
    const peticion = obtener(idMufa).finally(() => enCamino.delete(idMufa))
    enCamino.set(idMufa, peticion)
    return peticion
  }
}

/**
 * Qué recordar de una mufa tras volver a consultarla.
 *
 * La respuesta nueva reemplaza a la anterior, porque es lo que la base tiene
 * ahora. La excepción es un fallo de red o de la base: ese no borra una
 * conectividad que ya se había obtenido. El panel la sigue ofreciendo y el
 * aviso de la consulta cuenta el fallo.
 */
export function resultadoAGuardar(
  anterior: EstadoConectividad | undefined,
  nuevo: EstadoConectividad,
): EstadoConectividad {
  return nuevo.estado === "error" && anterior && anterior.estado !== "error" ? anterior : nuevo
}

/**
 * Por qué el esquemático no puede dibujar este JSON, o `null` si puede.
 *
 * Usa el mismo analizador del esquemático de Dario, así que sigue sus reglas
 * aunque cambien. Comprobarlo antes de abrirlo da el motivo exacto («no hay
 * ningún cable de salida») en vez de un diagrama que se rompe al dibujarse.
 */
export function motivoNoDibujable(esquema: MufaCampoJSON): string | null {
  try {
    parseMufaData(esquema)
    return null
  } catch (error) {
    if (error instanceof ErrorDatosMufaCampo) {
      return error.message.replace(/^Datos de la mufa inválidos:\s*/, "")
    }
    return "el JSON no tiene la forma que espera el esquemático"
  }
}
