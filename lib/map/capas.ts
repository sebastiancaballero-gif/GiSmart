import type Feature from "ol/Feature"
import type { Geometry } from "ol/geom"

/**
 * Resumen de lo que hay cargado en el mapa y desglose por categoría.
 *
 * Es lo que el mapa le pasa al panel lateral. Vive aparte del componente
 * porque son funciones puras sobre los datos ya cargados: no tocan el mapa, no
 * dependen de React y se pueden probar solas.
 */
export type LayerBucket = { label: string; count: number; color: string; width?: number }

/** Resumen de lo cargado en el mapa, que consume el panel lateral. */
export type NetworkStats = {
  counts: { nodes: number; fibers: number; zones: number; cabeceras: number }
  totalKm: number
  /** Conteo por categoría de cada capa, para desplegar en el panel. */
  breakdown: { nodes: LayerBucket[]; fibers: LayerBucket[] }
  /**
   * Lo que queda a la vista con el filtro por categoría puesto.
   *
   * Va aparte de `counts` y `totalKm`, que siguen midiendo la red completa.
   * Hacía falta porque filtrando a «144 hilos» el panel seguía anunciando los
   * 18,73 km de toda la red mientras el mapa mostraba veinte cables: no había
   * forma de saber cuánto era lo que se estaba mirando.
   */
  enPantalla: { nodes: number; fibers: number; km: number }
}

/**
 * Cuenta los elementos por categoría, ordenados de mayor a menor. `clasificar`
 * define a qué categoría pertenece cada elemento y de qué color se muestra.
 */
export function agrupar(
  features: Feature<Geometry>[],
  clasificar: (f: Feature<Geometry>) => { label: string; color: string; width?: number },
): LayerBucket[] {
  // `Object.create(null)` y no `{}`: con un literal, una categoría llamada
  // "__proto__" o "constructor" choca con el prototipo y los elementos
  // desaparecían del conteo sin avisar. Con 3 elementos y la categoría
  // "constructor", el desglose devolvía una lista vacía.
  const buckets: Record<string, LayerBucket> = Object.create(null)
  features.forEach((f) => {
    const { label, color, width } = clasificar(f)
    if (buckets[label]) buckets[label].count += 1
    else buckets[label] = { label, color, width, count: 1 }
  })
  return Object.values(buckets).sort((a, b) => b.count - a.count)
}

/** Sin categorías seleccionadas no hay filtro: se muestran todas. */
export function categoriaVisible(seleccionadas: string[] | undefined, categoria: string): boolean {
  if (!seleccionadas || seleccionadas.length === 0) return true
  return seleccionadas.includes(categoria)
}
