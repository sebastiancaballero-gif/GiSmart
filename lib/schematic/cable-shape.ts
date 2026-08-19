import { dia } from "@joint/core"

import type { BufferParseado, CableParseado, HiloParseado, RolCable } from "./mufa-data"

/**
 * Traducción del modelo de datos a formas de JointJS.
 *
 * Jerarquía: el cable es un `dia.Element` rectangular, cada buffer es una banda
 * dentro de su markup y cada hilo es un puerto (`port`) del elemento, que es lo
 * único conectable. Toda la geometría se calcula a partir de los buffers e hilos
 * que traiga el JSON, así que los cables pueden tener distinta cantidad de
 * buffers y los buffers distinta cantidad de hilos.
 *
 * Sólo se usan APIs de `@joint/core` (MPL-2.0): `dia.Element.define`, la API de
 * puertos y el layout de puertos `absolute`.
 */

export const GEOMETRIA_CABLE = {
  ancho: 208,
  /** Franja superior con la etiqueta del cable. */
  altoEncabezado: 36,
  margenInferior: 14,
  /** Alto de la fila que rotula cada buffer. */
  altoEtiquetaBuffer: 15,
  margenBufferY: 6,
  separacionBuffers: 12,
  /** Separación vertical entre hilos. */
  separacionHilos: 18,
  /** Largo de la hebra de color que representa al hilo. */
  largoHebra: 128,
  /** Distancia del puerto al borde del cable. */
  margenPuerto: 30,
  radioPuerto: 4.5,
} as const

const ESTILO_ROL: Record<RolCable, { trazo: string }> = {
  entrada: { trazo: "#2563eb" },
  salida: { trazo: "#0ea5e9" },
}

const GRUPO_PUERTOS = "hilos"

export const TIPO_CABLE = "gismart.Cable"

/** z fijo para que los empalmes queden siempre por debajo del cuerpo del cable. */
export const Z_CABLE = 1

export function altoBuffer(buffer: BufferParseado): number {
  const g = GEOMETRIA_CABLE
  return g.altoEtiquetaBuffer + buffer.hilos.length * g.separacionHilos + g.margenBufferY * 2
}

export function altoCable(cable: CableParseado): number {
  const g = GEOMETRIA_CABLE
  const altoBuffers = cable.buffers.reduce((total, buffer) => total + altoBuffer(buffer), 0)
  const separaciones = Math.max(0, cable.buffers.length - 1) * g.separacionBuffers
  return g.altoEncabezado + altoBuffers + separaciones + g.margenInferior
}

/** Coordenada Y (relativa al cable) del borde superior del buffer en esa posición. */
function topeBuffer(cable: CableParseado, indiceBuffer: number): number {
  const g = GEOMETRIA_CABLE
  let y = g.altoEncabezado
  for (let i = 0; i < indiceBuffer; i++) {
    y += altoBuffer(cable.buffers[i]) + g.separacionBuffers
  }
  return y
}

/** Coordenada Y (relativa al cable) del centro de un hilo. */
function centroHilo(cable: CableParseado, indiceBuffer: number, indiceHilo: number): number {
  const g = GEOMETRIA_CABLE
  return (
    topeBuffer(cable, indiceBuffer) +
    g.margenBufferY +
    g.altoEtiquetaBuffer +
    (indiceHilo + 0.5) * g.separacionHilos
  )
}

const MARKUP_PUERTO: dia.MarkupJSON = [
  // <title> nativo de SVG: muestra el detalle del hilo al pasar el puntero.
  { tagName: "title", selector: "hiloTooltip" },
  { tagName: "rect", selector: "hiloHebra" },
  { tagName: "circle", selector: "hiloPunto" },
  { tagName: "text", selector: "hiloNumero" },
]

/**
 * Los puertos del cable de entrada salen por el borde derecho y los de los
 * cables de salida por el izquierdo, para que el empalme se lea de izquierda
 * a derecha.
 */
function haciaDentro(rol: RolCable): 1 | -1 {
  return rol === "entrada" ? -1 : 1
}

/** Las etiquetas vienen del backend, así que se escapan antes de inyectarlas. */
function escaparTexto(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function descripcionHilo(hilo: HiloParseado, buffer: BufferParseado): string {
  const base = `${hilo.cableEtiqueta} · Buffer ${buffer.numero} (${buffer.color.name}) · Hilo ${hilo.hilo} (${hilo.color.name})`
  return escaparTexto(hilo.etiqueta ? `${base} · ${hilo.etiqueta}` : base)
}

function puertoHilo(
  cable: CableParseado,
  buffer: BufferParseado,
  hilo: HiloParseado,
  indiceBuffer: number,
  indiceHilo: number,
): dia.Element.Port {
  const g = GEOMETRIA_CABLE
  const direccion = haciaDentro(cable.rol)
  const separacion = g.radioPuerto + 2
  // La hebra se dibuja hacia el interior del cable y el número queda entre el
  // puerto y el borde.
  const xHebra = direccion === -1 ? -(separacion + g.largoHebra) : separacion
  const xNumero = direccion === -1 ? separacion + 3 : -(separacion + 3)

  return {
    id: hilo.portId,
    group: GRUPO_PUERTOS,
    position: {
      args: {
        x: cable.rol === "entrada" ? g.ancho - g.margenPuerto : g.margenPuerto,
        y: centroHilo(cable, indiceBuffer, indiceHilo),
      },
    },
    attrs: {
      // Se usa `html` y no el atributo especial `text` porque este último
      // envuelve el contenido en <tspan>, que no es válido dentro de <title>.
      hiloTooltip: { html: descripcionHilo(hilo, buffer) },
      hiloHebra: {
        x: xHebra,
        y: -2,
        width: g.largoHebra,
        height: 4,
        rx: 2,
        ry: 2,
        fill: hilo.color.hex,
        // El contorno mantiene visible el hilo blanco sobre el cable blanco.
        stroke: "#64748b",
        strokeWidth: 0.8,
        pointerEvents: "none",
      },
      hiloPunto: {
        r: g.radioPuerto,
        fill: hilo.color.hex,
        stroke: "#334155",
        strokeWidth: 1,
        // `magnet` marca el nodo como conectable: es lo que permite arrastrar
        // un empalme desde el hilo.
        magnet: true,
        cursor: "crosshair",
      },
      hiloNumero: {
        x: xNumero,
        y: 0,
        textAnchor: direccion === -1 ? "start" : "end",
        textVerticalAnchor: "middle",
        fontSize: 9,
        fontFamily: "Inter, sans-serif",
        fill: "#475569",
        text: String(hilo.hilo),
        pointerEvents: "none",
      },
    },
  }
}

const selectorBanda = (numero: number) => `bufferBanda${numero}`
const selectorChip = (numero: number) => `bufferChip${numero}`
const selectorEtiquetaBuffer = (numero: number) => `bufferEtiqueta${numero}`

function markupCable(cable: CableParseado): dia.MarkupJSON {
  const bandas: dia.MarkupJSON = cable.buffers.flatMap((buffer) => [
    { tagName: "rect", selector: selectorBanda(buffer.numero) },
    { tagName: "rect", selector: selectorChip(buffer.numero) },
    { tagName: "text", selector: selectorEtiquetaBuffer(buffer.numero) },
  ])

  return [
    { tagName: "rect", selector: "body" },
    { tagName: "line", selector: "lineaEncabezado" },
    { tagName: "circle", selector: "puntoRol" },
    { tagName: "text", selector: "etiquetaCable" },
    { tagName: "text", selector: "detalleCable" },
    ...bandas,
  ]
}

function atributosCable(cable: CableParseado): dia.Cell.Selectors {
  const g = GEOMETRIA_CABLE
  const estilo = ESTILO_ROL[cable.rol]
  const cantidadBuffers = cable.buffers.length

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
    etiquetaCable: {
      x: 25,
      y: 15,
      textVerticalAnchor: "middle",
      fontSize: 11,
      fontFamily: "Inter, sans-serif",
      fontWeight: 600,
      fill: "#0f172a",
      text: cable.etiqueta,
    },
    detalleCable: {
      x: 25,
      y: 27,
      textVerticalAnchor: "middle",
      fontSize: 8.5,
      fontFamily: "Inter, sans-serif",
      fill: "#64748b",
      text: `${cable.rol.toUpperCase()} · ${cable.totalHilos} hilos · ${cantidadBuffers} buffer${
        cantidadBuffers === 1 ? "" : "s"
      }`,
    },
  }

  cable.buffers.forEach((buffer, indiceBuffer) => {
    const tope = topeBuffer(cable, indiceBuffer)

    attrs[selectorBanda(buffer.numero)] = {
      x: 6,
      y: tope,
      width: "calc(w-12)",
      height: altoBuffer(buffer),
      rx: 6,
      ry: 6,
      fill: buffer.color.hex,
      fillOpacity: 0.08,
      stroke: buffer.color.hex,
      strokeWidth: 1,
      strokeOpacity: 0.55,
    }
    attrs[selectorChip(buffer.numero)] = {
      x: 13,
      y: tope + 5,
      width: 7,
      height: 7,
      rx: 1.5,
      ry: 1.5,
      fill: buffer.color.hex,
      stroke: "#64748b",
      strokeWidth: 0.5,
    }
    attrs[selectorEtiquetaBuffer(buffer.numero)] = {
      x: 25,
      y: tope + 8.5,
      textVerticalAnchor: "middle",
      fontSize: 8.5,
      fontFamily: "Inter, sans-serif",
      fontWeight: 500,
      fill: "#475569",
      text: `Buffer ${buffer.numero} · ${buffer.color.name} · ${buffer.hilos.length} hilos`,
    }
  })

  return attrs
}

/**
 * Elemento "cable". Se registra en el `cellNamespace` del grafo para que
 * JointJS resuelva la vista correcta a partir del `type`.
 */
export const Cable = dia.Element.define(TIPO_CABLE, {
  size: { width: GEOMETRIA_CABLE.ancho, height: 120 },
  ports: {
    groups: {
      [GRUPO_PUERTOS]: {
        position: { name: "absolute" },
        markup: MARKUP_PUERTO,
      },
    },
  },
})

/** Crea el elemento de un cable con sus bandas de buffer y un puerto por hilo. */
export function crearCable(cable: CableParseado, en: { x: number; y: number }): dia.Element {
  const elemento = new Cable({
    id: cable.id,
    position: en,
    size: { width: GEOMETRIA_CABLE.ancho, height: altoCable(cable) },
    markup: markupCable(cable),
    attrs: atributosCable(cable),
    z: Z_CABLE,
  })

  // Los datos parseados viajan con el elemento: las validaciones de conexión y
  // la exportación los leen sin volver a consultar el JSON.
  elemento.set("datosCable", cable)

  const puertos = cable.buffers.flatMap((buffer, indiceBuffer) =>
    buffer.hilos.map((hilo, indiceHilo) =>
      puertoHilo(cable, buffer, hilo, indiceBuffer, indiceHilo),
    ),
  )
  elemento.addPorts(puertos)

  return elemento
}

export function datosCable(elemento: dia.Element): CableParseado | undefined {
  return elemento.get("datosCable") as CableParseado | undefined
}

/** Resuelve el hilo asociado a un puerto usando los datos guardados en el elemento. */
export function hiloDesdePuerto(
  elemento: dia.Element,
  portId: string,
): HiloParseado | undefined {
  const cable = datosCable(elemento)
  if (!cable) return undefined

  for (const buffer of cable.buffers) {
    const hilo = buffer.hilos.find((item) => item.portId === portId)
    if (hilo) return hilo
  }
  return undefined
}
