import { dia } from "@joint/core"

import type { DivisorCampoParseado, PuertoDivisorParseado } from "./mufa-field-data"
import { TEMA_CLARO, sombraTarjeta, type TemaLienzo } from "./tema-lienzo"

/**
 * Divisor óptico (splitter) en JointJS: pasarela entre el cable de entrada y
 * los de salida. El puerto de entrada queda a la izquierda y los de salida a
 * la derecha, cada uno como `port` del elemento.
 *
 * Sólo APIs de `@joint/core` (MPL-2.0).
 */

export const GEOMETRIA_DIVISOR = {
  ancho: 132,
  altoEncabezado: 28,
  margenInferior: 8,
  altoPuerto: 18,
  margenPuerto: 14,
  radioPuerto: 5,
} as const

export const TIPO_DIVISOR = "gismart.Divisor"
export const Z_DIVISOR = 2

const GRUPO_PUERTOS = "puertos"

export function altoDivisor(divisor: DivisorCampoParseado): number {
  const g = GEOMETRIA_DIVISOR
  const filas = Math.max(divisor.entradas.length, divisor.salidas.length, 1)
  return g.altoEncabezado + filas * g.altoPuerto + g.margenInferior
}

function centroPuerto(indice: number, total: number, filas: number): number {
  const g = GEOMETRIA_DIVISOR
  const altoZona = filas * g.altoPuerto
  const altoGrupo = Math.max(total, 1) * g.altoPuerto
  return g.altoEncabezado + (altoZona - altoGrupo) / 2 + (indice + 0.5) * g.altoPuerto
}

function escaparTexto(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function puertoDivisor(
  divisor: DivisorCampoParseado,
  puerto: PuertoDivisorParseado,
  indice: number,
  filas: number,
  tema: TemaLienzo,
): dia.Element.Port {
  const g = GEOMETRIA_DIVISOR
  const entrada = puerto.lado === "entrada"
  const x = entrada ? g.margenPuerto : g.ancho - g.margenPuerto
  const xNumero = entrada ? x + 10 : x - 10

  return {
    id: puerto.portId,
    group: GRUPO_PUERTOS,
    position: { args: { x, y: centroPuerto(indice, entrada ? divisor.entradas.length : divisor.salidas.length, filas) } },
    attrs: {
      divisorTooltip: {
        html: escaparTexto(
          `Divisor ${divisor.numero} · ${entrada ? "entrada" : "salida"} ${puerto.numero}`,
        ),
      },
      divisorPunto: {
        r: g.radioPuerto,
        fill: tema.superficie,
        stroke: tema.acentoEntrada,
        strokeWidth: 1.5,
        magnet: "passive",
        cursor: "default",
      },
      divisorNumero: {
        x: xNumero,
        y: 0,
        textAnchor: entrada ? "start" : "end",
        textVerticalAnchor: "middle",
        fontSize: 9,
        fontFamily: tema.fuenteMono,
        fill: tema.texto,
        text: String(puerto.numero),
        pointerEvents: "none",
      },
    },
  }
}

const MARKUP_PUERTO: dia.MarkupJSON = [
  { tagName: "title", selector: "divisorTooltip" },
  { tagName: "circle", selector: "divisorPunto" },
  { tagName: "text", selector: "divisorNumero" },
]

export const Divisor = dia.Element.define(TIPO_DIVISOR, {
  size: { width: GEOMETRIA_DIVISOR.ancho, height: 80 },
  ports: {
    groups: {
      [GRUPO_PUERTOS]: {
        position: { name: "absolute" },
        markup: MARKUP_PUERTO,
      },
    },
  },
})

export function crearDivisor(
  divisor: DivisorCampoParseado,
  en: { x: number; y: number },
  tema: TemaLienzo = TEMA_CLARO,
): dia.Element {
  const g = GEOMETRIA_DIVISOR
  const filas = Math.max(divisor.entradas.length, divisor.salidas.length, 1)
  const acento = tema.acentoEntrada
  const detalle = divisor.modelo ?? `${divisor.entradas.length}×${divisor.salidas.length}`

  const elemento = new Divisor({
    id: divisor.id,
    position: en,
    size: { width: g.ancho, height: altoDivisor(divisor) },
    markup: [
      { tagName: "rect", selector: "body" },
      { tagName: "text", selector: "etiqueta" },
      { tagName: "text", selector: "detalle" },
    ],
    attrs: {
      body: {
        width: "calc(w)",
        height: "calc(h)",
        rx: tema.neon ? tema.radioEsquina : 8,
        ry: tema.neon ? tema.radioEsquina : 8,
        fill: tema.superficie,
        stroke: acento,
        strokeWidth: 1.25,
        strokeOpacity: tema.oscuro ? 0.7 : 0.85,
        filter: tema.neon ? null : sombraTarjeta(tema, acento),
      },
      etiqueta: {
        x: g.ancho / 2,
        y: 12,
        textAnchor: "middle",
        textVerticalAnchor: "middle",
        fontSize: 11,
        fontFamily: tema.fuente,
        fontWeight: 600,
        fill: tema.texto,
        text: `Divisor ${divisor.numero}`,
      },
      detalle: {
        x: g.ancho / 2,
        y: 23,
        textAnchor: "middle",
        textVerticalAnchor: "middle",
        fontSize: 8,
        fontFamily: tema.fuenteMono,
        fill: tema.textoSuave,
        text: detalle,
      },
    },
    z: Z_DIVISOR,
  })

  elemento.set("datosDivisor", divisor)
  const puertos = [
    ...divisor.entradas.map((puerto, indice) => puertoDivisor(divisor, puerto, indice, filas, tema)),
    ...divisor.salidas.map((puerto, indice) => puertoDivisor(divisor, puerto, indice, filas, tema)),
  ]
  elemento.addPorts(puertos)
  return elemento
}
