import type { MapTool } from "@/lib/map/herramientas"

/**
 * Capa activa: la que se activa antes de editar, mover o crear, con el botón
 * «Activar capa» (Inicio → Capas) o pulsándola en «Capas de red». Pedido del
 * ingeniero a cargo del proyecto: primero se activa la capa y solo entonces se
 * trabaja sobre ella, como en un SIG de escritorio. Así no se mueve una
 * cubierta queriendo corregir un cable que pasa por encima, ni se borra lo que
 * no era.
 *
 * Consultar no lo necesita: con «Editar elementos» se puede pulsar cualquier
 * elemento para ver su ficha, pero solo se mueve, se renombra o se quita si es
 * de la capa activa.
 *
 * Por ahora nada de esto se guarda: la base todavía no tiene cómo recibir las
 * ediciones. El flujo queda listo para cuando las haya.
 */
export type CapaEditable = "nodes" | "fibers" | "zones" | "cabeceras"

/** El tipo de elemento del mapa que guarda cada capa. */
export type TipoDeElemento = "node" | "fiber" | "zone" | "cabecera"

export const NOMBRE_DE_CAPA: Record<CapaEditable, string> = {
  nodes: "Cubiertas",
  fibers: "Tendido de fibra",
  zones: "Zonas",
  cabeceras: "Cabeceras",
}

export const CAPA_DE_TIPO: Record<TipoDeElemento, CapaEditable> = {
  node: "nodes",
  fiber: "fibers",
  zone: "zones",
  cabecera: "cabeceras",
}

/**
 * La herramienta de dibujo de cada capa. Las cabeceras no tienen: no se crean
 * desde el mapa.
 */
export const DIBUJO_DE_CAPA: Partial<Record<CapaEditable, MapTool>> = {
  nodes: "node",
  fibers: "fiber",
  zones: "zone",
}

const CAPA_DE_DIBUJO: Partial<Record<MapTool, CapaEditable>> = {
  node: "nodes",
  fiber: "fibers",
  zone: "zones",
}

const QUE_SE_DIBUJA: Partial<Record<MapTool, string>> = {
  node: "dibujar cubiertas",
  fiber: "trazar fibra",
  zone: "dibujar zonas",
}

/** Herramientas que cambian el mapa y por eso trabajan sobre la capa activa. */
export const HERRAMIENTAS_DE_EDICION: MapTool[] = ["edit", "node", "fiber", "zone", "delete"]

export function esCapaEditable(id: string): id is CapaEditable {
  // hasOwnProperty y no `in`: `in` también acepta "toString" y compañía.
  return Object.prototype.hasOwnProperty.call(NOMBRE_DE_CAPA, id)
}

/**
 * Por qué no se puede usar esta herramienta con la capa activa, listo para
 * mostrar, o `null` si se puede. Las herramientas que no cambian el mapa
 * (mover el mapa, medir, consultar) nunca se bloquean, y «Editar elementos»
 * tampoco: sin capa activa sirve para consultar.
 */
export function motivoHerramientaBloqueada(tool: MapTool, capa: CapaEditable | null): string | null {
  const capaDelDibujo = CAPA_DE_DIBUJO[tool]
  if (capaDelDibujo) {
    if (capa === capaDelDibujo) return null
    const pedido = `Para ${QUE_SE_DIBUJA[tool]}, activa la capa «${NOMBRE_DE_CAPA[capaDelDibujo]}»`
    return capa
      ? `${pedido}. Ahora está activa «${NOMBRE_DE_CAPA[capa]}».`
      : `${pedido} con «Activar capa» o en Capas de red.`
  }
  if (tool === "delete" && !capa) {
    return "Para eliminar, activa primero la capa de la que vas a quitar elementos, con «Activar capa» o en Capas de red."
  }
  return null
}
