import { dia } from "@joint/core"

import type {
  GrupoParseado,
  LadoTerminacion,
  PuntoParseado,
  RolTerminacion,
  TerminacionParseada,
  VocabularioElemento,
} from "./network-data"

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
  altoEncabezado: 36,
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
  radioPuerto: 4.5,
} as const

const ESTILO_ROL: Record<RolTerminacion, { trazo: string }> = {
  entrada: { trazo: "#2563eb" },
  salida: { trazo: "#0ea5e9" },
  derivacion: { trazo: "#7c3aed" },
  reserva: { trazo: "#94a3b8" },
}

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
): string {
  const base = `${punto.terminacionEtiqueta} · ${vocab.grupo} ${grupo.numero} (${grupo.color.name}) · ${vocab.punto} ${punto.punto} (${punto.color.name})`
  return escaparTexto(punto.etiqueta ? `${base} · ${punto.etiqueta}` : base)
}

function puertoPunto(
  terminacion: TerminacionParseada,
  grupo: GrupoParseado,
  punto: PuntoParseado,
  vocab: VocabularioElemento,
  indiceGrupo: number,
  indicePunto: number,
): dia.Element.Port {
  const g = GEOMETRIA_TERMINACION
  const direccion = haciaDentro(terminacion.lado)
  const separacion = g.radioPuerto + 2
  // La hebra se dibuja hacia el interior de la terminación y el número queda
  // entre el puerto y el borde.
  const xHebra = direccion === -1 ? -(separacion + g.largoHebra) : separacion
  const xNumero = direccion === -1 ? separacion + 3 : -(separacion + 3)

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
      puntoTooltip: { html: descripcionPunto(punto, grupo, vocab) },
      puntoHebra: {
        x: xHebra,
        y: -2,
        width: g.largoHebra,
        height: 4,
        rx: 2,
        ry: 2,
        fill: punto.color.hex,
        // El contorno mantiene visible el hilo blanco sobre el fondo blanco.
        stroke: "#64748b",
        strokeWidth: 0.8,
        pointerEvents: "none",
      },
      puntoMagnet: {
        r: g.radioPuerto,
        fill: punto.color.hex,
        stroke: "#334155",
        strokeWidth: 1,
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
        fontFamily: "Inter, sans-serif",
        fill: "#475569",
        text: String(punto.punto),
        pointerEvents: "none",
      },
    },
  }
}

const selectorBanda = (numero: number) => `grupoBanda${numero}`
const selectorChip = (numero: number) => `grupoChip${numero}`
const selectorEtiquetaGrupo = (numero: number) => `grupoEtiqueta${numero}`

function markupTerminacion(terminacion: TerminacionParseada): dia.MarkupJSON {
  const bandas: dia.MarkupJSON = terminacion.grupos.flatMap((grupo) => [
    { tagName: "rect", selector: selectorBanda(grupo.numero) },
    { tagName: "rect", selector: selectorChip(grupo.numero) },
    { tagName: "text", selector: selectorEtiquetaGrupo(grupo.numero) },
  ])

  return [
    { tagName: "rect", selector: "body" },
    { tagName: "line", selector: "lineaEncabezado" },
    { tagName: "circle", selector: "puntoRol" },
    { tagName: "text", selector: "etiquetaTerminacion" },
    { tagName: "text", selector: "detalleTerminacion" },
    ...bandas,
  ]
}

/** Pluraliza contra el vocabulario del elemento, que ya trae ambas formas. */
function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular.toLowerCase() : plural}`
}

function atributosTerminacion(
  terminacion: TerminacionParseada,
  vocab: VocabularioElemento,
): dia.Cell.Selectors {
  const g = GEOMETRIA_TERMINACION
  const estilo = ESTILO_ROL[terminacion.rol]

  const attrs: dia.Cell.Selectors = {
    body: {
      // `calc(w)` / `calc(h)` son las expresiones relativas de JointJS v4; un
      // "100%" lo resolvería el SVG contra el viewport, no contra el elemento.
      width: "calc(w)",
      height: "calc(h)",
      rx: 8,
      ry: 8,
      fill: "#ffffff",
      stroke: estilo.trazo,
      strokeWidth: 1.5,
    },
    lineaEncabezado: {
      x1: 0,
      y1: g.altoEncabezado - 6,
      x2: "calc(w)",
      y2: g.altoEncabezado - 6,
      stroke: estilo.trazo,
      strokeWidth: 1,
      strokeOpacity: 0.35,
    },
    puntoRol: { cx: 15, cy: 15, r: 4, fill: estilo.trazo },
    etiquetaTerminacion: {
      x: 25,
      y: 15,
      textVerticalAnchor: "middle",
      fontSize: 11,
      fontFamily: "Inter, sans-serif",
      fontWeight: 600,
      fill: "#0f172a",
      text: terminacion.etiqueta,
    },
    detalleTerminacion: {
      x: 25,
      y: 27,
      textVerticalAnchor: "middle",
      fontSize: 8.5,
      fontFamily: "Inter, sans-serif",
      fill: "#64748b",
      text: `${terminacion.rol.toUpperCase()} · ${contar(
        terminacion.totalPuntos,
        vocab.punto,
        vocab.puntoPlural,
      )} · ${contar(terminacion.grupos.length, vocab.grupo, vocab.grupoPlural)}`,
    },
  }

  terminacion.grupos.forEach((grupo, indiceGrupo) => {
    const tope = topeGrupo(terminacion, indiceGrupo)

    attrs[selectorBanda(grupo.numero)] = {
      x: 6,
      y: tope,
      width: "calc(w-12)",
      height: altoGrupo(grupo),
      rx: 6,
      ry: 6,
      fill: grupo.color.hex,
      fillOpacity: 0.08,
      stroke: grupo.color.hex,
      strokeWidth: 1,
      strokeOpacity: 0.55,
    }
    attrs[selectorChip(grupo.numero)] = {
      x: 13,
      y: tope + 5,
      width: 7,
      height: 7,
      rx: 1.5,
      ry: 1.5,
      fill: grupo.color.hex,
      stroke: "#64748b",
      strokeWidth: 0.5,
    }
    attrs[selectorEtiquetaGrupo(grupo.numero)] = {
      x: 25,
      y: tope + 8.5,
      textVerticalAnchor: "middle",
      fontSize: 8.5,
      fontFamily: "Inter, sans-serif",
      fontWeight: 500,
      fill: "#475569",
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
): dia.Element {
  const elemento = new Terminacion({
    id: terminacion.id,
    position: en,
    size: { width: GEOMETRIA_TERMINACION.ancho, height: altoTerminacion(terminacion) },
    markup: markupTerminacion(terminacion),
    attrs: atributosTerminacion(terminacion, vocab),
    z: Z_TERMINACION,
  })

  // Los datos parseados viajan con el elemento: las validaciones de conexión y
  // la exportación los leen sin volver a consultar el JSON.
  elemento.set("datosTerminacion", terminacion)

  const puertos = terminacion.grupos.flatMap((grupo, indiceGrupo) =>
    grupo.puntos.map((punto, indicePunto) =>
      puertoPunto(terminacion, grupo, punto, vocab, indiceGrupo, indicePunto),
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
