/**
 * Lo que el asistente va haciendo mientras responde, para mostrarlo en vivo
 * («Leyendo la ficha de CO19…»). El servidor lo avisa en cada paso y el panel
 * lo pinta; la descripción sale de aquí para que las dos partes digan lo mismo.
 */

export type EventoDelAsistente =
  | { tipo: "herramienta"; nombre: string; argumentos: Record<string, unknown> }
  | { tipo: "reintento"; modelo: string; esperaMs: number }
  | { tipo: "respaldo"; modelo: string }

const corto = (v: unknown, max = 40) => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** El paso en palabras, para el panel. */
export function describirPaso(evento: EventoDelAsistente): string {
  if (evento.tipo === "reintento") return `Gemini está ocupado; reintento en ${Math.round(evento.esperaMs / 100) / 10} s`
  if (evento.tipo === "respaldo") return `Probando con ${evento.modelo}`
  const a = evento.argumentos
  switch (evento.nombre) {
    case "buscar_elementos":
      return corto(a.texto) ? `Buscando «${corto(a.texto)}»` : corto(a.nivel) ? `Listando las cubiertas de ${corto(a.nivel)} nivel` : "Buscando"
    case "resumen_red":
      return "Contando la red"
    case "ficha_cubierta":
      return `Leyendo la ficha de ${corto(a.nombre) || "la cubierta"}`
    case "ficha_cable":
      return `Leyendo el cable ${corto(a.codigo) || ""}${a.con_hilos ? " y sus hilos" : ""}`.replace(/\s+$/, "")
    case "trace":
      return `Recorriendo el trace hacia ${a.direccion === "abajo" ? "abajo" : "la fuente"}`
    case "mostrar_en_mapa":
      return `Llevando el mapa a ${corto(a.nombre) || "lo encontrado"}`
    case "seleccionar_en_mapa":
      return "Seleccionando en el mapa"
    case "abrir_trace":
      return "Abriendo la ventana del trace"
    case "ayuda_gismart":
      return `Buscando en la ayuda${corto(a.tema) ? ` «${corto(a.tema)}»` : ""}`
    case "cerca_de":
      return corto(a.direccion) ? `Ubicando «${corto(a.direccion)}»` : `Buscando cerca de ${corto(a.cubierta) || "ese punto"}`
    default:
      return `Consultando ${corto(evento.nombre)}`
  }
}
