/**
 * Última vista del mapa (centro y zoom), para retomarla al volver a entrar.
 *
 * Quien trabaja sobre un sector concreto lo recupera al recargar, en vez de
 * volver siempre al encuadre de toda la red. Si el navegador bloquea el
 * almacenamiento, todo sigue funcionando: simplemente no se recuerda.
 */
const CLAVE_VISTA = "gismart_vista_mapa"

export type VistaGuardada = { centro: [number, number]; zoom: number }

export function leerVistaGuardada(): VistaGuardada | null {
  try {
    const crudo = localStorage.getItem(CLAVE_VISTA)
    if (!crudo) return null
    const dato = JSON.parse(crudo) as VistaGuardada
    const [lon, lat] = dato.centro ?? []
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(dato.zoom)) return null
    return dato
  } catch {
    return null
  }
}

export function guardarVista(vista: VistaGuardada) {
  try {
    localStorage.setItem(CLAVE_VISTA, JSON.stringify(vista))
  } catch {
    // Sin almacenamiento el mapa simplemente no recuerda la vista.
  }
}
