/**
 * Código de colores ITU-T / TIA-598-D, usado para identificar buffers e hilos
 * dentro de un cable de fibra óptica.
 */

export type FiberColor = {
  /** Posición en la secuencia TIA-598-D (1 a 12). */
  order: number
  name: string
  hex: string
}

export const FIBER_COLORS: readonly FiberColor[] = [
  { order: 1, name: "Azul", hex: "#1d6ff2" },
  { order: 2, name: "Naranja", hex: "#f97316" },
  { order: 3, name: "Verde", hex: "#16a34a" },
  { order: 4, name: "Café", hex: "#8a5a2b" },
  { order: 5, name: "Gris", hex: "#94a3b8" },
  { order: 6, name: "Blanco", hex: "#f8fafc" },
  { order: 7, name: "Rojo", hex: "#e11d48" },
  { order: 8, name: "Negro", hex: "#1e293b" },
  { order: 9, name: "Amarillo", hex: "#eab308" },
  { order: 10, name: "Violeta", hex: "#7c3aed" },
  { order: 11, name: "Rosa", hex: "#f472b6" },
  { order: 12, name: "Aguamarina", hex: "#06b6d4" },
]

export const FIBER_COLOR_CYCLE = FIBER_COLORS.length

/**
 * La secuencia de 12 colores se repite para cables de mayor capacidad,
 * por lo que el hilo 13 vuelve a ser Azul. `position` es 1-based.
 */
export function fiberColor(position: number): FiberColor {
  const index = (position - 1) % FIBER_COLOR_CYCLE
  return FIBER_COLORS[index]
}

/** Normaliza el nombre para tolerar acentos y mayúsculas ("Café" = "cafe"). */
function normalizeColorName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

const COLORS_BY_NAME = new Map<string, FiberColor>(
  FIBER_COLORS.map((color) => [normalizeColorName(color.name), color]),
)

/** Sinónimos habituales en los inventarios de planta. */
const COLOR_ALIASES: Record<string, string> = {
  marron: "cafe",
  cafe_claro: "cafe",
  turquesa: "aguamarina",
  aqua: "aguamarina",
  celeste: "azul",
  purpura: "violeta",
  morado: "violeta",
}

/**
 * Resuelve el nombre de color que viene en el JSON. Devuelve `undefined` si no
 * pertenece al código ITU-T / TIA-598-D, para que la capa de parseo pueda avisarlo.
 */
export function fiberColorByName(name: string): FiberColor | undefined {
  const key = normalizeColorName(name)
  return COLORS_BY_NAME.get(key) ?? COLORS_BY_NAME.get(COLOR_ALIASES[key] ?? "")
}

/**
 * Devuelve el HEX ITU-T correspondiente al nombre de color. Si el nombre no se
 * reconoce, usa el color por posición (1 = Azul) para no dejar el hilo sin pintar.
 */
export function getColorITU(colorName: string, posicion = 1): string {
  return fiberColorByName(colorName)?.hex ?? fiberColor(posicion).hex
}
