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
  ancho: 212,
  altoEncabezado: 38,
  margenInferior: 10,
  altoPuerto: 20,
  /** Del borde izquierdo al centro del círculo de la entrada. */
  margenPuerto: 16,
  /**
   * Del borde derecho al centro del círculo de cada salida: deja lugar para el
   * número global entre el círculo y el borde (hasta tres cifras).
   */
  margenPuertoSalida: 46,
  radioPuerto: 5,
  /** Del centro del círculo al número local, hacia el interior del divisor. */
  separacionNumero: 13,
  /** Del centro del círculo de salida al número global, hacia el borde. */
  separacionNumeroGlobal: 11,
} as const

/**
 * Extremo de un enlace que sale de un puerto de salida del divisor: se ancla
 * en el borde derecho, a la altura del puerto, y no sobre el círculo.
 */
export const ANCLA_SALIDA_DIVISOR = {
  anchor: { name: "center", args: { dx: GEOMETRIA_DIVISOR.margenPuertoSalida } },
  connectionPoint: { name: "anchor" },
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
  const x = entrada ? g.margenPuerto : g.ancho - g.margenPuertoSalida
  const global = puerto.numeroGlobal

  return {
    id: puerto.portId,
    group: entrada ? GRUPO_ENTRADAS : GRUPO_SALIDAS,
    position: { args: { x, y: centroPuerto(indice, entrada ? divisor.entradas.length : divisor.salidas.length, filas) } },
    attrs: {
      divisorTooltip: {
        html: escaparTexto(
          `Divisor ${divisor.numero} · ${entrada ? "entrada" : "salida"} ${puerto.numero}` +
            (global === undefined ? "" : ` · salida global ${global}`),
        ),
      },
      ...(entrada
        ? {}
        : {
            divisorGlobal: {
              x: g.separacionNumeroGlobal,
              y: 0,
              textAnchor: "start",
              textVerticalAnchor: "middle",
              fontSize: 10,
              fontFamily: tema.fuenteMono,
              fontWeight: 600,
              fill: tema.acentoTraza,
              text: global === undefined ? "" : String(global),
              pointerEvents: "none",
            },
          }),
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

const MARKUP_PUERTO_SALIDA: dia.MarkupJSON = [
  ...MARKUP_PUERTO,
  { tagName: "text", selector: "divisorGlobal" },
]

const MARKUP_NUMERO: dia.MarkupJSON = [{ tagName: "text", selector: "divisorNumero" }]

/**
 * Los números van hacia adentro del divisor: la entrada (borde izquierdo) a la
 * derecha de su círculo; cada salida, `[local] (puerto) [global]`, con el
 * local a la izquierda del círculo y el correlativo de la cubierta entre el
 * círculo y el borde derecho. El enlace de una salida arranca en el borde
 * (ver `ANCLA_SALIDA_DIVISOR`) para no tapar el número global.
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
        markup: MARKUP_PUERTO_SALIDA,
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
