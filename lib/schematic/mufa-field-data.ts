import { fiberColor, fiberColorByName, getColorITU, type FiberColor } from "./fiber-colors"

/**
 * Datos de campo de una MUFA, tal como los entrega el backend
 * (`JsonMufa.txt`): cables → buffers → hilos, y bandejas con slots de fusión.
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

export type SlotCampoJSON = {
  Slot: number
  "Tipo empalme": string
  atenuacion: number
  origen: ExtremoEmpalmeJSON
  destino: ExtremoEmpalmeJSON
}

export type BandejaCampoJSON = {
  bandeja_id: number
  Numero_bandeja: number
  Capacidad_fusiones: number
  Slots_usados: number
  /** Algunas respuestas usan `Slots`, otras `Empalmes_internos`. */
  Slots?: SlotCampoJSON[]
  Empalmes_internos?: SlotCampoJSON[]
}

export type MufaCampoJSON = {
  mufa_id: number
  tipo: string
  estado: string
  capacidad_band: number
  can_band_inst: number
  cables: CableCampoJSON[]
  bandejas: BandejaCampoJSON[]
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
  capacidadBandejas: number
  bandejasInstaladas: number
  cables: CableCampoParseado[]
  entradas: CableCampoParseado[]
  salidas: CableCampoParseado[]
  bandejas: BandejaCampoParseada[]
  empalmes: EmpalmeCampoParseado[]
  avisos: string[]
}

export function portIdHilo(hiloId: number): string {
  return `hilo-${hiloId}`
}

export function portIdSlot(bandejaId: number, slot: number, lado: "in" | "out"): string {
  return `bandeja-${bandejaId}::slot-${slot}::${lado}`
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

function slotsDeBandeja(bandeja: BandejaCampoJSON): SlotCampoJSON[] {
  return bandeja.Slots ?? bandeja.Empalmes_internos ?? []
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
      color: resolverColor(
        buffer.color,
        numero,
        `${cable.codigo} buffer ${numero}`,
        avisos,
      ),
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

/**
 * Convierte el JSON de campo en el modelo que consume el lienzo. Sólo se
 * renderizan las primeras `can_band_inst` bandejas (las instaladas).
 */
export function parsearMufaCampo(json: MufaCampoJSON): MufaCampoParseada {
  if (!json.cables?.length) throw new ErrorDatosMufaCampo("no hay cables declarados")

  const avisos: string[] = []
  const cables = json.cables.map((cable) => parsearCable(cable, avisos))
  const entradas = cables.filter((cable) => cable.rol === "entrada")
  const salidas = cables.filter((cable) => cable.rol === "salida")

  if (entradas.length === 0) throw new ErrorDatosMufaCampo("no hay ningún cable de entrada")
  if (salidas.length === 0) throw new ErrorDatosMufaCampo("no hay ningún cable de salida")

  const hilosPorId = new Map<number, HiloCampoParseado>()
  for (const cable of cables) {
    for (const buffer of cable.buffers) {
      for (const hilo of buffer.hilos) {
        if (hilosPorId.has(hilo.hiloId)) {
          avisos.push(`El hilo_id ${hilo.hiloId} está repetido entre cables; se usa la primera aparición.`)
          continue
        }
        hilosPorId.set(hilo.hiloId, hilo)
      }
    }
  }

  const ocupados = new Set<number>()
  const instaladas = Math.max(0, json.can_band_inst ?? 0)
  const bandejasFuente = (json.bandejas ?? []).slice(0, instaladas)

  const bandejas: BandejaCampoParseada[] = []
  const empalmes: EmpalmeCampoParseado[] = []

  for (const bandeja of bandejasFuente) {
    const slotsParseados: SlotCampoParseado[] = []

    for (const slot of slotsDeBandeja(bandeja)) {
      const origen = hilosPorId.get(slot.origen.hilo_id)
      const destino = hilosPorId.get(slot.destino.hilo_id)
      const etiqueta = `Bandeja ${bandeja.Numero_bandeja} slot ${slot.Slot}`

      if (!origen) {
        avisos.push(`${etiqueta} ignorado: el hilo de origen ${slot.origen.hilo_id} no existe.`)
        continue
      }
      if (!destino) {
        avisos.push(`${etiqueta} ignorado: el hilo de destino ${slot.destino.hilo_id} no existe.`)
        continue
      }
      if (String(slot.origen.cable_id) !== origen.cableId) {
        avisos.push(`${etiqueta}: cable_id de origen no coincide con el hilo ${origen.hiloId}.`)
      }
      if (String(slot.destino.cable_id) !== destino.cableId) {
        avisos.push(`${etiqueta}: cable_id de destino no coincide con el hilo ${destino.hiloId}.`)
      }
      if (origen.rol === destino.rol) {
        avisos.push(`${etiqueta} ignorado: origen y destino son ambos de ${origen.rol}.`)
        continue
      }
      if (ocupados.has(origen.hiloId)) {
        avisos.push(`${etiqueta} ignorado: el hilo ${origen.cableCodigo}·H${origen.numero} ya está empalmado.`)
        continue
      }
      if (ocupados.has(destino.hiloId)) {
        avisos.push(`${etiqueta} ignorado: el hilo ${destino.cableCodigo}·H${destino.numero} ya está empalmado.`)
        continue
      }

      // Se normaliza entrada → salida para que la flecha apunte al destino.
      const desde = origen.rol === "entrada" ? origen : destino
      const hasta = origen.rol === "entrada" ? destino : origen

      ocupados.add(desde.hiloId)
      ocupados.add(hasta.hiloId)

      const portIdEntrada = portIdSlot(bandeja.bandeja_id, slot.Slot, "in")
      const portIdSalida = portIdSlot(bandeja.bandeja_id, slot.Slot, "out")

      const slotParseado: SlotCampoParseado = {
        slot: slot.Slot,
        tipoEmpalme: slot["Tipo empalme"],
        atenuacion: slot.atenuacion,
        origen: desde,
        destino: hasta,
        portIdEntrada,
        portIdSalida,
      }
      slotsParseados.push(slotParseado)
      empalmes.push({
        bandejaId: String(bandeja.bandeja_id),
        numeroBandeja: bandeja.Numero_bandeja,
        slot: slot.Slot,
        tipoEmpalme: slot["Tipo empalme"],
        atenuacion: slot.atenuacion,
        origen: desde,
        destino: hasta,
        portIdEntrada,
        portIdSalida,
      })
    }

    bandejas.push({
      id: String(bandeja.bandeja_id),
      bandejaId: bandeja.bandeja_id,
      numero: bandeja.Numero_bandeja,
      capacidad: bandeja.Capacidad_fusiones,
      slotsUsados: slotsParseados.length,
      slots: slotsParseados,
    })
  }

  if ((json.bandejas?.length ?? 0) > instaladas) {
    avisos.push(
      `Se omitieron ${(json.bandejas?.length ?? 0) - instaladas} bandeja(s) no instaladas (capacidad ${json.capacidad_band}, instaladas ${instaladas}).`,
    )
  }

  return {
    id: `MUFA-${json.mufa_id}`,
    mufaId: json.mufa_id,
    tipo: json.tipo,
    estado: json.estado,
    capacidadBandejas: json.capacidad_band,
    bandejasInstaladas: instaladas,
    cables,
    entradas,
    salidas,
    bandejas,
    empalmes,
    avisos,
  }
}

/** Reexport útil para quien sólo necesite el HEX ITU sin el modelo completo. */
export { getColorITU }
