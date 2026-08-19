import { dia } from "@joint/core"

import type { BandejaCampoParseada, SlotCampoParseado } from "./mufa-field-data"

/**
 * Forma JointJS de una bandeja de empalme: contenedor intermedio entre los
 * cables de entrada y de salida. Cada slot usado expone un puerto a la
 * izquierda (origen) y otro a la derecha (destino); las filas vacías muestran
 * la capacidad restante de la bandeja.
 *
 * Sólo APIs de `@joint/core` (MPL-2.0).
 */

export const GEOMETRIA_BANDEJA = {
  ancho: 168,
  altoEncabezado: 40,
  margenInferior: 12,
  altoSlot: 22,
  margenPuerto: 10,
  radioPuerto: 4,
} as const

export const TIPO_BANDEJA = "gismart.Bandeja"
export const Z_BANDEJA = 2

const GRUPO_SLOTS = "slots"

export function altoBandeja(bandeja: BandejaCampoParseada): number {
  const g = GEOMETRIA_BANDEJA
  const filas = Math.max(bandeja.capacidad, bandeja.slots.length, 1)
  return g.altoEncabezado + filas * g.altoSlot + g.margenInferior
}

function centroSlot(indice: number): number {
  const g = GEOMETRIA_BANDEJA
  return g.altoEncabezado + (indice + 0.5) * g.altoSlot
}

function escaparTexto(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function descripcionSlot(slot: SlotCampoParseado, bandeja: BandejaCampoParseada): string {
  return escaparTexto(
    `Bandeja ${bandeja.numero} · Slot ${slot.slot} · ${slot.tipoEmpalme} · ${slot.atenuacion} dB · ${slot.origen.cableCodigo} H${slot.origen.numero} → ${slot.destino.cableCodigo} H${slot.destino.numero}`,
  )
}

function puertoSlot(
  bandeja: BandejaCampoParseada,
  slot: SlotCampoParseado,
  indice: number,
  lado: "in" | "out",
): dia.Element.Port {
  const g = GEOMETRIA_BANDEJA
  const x = lado === "in" ? g.margenPuerto : g.ancho - g.margenPuerto

  return {
    id: lado === "in" ? slot.portIdEntrada : slot.portIdSalida,
    group: GRUPO_SLOTS,
    position: { args: { x, y: centroSlot(indice) } },
    attrs: {
      slotTooltip: { html: descripcionSlot(slot, bandeja) },
      slotPunto: {
        r: g.radioPuerto,
        fill: slot.origen.color.hex,
        stroke: "#334155",
        strokeWidth: 1,
        // Solo lectura: el magnet existe para anclar el enlace, no para crear
        // conexiones nuevas desde la interfaz.
        magnet: "passive",
        cursor: "default",
      },
    },
  }
}

const selectorFila = (numero: number) => `slotFila${numero}`
const selectorNumero = (numero: number) => `slotNumero${numero}`
const selectorPuente = (numero: number) => `slotPuente${numero}`
const selectorTipo = (numero: number) => `slotTipo${numero}`

function markupBandeja(bandeja: BandejaCampoParseada): dia.MarkupJSON {
  const filas = Math.max(bandeja.capacidad, bandeja.slots.length, 1)
  const detalle: dia.MarkupJSON = []

  for (let i = 1; i <= filas; i++) {
    detalle.push(
      { tagName: "rect", selector: selectorFila(i) },
      { tagName: "text", selector: selectorNumero(i) },
      { tagName: "line", selector: selectorPuente(i) },
      { tagName: "text", selector: selectorTipo(i) },
    )
  }

  return [
    { tagName: "rect", selector: "body" },
    { tagName: "line", selector: "lineaEncabezado" },
    { tagName: "text", selector: "etiquetaBandeja" },
    { tagName: "text", selector: "detalleBandeja" },
    ...detalle,
  ]
}

function atributosBandeja(bandeja: BandejaCampoParseada): dia.Cell.Selectors {
  const g = GEOMETRIA_BANDEJA
  const filas = Math.max(bandeja.capacidad, bandeja.slots.length, 1)
  const porSlot = new Map(bandeja.slots.map((slot) => [slot.slot, slot]))

  const attrs: dia.Cell.Selectors = {
    body: {
      width: "calc(w)",
      height: "calc(h)",
      rx: 8,
      ry: 8,
      fill: "#fff7ed",
      stroke: "#ea580c",
      strokeWidth: 1.5,
    },
    lineaEncabezado: {
      x1: 0,
      y1: g.altoEncabezado - 6,
      x2: "calc(w)",
      y2: g.altoEncabezado - 6,
      stroke: "#ea580c",
      strokeWidth: 1,
      strokeOpacity: 0.35,
    },
    etiquetaBandeja: {
      x: 12,
      y: 14,
      textVerticalAnchor: "middle",
      fontSize: 11,
      fontFamily: "Inter, sans-serif",
      fontWeight: 600,
      fill: "#9a3412",
      text: `Bandeja ${bandeja.numero}`,
    },
    detalleBandeja: {
      x: 12,
      y: 28,
      textVerticalAnchor: "middle",
      fontSize: 8.5,
      fontFamily: "Inter, sans-serif",
      fill: "#c2410c",
      text: `${bandeja.slotsUsados}/${bandeja.capacidad} fusiones`,
    },
  }

  for (let i = 1; i <= filas; i++) {
    const y = g.altoEncabezado + (i - 1) * g.altoSlot
    const slot = porSlot.get(i)
    const ocupado = Boolean(slot)

    attrs[selectorFila(i)] = {
      x: 6,
      y: y + 2,
      width: "calc(w-12)",
      height: g.altoSlot - 4,
      rx: 4,
      ry: 4,
      fill: ocupado ? "#ffedd5" : "#fffbeb",
      stroke: ocupado ? "#fdba74" : "#fde68a",
      strokeWidth: 1,
    }
    attrs[selectorNumero(i)] = {
      x: g.ancho / 2,
      y: y + g.altoSlot / 2,
      textAnchor: "middle",
      textVerticalAnchor: "middle",
      fontSize: 8,
      fontFamily: "Inter, sans-serif",
      fill: ocupado ? "#9a3412" : "#a8a29e",
      text: ocupado ? `S${i} · ${slot!.tipoEmpalme}` : `S${i} · libre`,
      pointerEvents: "none",
    }
    attrs[selectorPuente(i)] = {
      x1: 28,
      y1: y + g.altoSlot / 2,
      x2: g.ancho - 28,
      y2: y + g.altoSlot / 2,
      stroke: ocupado ? slot!.origen.color.hex : "transparent",
      strokeWidth: ocupado ? 2 : 0,
      strokeLinecap: "round",
      pointerEvents: "none",
    }
    attrs[selectorTipo(i)] = {
      display: "none",
    }
  }

  return attrs
}

const MARKUP_PUERTO: dia.MarkupJSON = [
  { tagName: "title", selector: "slotTooltip" },
  { tagName: "circle", selector: "slotPunto" },
]

export const Bandeja = dia.Element.define(TIPO_BANDEJA, {
  size: { width: GEOMETRIA_BANDEJA.ancho, height: 120 },
  ports: {
    groups: {
      [GRUPO_SLOTS]: {
        position: { name: "absolute" },
        markup: MARKUP_PUERTO,
      },
    },
  },
})

export function crearBandeja(
  bandeja: BandejaCampoParseada,
  en: { x: number; y: number },
): dia.Element {
  const elemento = new Bandeja({
    id: bandeja.id,
    position: en,
    size: { width: GEOMETRIA_BANDEJA.ancho, height: altoBandeja(bandeja) },
    markup: markupBandeja(bandeja),
    attrs: atributosBandeja(bandeja),
    z: Z_BANDEJA,
  })

  elemento.set("datosBandeja", bandeja)

  // Los puertos se alinean con el índice visual del slot (1-based → 0-based).
  const puertos = bandeja.slots.flatMap((slot) => {
    const indice = Math.max(0, slot.slot - 1)
    return [puertoSlot(bandeja, slot, indice, "in"), puertoSlot(bandeja, slot, indice, "out")]
  })
  elemento.addPorts(puertos)

  return elemento
}

export function datosBandeja(elemento: dia.Element): BandejaCampoParseada | undefined {
  return elemento.get("datosBandeja") as BandejaCampoParseada | undefined
}
