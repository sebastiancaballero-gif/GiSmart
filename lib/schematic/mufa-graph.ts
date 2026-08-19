import { dia, routers, shapes } from "@joint/core"

import {
  Cable,
  GEOMETRIA_CABLE,
  altoCable,
  crearCable,
  datosCable,
  hiloDesdePuerto,
} from "./cable-shape"
import type {
  CableParseado,
  HiloParseado,
  MufaParseada,
  ReferenciaHiloJSON,
} from "./mufa-data"

/**
 * Orquestación del grafo de JointJS: construye el lienzo a partir del modelo
 * parseado, define las reglas de conexión hilo a hilo y exporta los empalmes.
 *
 * Todo lo que se usa aquí pertenece a `@joint/core` (MPL-2.0): `dia.Link.define`,
 * el conector `smooth` y las validaciones `validateConnection` / `validateMagnet`
 * del Paper.
 */

export const TIPO_EMPALME = "gismart.Splice"

/**
 * Los empalmes van por encima de los cables. No tapan los números de los hilos
 * porque el `connectionPoint` del Paper recorta los extremos en el borde del
 * cable (ver `defaultConnectionPoint` en el componente).
 */
const Z_EMPALME = 10

/** Grosores y colores del empalme en reposo y resaltado. */
const ESTILO_EMPALME = {
  grosorLinea: 2.4,
  grosorHalo: 4.4,
  grosorLineaResaltada: 4,
  grosorHaloResaltado: 7.5,
  halo: "#64748b",
  haloResaltado: "#0f172a",
  radioCodo: 6,
} as const

/**
 * `rightAngle` es el router ortogonal pensado para enlaces entre puertos: se le
 * indica por qué lado sale y entra la línea. Se descartaron `orthogonal` (gira
 * dentro del cable, porque los puertos están hacia el interior) y `manhattan`
 * (esquiva obstáculos y rodearía los cables).
 */
const ROUTER_ORTOGONAL = {
  name: "rightAngle",
  args: {
    sourceDirection: routers.rightAngle.Directions.RIGHT,
    targetDirection: routers.rightAngle.Directions.LEFT,
  },
} as const satisfies dia.Link.Attributes["router"]

/** Punta de flecha en el extremo de salida, para leer la dirección del empalme. */
const MARCADOR_DESTINO = {
  type: "path",
  d: "M 9 -4 0 0 9 4 Z",
  stroke: "#334155",
  strokeWidth: 0.6,
} as const

const COLOR_BASE = "#94a3b8"

/** Tiñe la línea y su flecha con el color del hilo de origen. */
function atributosDeColor(hex: string): dia.Cell.Selectors {
  return {
    line: { stroke: hex, targetMarker: { ...MARCADOR_DESTINO, fill: hex } },
  }
}

export const Empalme = dia.Link.define(
  TIPO_EMPALME,
  {
    z: Z_EMPALME,
    // Enrutamiento ortogonal: sólo tramos horizontales y verticales.
    router: ROUTER_ORTOGONAL,
    // Redondea los codos de 90 grados.
    connector: { name: "rounded", args: { radius: ESTILO_EMPALME.radioCodo } },
    attrs: {
      // Trazo transparente y ancho: amplía el área sensible al puntero.
      wrapper: {
        connection: true,
        strokeWidth: 12,
        strokeLinejoin: "round",
      },
      // Halo gris que despega la línea del fondo y hace visibles los hilos
      // blancos o muy claros.
      outline: {
        connection: true,
        stroke: ESTILO_EMPALME.halo,
        strokeWidth: ESTILO_EMPALME.grosorHalo,
        strokeLinejoin: "round",
        fill: "none",
        pointerEvents: "none",
      },
      line: {
        connection: true,
        stroke: COLOR_BASE,
        strokeWidth: ESTILO_EMPALME.grosorLinea,
        strokeLinejoin: "round",
        fill: "none",
        pointerEvents: "none",
        targetMarker: { ...MARCADOR_DESTINO, fill: COLOR_BASE },
      },
    },
  },
  {
    markup: [
      {
        tagName: "path",
        selector: "wrapper",
        attributes: { fill: "none", stroke: "transparent", cursor: "pointer" },
      },
      { tagName: "path", selector: "outline" },
      { tagName: "path", selector: "line" },
    ] satisfies dia.MarkupJSON,
  },
)

/**
 * Engrosa y oscurece el empalme al pasar el puntero para poder seguir su
 * recorrido entre las líneas que se cruzan.
 *
 * Sólo se tocan los grosores y el color del halo: cambiar la `z` del enlace
 * (por ejemplo con `toFront()`) reordena el lienzo, invalida la vista y dejaría
 * huérfano el botón de borrar que se añade en el mismo evento.
 */
export function resaltarEmpalme(linkView: dia.LinkView, activo: boolean): void {
  linkView.model.attr({
    outline: {
      stroke: activo ? ESTILO_EMPALME.haloResaltado : ESTILO_EMPALME.halo,
      strokeWidth: activo ? ESTILO_EMPALME.grosorHaloResaltado : ESTILO_EMPALME.grosorHalo,
    },
    line: {
      strokeWidth: activo
        ? ESTILO_EMPALME.grosorLineaResaltada
        : ESTILO_EMPALME.grosorLinea,
    },
  })
}

/** Namespace para que JointJS resuelva las vistas a partir del `type`. */
export const cellNamespace = {
  ...shapes,
  gismart: { Cable, Splice: Empalme },
}

const DISPOSICION = {
  origenX: 48,
  origenY: 32,
  /** Separación horizontal entre la columna de entradas y la de salidas. */
  separacionColumnas: 260,
  /** Separación vertical entre cables de la misma columna. */
  separacionFilas: 40,
} as const

function altoColumna(cables: CableParseado[]): number {
  const alto = cables.reduce((total, cable) => total + altoCable(cable), 0)
  return alto + Math.max(0, cables.length - 1) * DISPOSICION.separacionFilas
}

/**
 * Entradas a la izquierda y salidas a la derecha, cada columna centrada
 * verticalmente respecto a la más alta.
 */
export function calcularPosiciones(mufa: MufaParseada): Map<string, { x: number; y: number }> {
  const posiciones = new Map<string, { x: number; y: number }>()
  const altoContenido = Math.max(altoColumna(mufa.entradas), altoColumna(mufa.salidas))

  const columnas: { cables: CableParseado[]; x: number }[] = [
    { cables: mufa.entradas, x: DISPOSICION.origenX },
    {
      cables: mufa.salidas,
      x: DISPOSICION.origenX + GEOMETRIA_CABLE.ancho + DISPOSICION.separacionColumnas,
    },
  ]

  for (const columna of columnas) {
    let y = DISPOSICION.origenY + (altoContenido - altoColumna(columna.cables)) / 2
    for (const cable of columna.cables) {
      posiciones.set(cable.id, { x: columna.x, y })
      y += altoCable(cable) + DISPOSICION.separacionFilas
    }
  }

  return posiciones
}

/**
 * Dibuja el escenario completo a partir del modelo parseado: reemplaza el
 * contenido del lienzo por los cables y los empalmes que declara el JSON. La
 * estructura no se modifica desde la interfaz, así que ésta es la única vía por
 * la que se crean los cables.
 */
export function cargarEscenario(graph: dia.Graph, mufa: MufaParseada): void {
  graph.clear()

  const posiciones = calcularPosiciones(mufa)
  for (const cable of mufa.cables) {
    const en = posiciones.get(cable.id) ?? {
      x: DISPOSICION.origenX,
      y: DISPOSICION.origenY,
    }
    crearCable(cable, en).addTo(graph)
  }

  // El parseo ya descartó los empalmes inválidos o repetidos.
  for (const empalme of mufa.empalmes) {
    crearEmpalme(graph, empalme.desde, empalme.hasta)
  }
}

/** Un hilo sólo admite un empalme, por lo que hay que saber si ya está ocupado. */
export function isHiloEmpalmado(
  graph: dia.Graph,
  cellId: dia.Cell.ID,
  portId: string,
  ignorar?: dia.Link,
): boolean {
  return graph.getLinks().some((link) => {
    if (ignorar && link.id === ignorar.id) return false
    const source = link.source()
    const target = link.target()
    return (
      (source.id === cellId && source.port === portId) ||
      (target.id === cellId && target.port === portId)
    )
  })
}

function portIdDesdeMagnet(cellView: dia.CellView, magnet: SVGElement): string | null {
  return cellView.findAttribute("port", magnet)
}

/**
 * Un empalme sólo es válido de hilo a hilo (puerto a puerto), entre un cable de
 * entrada y uno de salida, y siempre que ambos hilos estén libres.
 */
export function crearValidadorDeConexion(
  graph: dia.Graph,
): NonNullable<dia.Paper.Options["validateConnection"]> {
  return (cellViewS, magnetS, cellViewT, magnetT, _end, linkView) => {
    // Sin magnet en alguno de los extremos no hay hilo: se descarta.
    if (!magnetS || !magnetT) return false
    if (cellViewS === cellViewT) return false

    const origen = cellViewS.model
    const destino = cellViewT.model
    if (!origen.isElement() || !destino.isElement()) return false

    const cableOrigen = datosCable(origen as dia.Element)
    const cableDestino = datosCable(destino as dia.Element)
    if (!cableOrigen || !cableDestino) return false
    if (cableOrigen.rol === cableDestino.rol) return false

    const puertoOrigen = portIdDesdeMagnet(cellViewS, magnetS)
    const puertoDestino = portIdDesdeMagnet(cellViewT, magnetT)
    if (!puertoOrigen || !puertoDestino) return false

    const link = linkView.model
    return (
      !isHiloEmpalmado(graph, origen.id, puertoOrigen, link) &&
      !isHiloEmpalmado(graph, destino.id, puertoDestino, link)
    )
  }
}

/** Impide iniciar el arrastre desde un hilo que ya tiene empalme. */
export function crearValidadorDeMagnet(
  graph: dia.Graph,
): NonNullable<dia.Paper.Options["validateMagnet"]> {
  return (cellView, magnet) => {
    const portId = portIdDesdeMagnet(cellView, magnet)
    if (!portId) return false
    return !isHiloEmpalmado(graph, cellView.model.id, portId)
  }
}

/**
 * Enlace que se crea al arrastrar desde un hilo. Hereda el enrutamiento y el
 * estilo de `Empalme` y sólo ajusta el color al del hilo de origen, para poder
 * rastrearlo a simple vista.
 */
export function crearEnlacePorDefecto(): NonNullable<dia.Paper.Options["defaultLink"]> {
  return (cellView, magnet) => {
    const portId = portIdDesdeMagnet(cellView, magnet)
    const hilo = portId ? hiloDesdePuerto(cellView.model as dia.Element, portId) : undefined
    return new Empalme({ attrs: atributosDeColor(hilo?.color.hex ?? COLOR_BASE) })
  }
}

export function crearEmpalme(
  graph: dia.Graph,
  desde: HiloParseado,
  hasta: HiloParseado,
): dia.Link {
  const link = new Empalme({
    // La flecha apunta al hilo de salida: el origen es siempre la entrada.
    source: { id: desde.cableId, port: desde.portId },
    target: { id: hasta.cableId, port: hasta.portId },
    attrs: atributosDeColor(desde.color.hex),
  })
  link.addTo(graph)
  return link
}

/**
 * Orienta el empalme siempre de entrada a salida. Hace falta porque el usuario
 * puede arrastrar en cualquier sentido y la flecha debe apuntar al hilo de
 * salida; también reajusta el color al del hilo de entrada.
 */
export function normalizarEmpalme(graph: dia.Graph, link: dia.Link): void {
  const extremoOrigen = link.source()
  const extremoDestino = link.target()
  const origen = hiloDesdeExtremo(graph, extremoOrigen)
  const destino = hiloDesdeExtremo(graph, extremoDestino)
  if (!origen || !destino) return

  if (origen.rol === "entrada") {
    link.attr(atributosDeColor(origen.color.hex))
    return
  }

  link.set({ source: extremoDestino, target: extremoOrigen })
  link.attr(atributosDeColor(destino.color.hex))
}

export type RegistroEmpalme = {
  linkId: string
  entrada: HiloParseado
  salida: HiloParseado
}

function hiloDesdeExtremo(
  graph: dia.Graph,
  extremo: dia.Link.EndJSON,
): HiloParseado | undefined {
  if (!extremo.id || !extremo.port) return undefined
  const elemento = graph.getCell(extremo.id)
  if (!elemento?.isElement()) return undefined
  return hiloDesdePuerto(elemento as dia.Element, extremo.port)
}

/** Lee el estado actual del grafo y lista los empalmes, orientados entrada -> salida. */
export function listarEmpalmes(graph: dia.Graph): RegistroEmpalme[] {
  const registros: RegistroEmpalme[] = []

  for (const link of graph.getLinks()) {
    const a = hiloDesdeExtremo(graph, link.source())
    const b = hiloDesdeExtremo(graph, link.target())
    if (!a || !b) continue

    const entrada = a.rol === "entrada" ? a : b
    const salida = a.rol === "entrada" ? b : a
    if (entrada.rol !== "entrada" || salida.rol !== "salida") continue

    registros.push({ linkId: String(link.id), entrada, salida })
  }

  return registros.sort((x, y) => {
    if (x.entrada.buffer !== y.entrada.buffer) return x.entrada.buffer - y.entrada.buffer
    return x.entrada.hilo - y.entrada.hilo
  })
}

/** Hilos del cable que todavía no tienen empalme, en el orden del JSON. */
export function hilosLibres(graph: dia.Graph, cable: CableParseado): HiloParseado[] {
  return cable.buffers
    .flatMap((buffer) => buffer.hilos)
    .filter((hilo) => !isHiloEmpalmado(graph, cable.id, hilo.portId))
}

/**
 * Empalma en orden los hilos libres de las entradas con los de cada salida, que
 * es el patrón habitual al documentar una mufa de paso.
 */
export function empalmarEnOrden(graph: dia.Graph, mufa: MufaParseada): number {
  const disponiblesEntrada = mufa.entradas.flatMap((cable) => hilosLibres(graph, cable))
  let cursor = 0
  let creados = 0

  for (const salida of mufa.salidas) {
    for (const hiloSalida of hilosLibres(graph, salida)) {
      const hiloEntrada = disponiblesEntrada[cursor]
      if (!hiloEntrada) return creados
      cursor++
      crearEmpalme(graph, hiloEntrada, hiloSalida)
      creados++
    }
  }

  return creados
}

// ---------------------------------------------------------------------------
// Exportación de datos
// ---------------------------------------------------------------------------

export type ExtremoExportado = ReferenciaHiloJSON & {
  etiquetaCable: string
  color: string
  etiquetaHilo?: string
}

export type EmpalmeExportado = {
  id: string
  desde: ExtremoExportado
  hasta: ExtremoExportado
}

export type ExportacionEmpalmes = {
  mufa: string
  nombre: string
  generadoEn: string
  totalEmpalmes: number
  empalmes: EmpalmeExportado[]
}

function extremoExportado(hilo: HiloParseado): ExtremoExportado {
  return {
    cable: hilo.cableId,
    buffer: hilo.buffer,
    hilo: hilo.hilo,
    etiquetaCable: hilo.cableEtiqueta,
    color: hilo.color.name,
    etiquetaHilo: hilo.etiqueta,
  }
}

/**
 * Extrae los empalmes trazados en el lienzo en formato JSON. Las claves
 * `cable`/`buffer`/`hilo` coinciden con `EmpalmeJSON`, así que el resultado se
 * puede volver a cargar como dato de entrada.
 */
export function exportarEmpalmes(
  graph: dia.Graph,
  mufa: MufaParseada,
): ExportacionEmpalmes {
  const empalmes = listarEmpalmes(graph).map((registro) => ({
    id: registro.linkId,
    desde: extremoExportado(registro.entrada),
    hasta: extremoExportado(registro.salida),
  }))

  return {
    mufa: mufa.id,
    nombre: mufa.nombre,
    generadoEn: new Date().toISOString(),
    totalEmpalmes: empalmes.length,
    empalmes,
  }
}
