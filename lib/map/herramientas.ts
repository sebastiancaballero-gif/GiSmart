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
   * Consulta de conectividad: se activa desde el ribbon (Consultas → Red →
   * «Conectividad fina»), no desde la barra lateral, así que no está en
   * `TOOL_ORDER` ni tiene atajo de teclado.
   */
  | "conectividad"
  /**
   * Entradas y salidas: deja pintados los cables de la mufa pulsada,
   * con el sentido y el color que devuelve la función de cables de la base.
   * También se activa desde el ribbon (Consultas → Red) y tampoco tiene atajo.
   */
  | "sentido"
  /**
   * Consulta de un cable: lo pinta en dos colores, naranja del lado de donde
   * sale y verde del lado al que entra. Se activa desde el ribbon
   * (Consultas → Red) y no tiene atajo.
   */
  | "cable"

/**
 * Aviso mientras una herramienta está activa.
 *
 * En las de consulta explica qué hacer. En las que modifican advierte además
 * que nada se guarda: lo que se dibuja o borra no llega todavía a la base, y
 * sin este aviso alguien podía trazar media red creyendo que estaba trabajando
 * y perderla al recargar, o creer que borró un registro real.
 */
export const TOOL_HINTS: Partial<Record<MapTool, string>> = {
  fiber: FIBER_HINT,
  node: "Click para agregar una mufa. Lo dibujado no se guarda en la base todavía.",
  zone: "Click para dibujar la zona y doble click para terminar. No se guarda en la base todavía.",
  edit: "Click para consultar o corregir. Los cambios no se guardan en la base todavía.",
  delete: "Click sobre un elemento para quitarlo del mapa. No se borra de la base de datos.",
  conectividad: "Click sobre una cubierta de empalme para ver su conectividad. Otros elementos se ignoran.",
  sentido: "Click sobre una mufa: sus cables de entrada y de salida quedan resaltados con los colores de la leyenda. Click sobre un cable para identificarlo. Click fuera para quitar la marca.",
  cable: "Click sobre un cable: se pinta en naranja del lado de donde sale y en verde del lado al que entra. Click fuera para quitarlo.",
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
