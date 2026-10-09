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
       * que `pasos.length`: en un recorrido que se abre en dos (un hilo fusionado
       * con dos) hay dos filas con el mismo número de paso.
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
      /**
       * Hacia arriba, los recorridos de la caché con que la ruta lo continuó
       * al cruzar un divisor (vacío si no cruza ninguno, y hacia abajo).
       */
      tramos: TramoDelTrace[]
      /** La tabla del trace hacia arriba (`null` hacia abajo). */
      tabla: TablaHaciaArriba | null
      /** Si no se pudieron leer los datos de esa tabla, por qué. */
      errorTabla: { mensaje: string; detalle?: string } | null
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
 * - Hilo: ubica «Buffer» y su número; contenedor «Cable»; la longitud es la
 *   del cable (medida en campo o, si no hay, la calculada).
 *
 * «Código elemento» y «Código contenedor» son los UUID: del hilo o el puerto
 * (de la cabecera en la fila de la central) y del cable, la cubierta o el
 * equipo (ODF, OLT) que lo contiene. Lo que se lee (hilo 56, cable 2103630,
 * CO19) va en `nombre` y `nombreContenedor`.
 *
 * Los campos opcionales no son columnas de la tabla ni del Excel: sirven para
 * leer la fila, ubicar el elemento en el mapa y las muestras de color.
 */
export type ElementoDelRecorrido = {
  tipo: "Puerto" | "Hilo" | "Central"
  codigo: string | null
  ubica: string | null
  codigoUbica: string | null
  longitudM: number | null
  contenedor: string | null
  codigoContenedor: string | null
  /** Lo que se lee del elemento: el número del hilo, el nombre del puerto, el nombre de la central. */
  nombre?: string | null
  /** Lo que se lee del contenedor: el código del cable, la etiqueta de la cubierta, el código del equipo. */
  nombreContenedor?: string | null
  /** La cubierta donde está el puerto de un divisor. */
  idCubierta?: string | null
  /** La función de esa cubierta («Primer nivel»), para su color. */
  funcionCubierta?: string | null
  /** El cable del hilo. */
  idCable?: string | null
  /** Los colores del hilo y de su buffer como los nombra la base («Verde»). */
  colorHilo?: string | null
  colorBuffer?: string | null
}

/** Una ruta del recorrido hacia arriba, ya como tabla. */
export type RutaHaciaArriba = {
  filas: ElementoDelRecorrido[]
  /** La suma de las longitudes de sus hilos. */
  sumaM: number
  /** Si termina en un puerto de una tarjeta de la OLT. */
  llegaALaOlt: boolean
  /** Los divisores por donde pasa: «divisor 1 (1x8PC) de CO02, de S5 a E1». */
  divisores: string[]
}

/**
 * La tabla del trace hacia arriba. Casi siempre es una sola ruta; si la caché
 * trae una bifurcación (un hilo fusionado con dos), sale una ruta por camino.
 * Los avisos dicen lo que no cuadra en los datos, para revisarlo en la base.
 */
export type TablaHaciaArriba = {
  rutas: RutaHaciaArriba[]
  avisos: string[]
}

/**
 * Otro recorrido de la caché con que la ruta continúa el pedido: hacia arriba,
 * la caché se detiene en la salida de un divisor y sigue en el recorrido que
 * empieza en su entrada.
 */
export type TramoDelTrace = {
  idOrigen: string
  pasos: PasoDeTrace[]
  totalPasos: number
  atenuacionTotal: number | null
  calculadoEn: string | null
  geometria: GeometriaDeTramo | null
}

/** Lo que la ruta lee de la base para armar esa tabla, por UUID. */
export type DatosDeElementos = {
  hilos: Record<
    string,
    { numero: number | null; buffer: number | null; idCable: string | null; colorHilo?: string | null; colorBuffer?: string | null }
  >
  cables: Record<string, { codigo: string | null; largoM: number | null }>
  puertos: Record<
    string,
    { numero: number | null; nombre: string | null; tipoPert: string | null; idPert: string | null; sentido?: string | null }
  >
  tarjetas: Record<string, { slot: number | null; tipoEquipo: string | null; idEquipo: string | null }>
  equipos: Record<string, { codigo: string | null; idCabecera: string | null }>
  divisores: Record<string, { numero: number | null; codigo: string | null; idCubierta: string | null; modelo?: string | null }>
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
 * paso, sin repetir (en un recorrido que se abre en dos, un elemento sale dos veces).
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

/**
 * Las rutas del recorrido: del origen a cada final, siguiendo los pasos (lo
 * que sale de uno es lo que entra al siguiente). Casi siempre es una. La caché
 * tiene recorridos que se abren en dos (un hilo fusionado con dos hilos o con
 * dos puertos): ahí sale una ruta por camino, hasta `maximo`.
 */
export function rutasDelRecorrido(pasos: PasoDeTrace[], origen?: string | null, maximo = 8): ExtremoDePaso[][] {
  const siguientes = new Map<string, ExtremoDePaso[]>()
  for (const p of pasos) {
    const de = p.origen.id
    const a = p.destino.id
    if (!de || !a || de === a) continue
    const lista = siguientes.get(de) ?? []
    if (!lista.some((e) => e.id === a)) lista.push(p.destino)
    siguientes.set(de, lista)
  }
  const inicio = (origen ? pasos.find((p) => p.origen.id === origen)?.origen : undefined) ?? pasos[0]?.origen
  if (!inicio?.id) return []
  const rutas: ExtremoDePaso[][] = []
  const seguir = (camino: ExtremoDePaso[]) => {
    if (rutas.length >= maximo) return
    const ultimo = camino[camino.length - 1].id as string
    const proximos = (siguientes.get(ultimo) ?? []).filter((e) => !camino.some((c) => c.id === e.id))
    if (proximos.length === 0) rutas.push(camino)
    else for (const e of proximos) seguir([...camino, e])
  }
  seguir([inicio])
  return rutas
}

/** El contenedor del paso con que la ruta cruza un divisor por dentro. */
export const CRUCE_DE_DIVISOR = "DIVISOR_INTERNO"

/**
 * El paso que une la salida de un divisor, donde termina un recorrido hacia
 * arriba de la caché, con su entrada, donde empieza el siguiente. Solo lo usa
 * la ruta para encadenar los dos; no es un paso de la caché.
 */
export function pasoPorDentroDelDivisor(salida: string, entrada: string, idDivisor: string): PasoDeTrace {
  return {
    paso: 0,
    contenedor: { id: idDivisor, tipo: CRUCE_DE_DIVISOR },
    origen: { tipo: "PUERTO", id: salida },
    destino: { tipo: "PUERTO", id: entrada },
    conexion: CRUCE_DE_DIVISOR,
    atenuacionDb: null,
    atenuacionAcumulada: null,
    geometria: null,
  }
}

const UBICA: Record<string, string> = { DIV: "Divisor", TJT: "Tarjeta", BDJ: "Bandeja" }

/** «Primer nivel» → «Cub nivel 1», «Segundo nivel» → «Cub nivel 2». */
function contenedorDeCubierta(funcion: string | null): string {
  if (!funcion) return "Cubierta"
  const nivel = /primer/i.test(funcion) ? 1 : /segundo/i.test(funcion) ? 2 : /tercer/i.test(funcion) ? 3 : null
  return nivel ? `Cub nivel ${nivel}` : `Cubierta (${funcion})`
}

const textoDe = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : String(v))

/** «a», «a y b», «a, b y c». */
function enLista(partes: string[]): string {
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`
}

/** «el hilo 13» → «del hilo 13»: la contracción de «de el». */
const conDe = (texto: string) => (texto.startsWith("el ") ? `del ${texto.slice(3)}` : `de ${texto}`)

/** «divisor 1 (1x8PC) de CO02». */
function nombreDeDivisor(idDivisor: string, datos: DatosDeElementos): string {
  const d = datos.divisores[idDivisor]
  const cubierta = d?.idCubierta ? datos.cubiertas[d.idCubierta]?.etiqueta : null
  return `divisor ${d?.numero ?? "sin número"}${d?.modelo ? ` (${d.modelo})` : ""}${cubierta ? ` de ${cubierta}` : ""}`
}

/** Un elemento del recorrido en palabras, para los avisos: «el hilo 13 del cable 2103191». */
function describir(e: ExtremoDePaso, datos: DatosDeElementos): string {
  const id = e.id ?? ""
  if (e.tipo === "HILO") {
    const h = datos.hilos[id]
    const cable = h?.idCable ? datos.cables[h.idCable]?.codigo : null
    return h ? `el hilo ${h.numero ?? "sin número"}${cable ? ` del cable ${cable}` : ""}` : `el hilo ${id.slice(0, 8)}…`
  }
  const p = datos.puertos[id]
  if (!p) return `el puerto ${id.slice(0, 8)}…`
  const nombre = p.nombre ?? textoDe(p.numero) ?? "sin número"
  if (p.tipoPert === "DIV" && p.idPert) return `el puerto ${nombre} del ${nombreDeDivisor(p.idPert, datos)}`
  const t = p.idPert ? datos.tarjetas[p.idPert] : undefined
  const equipo = t?.idEquipo ? datos.equipos[t.idEquipo]?.codigo : null
  const donde = p.tipoPert === "TJT" ? ` de la tarjeta ${t?.slot ?? "?"}` : p.tipoPert === "BDJ" ? ` de la bandeja ${t?.slot ?? "?"}` : ""
  const en = t?.tipoEquipo ? ` ${t.tipoEquipo === "OLT" ? "de la OLT" : `del ${t.tipoEquipo}`}${equipo ? ` ${equipo}` : ""}` : ""
  return `el puerto ${nombre}${donde}${en}`
}

/** La fila de la tabla de un puerto o un hilo. */
function filaDe(e: ExtremoDePaso, datos: DatosDeElementos): ElementoDelRecorrido {
  const id = e.id ?? ""
  if (e.tipo === "HILO") {
    const hilo = datos.hilos[id]
    const cable = hilo?.idCable ? datos.cables[hilo.idCable] : undefined
    return {
      tipo: "Hilo",
      codigo: id || null,
      ubica: hilo?.buffer !== null && hilo?.buffer !== undefined ? "Buffer" : null,
      codigoUbica: textoDe(hilo?.buffer),
      longitudM: cable?.largoM ?? null,
      contenedor: "Cable",
      codigoContenedor: hilo?.idCable ?? null,
      nombre: textoDe(hilo?.numero),
      nombreContenedor: cable?.codigo ?? null,
      idCable: hilo?.idCable ?? null,
      colorHilo: hilo?.colorHilo ?? null,
      colorBuffer: hilo?.colorBuffer ?? null,
    }
  }
  const puerto = datos.puertos[id]
  const tipoPert = puerto?.tipoPert ?? null
  const fila: ElementoDelRecorrido = {
    tipo: "Puerto",
    codigo: id || null,
    ubica: tipoPert ? (UBICA[tipoPert] ?? tipoPert) : null,
    codigoUbica: null,
    longitudM: null,
    contenedor: null,
    codigoContenedor: null,
    nombre: puerto?.nombre ?? textoDe(puerto?.numero),
    nombreContenedor: null,
  }
  if (tipoPert === "DIV" && puerto?.idPert) {
    const divisor = datos.divisores[puerto.idPert]
    const cubierta = divisor?.idCubierta ? datos.cubiertas[divisor.idCubierta] : undefined
    fila.codigoUbica = textoDe(divisor?.numero) ?? divisor?.codigo ?? null
    fila.contenedor = contenedorDeCubierta(cubierta?.funcion ?? null)
    fila.codigoContenedor = divisor?.idCubierta ?? null
    fila.nombreContenedor = cubierta?.etiqueta ?? null
    fila.idCubierta = divisor?.idCubierta ?? null
    fila.funcionCubierta = cubierta?.funcion ?? null
  } else if (puerto?.idPert) {
    const tarjeta = datos.tarjetas[puerto.idPert]
    const equipo = tarjeta?.idEquipo ? datos.equipos[tarjeta.idEquipo] : undefined
    fila.codigoUbica = textoDe(tarjeta?.slot)
    fila.contenedor = tarjeta?.tipoEquipo ?? null
    fila.codigoContenedor = tarjeta?.idEquipo ?? null
    fila.nombreContenedor = equipo?.codigo ?? null
  }
  return fila
}

/** La central (cabecera) donde está el equipo de ese puerto (tarjeta o bandeja), si se sabe. */
function centralDe(e: ExtremoDePaso, datos: DatosDeElementos): { id: string; nombre: string | null } | null {
  const puerto = e.tipo === "HILO" || !e.id ? undefined : datos.puertos[e.id]
  if (!puerto?.idPert || puerto.tipoPert === "DIV") return null
  const equipo = datos.equipos[datos.tarjetas[puerto.idPert]?.idEquipo ?? ""]
  return equipo?.idCabecera ? { id: equipo.idCabecera, nombre: datos.cabeceras[equipo.idCabecera]?.nombre ?? null } : null
}

/**
 * Arma la tabla del trace hacia arriba con lo que la ruta leyó de la base.
 * `pasos` son los de la caché, ya unidos con los de la entrada de cada divisor
 * que cruza (ver `pasoPorDentroDelDivisor`); `origen`, el UUID de donde sale.
 *
 * Cada ruta va del origen a su final, en orden, con la central al final si
 * llega a un equipo de la central. Los avisos cuentan lo que no cuadra: una
 * bifurcación, una ruta que no llega a la OLT, elementos que no están en la
 * base o pasos que no encadenan con el origen.
 */
export function armarTablaHaciaArriba(pasos: PasoDeTrace[], datos: DatosDeElementos, origen?: string | null): TablaHaciaArriba {
  const caminos = rutasDelRecorrido(pasos, origen)
  const rutas = caminos.map((camino): RutaHaciaArriba => {
    const filas: ElementoDelRecorrido[] = []
    const divisores: string[] = []
    let central: { id: string; nombre: string | null } | null = null
    camino.forEach((e, i) => {
      filas.push(filaDe(e, datos))
      central = centralDe(e, datos) ?? central
      // Dos puertos seguidos del mismo divisor: el recorrido lo cruzó por dentro.
      const siguiente = camino[i + 1]
      const a = e.tipo !== "HILO" && e.id ? datos.puertos[e.id] : undefined
      const b = siguiente && siguiente.tipo !== "HILO" && siguiente.id ? datos.puertos[siguiente.id] : undefined
      if (a?.tipoPert === "DIV" && b?.tipoPert === "DIV" && a.idPert && a.idPert === b.idPert) {
        divisores.push(`${nombreDeDivisor(a.idPert, datos)}, de ${a.nombre ?? a.numero ?? "?"} a ${b.nombre ?? b.numero ?? "?"}`)
      }
    })
    // `central` cambia dentro del forEach: TypeScript no lo ve.
    const cabecera = central as { id: string; nombre: string | null } | null
    if (cabecera) {
      filas.push({
        tipo: "Central",
        codigo: cabecera.id,
        ubica: null,
        codigoUbica: null,
        longitudM: null,
        contenedor: null,
        codigoContenedor: null,
        nombre: cabecera.nombre,
      })
    }
    const ultimo = camino[camino.length - 1]
    const final = ultimo.tipo !== "HILO" && ultimo.id ? datos.puertos[ultimo.id] : undefined
    return { filas, sumaM: sumaDeLongitudes(filas), llegaALaOlt: final?.tipoPert === "TJT", divisores }
  })

  const avisos: string[] = []
  // Una bifurcación: un elemento seguido por dos distintos según la ruta.
  const despues = new Map<string, Map<string, ExtremoDePaso>>()
  for (const camino of caminos) {
    camino.forEach((e, i) => {
      const siguiente = camino[i + 1]
      if (!siguiente?.id || !e.id) return
      const m = despues.get(e.id) ?? new Map<string, ExtremoDePaso>()
      m.set(siguiente.id, siguiente)
      despues.set(e.id, m)
    })
  }
  const dichos = new Set<string>()
  for (const e of caminos.flat()) {
    const m = e.id ? despues.get(e.id) : undefined
    if (!m || m.size < 2 || dichos.has(e.id as string)) continue
    dichos.add(e.id as string)
    avisos.push(
      `El recorrido se abre en ${m.size} después ${conDe(describir(e, datos))}: sigue por ${enLista([...m.values()].map((s) => describir(s, datos)))}. ` +
        `${e.tipo === "HILO" ? "Un hilo" : "Un puerto"} no debería estar conectado con dos; hay que revisar esa conectividad en la base.`,
    )
  }
  // Rutas que no llegan a la OLT, agrupadas por dónde terminan.
  const cortes = new Map<string, { final: ExtremoDePaso; rutas: number[] }>()
  rutas.forEach((r, i) => {
    if (r.llegaALaOlt) return
    const final = caminos[i][caminos[i].length - 1]
    const clave = final.id ?? `ruta-${i}`
    const corte = cortes.get(clave) ?? { final, rutas: [] }
    corte.rutas.push(i + 1)
    cortes.set(clave, corte)
  })
  for (const { final, rutas: numeros } of cortes.values()) {
    const quien =
      caminos.length === 1
        ? "El recorrido no llega"
        : numeros.length === 1
          ? `La ruta ${numeros[0]} no llega`
          : `Las rutas ${enLista(numeros.map(String))} no llegan`
    const puerto = final.tipo !== "HILO" && final.id ? datos.puertos[final.id] : undefined
    const porque =
      final.tipo === "HILO"
        ? ", que no tiene más conexiones registradas."
        : puerto?.tipoPert === "DIV" && puerto.sentido === "S"
          ? ", y la entrada de ese divisor no tiene recorrido hacia arriba en la caché."
          : "."
    const donde = describir(final, datos)
    avisos.push(`${quien} a la OLT: termina en ${donde}${donde.endsWith("…") && porque === "." ? "" : porque}`)
  }
  // Elementos que la caché nombra y la base no tiene.
  const sinDatos = new Set(
    caminos.flat().flatMap((e) => (e.id && !(e.tipo === "HILO" ? datos.hilos[e.id] : datos.puertos[e.id]) ? [e.id] : [])),
  )
  if (sinDatos.size > 0) {
    avisos.push(
      sinDatos.size === 1
        ? "Un elemento del recorrido no está en la base: su fila sale incompleta."
        : `${sinDatos.size} elementos del recorrido no están en la base: sus filas salen incompletas.`,
    )
  }
  // Pasos de la caché que no encadenan con el origen.
  const enRutas = new Set(caminos.flat().map((e) => e.id))
  const nombrados = new Set(pasos.flatMap((p) => [p.origen.id, p.destino.id]).filter((id): id is string => !!id))
  const sueltos = [...nombrados].filter((id) => !enRutas.has(id)).length
  if (sueltos > 0) {
    avisos.push(
      sueltos === 1
        ? "Un elemento de la caché no encadena con el recorrido desde el origen y no sale en la tabla."
        : `${sueltos} elementos de la caché no encadenan con el recorrido desde el origen y no salen en la tabla.`,
    )
  }
  return { rutas, avisos }
}

/** La suma de las longitudes de la tabla (las de los hilos), al centímetro. */
export function sumaDeLongitudes(filas: ElementoDelRecorrido[]): number {
  return Math.round(filas.reduce((suma, f) => suma + (f.longitudM ?? 0), 0) * 100) / 100
}

/** Lee las filas como las reenvía la ruta; lo que no tenga la forma esperada se descarta. */
function normalizarElementos(v: unknown): ElementoDelRecorrido[] {
  if (!Array.isArray(v)) return []
  const tipos = ["Puerto", "Hilo", "Central"]
  const opcionales = ["nombre", "nombreContenedor", "idCubierta", "funcionCubierta", "idCable", "colorHilo", "colorBuffer"] as const
  return v.flatMap((f) => {
    if (!f || typeof f !== "object") return []
    const o = f as Record<string, unknown>
    if (!tipos.includes(o.tipo as string)) return []
    const fila: ElementoDelRecorrido = {
      tipo: o.tipo as ElementoDelRecorrido["tipo"],
      codigo: texto(o.codigo),
      ubica: texto(o.ubica),
      codigoUbica: texto(o.codigoUbica),
      longitudM: numero(o.longitudM),
      contenedor: texto(o.contenedor),
      codigoContenedor: texto(o.codigoContenedor),
    }
    for (const clave of opcionales) if (clave in o) fila[clave] = texto(o[clave])
    return [fila]
  })
}

const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])

/** Lee la tabla como la reenvía la ruta. */
function normalizarTabla(v: unknown): TablaHaciaArriba | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.rutas)) return null
  const rutas = o.rutas.flatMap((r): RutaHaciaArriba[] => {
    if (!r || typeof r !== "object") return []
    const x = r as Record<string, unknown>
    const filas = normalizarElementos(x.filas)
    return [{ filas, sumaM: numero(x.sumaM) ?? sumaDeLongitudes(filas), llegaALaOlt: x.llegaALaOlt === true, divisores: textos(x.divisores) }]
  })
  return { rutas, avisos: textos(o.avisos) }
}

/** Lee los tramos con que la ruta continuó el recorrido. */
function normalizarTramos(v: unknown): TramoDelTrace[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((t): TramoDelTrace[] => {
    if (!t || typeof t !== "object") return []
    const o = t as Record<string, unknown>
    const idOrigen = texto(o.idOrigen)
    if (!idOrigen) return []
    const pasos = normalizarPasos(o.pasos)
    return [
      {
        idOrigen,
        pasos,
        totalPasos: numero(o.totalPasos) ?? new Set(pasos.map((p) => p.paso)).size,
        atenuacionTotal: numero(o.atenuacionTotal),
        calculadoEn: texto(o.calculadoEn),
        geometria: geometria(o.geomPath),
      },
    ]
  })
}

/** El error de la tabla como lo manda la ruta (`{ message, detalle }`). */
function errorDeTabla(v: unknown): { mensaje: string; detalle?: string } | null {
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
    tramos: normalizarTramos(c.tramos),
    tabla: normalizarTabla(c.tabla),
    errorTabla: errorDeTabla(c.errorTabla),
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
