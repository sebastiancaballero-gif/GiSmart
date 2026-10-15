import { limpiarNombre } from "@/lib/texto"
import type { VistaGuardada } from "@/lib/map/vista-guardada"

/**
 * Marcadores: vistas del mapa con nombre («HUB La Unión», «Zona norte») para
 * volver a ellas con un click, como los de RustGIS o ArcGIS.
 *
 * Se guardan en este navegador y por usuario: son una comodidad de cada quien,
 * no un dato de la red. Si el navegador bloquea el almacenamiento, la ventana
 * lo dice y sigue funcionando mientras esté abierta.
 */
export type Marcador = VistaGuardada & {
  id: string
  nombre: string
  /** Cuándo se guardó (ISO). */
  creado: string
}

/** Tope de marcadores por usuario: más no se recorren en una lista. */
export const MAX_MARCADORES = 50

const clave = (usuario: string) => `gismart_marcadores_${usuario || "anonimo"}`

function esMarcador(dato: unknown): dato is Marcador {
  if (!dato || typeof dato !== "object") return false
  const m = dato as Record<string, unknown>
  const centro = m.centro as unknown[] | undefined
  return (
    typeof m.id === "string" &&
    typeof m.nombre === "string" &&
    Array.isArray(centro) &&
    centro.length === 2 &&
    centro.every((v) => typeof v === "number" && Number.isFinite(v)) &&
    Math.abs(centro[0] as number) <= 180 &&
    Math.abs(centro[1] as number) <= 90 &&
    typeof m.zoom === "number" &&
    Number.isFinite(m.zoom)
  )
}

/** Los marcadores guardados; lo que no tenga forma de marcador se ignora. */
export function leerMarcadores(usuario: string): Marcador[] {
  try {
    const crudo = localStorage.getItem(clave(usuario))
    if (!crudo) return []
    const datos = JSON.parse(crudo) as unknown
    return Array.isArray(datos) ? datos.filter(esMarcador).slice(0, MAX_MARCADORES) : []
  } catch {
    return []
  }
}

/** Guarda la lista. `false` si el navegador no deja guardar. */
export function guardarMarcadores(usuario: string, marcadores: Marcador[]): boolean {
  try {
    localStorage.setItem(clave(usuario), JSON.stringify(marcadores.slice(0, MAX_MARCADORES)))
    return true
  } catch {
    return false
  }
}

/** Un marcador nuevo con esa vista; el nombre se limpia como el de cualquier elemento. */
export function nuevoMarcador(nombre: string, vista: VistaGuardada, ahora = new Date()): Marcador {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${ahora.getTime()}-${Math.random()}`
  return {
    id,
    nombre: limpiarNombre(nombre).trim() || "Vista sin nombre",
    centro: [vista.centro[0], vista.centro[1]],
    zoom: Math.round(vista.zoom * 100) / 100,
    creado: ahora.toISOString(),
  }
}
