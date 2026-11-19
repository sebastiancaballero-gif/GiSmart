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
  ancho: 184,
  altoEncabezado: 38,
  margenInferior: 10,
  altoPuerto: 20,
  /** Del borde al centro del círculo de cada puerto: queda entero adentro. */
  margenPuerto: 16,
  radioPuerto: 5,
  /** Del centro del círculo al número, hacia el interior del divisor. */
  separacionNumero: 13,
} as const

export const TIPO_DIVISOR = "gismart.Divisor"
export const Z_DIVISOR = 2

const GRUPO_ENTRADAS = "entradas"
const GRUPO_SALIDAS = "salidas"

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

  return {
    id: puerto.portId,
    group: entrada ? GRUPO_ENTRADAS : GRUPO_SALIDAS,
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
        fontSize: 10,
        fontFamily: tema.fuenteMono,
        fontWeight: 600,
        fill: tema.texto,
        text: entrada ? `E${puerto.numero}` : String(puerto.numero),
        pointerEvents: "none",
      },
    },
  }
}

const MARKUP_PUERTO: dia.MarkupJSON = [
  { tagName: "title", selector: "divisorTooltip" },
  { tagName: "circle", selector: "divisorPunto" },
]

const MARKUP_NUMERO: dia.MarkupJSON = [{ tagName: "text", selector: "divisorNumero" }]

/**
 * Los números van con la etiqueta de puerto de JointJS, hacia adentro: las
 * entradas (borde izquierdo) a la derecha de su círculo y las salidas (borde
 * derecho) a la izquierda. Así ninguno se sale del contorno del divisor.
 */
export const Divisor = dia.Element.define(TIPO_DIVISOR, {
  size: { width: GEOMETRIA_DIVISOR.ancho, height: 80 },
  ports: {
    groups: {
      [GRUPO_ENTRADAS]: {
        position: { name: "absolute" },
        markup: MARKUP_PUERTO,
        label: {
          position: { name: "right", args: { x: GEOMETRIA_DIVISOR.separacionNumero } },
          markup: MARKUP_NUMERO,
        },
      },
      [GRUPO_SALIDAS]: {
        position: { name: "absolute" },
        markup: MARKUP_PUERTO,
        label: {
          position: { name: "left", args: { x: -GEOMETRIA_DIVISOR.separacionNumero } },
          markup: MARKUP_NUMERO,
        },
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
      { tagName: "title", selector: "tooltip" },
      { tagName: "rect", selector: "body" },
      { tagName: "text", selector: "etiqueta" },
      { tagName: "text", selector: "detalle" },
    ],
    attrs: {
      tooltip: {
        html: escaparTexto(
          [`Divisor ${divisor.numero}`, divisor.codigo, divisor.modelo].filter(Boolean).join(" · "),
        ),
      },
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
        y: 14,
        textAnchor: "middle",
        textVerticalAnchor: "middle",
        fontSize: 12,
        fontFamily: tema.fuente,
        fontWeight: 600,
        fill: tema.texto,
        text: `Divisor ${divisor.numero}`,
      },
      detalle: {
        x: g.ancho / 2,
        y: 28,
        textAnchor: "middle",
        textVerticalAnchor: "middle",
        fontSize: 9,
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
