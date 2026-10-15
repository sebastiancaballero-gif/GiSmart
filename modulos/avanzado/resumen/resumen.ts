import type { ElementoDelMapa } from "@/components/network-map"
import { largoDentroM } from "./medidas"

/** Una barra del resumen: una categoría con cuántos hay (y, en cables, cuántos km se ven). */
export type FilaDeResumen = { etiqueta: string; color: string; cantidad: number; km?: number }

export type ResumenEnPantalla = {
  cubiertas: { total: number; porNivel: FilaDeResumen[] }
  cables: { total: number; km: number; porCapacidad: FilaDeResumen[] }
  cabeceras: { total: number; nombres: string[] }
  zonas: number
  /** Elementos en pantalla que no se cuentan porque su capa está apagada o el filtro los oculta. */
  ocultos: number
}

/**
 * Lo que se ve en pantalla, en cifras, como las «infografías» de RustGIS:
 * cubiertas por nivel, cables por capacidad con los km que caen dentro de la
 * pantalla (no el largo entero de cada cable que asoma), cabeceras y zonas.
 * Solo cuenta lo que está pintado: capas encendidas y lo que el filtro deja.
 */
export function resumirEnPantalla(elementos: ElementoDelMapa[], extension: number[]): ResumenEnPantalla {
  const visibles = elementos.filter((e) => e.visible)
  const agrupar = (lista: ElementoDelMapa[], conKm: boolean) => {
    const grupos = new Map<string, FilaDeResumen>()
    for (const e of lista) {
      const fila = grupos.get(e.categoria) ?? { etiqueta: e.categoria, color: e.color, cantidad: 0, ...(conKm ? { km: 0 } : {}) }
      fila.cantidad += 1
      if (conKm && e.lineas) fila.km = (fila.km ?? 0) + largoDentroM(e.lineas, extension) / 1000
      grupos.set(e.categoria, fila)
    }
    return [...grupos.values()]
  }

  const cubiertas = visibles.filter((e) => e.tipo === "node")
  const cables = visibles.filter((e) => e.tipo === "fiber")
  const cabeceras = visibles.filter((e) => e.tipo === "cabecera")
  const porCapacidad = agrupar(cables, true).sort((a, b) => (b.km ?? 0) - (a.km ?? 0) || b.cantidad - a.cantidad)
  return {
    cubiertas: { total: cubiertas.length, porNivel: agrupar(cubiertas, false).sort((a, b) => b.cantidad - a.cantidad) },
    cables: {
      total: cables.length,
      km: porCapacidad.reduce((s, f) => s + (f.km ?? 0), 0),
      porCapacidad,
    },
    cabeceras: { total: cabeceras.length, nombres: cabeceras.map((c) => c.nombre) },
    zonas: visibles.filter((e) => e.tipo === "zone").length,
    ocultos: elementos.length - visibles.length,
  }
}
