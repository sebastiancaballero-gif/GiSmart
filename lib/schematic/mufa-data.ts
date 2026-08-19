import { fiberColor, fiberColorByName, type FiberColor } from "./fiber-colors"

/**
 * Capa de datos del esquema de la mufa.
 *
 * Este módulo no importa JointJS: sólo describe la forma del JSON que entrega
 * el backend y lo convierte en un modelo normalizado (colores resueltos,
 * identificadores de puerto calculados, empalmes validados). El renderizado
 * vive en `cable-shape.ts` y `mufa-graph.ts`.
 */

// ---------------------------------------------------------------------------
// Forma del JSON de entrada
// ---------------------------------------------------------------------------

export type RolCable = "entrada" | "salida"

export type HiloJSON = {
  /** Número del hilo dentro del buffer, 1-based. */
  numero: number
  /** Nombre del color TIA-598-D, ej. "Azul", "Café". */
  color: string
  /** Identificador opcional del hilo en el inventario. */
  etiqueta?: string
}

export type BufferJSON = {
  /** Número del buffer dentro del cable, 1-based. */
  numero: number
  color: string
  hilos: HiloJSON[]
}

export type CableJSON = {
  id: string
  /** Código del cable, ej. "F-C-0167653". */
  etiqueta: string
  rol: RolCable
  buffers: BufferJSON[]
}

export type ReferenciaHiloJSON = {
  cable: string
  buffer: number
  hilo: number
}

export type EmpalmeJSON = {
  desde: ReferenciaHiloJSON
  hasta: ReferenciaHiloJSON
}

export type MufaJSON = {
  id: string
  nombre: string
  ubicacion?: string
  cables: CableJSON[]
  empalmes?: EmpalmeJSON[]
}

// ---------------------------------------------------------------------------
// Modelo normalizado que consume el renderizador
// ---------------------------------------------------------------------------

export type HiloParseado = {
  /** Identificador del puerto de JointJS. */
  portId: string
  cableId: string
  cableEtiqueta: string
  rol: RolCable
  buffer: number
  hilo: number
  /** Posición del hilo contando todos los buffers del cable, 1-based. */
  posicionEnCable: number
  color: FiberColor
  etiqueta?: string
}

export type BufferParseado = {
  numero: number
  color: FiberColor
  hilos: HiloParseado[]
}

export type CableParseado = {
  id: string
  etiqueta: string
  rol: RolCable
  buffers: BufferParseado[]
  totalHilos: number
}

export type EmpalmeParseado = {
  desde: HiloParseado
  hasta: HiloParseado
}

export type MufaParseada = {
  id: string
  nombre: string
  ubicacion?: string
  cables: CableParseado[]
  entradas: CableParseado[]
  salidas: CableParseado[]
  empalmes: EmpalmeParseado[]
  /** Incidencias no fatales detectadas al parsear (colores o empalmes inválidos). */
  avisos: string[]
}

/** El identificador de puerto codifica cable, buffer e hilo. */
export function construirPortId(cableId: string, buffer: number, hilo: number): string {
  return `${cableId}::b${buffer}::h${hilo}`
}

const PORT_ID_REGEX = /^(.*)::b(\d+)::h(\d+)$/

export function descomponerPortId(
  portId: string,
): { cableId: string; buffer: number; hilo: number } | undefined {
  const match = PORT_ID_REGEX.exec(portId)
  if (!match) return undefined
  return { cableId: match[1], buffer: Number(match[2]), hilo: Number(match[3]) }
}

class ErrorDatosMufa extends Error {
  constructor(mensaje: string) {
    super(`Datos de la mufa inválidos: ${mensaje}`)
    this.name = "ErrorDatosMufa"
  }
}

function parsearCable(cable: CableJSON, avisos: string[]): CableParseado {
  if (!cable.id) throw new ErrorDatosMufa("hay un cable sin `id`")
  if (!cable.buffers?.length) {
    throw new ErrorDatosMufa(`el cable "${cable.id}" no declara buffers`)
  }

  const numerosBuffer = new Set<number>()
  let posicionEnCable = 0

  const buffers = cable.buffers.map((buffer) => {
    if (numerosBuffer.has(buffer.numero)) {
      throw new ErrorDatosMufa(
        `el cable "${cable.id}" repite el buffer ${buffer.numero}`,
      )
    }
    numerosBuffer.add(buffer.numero)

    if (!buffer.hilos?.length) {
      throw new ErrorDatosMufa(
        `el buffer ${buffer.numero} del cable "${cable.id}" no declara hilos`,
      )
    }

    const colorBuffer = fiberColorByName(buffer.color)
    if (!colorBuffer) {
      avisos.push(
        `Color de buffer desconocido "${buffer.color}" (cable ${cable.etiqueta}, buffer ${buffer.numero}); se usa el color por posición.`,
      )
    }

    const numerosHilo = new Set<number>()
    const hilos = buffer.hilos.map((hilo) => {
      if (numerosHilo.has(hilo.numero)) {
        throw new ErrorDatosMufa(
          `el buffer ${buffer.numero} del cable "${cable.id}" repite el hilo ${hilo.numero}`,
        )
      }
      numerosHilo.add(hilo.numero)
      posicionEnCable += 1

      const colorHilo = fiberColorByName(hilo.color)
      if (!colorHilo) {
        avisos.push(
          `Color de hilo desconocido "${hilo.color}" (cable ${cable.etiqueta}, buffer ${buffer.numero}, hilo ${hilo.numero}); se usa el color por posición.`,
        )
      }

      return {
        portId: construirPortId(cable.id, buffer.numero, hilo.numero),
        cableId: cable.id,
        cableEtiqueta: cable.etiqueta,
        rol: cable.rol,
        buffer: buffer.numero,
        hilo: hilo.numero,
        posicionEnCable,
        color: colorHilo ?? fiberColor(hilo.numero),
        etiqueta: hilo.etiqueta,
      } satisfies HiloParseado
    })

    return {
      numero: buffer.numero,
      color: colorBuffer ?? fiberColor(buffer.numero),
      hilos,
    } satisfies BufferParseado
  })

  return {
    id: cable.id,
    etiqueta: cable.etiqueta,
    rol: cable.rol,
    buffers,
    totalHilos: buffers.reduce((total, buffer) => total + buffer.hilos.length, 0),
  }
}

function indexarHilos(cables: CableParseado[]): Map<string, HiloParseado> {
  const indice = new Map<string, HiloParseado>()
  for (const cable of cables) {
    for (const buffer of cable.buffers) {
      for (const hilo of buffer.hilos) indice.set(hilo.portId, hilo)
    }
  }
  return indice
}

/**
 * Valida los empalmes declarados en el JSON: deben apuntar a hilos existentes,
 * unir un cable de entrada con uno de salida y no reutilizar un hilo.
 */
function parsearEmpalmes(
  empalmes: EmpalmeJSON[],
  indice: Map<string, HiloParseado>,
  avisos: string[],
): EmpalmeParseado[] {
  const ocupados = new Set<string>()
  const resultado: EmpalmeParseado[] = []

  empalmes.forEach((empalme, posicion) => {
    const describir = (ref: ReferenciaHiloJSON) =>
      `${ref.cable} B${ref.buffer}·H${ref.hilo}`

    const desde = indice.get(construirPortId(empalme.desde.cable, empalme.desde.buffer, empalme.desde.hilo))
    const hasta = indice.get(construirPortId(empalme.hasta.cable, empalme.hasta.buffer, empalme.hasta.hilo))

    if (!desde || !hasta) {
      const faltante = !desde ? empalme.desde : empalme.hasta
      avisos.push(`Empalme ${posicion + 1} ignorado: el hilo ${describir(faltante)} no existe.`)
      return
    }

    if (desde.rol === hasta.rol) {
      avisos.push(
        `Empalme ${posicion + 1} ignorado: ${describir(empalme.desde)} y ${describir(empalme.hasta)} son ambos de ${desde.rol}.`,
      )
      return
    }

    const yaOcupado = [desde, hasta].find((hilo) => ocupados.has(hilo.portId))
    if (yaOcupado) {
      avisos.push(
        `Empalme ${posicion + 1} ignorado: el hilo ${yaOcupado.cableEtiqueta} B${yaOcupado.buffer}·H${yaOcupado.hilo} ya está empalmado.`,
      )
      return
    }

    ocupados.add(desde.portId)
    ocupados.add(hasta.portId)
    // Se normaliza la orientación entrada -> salida.
    resultado.push(
      desde.rol === "entrada" ? { desde, hasta } : { desde: hasta, hasta: desde },
    )
  })

  return resultado
}

/**
 * Convierte el JSON de la mufa en el modelo que consume el lienzo. Lanza
 * `ErrorDatosMufa` ante errores de estructura y acumula en `avisos` las
 * incidencias recuperables.
 */
export function parsearMufa(json: MufaJSON): MufaParseada {
  if (!json.cables?.length) throw new ErrorDatosMufa("no hay cables declarados")

  const avisos: string[] = []
  const identificadores = new Set<string>()

  const cables = json.cables.map((cable) => {
    if (identificadores.has(cable.id)) {
      throw new ErrorDatosMufa(`el identificador de cable "${cable.id}" está repetido`)
    }
    identificadores.add(cable.id)
    return parsearCable(cable, avisos)
  })

  const entradas = cables.filter((cable) => cable.rol === "entrada")
  const salidas = cables.filter((cable) => cable.rol === "salida")

  if (entradas.length === 0) throw new ErrorDatosMufa("no hay ningún cable de entrada")
  if (salidas.length === 0) throw new ErrorDatosMufa("no hay ningún cable de salida")

  return {
    id: json.id,
    nombre: json.nombre,
    ubicacion: json.ubicacion,
    cables,
    entradas,
    salidas,
    empalmes: parsearEmpalmes(json.empalmes ?? [], indexarHilos(cables), avisos),
    avisos,
  }
}

export function buscarHilo(mufa: MufaParseada, portId: string): HiloParseado | undefined {
  const partes = descomponerPortId(portId)
  if (!partes) return undefined

  const cable = mufa.cables.find((item) => item.id === partes.cableId)
  const buffer = cable?.buffers.find((item) => item.numero === partes.buffer)
  return buffer?.hilos.find((item) => item.hilo === partes.hilo)
}