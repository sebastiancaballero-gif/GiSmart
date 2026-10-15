/**
 * Lo que el asistente pide hacer en el mapa. Lo decide el servidor (al
 * responder) y lo hace el navegador; va en su propio archivo para que el
 * navegador no importe nada del código del servidor.
 */
export type AccionDelAsistente =
  | { tipo: "mostrar"; capa: "cubierta" | "cable" | "cabecera"; nombre: string }
  | { tipo: "seleccionar"; capa: "cubierta" | "cable"; nombres: string[] }
  | { tipo: "trace"; idOrigen: string; direccion: "UPSTREAM" | "DOWNSTREAM"; etiqueta: string | null }
