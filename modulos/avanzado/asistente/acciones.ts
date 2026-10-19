/**
 * Lo que el asistente pide hacer en el mapa. Lo decide el servidor (al
 * responder) y lo hace el navegador; va en su propio archivo para que el
 * navegador no importe nada del código del servidor.
 */
export type AccionDelAsistente =
  | { tipo: "mostrar"; capa: "cubierta" | "cable" | "cabecera"; nombre: string }
  /**
   * Con `nivel`, el navegador elige por el nivel de cada cubierta en el mapa
   * (así entran también las que no tienen etiqueta) y `nombres` no se usa.
   */
  | { tipo: "seleccionar"; capa: "cubierta" | "cable"; nombres: string[]; nivel?: string }
  | { tipo: "trace"; idOrigen: string; direccion: "UPSTREAM" | "DOWNSTREAM"; etiqueta: string | null }
  /** Marca un punto (una dirección, una coordenada o una cubierta) con el círculo de la búsqueda. */
  | { tipo: "cercania"; lon: number; lat: number; radioM: number; etiqueta: string }
