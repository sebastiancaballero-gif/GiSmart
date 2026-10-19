import { fetchConSesion } from "@/lib/auth"

/**
 * «Sección distribución» de Gestión de hilos (ribbon: Red de fibra → Hilos),
 * como la pantalla del SIG anterior: de cada hilo del cable, de qué divisor
 * sale (la cubierta de primer nivel, el divisor, su puerto y la salida de la
 * cubierta) y a qué equipo llega.
 *
 * No hay función de la base para esto: sale de la caché del trace
 * (`tab_fiber.element_connection`), la misma de «Recorrido del trace».
 *
 * - Hacia la fuente, el recorrido de un hilo de distribución termina en la
 *   salida del divisor de donde sale: ese paso da el divisor, el puerto y la
 *   cubierta.
 * - Hacia abajo, el último paso es donde termina: la entrada del divisor de una
 *   cubierta de segundo nivel (la NAP) o, en un hilo del feeder, la del divisor
 *   de primer nivel.
 *
 * La salida de la cubierta numera las salidas de sus divisores seguidas, en el
 * orden de los divisores: con divisores 1x8, el puerto 1 del divisor 2 es la
 * salida 9. Así la daba el SIG anterior.
 */
export type DistribucionDeHilo = {
  /** UUID del hilo. */
  id: string
  /** La cubierta (de primer nivel) del divisor de donde sale el hilo («CO05»). */
  cubierta: string | null
  divisor: number | null
  /** El puerto de salida del divisor (el 3 de «S3»). */
  puertoDivisor: number | null
  /** La salida de la cubierta: las salidas de sus divisores, numeradas seguidas. */
  salida: number | null
  /** A dónde llega hacia abajo («NAP 13/14»); «Sin conectar» si no sigue a ningún lado. */
  destino: string | null
}

export type ResultadoDistribucion =
  | { estado: "ok"; hilos: DistribucionDeHilo[] }
  /** `detalle`: el error tal como lo dio la base (solo fuera de producción). */
  | { estado: "error"; mensaje: string; detalle?: string }

export const SIN_CONECTAR = "Sin conectar"

/** Un paso de `path_secuencia`, con los campos que se usan aquí. */
type PasoEnCache = {
  paso?: unknown
  tipo_contenedor?: unknown
  id_contenedor?: unknown
  tip_destino?: unknown
  puerto_origen?: unknown
  puerto_destino?: unknown
}

export type FilaDeCacheDistribucion = {
  id_origen: string
  direccion: string
  path_secuencia: unknown
  fecha_calculo: string | null
}
export type PuertoDistribucion = { id: string; numero_puerto: number | null; id_equipo_pert: string | null; tipo_equipo_pert: string | null }
export type DivisorDistribucion = { id: string; num_divisor: number | null; modelo_divisor: string | null; id_cubierta_ubica: string | null }
export type CubiertaDistribucion = { id: string; etiqueta: string | null; funcion_cub: string | null }

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const entero = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isInteger(n) ? n : null
}

/** Los pasos de una fila de la caché, en orden. */
function pasosDe(fila: FilaDeCacheDistribucion | undefined): PasoEnCache[] {
  const pasos = Array.isArray(fila?.path_secuencia) ? (fila.path_secuencia as unknown[]) : []
  return pasos
    .filter((p): p is PasoEnCache => !!p && typeof p === "object")
    .sort((a, b) => (entero(a.paso) ?? 0) - (entero(b.paso) ?? 0))
}

/** Cuántas salidas tiene un divisor según su modelo («1x8PC» → 8); `null` si no se lee. */
export function salidasDelModelo(modelo: string | null): number | null {
  const m = modelo ? /1\s*[x×]\s*(\d+)/i.exec(modelo) : null
  return m ? Number(m[1]) : null
}

/**
 * La salida de la cubierta: las de los divisores anteriores (por número) más el
 * puerto. Si los números de divisor se repiten en la cubierta, o un modelo no
 * dice cuántas salidas tiene, no se puede saber: `null`.
 */
export function salidaDeLaCubierta(divisor: DivisorDistribucion, puerto: number, hermanos: DivisorDistribucion[]): number | null {
  if (divisor.num_divisor === null) return null
  const numeros = hermanos.map((d) => d.num_divisor)
  if (new Set(numeros).size !== numeros.length) return null
  let antes = 0
  for (const d of hermanos) {
    if (d.num_divisor === null) return null
    if (d.num_divisor >= divisor.num_divisor) continue
    const salidas = salidasDelModelo(d.modelo_divisor)
    if (salidas === null) return null
    antes += salidas
  }
  return antes + puerto
}

/** Lo que hay que leer de la base después de la caché: puertos y divisores de los pasos que importan. */
export function idsParaDistribucion(cache: FilaDeCacheDistribucion[]): { puertos: string[]; contenedores: string[] } {
  const puertos = new Set<string>()
  const contenedores = new Set<string>()
  for (const fila of cache) {
    const pasos = pasosDe(fila)
    const paso = fila.direccion === "UPSTREAM" ? pasos.find((p) => p.tipo_contenedor === "DIVISOR") : pasos.at(-1)
    if (!paso) continue
    const puerto = texto(paso.puerto_destino) ?? texto(paso.puerto_origen)
    if (puerto) puertos.add(puerto)
    const contenedor = texto(paso.id_contenedor)
    if (contenedor) contenedores.add(contenedor)
  }
  return { puertos: [...puertos], contenedores: [...contenedores] }
}

/**
 * La sección distribución de cada hilo, con la caché ya leída y el catálogo de
 * puertos, divisores y cubiertas de esos pasos. `divisoresDeLaCubierta` son
 * todos los divisores de cada cubierta (para numerar sus salidas).
 */
export function armarDistribucion({
  hilos,
  cache,
  puertos,
  divisores,
  cubiertas,
  divisoresDeLaCubierta,
}: {
  hilos: string[]
  cache: FilaDeCacheDistribucion[]
  puertos: Map<string, PuertoDistribucion>
  divisores: Map<string, DivisorDistribucion>
  cubiertas: Map<string, CubiertaDistribucion>
  divisoresDeLaCubierta: Map<string, DivisorDistribucion[]>
}): DistribucionDeHilo[] {
  // Una fila por hilo y sentido; si hubiera dos, la más reciente (como el trace).
  const ultima = new Map<string, FilaDeCacheDistribucion>()
  for (const fila of cache) {
    const llave = `${fila.id_origen.toLowerCase()}|${fila.direccion}`
    const otra = ultima.get(llave)
    if (!otra || (fila.fecha_calculo ?? "") > (otra.fecha_calculo ?? "")) ultima.set(llave, fila)
  }

  /** El divisor de un puerto: el del paso o, si no, el dueño del puerto. */
  const divisorDe = (paso: PasoEnCache, puerto: PuertoDistribucion | undefined) =>
    divisores.get(texto(paso.id_contenedor) ?? "") ?? divisores.get(puerto?.id_equipo_pert ?? "")

  return hilos.map((id) => {
    const fila: DistribucionDeHilo = { id, cubierta: null, divisor: null, puertoDivisor: null, salida: null, destino: null }

    // Hacia la fuente: el primer divisor que se cruza es de donde sale el hilo.
    const pasoDivisor = pasosDe(ultima.get(`${id.toLowerCase()}|UPSTREAM`)).find((p) => p.tipo_contenedor === "DIVISOR")
    if (pasoDivisor) {
      const puerto = puertos.get(texto(pasoDivisor.puerto_destino) ?? texto(pasoDivisor.puerto_origen) ?? "")
      const divisor = divisorDe(pasoDivisor, puerto)
      fila.divisor = divisor?.num_divisor ?? null
      fila.puertoDivisor = puerto?.numero_puerto ?? null
      if (divisor?.id_cubierta_ubica) {
        fila.cubierta = cubiertas.get(divisor.id_cubierta_ubica)?.etiqueta ?? null
        if (fila.puertoDivisor !== null) {
          fila.salida = salidaDeLaCubierta(divisor, fila.puertoDivisor, divisoresDeLaCubierta.get(divisor.id_cubierta_ubica) ?? [divisor])
        }
      }
    }

    // Hacia abajo: donde termina el recorrido.
    const final = pasosDe(ultima.get(`${id.toLowerCase()}|DOWNSTREAM`)).at(-1)
    if (!final) {
      fila.destino = SIN_CONECTAR
    } else {
      const puerto = final.tip_destino === "PUERTO" ? puertos.get(texto(final.puerto_destino) ?? "") : undefined
      const divisor = puerto?.tipo_equipo_pert?.startsWith("DIV") ? divisorDe({}, puerto) : undefined
      const cubierta = cubiertas.get(divisor?.id_cubierta_ubica ?? "") ?? cubiertas.get(texto(final.id_contenedor) ?? "")
      const nombre = cubierta?.etiqueta ?? null
      if (divisor && /segundo/i.test(cubierta?.funcion_cub ?? "")) fila.destino = nombre ? `NAP ${nombre}` : "NAP"
      else if (divisor) fila.destino = `Divisor${divisor.num_divisor !== null ? ` ${divisor.num_divisor}` : ""}${nombre ? ` de ${nombre}` : ""}`
      else if (nombre) fila.destino = `Cubierta ${nombre}`
    }
    return fila
  })
}

/** Lee lo que responde `GET /api/cables/{id}/distribucion`. */
export function clasificarRespuestaDistribucion(status: number, cuerpo: unknown): ResultadoDistribucion {
  const objeto = (cuerpo ?? {}) as { hilos?: unknown; message?: unknown; detalle?: unknown }
  if (status < 200 || status >= 300) {
    return {
      estado: "error",
      mensaje:
        typeof objeto.message === "string" ? objeto.message : `No se pudo armar la sección distribución de este cable (HTTP ${status}).`,
      ...(typeof objeto.detalle === "string" ? { detalle: objeto.detalle } : {}),
    }
  }
  const hilos = Array.isArray(objeto.hilos) ? objeto.hilos : []
  return {
    estado: "ok",
    hilos: hilos.flatMap((h) => {
      const f = (h ?? {}) as Record<string, unknown>
      const id = texto(f.id)
      if (!id) return []
      return [
        {
          id,
          cubierta: texto(f.cubierta),
          divisor: entero(f.divisor),
          puertoDivisor: entero(f.puertoDivisor),
          salida: entero(f.salida),
          destino: texto(f.destino),
        },
      ]
    }),
  }
}

export const ESPERA_MAXIMA_DISTRIBUCION_MS = 20_000

/** Pide al servidor la sección distribución de un cable. Nunca lanza: los fallos vuelven como `estado: "error"`. */
export async function obtenerDistribucionDeCable(
  idCable: string,
  esperaMaxima = ESPERA_MAXIMA_DISTRIBUCION_MS,
): Promise<ResultadoDistribucion> {
  try {
    const res = await fetchConSesion(`/api/cables/${encodeURIComponent(idCable)}/distribucion`, {
      signal: AbortSignal.timeout(esperaMaxima),
    })
    const cuerpo: unknown = await res.json().catch(() => null)
    return clasificarRespuestaDistribucion(res.status, cuerpo)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { estado: "error", mensaje: `La base no respondió en ${esperaMaxima / 1000} segundos. Vuelve a intentarlo.` }
    }
    return { estado: "error", mensaje: "Error de red al pedir la sección distribución del cable. Revisa la conexión." }
  }
}
