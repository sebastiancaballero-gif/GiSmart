/**
 * El aspecto del mapa que elige cada quien (Avanzado › Mapa base y
 * Minimapa): cómo se ve el mapa base, la transparencia de cada capa y si el
 * minimapa está a la vista. Se guarda en el navegador, por usuario, como los
 * marcadores; va aparte del panel para probarlo sin el navegador.
 */

export type EstiloDeFondo = "tema" | "calles" | "gris" | "oscuro" | "ninguno"
export type CapaConOpacidad = "base" | "zones" | "fibers" | "nodes" | "cabeceras"

/** El filtro del tema oscuro (globals.css, `.gismart-basemap`), para la muestra de «Oscuro». */
const FILTRO_OSCURO = "invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88) saturate(0.72)"

/**
 * Los estilos del mapa base. Todos salen de las mismas teselas con un filtro
 * (globals.css, `[data-fondo]`): no hace falta otro proveedor ni otra licencia.
 * `muestra` es el filtro de su miniatura en el panel.
 */
export const ESTILOS_DE_FONDO: { id: EstiloDeFondo; nombre: string; descripcion: string; muestra: string }[] = [
  { id: "tema", nombre: "Según el tema", descripcion: "Claro u oscuro, como la aplicación", muestra: "none" },
  { id: "calles", nombre: "Calles", descripcion: "Los colores de siempre, también en el tema oscuro", muestra: "none" },
  { id: "gris", nombre: "Gris", descripcion: "Atenuado: la red resalta más", muestra: "grayscale(1) contrast(0.9) brightness(1.04)" },
  { id: "oscuro", nombre: "Oscuro", descripcion: "Oscuro aunque la aplicación esté clara", muestra: FILTRO_OSCURO },
  { id: "ninguno", nombre: "Sin fondo", descripcion: "Solo la red", muestra: "none" },
]

export const CAPAS_CON_OPACIDAD: { id: CapaConOpacidad; nombre: string }[] = [
  { id: "base", nombre: "Mapa base" },
  { id: "zones", nombre: "Zonas" },
  { id: "fibers", nombre: "Tendido de fibra" },
  { id: "nodes", nombre: "Cubiertas" },
  { id: "cabeceras", nombre: "Cabeceras" },
]

export type Apariencia = {
  fondo: EstiloDeFondo
  /** De 0 (invisible) a 1 (opaca). */
  opacidades: Record<CapaConOpacidad, number>
  minimapa: boolean
}

export const APARIENCIA_INICIAL: Apariencia = {
  fondo: "tema",
  opacidades: { base: 1, zones: 1, fibers: 1, nodes: 1, cabeceras: 1 },
  minimapa: false,
}

/** Lo más transparente que se deja una capa: del todo invisible, mejor apagarla en el panel de capas. */
export const OPACIDAD_MINIMA = 0.1

const clave = (usuario: string) => `gismart.apariencia.${usuario || "sin-usuario"}`

/** Una opacidad válida: entre la mínima y 1, en pasos de 5 %. */
export function opacidadValida(valor: unknown): number {
  const n = typeof valor === "number" && Number.isFinite(valor) ? valor : 1
  return Math.round(Math.min(1, Math.max(OPACIDAD_MINIMA, n)) * 20) / 20
}

/** Lo guardado; lo que no tenga forma se reemplaza por lo de siempre. */
export function leerApariencia(usuario: string): Apariencia {
  try {
    const crudo = localStorage.getItem(clave(usuario))
    if (!crudo) return APARIENCIA_INICIAL
    const datos = JSON.parse(crudo) as Partial<Apariencia> | null
    const fondo = ESTILOS_DE_FONDO.some((e) => e.id === datos?.fondo) ? (datos?.fondo as EstiloDeFondo) : "tema"
    const opacidades = { ...APARIENCIA_INICIAL.opacidades }
    for (const { id } of CAPAS_CON_OPACIDAD) opacidades[id] = opacidadValida(datos?.opacidades?.[id])
    return { fondo, opacidades, minimapa: datos?.minimapa === true }
  } catch {
    return APARIENCIA_INICIAL
  }
}

/** Guarda la elección. `false` si el navegador no deja guardar (dura mientras la página esté abierta). */
export function guardarApariencia(usuario: string, apariencia: Apariencia): boolean {
  try {
    localStorage.setItem(clave(usuario), JSON.stringify(apariencia))
    return true
  } catch {
    return false
  }
}

/**
 * Una tesela del centro de La Unión (zoom 17, unos 300 m: se ven las calles),
 * para las miniaturas de los estilos: la del proveedor configurado
 * (NEXT_PUBLIC_TESELAS_URL) o la de OpenStreetMap.
 */
export function teselaDeMuestra(): string {
  const [z, x, y] = [17, 37827, 63883]
  const plantilla = process.env.NEXT_PUBLIC_TESELAS_URL?.trim()
  if (!plantilla) return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
  return plantilla.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y))
}
