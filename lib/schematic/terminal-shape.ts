import { dia } from "@joint/core"

import type {
  GrupoParseado,
  LadoTerminacion,
  PuntoParseado,
  RolTerminacion,
  TerminacionParseada,
  VocabularioElemento,
} from "./network-data"
import { TEMA_CLARO, contornoHilo, sombraTarjeta, type TemaLienzo } from "./tema-lienzo"

/**
 * Traducción del modelo de datos a formas de JointJS.
 *
 * La terminación es un `dia.Element` rectangular, cada grupo es una banda
 * dentro de su markup y cada punto es un puerto (`port`) del elemento, que es lo
 * único conectable. Toda la geometría se calcula a partir de los grupos y puntos
 * que traiga el JSON, así que las terminaciones pueden tener distinta cantidad
 * de grupos y los grupos distinta cantidad de puntos.
 *
 * Los rótulos usan el vocabulario del elemento (buffer/hilo en una mufa,
 * casete/puerto en un ODF), de modo que la misma forma sirve para todos los
 * tipos.
 *
 * Sólo se usan APIs de `@joint/core` (MPL-2.0): `dia.Element.define`, la API de
 * puertos y el layout de puertos `absolute`.
 */

export const GEOMETRIA_TERMINACION = {
  ancho: 208,
  /** Franja superior con la etiqueta de la terminación. */
  altoEncabezado: 44,
  margenInferior: 14,
  /** Alto de la fila que rotula cada grupo. */
  altoEtiquetaGrupo: 15,
  margenGrupoY: 6,
  separacionGrupos: 12,
  /** Separación vertical entre puntos. */
  separacionPuntos: 18,
  /** Largo de la hebra de color que representa al punto. */
  largoHebra: 128,
  /** Distancia del puerto al borde de la terminación. */
  margenPuerto: 30,
  radioPuerto: 4,
  /** Hebra recortada de un punto que lleva etiqueta de trazabilidad al lado. */
  largoHebraConTraza: 34,
} as const

/** Color de acento de cada rol: borde, insignia y resplandor de la tarjeta. */
function acentoRol(rol: RolTerminacion, tema: TemaLienzo): string {
  switch (rol) {
    case "entrada":
      return tema.acentoEntrada
    case "salida":
      return tema.acentoSalida
    case "derivacion":
      return "#a78bfa"
    case "reserva":
      return "#94a3b8"
  }
}

/** Borde opaco de la tarjeta según su rol. */
function bordeRol(rol: RolTerminacion, tema: TemaLienzo): string {
  if (rol === "entrada") return tema.bordeEntrada
  if (rol === "salida") return tema.bordeSalida
  return tema.borde
}

/**
 * Etiqueta corta junto a un punto que dice de dónde viene su señal, p. ej.
 * `[SRC::Buffer 1-Hilo 4]`; `detalle` es la versión larga para el tooltip.
 */
export type TrazaPunto = { etiqueta: string; detalle: string }

const GRUPO_PUERTOS = "puntos"

export const TIPO_TERMINACION = "gismart.Terminacion"

/** z fijo, por debajo de las conexiones. */
export const Z_TERMINACION = 1

export function altoGrupo(grupo: GrupoParseado): number {
  const g = GEOMETRIA_TERMINACION
  return g.altoEtiquetaGrupo + grupo.puntos.length * g.separacionPuntos + g.margenGrupoY * 2
}

export function altoTerminacion(terminacion: TerminacionParseada): number {
  const g = GEOMETRIA_TERMINACION
  const alto = terminacion.grupos.reduce((total, grupo) => total + altoGrupo(grupo), 0)
  const separaciones = Math.max(0, terminacion.grupos.length - 1) * g.separacionGrupos
  return g.altoEncabezado + alto + separaciones + g.margenInferior
}

/** Coordenada Y (relativa a la terminación) del borde superior de un grupo. */
function topeGrupo(terminacion: TerminacionParseada, indiceGrupo: number): number {
  const g = GEOMETRIA_TERMINACION
  let y = g.altoEncabezado
  for (let i = 0; i < indiceGrupo; i++) {
    y += altoGrupo(terminacion.grupos[i]) + g.separacionGrupos
  }
  return y
}

/** Coordenada Y (relativa a la terminación) del centro de un punto. */
function centroPunto(
  terminacion: TerminacionParseada,
  indiceGrupo: number,
  indicePunto: number,
): number {
  const g = GEOMETRIA_TERMINACION
  return (
    topeGrupo(terminacion, indiceGrupo) +
    g.margenGrupoY +
    g.altoEtiquetaGrupo +
    (indicePunto + 0.5) * g.separacionPuntos
  )
}

const MARKUP_PUERTO: dia.MarkupJSON = [
  // <title> nativo de SVG: muestra el detalle del punto al pasar el puntero.
  { tagName: "title", selector: "puntoTooltip" },
  { tagName: "rect", selector: "puntoHebra" },
  { tagName: "circle", selector: "puntoMagnet" },
  { tagName: "text", selector: "puntoNumero" },
  { tagName: "text", selector: "puntoTraza" },
]

/**
 * Los puertos de la columna izquierda salen por el borde derecho y los de la
 * columna derecha por el izquierdo, para que la conexión se lea de izquierda a
 * derecha.
 */
function haciaDentro(lado: LadoTerminacion): 1 | -1 {
  return lado === "izquierda" ? -1 : 1
}

/** Las etiquetas vienen del backend, así que se escapan antes de inyectarlas. */
function escaparTexto(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function descripcionPunto(
  punto: PuntoParseado,
  grupo: GrupoParseado,
  vocab: VocabularioElemento,
  traza: TrazaPunto | undefined,
): string {
  const base = `${punto.terminacionEtiqueta} · ${vocab.grupo} ${grupo.numero} (${grupo.color.name}) · ${vocab.punto} ${punto.punto} (${punto.color.name})`
  const partes = [base, punto.etiqueta, traza?.detalle].filter(Boolean)
  return escaparTexto(partes.join(" · "))
}

function puertoPunto(
  terminacion: TerminacionParseada,
  grupo: GrupoParseado,
  punto: PuntoParseado,
  vocab: VocabularioElemento,
  indiceGrupo: number,
  indicePunto: number,
  tema: TemaLienzo,
  traza: TrazaPunto | undefined,
): dia.Element.Port {
  const g = GEOMETRIA_TERMINACION
  const direccion = haciaDentro(terminacion.lado)
  const separacion = g.radioPuerto + 3
  // La hebra se dibuja hacia el interior de la terminación y el número queda
  // entre el puerto y el borde. Con traza, la hebra se acorta para dejarle
  // sitio a la etiqueta a continuación.
  const largoHebra = traza ? g.largoHebraConTraza : g.largoHebra
  const xHebra = direccion === -1 ? -(separacion + largoHebra) : separacion
  const xNumero = direccion === -1 ? separacion + 3 : -(separacion + 3)
  const xTraza = direccion === -1 ? xHebra - 6 : xHebra + largoHebra + 6
  const contorno = contornoHilo(punto.color.hex, tema)

  return {
    id: punto.portId,
    group: GRUPO_PUERTOS,
    position: {
      args: {
        x: terminacion.lado === "izquierda" ? g.ancho - g.margenPuerto : g.margenPuerto,
        y: centroPunto(terminacion, indiceGrupo, indicePunto),
      },
    },
    attrs: {
      // Se usa `html` y no el atributo especial `text` porque este último
      // envuelve el contenido en <tspan>, que no es válido dentro de <title>.
      puntoTooltip: { html: descripcionPunto(punto, grupo, vocab, traza) },
      puntoHebra: {
        x: xHebra,
        y: -1.5,
        width: largoHebra,
        height: 3,
        rx: 1.5,
        ry: 1.5,
        fill: punto.color.hex,
        // Solo los hilos que se pierden contra la tarjeta (el blanco en modo
        // claro, el negro en oscuro) llevan contorno.
        stroke: contorno ?? "none",
        strokeWidth: contorno ? 0.75 : 0,
        pointerEvents: "none",
      },
      puntoMagnet: {
        r: g.radioPuerto,
        fill: punto.color.hex,
        // El anillo del color de la tarjeta separa el punto de su hebra.
        stroke: contorno ?? tema.superficie,
        strokeWidth: 1.5,
        // `magnet` marca el nodo como conectable: es lo que permite arrastrar
        // una conexión desde el punto.
        magnet: true,
        cursor: "crosshair",
      },
      puntoNumero: {
        x: xNumero,
        y: 0,
        textAnchor: direccion === -1 ? "start" : "end",
        textVerticalAnchor: "middle",
        fontSize: 9,
        fontFamily: tema.fuenteMono,
        fill: tema.textoSuave,
        text: String(punto.punto),
        pointerEvents: "none",
      },
      puntoTraza: traza
        ? {
            x: xTraza,
            y: 0,
            textAnchor: direccion === -1 ? "end" : "start",
            textVerticalAnchor: "middle",
            fontSize: 8,
            fontFamily: tema.fuenteMono,
            fill: tema.acentoTraza,
            text: traza.etiqueta,
            pointerEvents: "none",
          }
        : { display: "none" },
    },
  }
}

const selectorBanda = (numero: number) => `grupoBanda${numero}`
const selectorChip = (numero: number) => `grupoChip${numero}`
const selectorEtiquetaGrupo = (numero: number) => `grupoEtiqueta${numero}`
const selectorDivisor = (numero: number) => `grupoDivisor${numero}`

function markupTerminacion(terminacion: TerminacionParseada): dia.MarkupJSON {
  const bandas: dia.MarkupJSON = terminacion.grupos.flatMap((grupo, indice) => [
    // Un separador entre grupos, como `divide-y`: no va antes del primero.
    ...(indice > 0 ? [{ tagName: "line", selector: selectorDivisor(grupo.numero) }] : []),
    { tagName: "rect", selector: selectorBanda(grupo.numero) },
    { tagName: "rect", selector: selectorChip(grupo.numero) },
    { tagName: "text", selector: selectorEtiquetaGrupo(grupo.numero) },
  ])

  return [
    { tagName: "rect", selector: "body" },
    { tagName: "line", selector: "lineaEncabezado" },
    { tagName: "rect", selector: "insigniaRol" },
    { tagName: "text", selector: "textoRol" },
    { tagName: "text", selector: "etiquetaTerminacion" },
    { tagName: "text", selector: "detalleTerminacion" },
    ...bandas,
  ]
}

/** Pluraliza contra el vocabulario del elemento, que ya trae ambas formas. */
function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular.toLowerCase() : plural}`
}

const ANCHO_INSIGNIA_ROL = 58

function atributosTerminacion(
  terminacion: TerminacionParseada,
  vocab: VocabularioElemento,
  tema: TemaLienzo,
): dia.Cell.Selectors {
  const g = GEOMETRIA_TERMINACION
  const acento = acentoRol(terminacion.rol, tema)

  const attrs: dia.Cell.Selectors = {
    body: {
      // `calc(w)` / `calc(h)` son las expresiones relativas de JointJS v4; un
      // "100%" lo resolvería el SVG contra el viewport, no contra el elemento.
      width: "calc(w)",
      height: "calc(h)",
      rx: tema.radioEsquina,
      ry: tema.radioEsquina,
      fill: tema.superficie,
      // Borde sólido del rol, sin drop-shadow ni resplandor hacia afuera.
      // El tema claro sí lleva una sombra suave de tarjeta (`shadow-md`).
      stroke: bordeRol(terminacion.rol, tema),
      strokeOpacity: 1,
      strokeWidth: 1,
      filter: tema.neon ? null : sombraTarjeta(tema, acento),
    },
    lineaEncabezado: {
      x1: 0,
      y1: g.altoEncabezado - 4,
      x2: "calc(w)",
      y2: g.altoEncabezado - 4,
      stroke: tema.neon ? acento : tema.borde,
      strokeOpacity: tema.neon ? 0.25 : 1,
      strokeWidth: 1,
    },
    insigniaRol: {
      x: g.ancho - 14 - ANCHO_INSIGNIA_ROL,
      y: 10,
      width: ANCHO_INSIGNIA_ROL,
      height: 16,
      rx: tema.neon ? 2 : 8,
      ry: tema.neon ? 2 : 8,
      fill: acento,
      fillOpacity: tema.oscuro ? 0.14 : 0.1,
      stroke: tema.neon ? acento : "none",
      strokeOpacity: 0.6,
      strokeWidth: tema.neon ? 1 : 0,
    },
    textoRol: {
      x: g.ancho - 14 - ANCHO_INSIGNIA_ROL / 2,
      y: 18,
      textAnchor: "middle",
      textVerticalAnchor: "middle",
      fontSize: 8.5,
      fontFamily: tema.fuenteMono,
      fontWeight: 600,
      letterSpacing: 0.6,
      fill: acento,
      text: terminacion.rol.toUpperCase(),
    },
    etiquetaTerminacion: {
      x: 14,
      y: 16,
      textVerticalAnchor: "middle",
      fontSize: 12,
      fontFamily: tema.fuenteMono,
      fontWeight: 700,
      fill: tema.texto,
      text: terminacion.etiqueta,
    },
    detalleTerminacion: {
      x: 14,
      y: 31,
      textVerticalAnchor: "middle",
      fontSize: 9,
      fontFamily: tema.fuenteMono,
      fill: tema.textoSuave,
      text: `${contar(terminacion.totalPuntos, vocab.punto, vocab.puntoPlural)} · ${contar(
        terminacion.grupos.length,
        vocab.grupo,
        vocab.grupoPlural,
      )}`,
    },
  }

  terminacion.grupos.forEach((grupo, indiceGrupo) => {
    const tope = topeGrupo(terminacion, indiceGrupo)
    const contorno = contornoHilo(grupo.color.hex, tema)

    if (indiceGrupo > 0) {
      const y = tope - g.separacionGrupos / 2
      attrs[selectorDivisor(grupo.numero)] = {
        x1: 14,
        y1: y,
        x2: "calc(w-14)",
        y2: y,
        stroke: tema.borde,
        strokeWidth: 1,
        strokeDasharray: tema.neon ? "2 3" : "none",
      }
    }
    attrs[selectorBanda(grupo.numero)] = {
      x: 6,
      y: tope,
      width: "calc(w-12)",
      height: altoGrupo(grupo),
      rx: tema.neon ? 3 : 8,
      ry: tema.neon ? 3 : 8,
      // En el tema oscuro el buffer es una caja plana: fondo sólido, borde
      // opaco y sin filtro. El color del buffer vive solo en el recuadro.
      fill: tema.neon ? tema.fondo : grupo.color.hex,
      fillOpacity: tema.neon ? 1 : 0.05,
      stroke: tema.neon ? "#334155" : "none",
      strokeWidth: tema.neon ? 1 : 0,
      filter: null,
    }
    attrs[selectorChip(grupo.numero)] = {
      x: 14,
      y: tope + 4.5,
      width: 8,
      height: 8,
      rx: 2,
      ry: 2,
      fill: grupo.color.hex,
      stroke: contorno ?? "none",
      strokeWidth: contorno ? 0.75 : 0,
    }
    attrs[selectorEtiquetaGrupo(grupo.numero)] = {
      x: 28,
      y: tope + 8.5,
      textVerticalAnchor: "middle",
      fontSize: 9,
      fontFamily: tema.fuente,
      fontWeight: 500,
      fill: tema.textoSuave,
      text: `${grupo.etiqueta ?? `${vocab.grupo} ${grupo.numero}`} · ${grupo.color.name} · ${contar(
        grupo.puntos.length,
        vocab.punto,
        vocab.puntoPlural,
      )}`,
    }
  })

  return attrs
}

/**
 * Elemento "terminación". Se registra en el `cellNamespace` del grafo para que
 * JointJS resuelva la vista correcta a partir del `type`.
 */
export const Terminacion = dia.Element.define(TIPO_TERMINACION, {
  size: { width: GEOMETRIA_TERMINACION.ancho, height: 120 },
  ports: {
    groups: {
      [GRUPO_PUERTOS]: {
        position: { name: "absolute" },
        markup: MARKUP_PUERTO,
      },
    },
  },
})

/** Crea el elemento de una terminación con sus bandas de grupo y un puerto por punto. */
export function crearTerminacion(
  terminacion: TerminacionParseada,
  vocab: VocabularioElemento,
  en: { x: number; y: number },
  tema: TemaLienzo = TEMA_CLARO,
  trazas?: ReadonlyMap<string, TrazaPunto>,
): dia.Element {
  const elemento = new Terminacion({
    id: terminacion.id,
    position: en,
    size: { width: GEOMETRIA_TERMINACION.ancho, height: altoTerminacion(terminacion) },
    markup: markupTerminacion(terminacion),
    attrs: atributosTerminacion(terminacion, vocab, tema),
    z: Z_TERMINACION,
  })

  // Los datos parseados viajan con el elemento: las validaciones de conexión y
  // la exportación los leen sin volver a consultar el JSON.
  elemento.set("datosTerminacion", terminacion)

  const puertos = terminacion.grupos.flatMap((grupo, indiceGrupo) =>
    grupo.puntos.map((punto, indicePunto) =>
      puertoPunto(
        terminacion,
        grupo,
        punto,
        vocab,
        indiceGrupo,
        indicePunto,
        tema,
        trazas?.get(punto.portId),
      ),
    ),
  )
  elemento.addPorts(puertos)

  return elemento
}

export function datosTerminacion(elemento: dia.Element): TerminacionParseada | undefined {
  return elemento.get("datosTerminacion") as TerminacionParseada | undefined
}

/** Resuelve el punto asociado a un puerto usando los datos guardados en el elemento. */
export function puntoDesdePuerto(
  elemento: dia.Element,
  portId: string,
): PuntoParseado | undefined {
  const terminacion = datosTerminacion(elemento)
  if (!terminacion) return undefined

  for (const grupo of terminacion.grupos) {
    const punto = grupo.puntos.find((item) => item.portId === portId)
    if (punto) return punto
  }
  return undefined
}
