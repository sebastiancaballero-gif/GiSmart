import {
  parsearElemento,
  type ElementoRedJSON,
  type ElementoRedParseado,
  type TerminacionJSON,
} from "./network-data"

/**
 * Formato anterior del JSON, atado a la física de una mufa
 * (cables -> buffers -> hilos). Se conserva para no romper a los consumidores
 * que ya lo generan: `adaptarMufaJSON` lo traduce al esquema genérico y
 * `parsearEntrada` acepta indistintamente cualquiera de los dos.
 */

export type RolCable = "entrada" | "salida"

export type HiloJSON = {
  numero: number
  color: string
  etiqueta?: string
}

export type BufferJSON = {
  numero: number
  color: string
  hilos: HiloJSON[]
}

export type CableJSON = {
  id: string
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

/** El formato viejo se reconoce por su lista de cables. */
export function esMufaJSON(json: ElementoRedJSON | MufaJSON): json is MufaJSON {
  return Array.isArray((json as MufaJSON).cables)
}

function adaptarCable(cable: CableJSON): TerminacionJSON {
  return {
    id: cable.id,
    etiqueta: cable.etiqueta,
    rol: cable.rol,
    tipo: "cable",
    grupos: cable.buffers.map((buffer) => ({
      numero: buffer.numero,
      color: buffer.color,
      puntos: buffer.hilos.map((hilo) => ({
        numero: hilo.numero,
        color: hilo.color,
        etiqueta: hilo.etiqueta,
      })),
    })),
  }
}

export function adaptarMufaJSON(json: MufaJSON): ElementoRedJSON {
  return {
    id: json.id,
    nombre: json.nombre,
    tipo: "mufa",
    ubicacion: json.ubicacion,
    terminaciones: json.cables.map(adaptarCable),
    conexiones: json.empalmes?.map((empalme) => ({
      tipo: "empalme",
      desde: {
        terminacion: empalme.desde.cable,
        grupo: empalme.desde.buffer,
        punto: empalme.desde.hilo,
      },
      hasta: {
        terminacion: empalme.hasta.cable,
        grupo: empalme.hasta.buffer,
        punto: empalme.hasta.hilo,
      },
    })),
  }
}

/** Punto de entrada del esquema: admite el JSON genérico o el de mufa. */
export function parsearEntrada(json: ElementoRedJSON | MufaJSON): ElementoRedParseado {
  return parsearElemento(esMufaJSON(json) ? adaptarMufaJSON(json) : json)
}
