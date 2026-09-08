import { CABECERA_COLOR } from "@/lib/map/symbology"

/**
 * Símbolos de las capas, en SVG.
 *
 * Son la réplica de lo que OpenLayers dibuja sobre el mapa (ver
 * `lib/map/symbology.ts`). Viven acá para que la leyenda y el panel de capas
 * usen el mismo dibujo: si el símbolo del mapa cambia, se corrige en los dos
 * sitios a la vez en lugar de quedar uno desactualizado.
 */

/** Cubierta de empalme: círculo blanco con cruz inscrita. */
export function MufaSymbol({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="6" fill="#ffffff" stroke={color} strokeWidth="2" />
      <line x1="8" y1="2" x2="8" y2="14" stroke={color} strokeWidth="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

/** Cabecera central: círculo con triángulo inscrito. */
export function CabeceraSymbol({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="7" fill="#ffffff" stroke={CABECERA_COLOR} strokeWidth="1.8" />
      <polygon points="8,4 11.5,10 4.5,10" fill={CABECERA_COLOR} />
    </svg>
  )
}

/**
 * Cable de fibra: un trazo cuyo grosor refleja la cantidad de hilos, igual que
 * en el mapa. `width` viene de `fiberWidth()` para que coincidan.
 */
export function FiberSymbol({
  color,
  width = 3,
  size = 16,
}: {
  color: string
  width?: number
  size?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth={width} strokeLinecap="round" />
    </svg>
  )
}

/** Zona de cobertura: polígono con borde punteado. */
export function ZonaSymbol({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
    </svg>
  )
}
