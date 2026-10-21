import { dia, shapes } from "@joint/core"

import {
  GEOMETRIA_TERMINACION,
  Terminacion,
  altoTerminacion,
  crearTerminacion,
  type TrazaPunto,
} from "./terminal-shape"
import { Bandeja, GEOMETRIA_BANDEJA, altoBandeja, crearBandeja } from "./tray-shape"
import type {
  CableCampoParseado,
  EmpalmeCampoParseado,
  EmpalmeDirecto,
  EmpalmeEnBandeja,
  HiloCampoParseado,
  MufaCampoParseada,
} from "./mufa-field-data"
import { vocabulario, type TerminacionParseada } from "./network-data"
import { TEMA_CYBER, contornoHilo, type TemaLienzo } from "./tema-lienzo"

/**
 * Orquestación del grafo de una MUFA de campo: cables a los lados, bandejas
 * al centro y empalmes de solo lectura dibujados desde el JSON. Una cubierta
 * sin bandejas se dibuja con las dos columnas de cables juntas y las fusiones
 * de cable a cable.
 *
 * Sólo APIs de `@joint/core` (MPL-2.0).
 */

export const TIPO_EMPALME_CAMPO = "gismart.EmpalmeCampo"
const Z_EMPALME = 10

export type ModoEnrutamiento = "ortogonal" | "curvo"

const ESTILO = {
  grosorLinea: 1.75,
  grosorLineaResaltada: 2.75,
  opacidadLinea: 0.95,
  /**
   * El resplandor es un trazo ancho y translúcido del color del hilo debajo de
   * la línea. Un filtro `drop-shadow` en cada enlace daría lo mismo, pero con
   * cientos de líneas el desplazamiento y el zoom se vuelven lentos: el filtro
   * real se reserva para la fusión resaltada.
   */
  grosorBrillo: 5.5,
  opacidadBrillo: 0.2,
  grosorBrilloResaltado: 9,
  opacidadBrilloResaltado: 0.45,
  /** Hilos que se pierden contra el fondo (el negro): brillo gris y más opaco. */
  grosorBrilloContorno: 4,
  opacidadBrilloContorno: 0.75,
  radioCodo: 12,
  /**
   * Fracción del hueco entre columnas a la que cae cada punto de control de
   * la curva. Con 0,5 los dos quedan en el medio: la línea sale y entra en
   * horizontal y nunca pasa más allá de la columna de destino.
   */
  fraccionControl: 0.5,
} as const

/**
 * Carriles del modo ortogonal: cada fusión baja o sube por su propia vertical,
 * como las pistas paralelas de un bus en un circuito impreso.
 */
const CARRILES = {
  /** Separación ideal entre carriles vecinos. */
  espaciado: 5,
  /** Si no caben, se juntan hasta este mínimo antes de ensanchar el hueco. */
  espaciadoMinimo: 2,
  /** Distancia libre entre el borde de cada tarjeta y el primer carril. */
  margen: 26,
} as const

const COLOR_BASE = "#94a3b8"

const ROUTER_NORMAL = { name: "normal" } as const satisfies dia.Link.Attributes["router"]

const CONECTOR_ORTOGONAL = {
  name: "rounded",
  args: { radius: ESTILO.radioCodo },
} as const satisfies dia.Link.Attributes["connector"]

/**
 * Curva de Bézier con tangentes horizontales fijas.
 *
 * El conector `curve` de JointJS, sin más, alarga la tangente en proporción a
 * la distancia entre los extremos. Entre columnas cercanas funcionaba, pero
 * sin bandejas un cable de 144 hilos mide unos 3.000 px de alto: una fusión
 * entre el hilo de arriba y uno de abajo tenía la tangente tan larga que la
 * curva atravesaba la columna de salida.
 *
 * Aquí la tangente depende solo del hueco horizontal. JointJS pone cada punto
 * de control a 2/3 de su tangente (tensión 0,5), así que para dejarlo a
 * `fraccionControl · dx` la tangente mide 1,5 veces eso. Todas las líneas de
 * un mismo tramo comparten los puntos de control en x, y por eso se agrupan
 * en paralelo, como un bus, en el centro del hueco.
 */
function conectorCurvo(dx: number): dia.Link.Attributes["connector"] {
  const tangente = 1.5 * ESTILO.fraccionControl * Math.max(dx, 40)
  return {
    name: "curve",
    args: {
      sourceTangent: { x: tangente, y: 0 },
      targetTangent: { x: -tangente, y: 0 },
    },
  }
}

/**
 * Vértices del modo ortogonal: sale en horizontal del puerto de origen, cambia
 * de altura por su carril y entra en horizontal al de destino. Sin carril (o
 * sin desnivel) la línea va recta.
 */
function verticesOrtogonales(link: dia.Link): dia.Point[] {
  const carril = link.get("carrilX")
  const yOrigen = link.get("yOrigen")
  const yDestino = link.get("yDestino")
  if (typeof carril !== "number" || typeof yOrigen !== "number" || typeof yDestino !== "number") {
    return []
  }
  if (Math.abs(yDestino - yOrigen) < 0.5) return []
  return [
    { x: carril, y: yOrigen },
    { x: carril, y: yDestino },
  ]
}

function marcadorDestino(relleno: string, contorno: string | null) {
  return {
    type: "path",
    d: "M 7 -3.5 0 0 7 3.5 Z",
    fill: relleno,
    stroke: contorno ?? "none",
    strokeWidth: contorno ? 0.75 : 0,
  }
}

export const EmpalmeCampo = dia.Link.define(
  TIPO_EMPALME_CAMPO,
  {
    z: Z_EMPALME,
    router: ROUTER_NORMAL,
    connector: CONECTOR_ORTOGONAL,
    attrs: {
      wrapper: {
        connection: true,
        strokeWidth: 10,
        strokeLinejoin: "round",
      },
      brillo: {
        connection: true,
        stroke: COLOR_BASE,
        strokeWidth: ESTILO.grosorBrillo,
        strokeOpacity: ESTILO.opacidadBrillo,
        strokeLinejoin: "round",
        strokeLinecap: "round",
        fill: "none",
        pointerEvents: "none",
      },
      line: {
        connection: true,
        stroke: COLOR_BASE,
        strokeWidth: ESTILO.grosorLinea,
        strokeOpacity: ESTILO.opacidadLinea,
        strokeLinejoin: "round",
        strokeLinecap: "round",
        fill: "none",
        pointerEvents: "none",
        targetMarker: marcadorDestino(COLOR_BASE, null),
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
      { tagName: "path", selector: "brillo" },
      { tagName: "path", selector: "line" },
    ] satisfies dia.MarkupJSON,
  },
)

/** Brillo de un enlace en reposo. El hilo negro lo lleva gris para verse. */
function brilloBase(hex: string, tema: TemaLienzo) {
  const contorno = contornoHilo(hex, tema)
  return contorno
    ? {
        stroke: contorno,
        strokeWidth: ESTILO.grosorBrilloContorno,
        strokeOpacity: ESTILO.opacidadBrilloContorno,
      }
    : { stroke: hex, strokeWidth: ESTILO.grosorBrillo, strokeOpacity: ESTILO.opacidadBrillo }
}

function atributosDeEnlace(hex: string, tema: TemaLienzo): dia.Cell.Selectors {
  const contorno = contornoHilo(hex, tema)
  return {
    brillo: brilloBase(hex, tema),
    line: { stroke: hex, targetMarker: marcadorDestino(hex, contorno) },
  }
}

export function resaltarEmpalmeCampo(linkView: dia.LinkView, activo: boolean): void {
  const link = linkView.model
  const hex = String(link.get("colorHilo") ?? COLOR_BASE)
  const brillo = link.get("brilloBase") as ReturnType<typeof brilloBase> | undefined
  const colorBrillo = brillo?.stroke ?? hex

  link.attr({
    brillo: activo
      ? {
          stroke: colorBrillo,
          strokeWidth: ESTILO.grosorBrilloResaltado,
          strokeOpacity: ESTILO.opacidadBrilloResaltado,
        }
      : brillo ?? {},
    line: {
      strokeWidth: activo ? ESTILO.grosorLineaResaltada : ESTILO.grosorLinea,
      strokeOpacity: activo ? 1 : ESTILO.opacidadLinea,
      // `drop-shadow(0 0 5px currentColor)` en SVG: solo en la resaltada.
      filter: activo
        ? { name: "dropShadow", args: { dx: 0, dy: 0, blur: 4, color: colorBrillo, opacity: 0.9 } }
        : null,
    },
  })
  // Al frente mientras se resalta, para que no quede tapada por las vecinas.
  link.set("z", activo ? Z_EMPALME + 1 : Z_EMPALME)
}

function aplicarEstilo(link: dia.Link, modo: ModoEnrutamiento): void {
  link.set("router", ROUTER_NORMAL)
  if (modo === "ortogonal") {
    link.vertices(verticesOrtogonales(link))
    link.set("connector", CONECTOR_ORTOGONAL)
    return
  }
  link.vertices([])
  link.set("connector", conectorCurvo(Number(link.get("separacionX")) || 0))
}

/** Aplica el modo de enrutamiento a todos los enlaces ya dibujados. */
export function aplicarEnrutamiento(graph: dia.Graph, modo: ModoEnrutamiento): void {
  for (const link of graph.getLinks()) aplicarEstilo(link, modo)
}

export const cellNamespaceCampo = {
  ...shapes,
  gismart: { Terminacion, Bandeja, EmpalmeCampo },
}

const DISPOSICION = {
  origenX: 40,
  origenY: 28,
  /**
   * Límites del hueco entre dos columnas. Dentro de ellos el hueco es el que
   * piden los carriles: sin bandejas, las dos columnas de cables quedan tan
   * juntas como lo permiten sus fusiones y no queda un vacío en el centro.
   */
  separacionMinima: 140,
  separacionMaxima: 300,
  separacionFilas: 36,
} as const

/** Hueco entre dos columnas para que quepan `carriles` verticales paralelas. */
function separacionTramo(carriles: number): number {
  const necesario = 2 * CARRILES.margen + Math.max(0, carriles - 1) * CARRILES.espaciado
  return Math.min(DISPOSICION.separacionMaxima, Math.max(DISPOSICION.separacionMinima, necesario))
}

/**
 * Columnas en x de cada tipo de elemento, según haya bandejas o no. Cada
 * empalme pasa una vez por cada hueco, así que todos los huecos alojan tantos
 * carriles como empalmes haya.
 */
function columnas(mufa: MufaCampoParseada) {
  const separacion = separacionTramo(mufa.empalmes.length)
  const xEntrada = DISPOSICION.origenX
  const finEntrada = xEntrada + GEOMETRIA_TERMINACION.ancho

  if (mufa.conexionDirecta) {
    return { xEntrada, xBandeja: null, xSalida: finEntrada + separacion }
  }
  const xBandeja = finEntrada + separacion
  return {
    xEntrada,
    xBandeja,
    xSalida: xBandeja + GEOMETRIA_BANDEJA.ancho + separacion,
  }
}

/**
 * Hueco horizontal que recorre cada tramo, de puerto a puerto. Los puertos
 * están a una distancia fija del borde de su elemento, así que es el mismo
 * para todas las fusiones del tramo.
 */
function huecosDeTramo(mufa: MufaCampoParseada) {
  const { xEntrada, xBandeja, xSalida } = columnas(mufa)
  const puertoEntrada = xEntrada + GEOMETRIA_TERMINACION.ancho - GEOMETRIA_TERMINACION.margenPuerto
  const puertoSalida = xSalida + GEOMETRIA_TERMINACION.margenPuerto

  if (xBandeja === null) return { directo: puertoSalida - puertoEntrada, haciaBandeja: 0, desdeBandeja: 0 }
  return {
    directo: 0,
    haciaBandeja: xBandeja + GEOMETRIA_BANDEJA.margenPuerto - puertoEntrada,
    desdeBandeja: puertoSalida - (xBandeja + GEOMETRIA_BANDEJA.ancho - GEOMETRIA_BANDEJA.margenPuerto),
  }
}

function altoColumnaCables(cables: CableCampoParseado[]): number {
  const terminaciones = cables.map(cableATerminacion)
  const alto = terminaciones.reduce((total, item) => total + altoTerminacion(item), 0)
  return alto + Math.max(0, cables.length - 1) * DISPOSICION.separacionFilas
}

function altoColumnaBandejas(mufa: MufaCampoParseada): number {
  const alto = mufa.bandejas.reduce((total, bandeja) => total + altoBandeja(bandeja), 0)
  return alto + Math.max(0, mufa.bandejas.length - 1) * DISPOSICION.separacionFilas
}

/** Traduce un cable de campo al modelo genérico que dibuja `crearTerminacion`. */
function cableATerminacion(cable: CableCampoParseado): TerminacionParseada {
  const lado = cable.rol === "entrada" ? "izquierda" : "derecha"
  return {
    id: cable.id,
    etiqueta: cable.codigo,
    rol: cable.rol,
    lado,
    tipo: "cable",
    grupos: cable.buffers.map((buffer) => ({
      numero: buffer.numero,
      color: buffer.color,
      puntos: buffer.hilos.map((hilo) => ({
        portId: hilo.portId,
        terminacionId: cable.id,
        terminacionEtiqueta: cable.codigo,
        rol: cable.rol,
        lado,
        grupo: buffer.numero,
        punto: hilo.numero,
        color: hilo.color,
      })),
    })),
    totalPuntos: cable.totalHilos,
  }
}

export function calcularPosicionesCampo(
  mufa: MufaCampoParseada,
): Map<string, { x: number; y: number }> {
  const posiciones = new Map<string, { x: number; y: number }>()
  const altoContenido = Math.max(
    altoColumnaCables(mufa.entradas),
    altoColumnaBandejas(mufa),
    altoColumnaCables(mufa.salidas),
  )
  const { xEntrada, xBandeja, xSalida } = columnas(mufa)

  // Cada columna se centra en vertical contra la más alta.
  const colocar = (ids: { id: string; alto: number }[], x: number) => {
    const alto = ids.reduce((total, item) => total + item.alto, 0)
    const separaciones = Math.max(0, ids.length - 1) * DISPOSICION.separacionFilas
    let y = DISPOSICION.origenY + (altoContenido - (alto + separaciones)) / 2
    for (const item of ids) {
      posiciones.set(item.id, { x, y })
      y += item.alto + DISPOSICION.separacionFilas
    }
  }

  const deCables = (cables: CableCampoParseado[]) =>
    cables.map((cable) => ({ id: cable.id, alto: altoTerminacion(cableATerminacion(cable)) }))

  colocar(deCables(mufa.entradas), xEntrada)
  if (xBandeja !== null) {
    colocar(
      mufa.bandejas.map((bandeja) => ({ id: bandeja.id, alto: altoBandeja(bandeja) })),
      xBandeja,
    )
  }
  colocar(deCables(mufa.salidas), xSalida)

  return posiciones
}

type ExtremoEnlace = { id: string; port: string }

type Tramo = "directo" | "entrada-bandeja" | "bandeja-salida"

/** Centro absoluto de un puerto, para conocer la altura de cada extremo. */
function centroPuerto(graph: dia.Graph, extremo: ExtremoEnlace): dia.Point | null {
  const celda = graph.getCell(extremo.id)
  if (!celda?.isElement()) return null
  const grupo = celda.getPort(extremo.port)?.group
  if (!grupo) return null
  const relativo = celda.getPortsPositions(grupo)[extremo.port]
  if (!relativo) return null
  const { x, y } = celda.position()
  return { x: x + relativo.x, y: y + relativo.y }
}

function crearSegmento(
  graph: dia.Graph,
  source: ExtremoEnlace,
  target: ExtremoEnlace,
  hex: string,
  separacionX: number,
  tema: TemaLienzo,
  tramo: Tramo,
  meta: Record<string, unknown>,
): dia.Link {
  const link = new EmpalmeCampo({
    source,
    target,
    ...meta,
    tramo,
    separacionX,
    colorHilo: hex,
    brilloBase: brilloBase(hex, tema),
    yOrigen: centroPuerto(graph, source)?.y,
    yDestino: centroPuerto(graph, target)?.y,
    attrs: atributosDeEnlace(hex, tema),
  })
  link.addTo(graph)
  return link
}

/**
 * Con bandeja, cada empalme se dibuja en dos tramos: cable de entrada → slot
 * de la bandeja → cable de salida. Así la bandeja queda como contenedor visual
 * intermedio.
 */
function dibujarEmpalmeEnBandeja(
  graph: dia.Graph,
  empalme: EmpalmeEnBandeja,
  huecos: ReturnType<typeof huecosDeTramo>,
  tema: TemaLienzo,
): void {
  const hex = empalme.origen.color.hex
  const meta = { bandejaId: empalme.bandejaId, slot: empalme.slot }
  crearSegmento(
    graph,
    { id: empalme.origen.cableId, port: empalme.origen.portId },
    { id: empalme.bandejaId, port: empalme.portIdEntrada },
    hex,
    huecos.haciaBandeja,
    tema,
    "entrada-bandeja",
    meta,
  )
  crearSegmento(
    graph,
    { id: empalme.bandejaId, port: empalme.portIdSalida },
    { id: empalme.destino.cableId, port: empalme.destino.portId },
    hex,
    huecos.desdeBandeja,
    tema,
    "bandeja-salida",
    meta,
  )
}

/** Sin bandeja, la fusión va en un solo tramo de hilo a hilo. */
function dibujarEmpalmeDirecto(
  graph: dia.Graph,
  empalme: EmpalmeDirecto,
  huecos: ReturnType<typeof huecosDeTramo>,
  tema: TemaLienzo,
): void {
  crearSegmento(
    graph,
    { id: empalme.origen.cableId, port: empalme.origen.portId },
    { id: empalme.destino.cableId, port: empalme.destino.portId },
    empalme.origen.color.hex,
    huecos.directo,
    tema,
    "directo",
    { numero: empalme.numero },
  )
}

/**
 * Reparte un carril vertical a cada enlace de un hueco, entre `xInicio` y
 * `xFin` (los bordes de las tarjetas que lo limitan).
 *
 * El orden evita cruces entre fusiones que van en el mismo sentido: de las que
 * bajan, la que sale más abajo dobla antes (más a la izquierda), así su tramo
 * horizontal no atraviesa la vertical de las que salen más arriba; de las que
 * suben, al revés. Las que van rectas no necesitan carril.
 */
function asignarCarriles(enlaces: dia.Link[], xInicio: number, xFin: number): void {
  const altura = (link: dia.Link, clave: "yOrigen" | "yDestino") => Number(link.get(clave))
  const desnivel = (link: dia.Link) => altura(link, "yDestino") - altura(link, "yOrigen")

  const bajan = enlaces
    .filter((link) => desnivel(link) >= 0.5)
    .sort((a, b) => altura(b, "yOrigen") - altura(a, "yOrigen"))
  const suben = enlaces
    .filter((link) => desnivel(link) <= -0.5)
    .sort((a, b) => altura(a, "yOrigen") - altura(b, "yOrigen"))
  const ordenados = [...bajan, ...suben]

  const disponible = Math.max(0, xFin - xInicio - 2 * CARRILES.margen)
  const paso =
    ordenados.length > 1
      ? Math.max(
          CARRILES.espaciadoMinimo,
          Math.min(CARRILES.espaciado, disponible / (ordenados.length - 1)),
        )
      : 0
  const primero = (xInicio + xFin) / 2 - (paso * (ordenados.length - 1)) / 2

  ordenados.forEach((link, indice) => link.set("carrilX", primero + indice * paso))
}

/** Etiqueta técnica del hilo de origen de una fusión: `[SRC::Buffer 1-Hilo 4]`. */
export function etiquetaOrigen(hilo: HiloCampoParseado): string {
  return `[SRC::Buffer ${hilo.buffer}-Hilo ${hilo.numero}]`
}

/** Etiquetas de trazabilidad de los hilos de salida, por puerto. */
function trazasDeSalida(mufa: MufaCampoParseada): Map<string, TrazaPunto> {
  return new Map(
    mufa.empalmes.map((empalme) => [
      empalme.destino.portId,
      {
        etiqueta: etiquetaOrigen(empalme.origen),
        detalle: `origen ${empalme.origen.cableCodigo} · Buffer ${empalme.origen.buffer} · Hilo ${empalme.origen.numero}`,
      },
    ]),
  )
}

/**
 * Dibuja el escenario completo a partir del JSON de campo. Es de solo lectura:
 * la estructura y los empalmes vienen del backend.
 */
export function cargarEscenarioCampo(
  graph: dia.Graph,
  mufa: MufaCampoParseada,
  modo: ModoEnrutamiento = "ortogonal",
  tema: TemaLienzo = TEMA_CYBER,
): void {
  graph.clear()

  const vocab = vocabulario("mufa")
  const posiciones = calcularPosicionesCampo(mufa)
  const huecos = huecosDeTramo(mufa)
  const { xEntrada, xBandeja, xSalida } = columnas(mufa)
  const trazas = trazasDeSalida(mufa)

  for (const cable of mufa.cables) {
    const terminacion = cableATerminacion(cable)
    const en = posiciones.get(cable.id) ?? { x: DISPOSICION.origenX, y: DISPOSICION.origenY }
    const trazasCable = cable.rol === "salida" ? trazas : undefined
    crearTerminacion(terminacion, vocab, en, tema, trazasCable).addTo(graph)
  }

  for (const bandeja of mufa.bandejas) {
    const en = posiciones.get(bandeja.id) ?? { x: xBandeja ?? 0, y: DISPOSICION.origenY }
    crearBandeja(bandeja, en, tema).addTo(graph)
  }

  for (const empalme of mufa.empalmes) {
    if (empalme.via === "directo") dibujarEmpalmeDirecto(graph, empalme, huecos, tema)
    else dibujarEmpalmeEnBandeja(graph, empalme, huecos, tema)
  }

  // Los carriles se reparten con todos los enlaces de cada hueco ya creados.
  const finEntrada = xEntrada + GEOMETRIA_TERMINACION.ancho
  const porTramo = (tramo: Tramo) =>
    graph.getLinks().filter((link) => link.get("tramo") === tramo)
  if (xBandeja === null) {
    asignarCarriles(porTramo("directo"), finEntrada, xSalida)
  } else {
    asignarCarriles(porTramo("entrada-bandeja"), finEntrada, xBandeja)
    asignarCarriles(porTramo("bandeja-salida"), xBandeja + GEOMETRIA_BANDEJA.ancho, xSalida)
  }

  for (const link of graph.getLinks()) aplicarEstilo(link, modo)
}

export type RegistroEmpalmeCampo = EmpalmeCampoParseado

/** Clave estable de un empalme, para listas de React. */
export function claveEmpalme(empalme: EmpalmeCampoParseado): string {
  return empalme.via === "directo"
    ? `directo-${empalme.numero}`
    : `${empalme.bandejaId}-${empalme.slot}`
}

export function listarEmpalmesCampo(mufa: MufaCampoParseada): RegistroEmpalmeCampo[] {
  return [...mufa.empalmes].sort((a, b) => {
    if (a.via === "directo" && b.via === "directo") return a.numero - b.numero
    if (a.via === "bandeja" && b.via === "bandeja") {
      if (a.numeroBandeja !== b.numeroBandeja) return a.numeroBandeja - b.numeroBandeja
      return a.slot - b.slot
    }
    // No se mezclan en un mismo modelo, pero si pasara, primero las de bandeja.
    return a.via === "bandeja" ? -1 : 1
  })
}
