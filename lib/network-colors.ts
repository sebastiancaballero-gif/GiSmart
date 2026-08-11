// Paleta de las capas de red (nodos, fibra, zonas), compartida entre el mapa
// (OpenLayers dibuja sobre <canvas>, así que no puede resolver variables CSS)
// y cualquier UI que necesite representar el mismo color de capa.
export const LAYER_COLORS = {
  node: "#0ea5e9",
  fiber: "#2563eb",
  zone: "#38bdf8",
} as const

export type LayerId = keyof typeof LAYER_COLORS
