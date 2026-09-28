import { fetchConSesion } from "@/lib/auth"
import { fiberColor, fiberColorByName } from "@/lib/schematic/fiber-colors"

/**
 * Hilos de un cable, para «Gestión de hilos» (ribbon: Red de fibra → Hilos).
 *
 * Salen de la función `tab_fiber.fn_obtener_hilos_cable_json(p_id_cable)` de
 * Carlos, a la que se le pasa el UUID del cable. Hoy trae el número, el buffer,
 * los colores, la tecnología y el estado de cada hilo; él la va a ampliar con
 * lo que mostraba la pantalla del SIG anterior (rack, ODF, puerto, equipo,
 * tarjeta, transporte, destino). La lectura ya acepta esos campos con los
 * nombres más probables, así que aparecen en la grilla en cuanto la función
 * los devuelva.
 */
export type HiloDeCable = {
  /** Clave de la fila en la pantalla: el UUID o, si no llega, una propia. */
  id: string
  /** UUID del hilo en la base (el «ID» que se muestra al elegirlo); `null` si no llega. */
  uuid: string | null
  /** Identificador del SIG anterior (p. ej. 2100571), si lo tiene. */
  identificador: string | null
  numero: number | null
  buffer: number | null
  colorHilo: string | null
  colorBuffer: string | null
  tecnologia: string | null
  estado: string | null
  // Lo que la función va a agregar. Mientras no venga, queda vacío.
  nodoOrigen: string | null
  rack: string | null
  odf: string | null
  puerto: string | null
  rackEquipo: string | null
  equipo: string | null
  tarjeta: string | null
  puertoEquipo: string | null
  transporta: string | null
  equipoDestino: string | null
}

export type ResultadoHilos =
  | { estado: "ok"; hilos: HiloDeCable[] }
  /** `detalle`: el error tal como lo dio la base (solo fuera de producción). */
  | { estado: "error"; mensaje: string; detalle?: string }

export const ESPERA_MAXIMA_HILOS_MS = 20_000

function texto(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor)
  return typeof valor === "string" && valor.trim() ? valor.trim() : null
}

function numero(valor: unknown): number | null {
  const n = typeof valor === "string" ? Number(valor) : valor
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

/**
 * Las filas de `hilo_cable` como las usa la pantalla, ordenadas por número.
 *
 * Acepta tanto las filas de la base (`numero_hilo`, `id_legacy`…) como hilos ya
 * leídos (`numero`, `identificador`…): la ruta los lee en el servidor y el
 * navegador vuelve a pasar la respuesta por aquí. Antes solo entendía las
 * filas de la base, y esa segunda pasada dejaba los hilos sin número, sin
 * color y sin tecnología.
 */
export function normalizarHilos(datos: unknown): HiloDeCable[] {
  const hilos: HiloDeCable[] = []
  filasDe(datos).forEach((fila, i) => {
    if (!fila || typeof fila !== "object") return
    // Los nombres de los campos se comparan sin mayúsculas, tildes ni guiones:
    // la función ha ido cambiando («Tecnología», «num_buffer», «color») y así
    // no hay que tocar la pantalla por cada variación.
    const f: Record<string, unknown> = {}
    for (const [clave, valor] of Object.entries(fila as Record<string, unknown>)) f[claveComparable(clave)] = valor
    /** El primero de esos campos que traiga algo. */
    const campo = (...nombres: string[]) =>
      texto(nombres.map((n) => f[claveComparable(n)]).find((v) => texto(v) !== null))
    const num = (...nombres: string[]) => numero(nombres.map((n) => f[claveComparable(n)]).find((v) => numero(v) !== null))
    // Solo cuenta como UUID si lo es: la clave propia que se inventa para un
    // hilo sin ID («hilo-1-4-3») no es un ID de la base.
    const uuid =
      ["uuid", "id", "id_hilo"].map((n) => texto(f[claveComparable(n)])).find((v) => v !== null && UUID.test(v)) ?? null
    const hilo: HiloDeCable = {
      id: "",
      uuid,
      identificador: campo("id_legacy", "identificador", "id_hilo_legacy"),
      numero: num("numero_hilo", "num_hilo", "numero", "hilo"),
      buffer: num("numero_buffer", "num_buffer", "buffer", "numero_tubo", "tubo"),
      colorHilo: campo("color_hilo", "colorHilo", "color"),
      colorBuffer: campo("color_buffer", "colorBuffer"),
      tecnologia: campo("tipo_tecnologia", "tecnologia", "tecno", "tipo_tec"),
      estado: campo("estado_tec", "estado", "est_op", "estado_operativo"),
      nodoOrigen: campo("nodo_origen", "nodoOrigen"),
      rack: campo("rack"),
      odf: campo("odf"),
      puerto: campo("puerto", "puerto_odf"),
      rackEquipo: campo("rack_equipo", "rackEquipo"),
      equipo: campo("equipo"),
      tarjeta: campo("tarjeta"),
      puertoEquipo: campo("puerto_equipo", "puertoEquipo"),
      transporta: campo("transporta", "transporte"),
      equipoDestino: campo("equipo_destino", "equipoDestino", "destino"),
    }
    // Sin UUID se identifica por su posición; una fila sin número ni UUID no
    // es un hilo que se pueda mostrar.
    const id = campo("id", "id_hilo", "uuid")
    if (!id && hilo.numero === null) return
    hilos.push({ ...hilo, id: id ?? `hilo-${hilo.buffer ?? 0}-${hilo.numero}-${i}` })
  })
  return hilos.sort(
    (a, b) =>
      (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER) ||
      (a.buffer ?? 0) - (b.buffer ?? 0),
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `Tecnología`, `tecnologia` y `TECNOLOGIA` son el mismo campo; `num_buffer` y `numbuffer` también. */
function claveComparable(clave: string): string {
  return clave
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Dónde viene la lista: la función puede devolverla sola o dentro de un objeto
 * (`{ hilos: [...] }`, `{ data: [...] }`…), y la ruta la devuelve en `hilos`.
 */
function filasDe(datos: unknown): unknown[] {
  if (Array.isArray(datos)) return datos
  if (!datos || typeof datos !== "object") return []
  const objeto = datos as Record<string, unknown>
  for (const clave of ["hilos", "data", "resultado", "items"]) {
    if (Array.isArray(objeto[clave])) return objeto[clave] as unknown[]
  }
  return []
}

/**
 * El color para pintar la muestra: el del nombre que trae la base (código
 * TIA-598) o, si no lo reconoce, el que le toca por posición.
 */
export function colorParaMostrar(nombre: string | null, posicion: number | null): string | null {
  if (nombre) {
    const conocido = fiberColorByName(nombre)
    if (conocido) return conocido.hex
  }
  return posicion && posicion > 0 ? fiberColor(posicion).hex : null
}

/** Clasifica lo que responde `GET /api/cables/{id}/hilos`. */
export function clasificarRespuestaHilos(status: number, cuerpo: unknown): ResultadoHilos {
  if (status < 200 || status >= 300) {
    const { message: mensaje, detalle } = (cuerpo ?? {}) as { message?: unknown; detalle?: unknown }
    return {
      estado: "error",
      mensaje: typeof mensaje === "string" ? mensaje : `No se pudieron obtener los hilos de este cable (HTTP ${status}).`,
      ...(typeof detalle === "string" ? { detalle } : {}),
    }
  }
  return { estado: "ok", hilos: normalizarHilos(cuerpo) }
}

/** Pide al servidor los hilos de un cable. Nunca lanza: los fallos vuelven como `estado: "error"`. */
export async function obtenerHilosDeCable(
  idCable: string,
  esperaMaxima = ESPERA_MAXIMA_HILOS_MS,
): Promise<ResultadoHilos> {
  try {
    const res = await fetchConSesion(`/api/cables/${encodeURIComponent(idCable)}/hilos`, {
      signal: AbortSignal.timeout(esperaMaxima),
    })
    const cuerpo: unknown = await res.json().catch(() => null)
    return clasificarRespuestaHilos(res.status, cuerpo)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { estado: "error", mensaje: `La base no respondió en ${esperaMaxima / 1000} segundos. Vuelve a intentarlo.` }
    }
    return { estado: "error", mensaje: "Error de red al pedir los hilos del cable. Revisa la conexión." }
  }
}
