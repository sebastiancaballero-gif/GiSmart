import { dia, routers, shapes } from "@joint/core"

import {
  GEOMETRIA_TERMINACION,
  Terminacion,
  altoTerminacion,
  crearTerminacion,
} from "./terminal-shape"
import { Bandeja, GEOMETRIA_BANDEJA, altoBandeja, crearBandeja } from "./tray-shape"
import type {
  CableCampoParseado,
  EmpalmeCampoParseado,
  MufaCampoParseada,
} from "./mufa-field-data"
import { vocabulario, type TerminacionParseada } from "./network-data"

/**
 * Orquestación del grafo de una MUFA de campo: cables a los lados, bandejas
 * al centro y empalmes de solo lectura dibujados desde el JSON.
 *
 * Sólo APIs de `@joint/core` (MPL-2.0).
 */

export const TIPO_EMPALME_CAMPO = "gismart.EmpalmeCampo"
const Z_EMPALME = 10

export type ModoEnrutamiento = "ortogonal" | "curvo"

const ESTILO = {
  grosorLinea: 2.4,
  grosorHalo: 4.4,
  grosorLineaResaltada: 4,
  grosorHaloResaltado: 7.5,
  halo: "#64748b",
  haloResaltado: "#0f172a",
  radioCodo: 6,
} as const

const MARCADOR_DESTINO = {
  type: "path",
  d: "M 9 -4 0 0 9 4 Z",
  stroke: "#334155",
  strokeWidth: 0.6,
} as const

const COLOR_BASE = "#94a3b8"

const ROUTER_ORTOGONAL = {
  name: "rightAngle",
  args: {
    sourceDirection: routers.rightAngle.Directions.RIGHT,
    targetDirection: routers.rightAngle.Directions.LEFT,
  },
} as const satisfies dia.Link.Attributes["router"]

/** Configuración de router/connector según el modo de la interfaz. */
export function estiloEnrutamiento(modo: ModoEnrutamiento): {
  router: dia.Link.Attributes["router"] | null
  connector: dia.Link.Attributes["connector"]
} {
  if (modo === "ortogonal") {
    return {
      router: ROUTER_ORTOGONAL,
      connector: { name: "rounded", args: { radius: ESTILO.radioCodo } },
    }
  }
  // Curva de Bézier nativa de JointJS (conector `smooth`), sin router ortogonal.
  return {
    router: null,
    connector: { name: "smooth" },
  }
}

function atributosDeColor(hex: string): dia.Cell.Selectors {
  return {
    line: { stroke: hex, targetMarker: { ...MARCADOR_DESTINO, fill: hex } },
  }
}

export const EmpalmeCampo = dia.Link.define(
  TIPO_EMPALME_CAMPO,
  {
    z: Z_EMPALME,
    router: ROUTER_ORTOGONAL,
    connector: { name: "rounded", args: { radius: ESTILO.radioCodo } },
    attrs: {
      wrapper: {
        connection: true,
        strokeWidth: 12,
        strokeLinejoin: "round",
      },
      outline: {
        connection: true,
        stroke: ESTILO.halo,
        strokeWidth: ESTILO.grosorHalo,
        strokeLinejoin: "round",
        fill: "none",
        pointerEvents: "none",
      },
      line: {
        connection: true,
        stroke: COLOR_BASE,
        strokeWidth: ESTILO.grosorLinea,
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

export function resaltarEmpalmeCampo(linkView: dia.LinkView, activo: boolean): void {
  linkView.model.attr({
    outline: {
      stroke: activo ? ESTILO.haloResaltado : ESTILO.halo,
      strokeWidth: activo ? ESTILO.grosorHaloResaltado : ESTILO.grosorHalo,
    },
    line: {
      strokeWidth: activo ? ESTILO.grosorLineaResaltada : ESTILO.grosorLinea,
    },
  })
}

/** Aplica el modo de enrutamiento a todos los enlaces ya dibujados. */
export function aplicarEnrutamiento(graph: dia.Graph, modo: ModoEnrutamiento): void {
  const estilo = estiloEnrutamiento(modo)
  for (const link of graph.getLinks()) {
    if (estilo.router) link.set("router", estilo.router)
    else link.unset("router")
    link.set("connector", estilo.connector)
  }
}

export const cellNamespaceCampo = {
  ...shapes,
  gismart: { Terminacion, Bandeja, EmpalmeCampo },
}

const DISPOSICION = {
  origenX: 40,
  origenY: 28,
  separacionCableBandeja: 120,
  separacionBandejaCable: 120,
  separacionFilas: 36,
} as const

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

  const xEntrada = DISPOSICION.origenX
  const xBandeja = xEntrada + GEOMETRIA_TERMINACION.ancho + DISPOSICION.separacionCableBandeja
  const xSalida = xBandeja + GEOMETRIA_BANDEJA.ancho + DISPOSICION.separacionBandejaCable

  const colocar = (
    ids: { id: string; alto: number }[],
    x: number,
  ) => {
    const alto = ids.reduce((total, item) => total + item.alto, 0)
    const separaciones = Math.max(0, ids.length - 1) * DISPOSICION.separacionFilas
    let y = DISPOSICION.origenY + (altoContenido - (alto + separaciones)) / 2
    for (const item of ids) {
      posiciones.set(item.id, { x, y })
      y += item.alto + DISPOSICION.separacionFilas
    }
  }

  colocar(
    mufa.entradas.map((cable) => ({
      id: cable.id,
      alto: altoTerminacion(cableATerminacion(cable)),
    })),
    xEntrada,
  )
  colocar(
    mufa.bandejas.map((bandeja) => ({ id: bandeja.id, alto: altoBandeja(bandeja) })),
    xBandeja,
  )
  colocar(
    mufa.salidas.map((cable) => ({
      id: cable.id,
      alto: altoTerminacion(cableATerminacion(cable)),
    })),
    xSalida,
  )

  return posiciones
}

function crearSegmento(
  graph: dia.Graph,
  source: { id: string; port: string },
  target: { id: string; port: string },
  hex: string,
  modo: ModoEnrutamiento,
  meta: Record<string, unknown>,
): dia.Link {
  const estilo = estiloEnrutamiento(modo)
  const link = new EmpalmeCampo({
    source,
    target,
    ...meta,
    attrs: atributosDeColor(hex),
  })
  if (estilo.router) link.set("router", estilo.router)
  else link.unset("router")
  link.set("connector", estilo.connector)
  link.addTo(graph)
  return link
}

/**
 * Cada empalme se dibuja en dos tramos: cable de entrada → slot de la bandeja →
 * cable de salida. Así la bandeja queda como contenedor visual intermedio.
 */
function dibujarEmpalme(
  graph: dia.Graph,
  empalme: EmpalmeCampoParseado,
  modo: ModoEnrutamiento,
): void {
  const hex = empalme.origen.color.hex
  crearSegmento(
    graph,
    { id: empalme.origen.cableId, port: empalme.origen.portId },
    { id: empalme.bandejaId, port: empalme.portIdEntrada },
    hex,
    modo,
    {
      tramo: "entrada-bandeja",
      bandejaId: empalme.bandejaId,
      slot: empalme.slot,
    },
  )
  crearSegmento(
    graph,
    { id: empalme.bandejaId, port: empalme.portIdSalida },
    { id: empalme.destino.cableId, port: empalme.destino.portId },
    hex,
    modo,
    {
      tramo: "bandeja-salida",
      bandejaId: empalme.bandejaId,
      slot: empalme.slot,
    },
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
): void {
  graph.clear()

  const vocab = vocabulario("mufa")
  const posiciones = calcularPosicionesCampo(mufa)

  for (const cable of mufa.cables) {
    const terminacion = cableATerminacion(cable)
    const en = posiciones.get(cable.id) ?? { x: DISPOSICION.origenX, y: DISPOSICION.origenY }
    crearTerminacion(terminacion, vocab, en).addTo(graph)
  }

  for (const bandeja of mufa.bandejas) {
    const en = posiciones.get(bandeja.id) ?? {
      x: DISPOSICION.origenX + GEOMETRIA_TERMINACION.ancho + DISPOSICION.separacionCableBandeja,
      y: DISPOSICION.origenY,
    }
    crearBandeja(bandeja, en).addTo(graph)
  }

  for (const empalme of mufa.empalmes) {
    dibujarEmpalme(graph, empalme, modo)
  }
}

export type RegistroEmpalmeCampo = EmpalmeCampoParseado

export function listarEmpalmesCampo(mufa: MufaCampoParseada): RegistroEmpalmeCampo[] {
  return [...mufa.empalmes].sort((a, b) => {
    if (a.numeroBandeja !== b.numeroBandeja) return a.numeroBandeja - b.numeroBandeja
    return a.slot - b.slot
  })
}
