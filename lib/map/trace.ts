import { fetchConSesion } from "@/lib/auth"

/**
 * Recorrido del trace (ribbon: Red de fibra → Trace).
 *
 * El origen es el UUID de un puerto o de un hilo. `DOWNSTREAM` recorre hacia
 * el usuario y `UPSTREAM` hacia la OLT. Los recorridos ya vienen calculados en
 * la tabla de caché `tab_fiber.element_connection` (una fila por origen y
 * sentido): la ruta `GET /api/traces/{downstream|upstream}/{id}` solo la
 * consulta, sin llamar la función del trace (`fn_trace_conectividad_fina`),
 * que es pesada. Cada fila trae los pasos (`path_secuencia`), el total de
 * pasos, la atenuación total, la geometría del recorrido (`geom_path`, que la
 * ruta entrega como `geomPath`) y cuándo se calculó.
 *
 * Hoy `geom_path` llega vacío. Mientras tanto la ruta busca el cable de cada
 * hilo del recorrido (`tab_fiber.hilo_cable`): esos cables son justo los que
 * unen una cubierta con la siguiente. Cuando la tabla traiga la geometría, se
 * pinta esa.
 */

export type DireccionTrace = "UPSTREAM" | "DOWNSTREAM"
export const DIRECCIONES_TRACE: readonly DireccionTrace[] = ["UPSTREAM", "DOWNSTREAM"]

/** La dirección como va en la URL (`/api/traces/downstream/…`) y como la guarda la tabla. */
export const DIRECCION_EN_URL: Record<DireccionTrace, string> = { UPSTREAM: "upstream", DOWNSTREAM: "downstream" }

/** `downstream` o `upstream` (en minúsculas o mayúsculas) → la dirección de la tabla; otra cosa → `null`. */
export function direccionDeUrl(valor: string | null | undefined): DireccionTrace | null {
  const d = (valor ?? "").trim().toUpperCase()
  return DIRECCIONES_TRACE.includes(d as DireccionTrace) ? (d as DireccionTrace) : null
}

/** Lo que entra o sale en un paso: un puerto o un hilo. */
export type ExtremoDePaso = { tipo: string | null; id: string | null }

/** Geometría GeoJSON (EPSG:4326) de un tramo o del recorrido entero. */
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
      /** Si la caché tiene un recorrido para ese origen y sentido. */
      encontrado: boolean
      pasos: PasoDeTrace[]
      /**
       * Los pasos del recorrido según la tabla (`total_pasos`). Puede ser menos
       * que `pasos.length`: hay recorridos que repiten el último número de paso.
       */
      totalPasos: number
      /** UUID de los cables por donde va el recorrido, en orden y sin repetir. */
      cables: string[]
      /** La geometría del recorrido entero (`geom_path`), si la tabla la trae. */
      geometria: GeometriaDeTramo | null
      /** La atenuación total que guardó la tabla. */
      atenuacionTotal: number | null
      /** Cuándo se calculó el recorrido (ISO). */
      calculadoEn: string | null
      /** La tabla de elementos del recorrido hacia arriba (`null` hacia abajo). */
      elementos: ElementoDelRecorrido[] | null
      /** Si no se pudieron leer los datos de esa tabla, por qué. */
      errorElementos: { mensaje: string; detalle?: string } | null
    }
  | { estado: "error"; mensaje: string; detalle?: string }

/**
 * Una fila de la tabla del trace hacia arriba, como la pidió el ingeniero:
 * cada puerto o hilo por donde pasa el recorrido, dónde está y en qué
 * contenedor, y al final la central.
 *
 * - Puerto de un divisor: ubica «Divisor» y su número; contenedor la cubierta
 *   («Cub nivel 1», «Cub nivel 2») y su etiqueta.
 * - Puerto de una tarjeta o una bandeja: ubica «Tarjeta» o «Bandeja» y su slot;
 *   contenedor el equipo (OLT u ODF) y su código.
 * - Hilo: ubica «Buffer» y su número; contenedor «Cable» y su código; la
 *   longitud es la del cable (medida en campo o, si no hay, la calculada).
 */
export type ElementoDelRecorrido = {
  tipo: "Puerto" | "Hilo" | "Central"
  codigo: string | null
  ubica: string | null
  codigoUbica: string | null
  longitudM: number | null
  contenedor: string | null
  codigoContenedor: string | null
}

/** Lo que la ruta lee de la base para armar esa tabla, por UUID. */
export type DatosDeElementos = {
  hilos: Record<string, { numero: number | null; buffer: number | null; idCable: string | null }>
  cables: Record<string, { codigo: string | null; largoM: number | null }>
  puertos: Record<string, { numero: number | null; nombre: string | null; tipoPert: string | null; idPert: string | null }>
  tarjetas: Record<string, { slot: number | null; tipoEquipo: string | null; idEquipo: string | null }>
  equipos: Record<string, { codigo: string | null; idCabecera: string | null }>
  divisores: Record<string, { numero: number | null; codigo: string | null; idCubierta: string | null }>
  cubiertas: Record<string, { etiqueta: string | null; funcion: string | null }>
  cabeceras: Record<string, { nombre: string | null }>
}

/** Lo que puede tardar la consulta antes de darla por caída. */
export const ESPERA_MAXIMA_TRACE_MS = 30_000

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)

export function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

/** Una geometría GeoJSON, como objeto o como texto; lo que no lo sea se ignora. */
export function geometria(v: unknown): GeometriaDeTramo | null {
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

/** La lista de pasos: sola, en texto JSON o dentro de un objeto (`{ pasos: [...] }`, como la devuelve la ruta). */
function filasDe(datos: unknown): unknown[] {
  if (typeof datos === "string") {
    try {
      return filasDe(JSON.parse(datos))
    } catch {
      return []
    }
  }
  if (Array.isArray(datos)) return datos
  if (!datos || typeof datos !== "object") return []
  const objeto = datos as Record<string, unknown>
  for (const clave of ["pasos", "path_secuencia", "data", "resultado"]) {
    if (Array.isArray(objeto[clave])) return objeto[clave] as unknown[]
  }
  return []
}

/**
 * Lo que entra o sale en un paso. La caché lo guarda como `tip_origen`,
 * `puerto_origen` e `hilo_origen`; la función del trace como
 * `tip_elemento_origen`, `id_puerto_origen` e `id_hilo_origen`. Se aceptan los
 * dos.
 */
function extremo(f: Record<string, unknown>, lado: "origen" | "destino"): ExtremoDePaso {
  const tipo = texto(f[`tip_elemento_${lado}`]) ?? texto(f[`tipo_elemento_${lado}`]) ?? texto(f[`tip_${lado}`])
  const hilo = texto(f[`id_hilo_${lado}`]) ?? texto(f[`hilo_${lado}`])
  const puerto = texto(f[`id_puerto_${lado}`]) ?? texto(f[`puerto_${lado}`])
  return { tipo, id: tipo === "HILO" ? (hilo ?? puerto) : (puerto ?? hilo) }
}

/**
 * Lee los pasos tal como los guarda la caché (o la función), o como los
 * reenvía la ruta, ya leídos: la segunda lectura no pierde nada. Quedan
 * ordenados por número de paso; una fila sin número no es un paso.
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
    pasos.push({
      paso: n,
      contenedor: { id: texto(f.id_contenedor), tipo: texto(f.tipo_contenedor) },
      origen: extremo(f, "origen"),
      destino: extremo(f, "destino"),
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
    for (const e of [p.origen, p.destino]) {
      if (e.tipo === "HILO" && e.id && !hilos.includes(e.id)) hilos.push(e.id)
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

/**
 * Los puertos e hilos del recorrido en orden: el origen y lo que sale de cada
 * paso, sin repetir (hay recorridos que repiten el último paso).
 */
export function elementosDelRecorrido(pasos: PasoDeTrace[]): ExtremoDePaso[] {
  if (pasos.length === 0) return []
  const vistos = new Set<string>()
  const lista: ExtremoDePaso[] = []
  for (const e of [pasos[0].origen, ...pasos.map((p) => p.destino)]) {
    if (!e.id || vistos.has(e.id)) continue
    vistos.add(e.id)
    lista.push(e)
  }
  return lista
}

const UBICA: Record<string, string> = { DIV: "Divisor", TJT: "Tarjeta", BDJ: "Bandeja" }

/** «Primer nivel» → «Cub nivel 1», «Segundo nivel» → «Cub nivel 2». */
function contenedorDeCubierta(funcion: string | null): string {
  if (!funcion) return "Cubierta"
  const nivel = /primer/i.test(funcion) ? 1 : /segundo/i.test(funcion) ? 2 : /tercer/i.test(funcion) ? 3 : null
  return nivel ? `Cub nivel ${nivel}` : `Cubierta (${funcion})`
}

const textoDe = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : String(v))

/** Arma la tabla del trace hacia arriba con lo que la ruta leyó de la base. */
export function armarTablaHaciaArriba(pasos: PasoDeTrace[], datos: DatosDeElementos): ElementoDelRecorrido[] {
  const filas: ElementoDelRecorrido[] = []
  let cabecera: string | null = null
  for (const e of elementosDelRecorrido(pasos)) {
    const id = e.id as string
    if (e.tipo === "HILO") {
      const hilo = datos.hilos[id]
      const cable = hilo?.idCable ? datos.cables[hilo.idCable] : undefined
      filas.push({
        tipo: "Hilo",
        codigo: textoDe(hilo?.numero),
        ubica: hilo?.buffer !== null && hilo?.buffer !== undefined ? "Buffer" : null,
        codigoUbica: textoDe(hilo?.buffer),
        longitudM: cable?.largoM ?? null,
        contenedor: "Cable",
        codigoContenedor: cable?.codigo ?? null,
      })
      continue
    }
    const puerto = datos.puertos[id]
    const tipoPert = puerto?.tipoPert ?? null
    const fila: ElementoDelRecorrido = {
      tipo: "Puerto",
      codigo: puerto?.nombre ?? textoDe(puerto?.numero),
      ubica: tipoPert ? (UBICA[tipoPert] ?? tipoPert) : null,
      codigoUbica: null,
      longitudM: null,
      contenedor: null,
      codigoContenedor: null,
    }
    if (tipoPert === "DIV" && puerto?.idPert) {
      const divisor = datos.divisores[puerto.idPert]
      const cubierta = divisor?.idCubierta ? datos.cubiertas[divisor.idCubierta] : undefined
      fila.codigoUbica = textoDe(divisor?.numero) ?? divisor?.codigo ?? null
      fila.contenedor = contenedorDeCubierta(cubierta?.funcion ?? null)
      fila.codigoContenedor = cubierta?.etiqueta ?? null
    } else if (puerto?.idPert) {
      const tarjeta = datos.tarjetas[puerto.idPert]
      const equipo = tarjeta?.idEquipo ? datos.equipos[tarjeta.idEquipo] : undefined
      fila.codigoUbica = textoDe(tarjeta?.slot)
      fila.contenedor = tarjeta?.tipoEquipo ?? null
      fila.codigoContenedor = equipo?.codigo ?? null
      if (equipo?.idCabecera) cabecera = datos.cabeceras[equipo.idCabecera]?.nombre ?? cabecera
    }
    filas.push(fila)
  }
  // Al final, la central donde está el equipo al que llega el recorrido.
  if (cabecera) {
    filas.push({ tipo: "Central", codigo: cabecera, ubica: null, codigoUbica: null, longitudM: null, contenedor: null, codigoContenedor: null })
  }
  return filas
}

/** La suma de las longitudes de la tabla (las de los hilos). */
export function sumaDeLongitudes(filas: ElementoDelRecorrido[]): number {
  return filas.reduce((suma, f) => suma + (f.longitudM ?? 0), 0)
}

/** Lee la tabla como la reenvía la ruta; lo que no tenga la forma esperada se descarta. */
function normalizarElementos(v: unknown): ElementoDelRecorrido[] | null {
  if (!Array.isArray(v)) return null
  const tipos = ["Puerto", "Hilo", "Central"]
  return v.flatMap((f) => {
    if (!f || typeof f !== "object") return []
    const o = f as Record<string, unknown>
    if (!tipos.includes(o.tipo as string)) return []
    return [
      {
        tipo: o.tipo as ElementoDelRecorrido["tipo"],
        codigo: texto(o.codigo),
        ubica: texto(o.ubica),
        codigoUbica: texto(o.codigoUbica),
        longitudM: numero(o.longitudM),
        contenedor: texto(o.contenedor),
        codigoContenedor: texto(o.codigoContenedor),
      },
    ]
  })
}

/** El error de la tabla como lo manda la ruta (`{ message, detalle }`). */
function errorDeElementos(v: unknown): { mensaje: string; detalle?: string } | null {
  if (!v || typeof v !== "object") return null
  const { message, detalle } = v as { message?: unknown; detalle?: unknown }
  if (typeof message !== "string") return null
  return { mensaje: message, ...(typeof detalle === "string" ? { detalle } : {}) }
}

/** Clasifica lo que responde `GET /api/traces/{direccion}/{id}`. */
export function clasificarRespuestaTrace(status: number, cuerpo: unknown): ResultadoTrace {
  if (status < 200 || status >= 300) {
    const { message: mensaje, detalle } = (cuerpo ?? {}) as { message?: unknown; detalle?: unknown }
    return {
      estado: "error",
      mensaje: typeof mensaje === "string" ? mensaje : `No se pudo consultar el recorrido (HTTP ${status}).`,
      ...(typeof detalle === "string" ? { detalle } : {}),
    }
  }
  const c = (cuerpo ?? {}) as Record<string, unknown>
  const pasos = normalizarPasos(cuerpo)
  return {
    estado: "ok",
    // Una respuesta sin el dato se toma por encontrada si trae pasos.
    encontrado: typeof c.encontrado === "boolean" ? c.encontrado : pasos.length > 0,
    pasos,
    totalPasos: numero(c.totalPasos) ?? new Set(pasos.map((p) => p.paso)).size,
    cables: Array.isArray(c.cables) ? c.cables.filter((x): x is string => typeof x === "string") : [],
    geometria: geometria(c.geomPath),
    atenuacionTotal: numero(c.atenuacionTotal) ?? atenuacionTotal(pasos),
    calculadoEn: texto(c.calculadoEn),
    elementos: normalizarElementos(c.elementos),
    errorElementos: errorDeElementos(c.errorElementos),
  }
}

/** Pide el recorrido al servidor. Nunca lanza: los fallos vuelven como `estado: "error"`. */
export async function obtenerTrace(
  idOrigen: string,
  direccion: DireccionTrace,
  esperaMaxima = ESPERA_MAXIMA_TRACE_MS,
): Promise<ResultadoTrace> {
  try {
    const url = `/api/traces/${DIRECCION_EN_URL[direccion]}/${encodeURIComponent(idOrigen)}`
    const res = await fetchConSesion(url, { signal: AbortSignal.timeout(esperaMaxima) })
    const cuerpo: unknown = await res.json().catch(() => null)
    return clasificarRespuestaTrace(res.status, cuerpo)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { estado: "error", mensaje: `La base no respondió en ${esperaMaxima / 1000} segundos. Vuelve a intentarlo.` }
    }
    return { estado: "error", mensaje: "Error de red al pedir el recorrido. Revisa la conexión." }
  }
}
