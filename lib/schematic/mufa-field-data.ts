import { fiberColor, fiberColorByName, getColorITU, type FiberColor } from "./fiber-colors"

/**
 * Datos de campo de una MUFA, tal como los entrega el backend:
 * cables → buffers → hilos, y las fusiones agrupadas en bandejas.
 *
 * Se admiten dos formatos de bandeja, porque el backend cambió a mitad de
 * camino:
 *
 * 1. Con slots explícitos (`JsonMufa.txt`): cada bandeja trae su
 *    `Numero_bandeja`, su `Capacidad_fusiones` y su lista `Slots` /
 *    `Empalmes_internos`, donde cada empalme ya dice en qué slot va.
 * 2. Sin slots (`JsonNoSlots.txt`): llega una sola entrada con
 *    `bandeja_id: 0` y un arreglo global `Conectividades`. Aquí las posiciones
 *    no vienen dadas, así que se reparten secuencialmente entre las bandejas
 *    instaladas (`can_band_inst`) según la capacidad de cada una.
 *
 * Y una cubierta puede no tener bandejas: con `can_band_inst: 0` las fusiones
 * son directas entre el cable de entrada y el de salida, y `Conectividades`
 * llega en la raíz del JSON, sin arreglo de bandejas.
 *
 * Una cubierta de primer o segundo nivel puede traer divisores en vez de
 * bandejas. `can_div_inst` dice cuántos hay instalados y `Splitters` los
 * describe. Cada fusión que toca un puerto (`puerto_id` + `splitter_id`, sin
 * `hilo_id`) se dibuja como un tramo hasta ese puerto: la entrada del divisor
 * a la izquierda y las salidas a la derecha. Si `can_div_inst` no viene o es
 * 0, esas conexiones se apartan con un aviso, como antes.
 *
 * Este módulo no importa JointJS: valida, normaliza y deja el modelo listo
 * para el renderizado en `mufa-field-graph.ts`.
 */

// ---------------------------------------------------------------------------
// Forma del JSON de entrada (tal cual llega del backend)
// ---------------------------------------------------------------------------

/**
 * Los mockups usan identificadores numéricos y la base devuelve UUID en
 * texto. Se admiten los dos y se comparan siempre como texto.
 */
export type IdCampo = number | string

export type HiloCampoJSON = {
  hilo_id: IdCampo
  numero: number
  color: string
}

export type BufferCampoJSON = {
  Buffer_id: IdCampo
  color: string
  hilos: HiloCampoJSON[]
}

export type CableCampoJSON = {
  cable_id: IdCampo
  codigo: string
  sentido: string
  can_hilos?: number
  Buffers: BufferCampoJSON[]
}

export type ExtremoEmpalmeJSON = {
  /** Ausentes cuando la punta es un puerto de divisor. */
  cable_id?: IdCampo
  hilo_id?: IdCampo
  /**
   * Una punta en un puerto de divisor (funciones por nivel de la base): trae
   * el puerto y el divisor en vez del hilo. Solo se dibuja cuando la cubierta
   * declara divisores instalados (`can_div_inst` > 0); si no, se aparta.
   */
  puerto_id?: IdCampo
  splitter_id?: IdCampo
}

export type PuertoDivisorJSON = {
  puerto_id: IdCampo
  numero?: number
  nombre?: string
  /** `E`/`entrada` a la izquierda, `S`/`salida` a la derecha. */
  direccion?: string
  dir_principal_senhal?: string
}

export type DivisorCampoJSON = {
  splitter_id: IdCampo
  num_divisor?: number
  cod_divisor?: string
  modelo_divisor?: string
  puertos?: PuertoDivisorJSON[]
  Puertos?: PuertoDivisorJSON[]
}

/**
 * Una fusión entre dos hilos. `Slot` sólo viene en el formato con slots
 * explícitos; `Conectividad` es el número de orden en los mockups y el UUID
 * del registro en la base.
 */
export type ConectividadCampoJSON = {
  Slot?: number
  Conectividad?: IdCampo
  "Tipo empalme": string
  atenuacion: number
  origen: ExtremoEmpalmeJSON
  destino: ExtremoEmpalmeJSON
}

export type BandejaCampoJSON = {
  bandeja_id: number
  Numero_bandeja?: number
  Capacidad_fusiones?: number
  Slots_usados?: number
  /** Formato con slots explícitos; algunas respuestas usan una clave y otras la otra. */
  Slots?: ConectividadCampoJSON[]
  Empalmes_internos?: ConectividadCampoJSON[]
  /** Formato nuevo: arreglo global de fusiones sin posición asignada. */
  Conectividades?: ConectividadCampoJSON[]
}

export type MufaCampoJSON = {
  mufa_id: IdCampo
  tipo: string
  estado: string
  /**
   * Capacidad física de bandejas de la cubierta. La función de la base no la
   * envía hoy, así que puede faltar.
   */
  capacidad_band?: number
  /** `0` (o sin dato) significa que no hay bandejas: las fusiones son directas. */
  can_band_inst: number | null
  /**
   * Divisores instalados. Con un valor mayor que 0 el centro del esquema son
   * los divisores y no las bandejas.
   */
  can_div_inst?: number | null
  cables: CableCampoJSON[]
  /** Formato anterior (clave en minúscula). */
  bandejas?: BandejaCampoJSON[]
  /** Formato nuevo (clave capitalizada). */
  Bandejas?: BandejaCampoJSON[]
  /**
   * Fusiones en la raíz, sin bandeja: así llegan de la función de conectividad
   * (`get_esquema_cubierta_json`, antes `get_json_conectividad_cubierta_n0` y
   * `_n12`) y en las cubiertas sin bandejas.
   */
  Conectividades?: ConectividadCampoJSON[]
  /** Divisores de la cubierta (`_n12`). Se dibujan si `can_div_inst` > 0. */
  Splitters?: DivisorCampoJSON[]
}

// ---------------------------------------------------------------------------
// Modelo normalizado
// ---------------------------------------------------------------------------

export type RolCableCampo = "entrada" | "salida"

export type HiloCampoParseado = {
  hiloId: IdCampo
  portId: string
  cableId: string
  cableCodigo: string
  rol: RolCableCampo
  buffer: number
  bufferId: IdCampo
  numero: number
  color: FiberColor
}

export type BufferCampoParseado = {
  bufferId: IdCampo
  numero: number
  color: FiberColor
  hilos: HiloCampoParseado[]
}

export type CableCampoParseado = {
  id: string
  cableId: IdCampo
  codigo: string
  rol: RolCableCampo
  buffers: BufferCampoParseado[]
  totalHilos: number
}

export type SlotCampoParseado = {
  slot: number
  tipoEmpalme: string
  atenuacion: number
  origen: HiloCampoParseado
  destino: HiloCampoParseado
  /** Puerto izquierdo de la bandeja (lado origen). */
  portIdEntrada: string
  /** Puerto derecho de la bandeja (lado destino). */
  portIdSalida: string
}

export type BandejaCampoParseada = {
  id: string
  bandejaId: IdCampo
  numero: number
  capacidad: number
  slotsUsados: number
  slots: SlotCampoParseado[]
}

type EmpalmeCampoBase = {
  tipoEmpalme: string
  atenuacion: number
  origen: HiloCampoParseado
  destino: HiloCampoParseado
}

/** Fusión alojada en el slot de una bandeja: se dibuja en dos tramos. */
export type EmpalmeEnBandeja = EmpalmeCampoBase & {
  via: "bandeja"
  /** Id del elemento bandeja en el lienzo. */
  bandejaId: string
  numeroBandeja: number
  slot: number
  portIdEntrada: string
  portIdSalida: string
}

/** Fusión directa entre dos cables, en una cubierta sin bandejas. */
export type EmpalmeDirecto = EmpalmeCampoBase & {
  via: "directo"
  /** Orden de la fusión en el JSON, desde 1. */
  numero: number
}

/**
 * Un tramo entre un hilo y un puerto de divisor. `lado` dice en qué costado
 * del divisor está el puerto: `entrada` (izquierda) o `salida` (derecha).
 */
export type EmpalmeEnDivisor = {
  via: "divisor"
  divisorId: string
  numeroDivisor: number
  /** Id del puerto dentro del elemento JointJS del divisor. */
  puertoId: string
  numeroPuerto: number
  lado: "entrada" | "salida"
  tipoEmpalme: string
  atenuacion: number
  hilo: HiloCampoParseado
}

export type EmpalmeCampoParseado = EmpalmeEnBandeja | EmpalmeDirecto | EmpalmeEnDivisor

export type PuertoDivisorParseado = {
  puertoId: string
  portId: string
  numero: number
  lado: "entrada" | "salida"
}

export type DivisorCampoParseado = {
  id: string
  splitterId: IdCampo
  numero: number
  codigo: string | null
  modelo: string | null
  entradas: PuertoDivisorParseado[]
  salidas: PuertoDivisorParseado[]
}

export type MufaCampoParseada = {
  id: string
  mufaId: IdCampo
  tipo: string
  estado: string
  /** `null` cuando el JSON no declara la capacidad física de la cubierta. */
  capacidadBandejas: number | null
  bandejasInstaladas: number
  /** Sin bandejas instaladas: las fusiones van directo de cable a cable. */
  conexionDirecta: boolean
  /** El centro del esquema son divisores (`can_div_inst` > 0), no bandejas. */
  conexionPorDivisor: boolean
  divisoresInstalados: number
  cables: CableCampoParseado[]
  entradas: CableCampoParseado[]
  salidas: CableCampoParseado[]
  bandejas: BandejaCampoParseada[]
  divisores: DivisorCampoParseado[]
  empalmes: EmpalmeCampoParseado[]
  avisos: string[]
}

/** Capacidad de fusiones por bandeja cuando el JSON no la declara. */
export const CAPACIDAD_SLOTS_POR_BANDEJA = 12

export function portIdHilo(hiloId: IdCampo): string {
  return `hilo-${hiloId}`
}

export function portIdSlot(bandejaId: string, slot: number, lado: "in" | "out"): string {
  return `${bandejaId}::slot-${slot}::${lado}`
}

export function portIdDivisor(divisorId: string, lado: "in" | "out", puertoId: IdCampo): string {
  return `${divisorId}::${lado}::${puertoId}`
}

export class ErrorDatosMufaCampo extends Error {
  constructor(mensaje: string) {
    super(`Datos de la mufa inválidos: ${mensaje}`)
    this.name = "ErrorDatosMufaCampo"
  }
}

function normalizarRol(sentido: string): RolCableCampo {
  const clave = sentido.trim().toLowerCase()
  if (clave.startsWith("ent")) return "entrada"
  if (clave.startsWith("sal")) return "salida"
  throw new ErrorDatosMufaCampo(`sentido de cable desconocido "${sentido}"`)
}

function resolverColor(
  nombre: string,
  posicion: number,
  contexto: string,
  avisos: string[],
): FiberColor {
  const color = fiberColorByName(nombre)
  if (color) return color
  avisos.push(`Color ITU desconocido "${nombre}" en ${contexto}; se usa el color por posición.`)
  return fiberColor(posicion)
}

function parsearCable(cable: CableCampoJSON, avisos: string[]): CableCampoParseado {
  if (cable.cable_id == null) throw new ErrorDatosMufaCampo("hay un cable sin `cable_id`")
  if (!cable.Buffers?.length) {
    throw new ErrorDatosMufaCampo(`el cable ${cable.codigo} no declara buffers`)
  }

  const id = String(cable.cable_id)
  const rol = normalizarRol(cable.sentido)
  const buffers = cable.Buffers.map((buffer, indice) => {
    const numero = indice + 1
    if (!buffer.hilos?.length) {
      throw new ErrorDatosMufaCampo(
        `el buffer ${buffer.Buffer_id} del cable ${cable.codigo} no declara hilos`,
      )
    }

    const hilos = buffer.hilos.map((hilo) => ({
      hiloId: hilo.hilo_id,
      portId: portIdHilo(hilo.hilo_id),
      cableId: id,
      cableCodigo: cable.codigo,
      rol,
      buffer: numero,
      bufferId: buffer.Buffer_id,
      numero: hilo.numero,
      color: resolverColor(
        hilo.color,
        hilo.numero,
        `${cable.codigo} buffer ${numero} hilo ${hilo.numero}`,
        avisos,
      ),
    }))

    return {
      bufferId: buffer.Buffer_id,
      numero,
      color: resolverColor(buffer.color, numero, `${cable.codigo} buffer ${numero}`, avisos),
      hilos,
    } satisfies BufferCampoParseado
  })

  return {
    id,
    cableId: cable.cable_id,
    codigo: cable.codigo,
    rol,
    buffers,
    totalHilos: buffers.reduce((total, buffer) => total + buffer.hilos.length, 0),
  }
}

/** Índice de hilos por `hilo_id` en texto, para que `7` y `"7"` coincidan. */
type IndiceHilos = Map<string, HiloCampoParseado>

function indexarHilos(cables: CableCampoParseado[], avisos: string[]): IndiceHilos {
  const indice: IndiceHilos = new Map()
  for (const cable of cables) {
    for (const buffer of cable.buffers) {
      for (const hilo of buffer.hilos) {
        const clave = String(hilo.hiloId)
        if (indice.has(clave)) {
          avisos.push(
            `El hilo_id ${hilo.hiloId} está repetido entre cables; se usa la primera aparición.`,
          )
          continue
        }
        indice.set(clave, hilo)
      }
    }
  }
  return indice
}

// ---------------------------------------------------------------------------
// Validación y reparto de las fusiones
// ---------------------------------------------------------------------------

/** Fusión ya verificada contra los hilos del JSON, orientada entrada → salida. */
type ConexionValidada = {
  tipoEmpalme: string
  atenuacion: number
  origen: HiloCampoParseado
  destino: HiloCampoParseado
  /** Slot declarado en el JSON, si el formato lo traía. */
  slotDeclarado?: number
}

/** Las tres claves posibles según el formato de la respuesta. */
function conexionesDeBandeja(bandeja: BandejaCampoJSON): ConectividadCampoJSON[] {
  return bandeja.Slots ?? bandeja.Empalmes_internos ?? bandeja.Conectividades ?? []
}

function etiquetarConexion(conexion: ConectividadCampoJSON, posicion: number): string {
  if (conexion.Slot != null) return `Slot ${conexion.Slot}`
  // Cuando `Conectividad` es un UUID no le dice nada a quien lee el aviso: la
  // posición en la lista sí.
  if (typeof conexion.Conectividad === "number") return `Conectividad ${conexion.Conectividad}`
  return `Fusión ${posicion + 1}`
}

/**
 * Comprueba que la fusión apunte a hilos existentes, una un cable de entrada
 * con uno de salida y no reutilice un hilo ya empalmado. Devuelve `undefined`
 * y deja un aviso cuando hay que descartarla.
 */
function validarConexion(
  conexion: ConectividadCampoJSON,
  hilosPorId: IndiceHilos,
  ocupados: Set<string>,
  etiqueta: string,
  avisos: string[],
): ConexionValidada | undefined {
  if (!conexion.origen || !conexion.destino) {
    avisos.push(`${etiqueta} ignorada: no declara origen y destino.`)
    return undefined
  }

  const origen = hilosPorId.get(String(conexion.origen.hilo_id))
  const destino = hilosPorId.get(String(conexion.destino.hilo_id))

  if (!origen) {
    avisos.push(`${etiqueta} ignorada: el hilo de origen ${conexion.origen.hilo_id} no existe.`)
    return undefined
  }
  if (!destino) {
    avisos.push(`${etiqueta} ignorada: el hilo de destino ${conexion.destino.hilo_id} no existe.`)
    return undefined
  }
  if (String(conexion.origen.cable_id) !== origen.cableId) {
    avisos.push(`${etiqueta}: cable_id de origen no coincide con el hilo ${origen.hiloId}.`)
  }
  if (String(conexion.destino.cable_id) !== destino.cableId) {
    avisos.push(`${etiqueta}: cable_id de destino no coincide con el hilo ${destino.hiloId}.`)
  }
  if (origen.rol === destino.rol) {
    avisos.push(`${etiqueta} ignorada: origen y destino son ambos de ${origen.rol}.`)
    return undefined
  }
  if (ocupados.has(String(origen.hiloId))) {
    avisos.push(
      `${etiqueta} ignorada: el hilo ${origen.cableCodigo}·H${origen.numero} ya está empalmado.`,
    )
    return undefined
  }
  if (ocupados.has(String(destino.hiloId))) {
    avisos.push(
      `${etiqueta} ignorada: el hilo ${destino.cableCodigo}·H${destino.numero} ya está empalmado.`,
    )
    return undefined
  }

  ocupados.add(String(origen.hiloId))
  ocupados.add(String(destino.hiloId))

  // Se normaliza entrada → salida para que la flecha apunte al destino.
  return {
    tipoEmpalme: conexion["Tipo empalme"],
    atenuacion: conexion.atenuacion,
    origen: origen.rol === "entrada" ? origen : destino,
    destino: origen.rol === "entrada" ? destino : origen,
    slotDeclarado: conexion.Slot,
  }
}

function capacidadDeclarada(bandeja: BandejaCampoJSON | undefined): number {
  const capacidad = bandeja?.Capacidad_fusiones
  return capacidad && capacidad > 0 ? capacidad : CAPACIDAD_SLOTS_POR_BANDEJA
}

function armarSlot(
  bandejaId: string,
  slot: number,
  conexion: ConexionValidada,
): SlotCampoParseado {
  return {
    slot,
    tipoEmpalme: conexion.tipoEmpalme,
    atenuacion: conexion.atenuacion,
    origen: conexion.origen,
    destino: conexion.destino,
    portIdEntrada: portIdSlot(bandejaId, slot, "in"),
    portIdSalida: portIdSlot(bandejaId, slot, "out"),
  }
}

function armarEmpalmes(bandeja: BandejaCampoParseada): EmpalmeEnBandeja[] {
  return bandeja.slots.map((slot) => ({
    via: "bandeja",
    bandejaId: bandeja.id,
    numeroBandeja: bandeja.numero,
    slot: slot.slot,
    tipoEmpalme: slot.tipoEmpalme,
    atenuacion: slot.atenuacion,
    origen: slot.origen,
    destino: slot.destino,
    portIdEntrada: slot.portIdEntrada,
    portIdSalida: slot.portIdSalida,
  }))
}

/**
 * Formato con slots explícitos: cada bandeja conserva el número de slot que
 * declara el JSON.
 */
function ensamblarConSlots(
  fuente: BandejaCampoJSON[],
  hilosPorId: IndiceHilos,
  avisos: string[],
): BandejaCampoParseada[] {
  const ocupados = new Set<string>()

  return fuente.map((bandeja, indice) => {
    const numero = bandeja.Numero_bandeja ?? indice + 1
    const id = String(bandeja.bandeja_id)
    const capacidad = capacidadDeclarada(bandeja)
    const slots: SlotCampoParseado[] = []

    conexionesDeBandeja(bandeja).forEach((conexion, posicion) => {
      const etiqueta = `Bandeja ${numero} · ${etiquetarConexion(conexion, posicion)}`
      const validada = validarConexion(conexion, hilosPorId, ocupados, etiqueta, avisos)
      if (!validada) return

      const slot = validada.slotDeclarado ?? slots.length + 1
      if (slot > capacidad) {
        avisos.push(`${etiqueta} ignorada: excede la capacidad de ${capacidad} fusiones.`)
        return
      }
      slots.push(armarSlot(id, slot, validada))
    })

    return { id, bandejaId: bandeja.bandeja_id, numero, capacidad, slotsUsados: slots.length, slots }
  })
}

/**
 * Formato sin slots: las fusiones llegan en un arreglo global, así que se
 * reparten en orden entre las bandejas instaladas. Se llena la bandeja 1 hasta
 * su capacidad y se sigue con la 2, y así sucesivamente.
 *
 * Si no caben en las bandejas instaladas (la base registra 0 en las de
 * empalme, y 2 de 12 fusiones no alcanzan en varias de primer nivel), se
 * dibujan las que hagan falta y se avisa. Antes las que sobraban se perdían:
 * 113 fusiones en 9 cubiertas, cada una con su propio aviso.
 */
function distribuirEnBandejas(
  fuente: BandejaCampoJSON[],
  conexiones: ConectividadCampoJSON[],
  instaladas: number,
  hilosPorId: IndiceHilos,
  avisos: string[],
): BandejaCampoParseada[] {
  const capacidad = capacidadDeclarada(fuente[0])
  const bandejaOrigen = fuente[0]?.bandeja_id ?? 0

  // Primero se validan todas: así se sabe cuántas bandejas hacen falta y
  // ninguna fusión válida se pierde por falta de lugar.
  const ocupados = new Set<string>()
  const validas = conexiones.flatMap((conexion, posicion) => {
    const validada = validarConexion(conexion, hilosPorId, ocupados, etiquetarConexion(conexion, posicion), avisos)
    return validada ? [validada] : []
  })

  const necesarias = Math.ceil(validas.length / capacidad)
  const total = Math.max(instaladas, necesarias)
  if (total > instaladas) {
    avisos.push(
      `La base registra ${instaladas} ${instaladas === 1 ? "bandeja instalada" : "bandejas instaladas"}, pero sus ${validas.length} fusiones ` +
        `necesitan ${necesarias} (de ${capacidad} fusiones cada una): se dibujan ${total}.`,
    )
  }

  const bandejas: BandejaCampoParseada[] = Array.from({ length: total }, (_, indice) => {
    const numero = indice + 1
    return {
      // `bandeja_id` es 0 en este formato, así que el id del lienzo se deriva
      // del número de bandeja para que no colisionen entre sí.
      id: `bandeja-${numero}`,
      bandejaId: bandejaOrigen,
      numero,
      capacidad,
      slotsUsados: 0,
      slots: [],
    }
  })

  validas.forEach((validada, i) => {
    const bandeja = bandejas[Math.floor(i / capacidad)]
    bandeja.slots.push(armarSlot(bandeja.id, (i % capacidad) + 1, validada))
  })
  for (const bandeja of bandejas) bandeja.slotsUsados = bandeja.slots.length

  return bandejas
}

/** Una punta en un puerto de divisor en vez de un hilo. */
const esPuertoDeDivisor = (extremo: ExtremoEmpalmeJSON | undefined) =>
  !!extremo && extremo.hilo_id == null && (extremo.puerto_id != null || extremo.splitter_id != null)

/**
 * Aparta las conexiones con un puerto de divisor: el esquema todavía no dibuja
 * divisores. Antes cada una dejaba su propio aviso «el hilo de origen
 * undefined no existe» (234 en 68 cubiertas); ahora es uno solo que dice qué
 * pasa. Vale para las que vienen en bandejas y para las de la raíz.
 */
function apartarConexionesDeDivisor(
  fuente: BandejaCampoJSON[],
  enRaiz: ConectividadCampoJSON[],
  avisos: string[],
): { fuente: BandejaCampoJSON[]; enRaiz: ConectividadCampoJSON[] } {
  let apartadas = 0
  const filtrar = (lista: ConectividadCampoJSON[] | undefined) => {
    if (!lista) return lista
    const quedan = lista.filter((c) => !esPuertoDeDivisor(c.origen) && !esPuertoDeDivisor(c.destino))
    apartadas += lista.length - quedan.length
    return quedan
  }
  const resultado = fuente.map((bandeja) => ({
    ...bandeja,
    Slots: filtrar(bandeja.Slots),
    Empalmes_internos: filtrar(bandeja.Empalmes_internos),
    Conectividades: filtrar(bandeja.Conectividades),
  }))
  const raiz = filtrar(enRaiz) ?? []
  if (apartadas > 0) {
    avisos.push(
      apartadas === 1
        ? "1 conexión con un puerto de divisor no se dibuja: el esquema todavía no muestra los divisores."
        : `${apartadas} conexiones con puertos de divisor no se dibujan: el esquema todavía no muestra los divisores.`,
    )
  }
  return { fuente: resultado, enRaiz: raiz }
}

/**
 * Cubierta sin bandejas: cada fusión une directamente el hilo del cable de
 * entrada con el del cable de salida, sin slot intermedio.
 */
function conectarDirecto(
  conexiones: ConectividadCampoJSON[],
  hilosPorId: IndiceHilos,
  avisos: string[],
  ocupadosIniciales?: ReadonlySet<string>,
): EmpalmeDirecto[] {
  const ocupados = new Set<string>(ocupadosIniciales)
  const empalmes: EmpalmeDirecto[] = []

  conexiones.forEach((conexion, posicion) => {
    const etiqueta = etiquetarConexion(conexion, posicion)
    const validada = validarConexion(conexion, hilosPorId, ocupados, etiqueta, avisos)
    if (!validada) return
    empalmes.push({
      via: "directo",
      numero: empalmes.length + 1,
      tipoEmpalme: validada.tipoEmpalme,
      atenuacion: validada.atenuacion,
      origen: validada.origen,
      destino: validada.destino,
    })
  })

  return empalmes
}

/**
 * El formato nuevo no describe posiciones: llega una sola entrada con
 * `bandeja_id: 0` y todas las fusiones juntas, o menos bandejas que las
 * instaladas. En esos casos hay que repartirlas.
 */
function requiereReparto(fuente: BandejaCampoJSON[], instaladas: number): boolean {
  if (fuente.length === 0) return true
  if (fuente.length < instaladas) return true
  return fuente.some(
    (bandeja) => bandeja.Conectividades != null || bandeja.Numero_bandeja == null,
  )
}

/** «1x8PC» → 8 salidas. `null` si el modelo no trae la relación. */
function salidasDelModelo(modelo: string | null | undefined): number | null {
  const coincidencia = modelo ? /1\s*[x×]\s*(\d+)/i.exec(modelo) : null
  return coincidencia ? Number(coincidencia[1]) : null
}

function ladoDeclarado(puerto: PuertoDivisorJSON): "entrada" | "salida" | null {
  const texto = `${puerto.direccion ?? ""} ${puerto.dir_principal_senhal ?? ""} ${puerto.nombre ?? ""}`
    .trim()
    .toLowerCase()
  if (/(^|[^a-z])(e|in|entrada|input)([^a-z]|$)/.test(texto) || /^e\d*$/.test(texto)) return "entrada"
  if (/(^|[^a-z])(s|out|salida|output)([^a-z]|$)/.test(texto) || /^s\d+$/.test(texto)) return "salida"
  return null
}

function numeroDeclarado(puerto: PuertoDivisorJSON): number | null {
  if (typeof puerto.numero === "number" && puerto.numero > 0) return puerto.numero
  const texto = puerto.nombre ?? ""
  const coincidencia = /(\d+)\s*$/.exec(texto.trim())
  return coincidencia ? Number(coincidencia[1]) : null
}

type BorradorDivisor = {
  id: string
  splitterId: IdCampo
  numero: number
  codigo: string | null
  modelo: string | null
  entradas: Map<string, PuertoDivisorParseado>
  salidas: Map<string, PuertoDivisorParseado>
}

function siguienteNumero(puertos: Map<string, PuertoDivisorParseado>): number {
  const usados = new Set([...puertos.values()].map((puerto) => puerto.numero))
  let numero = 1
  while (usados.has(numero)) numero += 1
  return numero
}

function asegurarPuerto(
  divisor: BorradorDivisor,
  puertoCrudo: IdCampo,
  lado: "entrada" | "salida",
  numero: number | null,
): PuertoDivisorParseado {
  const clave = String(puertoCrudo)
  const ya = divisor.entradas.get(clave) ?? divisor.salidas.get(clave)
  if (ya) return ya
  const mapa = lado === "entrada" ? divisor.entradas : divisor.salidas
  const asignado = numero ?? siguienteNumero(mapa)
  const puerto: PuertoDivisorParseado = {
    puertoId: clave,
    portId: portIdDivisor(divisor.id, lado === "entrada" ? "in" : "out", clave),
    numero: asignado,
    lado,
  }
  mapa.set(clave, puerto)
  return puerto
}

function completarPuertos(divisor: BorradorDivisor): void {
  const salidasModelo = salidasDelModelo(divisor.modelo)
  const salidas = salidasModelo ?? (divisor.salidas.size > 0 ? divisor.salidas.size : 8)
  while (divisor.salidas.size < salidas) {
    const numero = siguienteNumero(divisor.salidas)
    asegurarPuerto(divisor, `libre-s-${numero}`, "salida", numero)
  }
  if (divisor.entradas.size === 0) asegurarPuerto(divisor, "libre-e-1", "entrada", 1)
}

/**
 * Arma los divisores instalados y los tramos hilo ↔ puerto. Las fusiones que
 * no tocan un divisor se devuelven aparte para dibujarlas de cable a cable.
 */
function ensamblarDivisores(
  json: MufaCampoJSON,
  conexiones: ConectividadCampoJSON[],
  hilosPorId: IndiceHilos,
  avisos: string[],
): {
  divisores: DivisorCampoParseado[]
  empalmes: EmpalmeEnDivisor[]
  entreHilos: ConectividadCampoJSON[]
  ocupados: Set<string>
} {
  const instalados = Math.max(0, json.can_div_inst ?? 0)
  const fuente = json.Splitters ?? []
  const porId = new Map<string, BorradorDivisor>()

  fuente.slice(0, instalados).forEach((divisor, indice) => {
    const id = `divisor-${divisor.splitter_id}`
    const borrador: BorradorDivisor = {
      id,
      splitterId: divisor.splitter_id,
      numero: divisor.num_divisor ?? indice + 1,
      codigo: divisor.cod_divisor ?? null,
      modelo: divisor.modelo_divisor ?? null,
      entradas: new Map(),
      salidas: new Map(),
    }
    for (const puerto of divisor.puertos ?? divisor.Puertos ?? []) {
      const lado = ladoDeclarado(puerto)
      if (!lado) continue
      asegurarPuerto(borrador, puerto.puerto_id, lado, numeroDeclarado(puerto))
    }
    porId.set(String(divisor.splitter_id), borrador)
  })

  if (fuente.length > instalados) {
    avisos.push(
      `Se omitieron ${fuente.length - instalados} divisor(es) por encima de can_div_inst (${instalados}).`,
    )
  }
  while (porId.size < instalados) {
    const numero = porId.size + 1
    const id = `divisor-instalado-${numero}`
    porId.set(id, {
      id,
      splitterId: id,
      numero,
      codigo: null,
      modelo: null,
      entradas: new Map(),
      salidas: new Map(),
    })
    avisos.push(`El divisor ${numero} está instalado, pero el JSON no lo describe: se dibuja 1x8 vacío.`)
  }

  const ocupados = new Set<string>()
  const empalmes: EmpalmeEnDivisor[] = []
  const entreHilos: ConectividadCampoJSON[] = []

  conexiones.forEach((conexion, posicion) => {
    const etiqueta = etiquetarConexion(conexion, posicion)
    const origenDivisor = esPuertoDeDivisor(conexion.origen)
    const destinoDivisor = esPuertoDeDivisor(conexion.destino)
    if (!origenDivisor && !destinoDivisor) {
      entreHilos.push(conexion)
      return
    }
    if (origenDivisor && destinoDivisor) {
      avisos.push(`${etiqueta} ignorada: une dos puertos de divisor y el esquema no dibuja ese salto.`)
      return
    }

    const extremoPuerto = origenDivisor ? conexion.origen : conexion.destino
    const extremoHilo = origenDivisor ? conexion.destino : conexion.origen
    const divisor = porId.get(String(extremoPuerto.splitter_id))
    if (!divisor) {
      avisos.push(`${etiqueta} ignorada: el divisor ${extremoPuerto.splitter_id} no está entre los instalados.`)
      return
    }
    const hilo = hilosPorId.get(String(extremoHilo.hilo_id))
    if (!hilo) {
      avisos.push(`${etiqueta} ignorada: el hilo ${extremoHilo.hilo_id} no existe.`)
      return
    }
    if (ocupados.has(String(hilo.hiloId))) {
      avisos.push(`${etiqueta} ignorada: el hilo ${hilo.cableCodigo}·H${hilo.numero} ya está empalmado.`)
      return
    }
    ocupados.add(String(hilo.hiloId))

    // El hilo llega al divisor por la izquierda; sale hacia el cable por la derecha.
    const ladoInferido: "entrada" | "salida" = origenDivisor ? "salida" : "entrada"
    const puerto = asegurarPuerto(
      divisor,
      extremoPuerto.puerto_id ?? `${ladoInferido}-${empalmes.length + 1}`,
      ladoInferido,
      null,
    )
    empalmes.push({
      via: "divisor",
      divisorId: divisor.id,
      numeroDivisor: divisor.numero,
      puertoId: puerto.portId,
      numeroPuerto: puerto.numero,
      lado: puerto.lado,
      tipoEmpalme: conexion["Tipo empalme"],
      atenuacion: conexion.atenuacion,
      hilo,
    })
  })

  for (const divisor of porId.values()) completarPuertos(divisor)

  const divisores = [...porId.values()]
    .sort((a, b) => a.numero - b.numero)
    .map((divisor) => ({
      id: divisor.id,
      splitterId: divisor.splitterId,
      numero: divisor.numero,
      codigo: divisor.codigo,
      modelo: divisor.modelo,
      entradas: [...divisor.entradas.values()].sort((a, b) => a.numero - b.numero),
      salidas: [...divisor.salidas.values()].sort((a, b) => a.numero - b.numero),
    }))

  return { divisores, empalmes, entreHilos, ocupados }
}

/**
 * Normaliza el JSON de campo al modelo que consume el lienzo. Con
 * `can_div_inst` > 0 se dibujan los divisores; si no, las bandejas instaladas
 * (`can_band_inst`) o las fusiones directas.
 */
export function parseMufaData(json: MufaCampoJSON): MufaCampoParseada {
  if (!json.cables?.length) throw new ErrorDatosMufaCampo("no hay cables declarados")

  const avisos: string[] = []
  const cables = json.cables.map((cable) => parsearCable(cable, avisos))
  const entradas = cables.filter((cable) => cable.rol === "entrada")
  const salidas = cables.filter((cable) => cable.rol === "salida")

  // Una cubierta puede tener cables de un solo sentido y seguir siendo válida:
  // las de segundo nivel terminales solo reciben su cable de entrada. Exigir
  // ambos lados dejaba 56 de las 184 cubiertas de la base sin dibujar (ver
  // docs/base-de-datos.md). Se dibuja con la columna del lado ausente vacía, y
  // se avisa para que no parezca que se perdió un dato.
  if (salidas.length === 0) {
    avisos.push(
      "Esta cubierta solo tiene cables de entrada: se dibuja como terminal, sin columna de salida.",
    )
  }
  if (entradas.length === 0) {
    avisos.push(
      "Esta cubierta solo tiene cables de salida: no hay columna de entrada que dibujar.",
    )
  }

  const hilosPorId = indexarHilos(cables, avisos)
  const divisoresInstalados = Math.max(0, json.can_div_inst ?? 0)
  if (divisoresInstalados > 0) {
    const enBandejas = (json.bandejas ?? json.Bandejas ?? []).flatMap(conexionesDeBandeja)
    if (enBandejas.length > 0) {
      avisos.push(
        "La cubierta declara divisores instalados: las fusiones que venían dentro de bandejas se leen igual, pero las bandejas no se dibujan.",
      )
    }
    const { divisores, empalmes, entreHilos, ocupados } = ensamblarDivisores(
      json,
      [...(json.Conectividades ?? []), ...enBandejas],
      hilosPorId,
      avisos,
    )
    return {
      ...resumen(json, cables, entradas, salidas, avisos),
      bandejasInstaladas: 0,
      conexionDirecta: false,
      conexionPorDivisor: true,
      divisoresInstalados,
      bandejas: [],
      divisores,
      empalmes: [...empalmes, ...conectarDirecto(entreHilos, hilosPorId, avisos, ocupados)],
    }
  }

  const instaladas = Math.max(0, json.can_band_inst ?? 0)
  // Las conexiones con un puerto de divisor se apartan con un solo aviso,
  // vengan en bandejas o en la raíz (las funciones por nivel `_n0` y `_n12`
  // mandan las fusiones sueltas, en la raíz).
  const { fuente, enRaiz } = apartarConexionesDeDivisor(json.bandejas ?? json.Bandejas ?? [], json.Conectividades ?? [], avisos)
  const enBandejas = fuente.flatMap(conexionesDeBandeja)

  if (instaladas === 0) {
    if (enBandejas.length > 0) {
      avisos.push(
        `El JSON trae ${enBandejas.length} fusión(es) dentro de bandejas, pero declara 0 bandejas instaladas: se dibujan como fusiones directas.`,
      )
    }
    return {
      ...resumen(json, cables, entradas, salidas, avisos),
      bandejasInstaladas: 0,
      conexionDirecta: true,
      conexionPorDivisor: false,
      divisoresInstalados: 0,
      bandejas: [],
      divisores: [],
      empalmes: conectarDirecto([...enRaiz, ...enBandejas], hilosPorId, avisos),
    }
  }

  let bandejas: BandejaCampoParseada[]
  if (enRaiz.length > 0 || requiereReparto(fuente, instaladas)) {
    bandejas = distribuirEnBandejas(fuente, [...enRaiz, ...enBandejas], instaladas, hilosPorId, avisos)
  } else {
    bandejas = ensamblarConSlots(fuente.slice(0, instaladas), hilosPorId, avisos)
    if (fuente.length > instaladas) {
      avisos.push(
        `Se omitieron ${fuente.length - instaladas} bandeja(s) no instaladas (instaladas ${instaladas} de ${json.capacidad_band ?? "capacidad sin declarar"}).`,
      )
    }
  }

  return {
    ...resumen(json, cables, entradas, salidas, avisos),
    bandejasInstaladas: instaladas,
    conexionDirecta: false,
    conexionPorDivisor: false,
    divisoresInstalados: 0,
    bandejas,
    divisores: [],
    empalmes: bandejas.flatMap(armarEmpalmes),
  }
}

/** Lo que el modelo comparte con y sin bandejas. */
function resumen(
  json: MufaCampoJSON,
  cables: CableCampoParseado[],
  entradas: CableCampoParseado[],
  salidas: CableCampoParseado[],
  avisos: string[],
) {
  return {
    id: `MUFA-${json.mufa_id}`,
    mufaId: json.mufa_id,
    tipo: json.tipo,
    estado: json.estado,
    capacidadBandejas: json.capacidad_band ?? null,
    cables,
    entradas,
    salidas,
    avisos,
  } satisfies Partial<MufaCampoParseada>
}

/** Reexport útil para quien sólo necesite el HEX ITU sin el modelo completo. */
export { getColorITU }
