import { fetchConSesion } from "@/lib/auth"

/**
 * El recorrido de los hilos de un cable para Gestión de hilos (ribbon: Red de
 * fibra → Hilos), como la pantalla del SIG anterior:
 *
 * - «Sección distribución»: de qué divisor sale cada hilo (la cubierta de
 *   primer nivel, el divisor, su puerto y la salida de la cubierta) y a qué
 *   equipo llega.
 * - «Sección feeder»: de dónde le viene la señal (el ODF con su bandeja y su
 *   puerto, la OLT con su tarjeta y su puerto) y a qué equipo llega.
 *
 * No hay función de la base para esto: sale de la caché del trace
 * (`tab_fiber.element_connection`), la misma de «Recorrido del trace».
 *
 * - Hacia la fuente, el recorrido de un hilo de distribución termina en la
 *   salida del divisor de donde sale: ese paso da el divisor, el puerto y la
 *   cubierta. Para llegar al ODF y a la OLT se sigue desde la entrada de ese
 *   divisor, como hace el trace (hasta cuatro divisores en serie). Un hilo del
 *   feeder llega directo.
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
  /** Hacia la fuente, el ODF donde llega el hilo («ODF 1»), su bandeja y su puerto. */
  odf: string | null
  bandejaOdf: number | null
  puertoOdf: string | null
  /** La OLT que le da la señal («OLT 1»), su tarjeta y su puerto. */
  olt: string | null
  tarjetaOlt: number | null
  puertoOlt: string | null
}

export type ResultadoDistribucion =
  | { estado: "ok"; hilos: DistribucionDeHilo[] }
  /** `detalle`: el error tal como lo dio la base (solo fuera de producción). */
  | { estado: "error"; mensaje: string; detalle?: string }

export const SIN_CONECTAR = "Sin conectar"

/** Más de cuatro divisores en serie no tiene sentido en una red FTTH: sería un ciclo (como en el trace). */
export const MAX_DIVISORES_EN_SERIE = 4

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
export type PuertoDistribucion = {
  id: string
  numero_puerto: number | null
  /** Su nombre («S3», «11»), si lo tiene; si no, se usa el número. */
  nombre?: string | null
  id_equipo_pert: string | null
  tipo_equipo_pert: string | null
}
export type DivisorDistribucion = { id: string; num_divisor: number | null; modelo_divisor: string | null; id_cubierta_ubica: string | null }
/** `etiqueta` es su nombre, venga de la columna que venga (ver `nombreDeCubierta`). */
export type CubiertaDistribucion = { id: string; etiqueta: string | null; funcion_cub: string | null }
/** Una tarjeta de la OLT o una bandeja del ODF (`tab_fiber.tarjeta_bandeja_eqp`). */
export type TarjetaDistribucion = { id: string; num_slot: number | null; tipo_equipo: string | null; id_equipo: string | null }
/** Un equipo de la central (`tab_fiber.equipo_red`): la OLT o el ODF. */
export type EquipoDistribucion = { id: string; codigo: string | null; tipo_equipo: string | null }

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

const llave = (origen: string, direccion: string) => `${origen.toLowerCase()}|${direccion}`

/** Una fila por origen y sentido; si hubiera dos, la más reciente (como el trace). */
function ultimasFilas(cache: FilaDeCacheDistribucion[]): Map<string, FilaDeCacheDistribucion> {
  const ultima = new Map<string, FilaDeCacheDistribucion>()
  for (const fila of cache) {
    const clave = llave(fila.id_origen, fila.direccion)
    const otra = ultima.get(clave)
    if (!otra || (fila.fecha_calculo ?? "") > (otra.fecha_calculo ?? "")) ultima.set(clave, fila)
  }
  return ultima
}

/** El divisor en cuya salida termina un tramo hacia la fuente, si termina en uno. */
function divisorDondeTermina(pasos: PasoEnCache[]): string | null {
  const final = pasos.at(-1)
  return final?.tipo_contenedor === "DIVISOR" && final.tip_destino === "PUERTO" ? texto(final.id_contenedor) : null
}

/**
 * Los pasos hacia la fuente desde un hilo, siguiendo por la entrada de cada
 * divisor donde termina un tramo. `falta` es la entrada cuyo recorrido no está
 * en la caché leída: la ruta lo pide y vuelve a armar.
 */
function subida(
  origen: string,
  ultima: Map<string, FilaDeCacheDistribucion>,
  entradas: Map<string, string>,
): { pasos: PasoEnCache[]; falta: string | null } {
  const pasos: PasoEnCache[] = []
  const cruzados = new Set<string>()
  let actual = origen
  for (let vuelta = 0; vuelta <= MAX_DIVISORES_EN_SERIE; vuelta++) {
    const fila = ultima.get(llave(actual, "UPSTREAM"))
    if (!fila) return { pasos, falta: vuelta === 0 ? null : actual }
    const tramo = pasosDe(fila)
    pasos.push(...tramo)
    const divisor = divisorDondeTermina(tramo)
    const entrada = divisor && !cruzados.has(divisor) ? entradas.get(divisor) : undefined
    if (!divisor || !entrada) break
    cruzados.add(divisor)
    actual = entrada
  }
  return { pasos, falta: null }
}

/**
 * Las entradas de divisor cuyo recorrido hacia la fuente hay que leer todavía
 * para llegar al ODF y a la OLT. `entradas`: divisor → su puerto de entrada.
 */
export function entradasPorLeer(hilos: string[], cache: FilaDeCacheDistribucion[], entradas: Map<string, string>): string[] {
  const ultima = ultimasFilas(cache)
  return [...new Set(hilos.flatMap((h) => subida(h, ultima, entradas).falta ?? []))]
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

/**
 * Lo que hay que leer de la base después de la caché: los puertos y divisores
 * de los pasos que importan, y hacia la fuente los puertos del ODF y de la OLT.
 */
export function idsParaDistribucion(cache: FilaDeCacheDistribucion[]): { puertos: string[]; contenedores: string[] } {
  const puertos = new Set<string>()
  const contenedores = new Set<string>()
  for (const fila of cache) {
    const pasos = pasosDe(fila)
    const haciaArriba = fila.direccion === "UPSTREAM"
    const paso = haciaArriba ? pasos.find((p) => p.tipo_contenedor === "DIVISOR") : pasos.at(-1)
    if (paso) {
      const puerto = texto(paso.puerto_destino) ?? texto(paso.puerto_origen)
      if (puerto) puertos.add(puerto)
      const contenedor = texto(paso.id_contenedor)
      if (contenedor) contenedores.add(contenedor)
    }
    if (haciaArriba) {
      for (const p of pasos) {
        const puerto = p.tipo_contenedor === "ODF" || p.tipo_contenedor === "OLT" ? texto(p.puerto_destino) : null
        if (puerto) puertos.add(puerto)
      }
    }
  }
  return { puertos: [...puertos], contenedores: [...contenedores] }
}

/** «ODF 1» con el tipo y el código del equipo; si el código ya trae el tipo («OLT-01»), solo el código. */
function nombreDeEquipo(equipo: EquipoDistribucion | undefined, tipo: string): string | null {
  const codigo = texto(equipo?.codigo)
  if (!codigo) return null
  const prefijo = texto(equipo?.tipo_equipo) ?? tipo
  return codigo.toLowerCase().startsWith(prefijo.toLowerCase()) ? codigo : `${prefijo} ${codigo}`
}

const nombreDePuerto = (p: PuertoDistribucion | undefined) =>
  texto(p?.nombre) ?? (typeof p?.numero_puerto === "number" ? String(p.numero_puerto) : null)

/**
 * La sección distribución y el origen de cada hilo, con la caché ya leída y el
 * catálogo de puertos, divisores y cubiertas de esos pasos.
 * `divisoresDeLaCubierta` son todos los divisores de cada cubierta (para
 * numerar sus salidas); `entradas`, el puerto de entrada de cada divisor; y
 * `tarjetas` y `equipos`, las tarjetas y bandejas con su OLT u ODF.
 */
export function armarDistribucion({
  hilos,
  cache,
  puertos,
  divisores,
  cubiertas,
  divisoresDeLaCubierta,
  entradas = new Map(),
  tarjetas = new Map(),
  equipos = new Map(),
}: {
  hilos: string[]
  cache: FilaDeCacheDistribucion[]
  puertos: Map<string, PuertoDistribucion>
  divisores: Map<string, DivisorDistribucion>
  cubiertas: Map<string, CubiertaDistribucion>
  divisoresDeLaCubierta: Map<string, DivisorDistribucion[]>
  entradas?: Map<string, string>
  tarjetas?: Map<string, TarjetaDistribucion>
  equipos?: Map<string, EquipoDistribucion>
}): DistribucionDeHilo[] {
  const ultima = ultimasFilas(cache)

  /** El divisor de un puerto: el del paso o, si no, el dueño del puerto. */
  const divisorDe = (paso: PasoEnCache, puerto: PuertoDistribucion | undefined) =>
    divisores.get(texto(paso.id_contenedor) ?? "") ?? divisores.get(puerto?.id_equipo_pert ?? "")

  /** El equipo de un paso hacia la fuente (el ODF o la OLT): su nombre, su tarjeta o bandeja y el puerto. */
  const enEquipo = (pasos: PasoEnCache[], tipo: "ODF" | "OLT") => {
    const paso = pasos.find((p) => p.tipo_contenedor === tipo)
    if (!paso) return null
    const puerto = puertos.get(texto(paso.puerto_destino) ?? "")
    const tarjeta = tarjetas.get(puerto?.id_equipo_pert ?? "") ?? tarjetas.get(texto(paso.id_contenedor) ?? "")
    return {
      nombre: nombreDeEquipo(equipos.get(tarjeta?.id_equipo ?? ""), tipo) ?? tipo,
      slot: tarjeta?.num_slot ?? null,
      puerto: nombreDePuerto(puerto),
    }
  }

  return hilos.map((id) => {
    const fila: DistribucionDeHilo = {
      id,
      cubierta: null,
      divisor: null,
      puertoDivisor: null,
      salida: null,
      destino: null,
      odf: null,
      bandejaOdf: null,
      puertoOdf: null,
      olt: null,
      tarjetaOlt: null,
      puertoOlt: null,
    }

    // Hacia la fuente: el primer divisor que se cruza es de donde sale el hilo.
    const pasoDivisor = pasosDe(ultima.get(llave(id, "UPSTREAM"))).find((p) => p.tipo_contenedor === "DIVISOR")
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

    // Más arriba, cruzando los divisores: el ODF y la OLT.
    const { pasos: haciaLaFuente } = subida(id, ultima, entradas)
    const odf = enEquipo(haciaLaFuente, "ODF")
    if (odf) {
      fila.odf = odf.nombre
      fila.bandejaOdf = odf.slot
      fila.puertoOdf = odf.puerto
    }
    const olt = enEquipo(haciaLaFuente, "OLT")
    if (olt) {
      fila.olt = olt.nombre
      fila.tarjetaOlt = olt.slot
      fila.puertoOlt = olt.puerto
    }

    // Hacia abajo: donde termina el recorrido.
    const final = pasosDe(ultima.get(llave(id, "DOWNSTREAM"))).at(-1)
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
        typeof objeto.message === "string" ? objeto.message : `No se pudo leer el recorrido de los hilos de este cable (HTTP ${status}).`,
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
          odf: texto(f.odf),
          bandejaOdf: entero(f.bandejaOdf),
          puertoOdf: texto(f.puertoOdf),
          olt: texto(f.olt),
          tarjetaOlt: entero(f.tarjetaOlt),
          puertoOlt: texto(f.puertoOlt),
        },
      ]
    }),
  }
}

export const ESPERA_MAXIMA_DISTRIBUCION_MS = 20_000

/** Pide al servidor el recorrido de los hilos de un cable. Nunca lanza: los fallos vuelven como `estado: "error"`. */
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
    return { estado: "error", mensaje: "Error de red al pedir el recorrido de los hilos del cable. Revisa la conexión." }
  }
}
