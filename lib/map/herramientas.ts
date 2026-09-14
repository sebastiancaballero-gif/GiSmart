import { FIBER_HINT } from "@/lib/map/symbology"

/**
 * Las herramientas del mapa y lo que hay que decir de cada una.
 *
 * Vive fuera del componente porque no depende de nada suyo: son datos fijos que
 * consultan tanto la barra de herramientas como los atajos de teclado, y el
 * ribbon las activa desde fuera.
 */
export type MapTool =
  | "pan"
  | "edit"
  | "node"
  | "fiber"
  | "zone"
  | "delete"
  | "measure-length"
  | "measure-area"

/**
 * Aviso mientras una herramienta que modifica está activa.
 *
 * Nada de lo que se dibuja o borra llega todavía a la base de datos: sin este
 * aviso, alguien podía trazar media red creyendo que estaba trabajando y
 * perderla al recargar, o creer que borró un registro real.
 */
export const TOOL_HINTS: Partial<Record<MapTool, string>> = {
  fiber: FIBER_HINT,
  node: "Click para agregar una mufa. Lo dibujado no se guarda en la base todavía.",
  zone: "Click para dibujar la zona y doble click para terminar. No se guarda en la base todavía.",
  edit: "Click para consultar o corregir. Los cambios no se guardan en la base todavía.",
  delete: "Click sobre un elemento para quitarlo del mapa. No se borra de la base de datos.",
}

/** Orden de la barra de herramientas; define también los atajos 1..8. */
export const TOOL_ORDER: MapTool[] = [
  "pan",
  "edit",
  "node",
  "fiber",
  "zone",
  "delete",
  "measure-length",
  "measure-area",
]
