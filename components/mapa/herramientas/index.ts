import type { MapTool } from "@/lib/map/herramientas"
import type { ContextoHerramienta } from "@/components/mapa/herramientas/contexto"
import { herramientaCable } from "@/components/mapa/herramientas/cable"
import { herramientaSentido } from "@/components/mapa/herramientas/sentido"
import { herramientaConectividad } from "@/components/mapa/herramientas/conectividad"
import { herramientaEdicion } from "@/components/mapa/herramientas/edicion"
import { herramientaDibujo } from "@/components/mapa/herramientas/dibujo"
import { herramientaBorrado } from "@/components/mapa/herramientas/borrado"
import { herramientaMedicion } from "@/components/mapa/herramientas/medicion"

export type { AvisoDeConsulta, ContextoHerramienta, SelectedFeature } from "@/components/mapa/herramientas/contexto"

/**
 * Activa una herramienta sobre el mapa. Si deja algo escuchando o pintado,
 * devuelve cómo quitarlo, igual que un efecto de React: el mapa lo llama al
 * cambiar de herramienta.
 */
export type Herramienta = (ctx: ContextoHerramienta) => (() => void) | void

/**
 * Lo que hace cada herramienta al activarse, cada una en su archivo. «Mover
 * mapa» no tiene nada propio: es el mapa sin interacciones añadidas.
 */
export const HERRAMIENTAS: Partial<Record<MapTool, Herramienta>> = {
  cable: herramientaCable,
  sentido: herramientaSentido,
  conectividad: herramientaConectividad,
  edit: herramientaEdicion,
  node: herramientaDibujo,
  fiber: herramientaDibujo,
  zone: herramientaDibujo,
  delete: herramientaBorrado,
  "measure-length": herramientaMedicion,
  "measure-area": herramientaMedicion,
}

/** Quita las interacciones que dejó la herramienta anterior (dibujo, selección, edición, snap). */
export function quitarInteracciones(ctx: ContextoHerramienta) {
  const { map, drawRef, selectRef, deleteHoverRef, editSelectRef, editModifyRef, fiberSnapRef } = ctx
  for (const ref of [drawRef, selectRef, deleteHoverRef, editSelectRef, editModifyRef, fiberSnapRef]) {
    if (ref.current) {
      map.removeInteraction(ref.current)
      ref.current = null
    }
  }
}
