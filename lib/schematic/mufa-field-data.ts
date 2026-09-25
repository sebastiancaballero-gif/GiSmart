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
 * Este módulo no importa JointJS: valida, normaliza y deja el modelo listo
 * para el renderizado en `mufa-field-graph.ts`.
 */

// ---------------------------------------------------------------------------
// Forma del JSON de entrada (tal cual llega del backend)
// ---------------------------------------------------------------------------

export type HiloCampoJSON = {
  hilo_id: number
  numero: number
  color: string
}

export type BufferCampoJSON = {
  Buffer_id: number
  color: string
  hilos: HiloCampoJSON[]
}

export type CableCampoJSON = {
  cable_id: number
  codigo: string
  sentido: string
  can_hilos?: number
  Buffers: BufferCampoJSON[]
}

export type ExtremoEmpalmeJSON = {
  cable_id: number
  hilo_id: number
}

/**
 * Una fusión entre dos hilos. `Slot` sólo viene en el formato con slots
 * explícitos; `Conectividad` es el número de orden del formato nuevo.
 */
export type ConectividadCampoJSON = {
  Slot?: number
  Conectividad?: number
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
  mufa_id: number
  tipo: string
  estado: string
  /**
   * Capacidad física de bandejas de la cubierta. La función de la base no la
   * envía hoy, así que puede faltar.
   */
  capacidad_band?: number
  can_band_inst: number
  cables: CableCampoJSON[]
  /** Formato anterior (clave en minúscula). */
  bandejas?: BandejaCampoJSON[]
  /** Formato nuevo (clave capitalizada). */
  Bandejas?: BandejaCampoJSON[]
}

// ---------------------------------------------------------------------------
// Modelo normalizado
// ---------------------------------------------------------------------------

export type RolCableCampo = "entrada" | "salida"

export type HiloCampoParseado = {
  hiloId: number
  portId: string
  cableId: string
  cableCodigo: string
  rol: RolCableCampo
  buffer: number
  bufferId: number
  numero: number
  color: FiberColor
}

export type BufferCampoParseado = {
  bufferId: number
  numero: number
  color: FiberColor
  hilos: HiloCampoParseado[]
}

export type CableCampoParseado = {
  id: string
  cableId: number
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
  bandejaId: number
  numero: number
  capacidad: number
  slotsUsados: number
  slots: SlotCampoParseado[]
}

export type EmpalmeCampoParseado = {
  /** Id del elemento bandeja en el lienzo. */
  bandejaId: string
  numeroBandeja: number
  slot: number
  tipoEmpalme: string
  atenuacion: number
  origen: HiloCampoParseado
  destino: HiloCampoParseado
  portIdEntrada: string
  portIdSalida: string
}

export type MufaCampoParseada = {
  id: string
  mufaId: number
  tipo: string
  estado: string
  /** `null` cuando el JSON no declara la capacidad física de la cubierta. */
  capacidadBandejas: number | null
  bandejasInstaladas: number
  cables: CableCampoParseado[]
  entradas: CableCampoParseado[]
  salidas: CableCampoParseado[]
  bandejas: BandejaCampoParseada[]
  empalmes: EmpalmeCampoParseado[]
  avisos: string[]
}

/** Capacidad de fusiones por bandeja cuando el JSON no la declara. */
export const CAPACIDAD_SLOTS_POR_BANDEJA = 12

export function portIdHilo(hiloId: number): string {
  return `hilo-${hiloId}`
}

export function portIdSlot(bandejaId: string, slot: number, lado: "in" | "out"): string {
  return `${bandejaId}::slot-${slot}::${lado}`
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

function indexarHilos(
  cables: CableCampoParseado[],
  avisos: string[],
): Map<number, HiloCampoParseado> {
  const indice = new Map<number, HiloCampoParseado>()
  for (const cable of cables) {
    for (const buffer of cable.buffers) {
      for (const hilo of buffer.hilos) {
        if (indice.has(hilo.hiloId)) {
          avisos.push(
            `El hilo_id ${hilo.hiloId} está repetido entre cables; se usa la primera aparición.`,
          )
          continue
        }
        indice.set(hilo.hiloId, hilo)
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
  if (conexion.Conectividad != null) return `Conectividad ${conexion.Conectividad}`
  return `Fusión ${posicion + 1}`
}

/**
 * Comprueba que la fusión apunte a hilos existentes, una un cable de entrada
 * con uno de salida y no reutilice un hilo ya empalmado. Devuelve `undefined`
 * y deja un aviso cuando hay que descartarla.
 */
function validarConexion(
  conexion: ConectividadCampoJSON,
  hilosPorId: Map<number, HiloCampoParseado>,
  ocupados: Set<number>,
  etiqueta: string,
  avisos: string[],
): ConexionValidada | undefined {
  if (!conexion.origen || !conexion.destino) {
    avisos.push(`${etiqueta} ignorada: no declara origen y destino.`)
    return undefined
  }

  const origen = hilosPorId.get(conexion.origen.hilo_id)
  const destino = hilosPorId.get(conexion.destino.hilo_id)

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
  if (ocupados.has(origen.hiloId)) {
    avisos.push(
      `${etiqueta} ignorada: el hilo ${origen.cableCodigo}·H${origen.numero} ya está empalmado.`,
    )
    return undefined
  }
  if (ocupados.has(destino.hiloId)) {
    avisos.push(
      `${etiqueta} ignorada: el hilo ${destino.cableCodigo}·H${destino.numero} ya está empalmado.`,
    )
    return undefined
  }

  ocupados.add(origen.hiloId)
  ocupados.add(destino.hiloId)

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

function armarEmpalmes(bandeja: BandejaCampoParseada): EmpalmeCampoParseado[] {
  return bandeja.slots.map((slot) => ({
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
  hilosPorId: Map<number, HiloCampoParseado>,
  avisos: string[],
): BandejaCampoParseada[] {
  const ocupados = new Set<number>()

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
 */
function distribuirEnBandejas(
  fuente: BandejaCampoJSON[],
  instaladas: number,
  hilosPorId: Map<number, HiloCampoParseado>,
  avisos: string[],
): BandejaCampoParseada[] {
  const capacidad = capacidadDeclarada(fuente[0])
  const bandejaOrigen = fuente[0]?.bandeja_id ?? 0

  const bandejas: BandejaCampoParseada[] = Array.from({ length: instaladas }, (_, indice) => {
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

  const ocupados = new Set<number>()
  const conexiones = fuente.flatMap((bandeja) => conexionesDeBandeja(bandeja))
  let cursor = 0

  for (const [posicion, conexion] of conexiones.entries()) {
    const etiqueta = etiquetarConexion(conexion, posicion)
    const validada = validarConexion(conexion, hilosPorId, ocupados, etiqueta, avisos)
    if (!validada) continue

    const bandeja = bandejas[Math.floor(cursor / capacidad)]
    if (!bandeja) {
      avisos.push(
        `${etiqueta} sin bandeja disponible: ${instaladas} bandeja(s) instaladas de ${capacidad} fusiones no alcanzan.`,
      )
      continue
    }

    const slot = (cursor % capacidad) + 1
    bandeja.slots.push(armarSlot(bandeja.id, slot, validada))
    cursor++
  }

  for (const bandeja of bandejas) bandeja.slotsUsados = bandeja.slots.length

  return bandejas
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

/**
 * Normaliza el JSON de campo al modelo que consume el lienzo. Sólo se
 * renderizan las bandejas instaladas (`can_band_inst`).
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
  const instaladas = Math.max(0, json.can_band_inst ?? 0)
  const fuente = json.bandejas ?? json.Bandejas ?? []

  let bandejas: BandejaCampoParseada[]
  if (requiereReparto(fuente, instaladas)) {
    bandejas = distribuirEnBandejas(fuente, instaladas, hilosPorId, avisos)
  } else {
    bandejas = ensamblarConSlots(fuente.slice(0, instaladas), hilosPorId, avisos)
    if (fuente.length > instaladas) {
      avisos.push(
        `Se omitieron ${fuente.length - instaladas} bandeja(s) no instaladas (instaladas ${instaladas} de ${json.capacidad_band ?? "capacidad sin declarar"}).`,
      )
    }
  }

  return {
    id: `MUFA-${json.mufa_id}`,
    mufaId: json.mufa_id,
    tipo: json.tipo,
    estado: json.estado,
    capacidadBandejas: json.capacidad_band ?? null,
    bandejasInstaladas: instaladas,
    cables,
    entradas,
    salidas,
    bandejas,
    empalmes: bandejas.flatMap(armarEmpalmes),
    avisos,
  }
}

/** Reexport útil para quien sólo necesite el HEX ITU sin el modelo completo. */
export { getColorITU }
