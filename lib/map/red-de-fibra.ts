import { normalizar, type ElementoBuscable } from "@/lib/map/busqueda"

/**
 * Lo que las ventanas «Redes/Nodo» y «GPON» sacan de lo cargado en el mapa.
 * Vive aparte de los componentes para poder probarlo sin navegador
 * (scripts/probar-red-de-fibra.mjs).
 */

/** Un nodo de fibra (SDS) que se puede consultar: hoy, las cabeceras del mapa. */
export type NodoDeFibra = { clave: string; nombre: string; detalle: string }

/** Una cubierta de la lista «Cod. Nivel 1». */
export type CubiertaNivel1 = { clave: string; nombre: string }

/** Los nodos de fibra del índice del mapa: por ahora, las cabeceras cargadas. */
export function nodosDeFibra(indice: ElementoBuscable[]): NodoDeFibra[] {
  return indice
    .filter((e) => e.tipo === "cabecera")
    .map((e) => ({ clave: e.clave, nombre: e.nombre, detalle: e.detalle }))
}

/**
 * Las cubiertas de primer nivel del mapa («Cod. Nivel 1 totales»), ordenadas
 * como las lee una persona: CU-2 antes que CU-10.
 */
export function cubiertasNivel1(indice: ElementoBuscable[]): CubiertaNivel1[] {
  return indice
    .filter((e) => e.tipo === "node" && e.categoria === "Primer nivel")
    .map((e) => ({ clave: e.clave, nombre: e.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }))
}

/**
 * Los nodos cuyo nombre contiene esos caracteres, sin importar mayúsculas ni
 * tildes. `null` si no se escribió nada: no es lo mismo que no encontrar.
 */
export function buscarNodos(nodos: NodoDeFibra[], texto: string): NodoDeFibra[] | null {
  const q = normalizar(texto)
  if (!q) return null
  return nodos.filter((n) => normalizar(n.nombre).includes(q))
}

/**
 * El elemento a `paso` posiciones de `posicion`, sin pasarse de los extremos
 * (las flechas de «Cod. Nivel 1» se detienen en la primera y la última).
 */
export function vecinoEnLista<T>(lista: T[], posicion: number, paso: number): T | null {
  if (lista.length === 0) return null
  return lista[Math.min(lista.length - 1, Math.max(0, posicion + paso))]
}
