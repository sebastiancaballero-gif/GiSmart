"use client"

/**
 * Barra de estado del mapa: coordenadas del cursor, zoom y herramienta activa.
 *
 * Longitud, latitud y zoom **no son props**: se reciben como referencias y el
 * mapa les escribe el texto directamente en el DOM. Es a propósito. Las
 * coordenadas cambian con cada movimiento del ratón y el zoom en cada cuadro de
 * la animación de acercar; pasarlos por estado de React obligaba a
 * re-renderizar el mapa entero decenas de veces por segundo. `zoom` es solo el
 * valor con que arranca.
 */
export function MapStatusBar({
  lonRef,
  latRef,
  zoomRef,
  zoom,
  herramienta,
}: {
  lonRef: React.RefObject<HTMLSpanElement | null>
  latRef: React.RefObject<HTMLSpanElement | null>
  zoomRef?: React.RefObject<HTMLSpanElement | null>
  zoom: number
  /** Nombre visible de la herramienta activa. */
  herramienta: string
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-lg bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md ring-1 ring-border backdrop-blur">
      <span>
        Lon:{" "}
        <span ref={lonRef} className="tabular-nums text-primary">
          —
        </span>
      </span>
      <Separador />
      <span>
        Lat:{" "}
        <span ref={latRef} className="tabular-nums text-primary">
          —
        </span>
      </span>
      <Separador />
      <span>
        Zoom:{" "}
        <span ref={zoomRef} className="tabular-nums text-primary">
          {zoom}
        </span>
      </span>
      <Separador />
      {/* Qué herramienta está activa: con ocho en la barra y atajos de teclado,
          conviene poder confirmarlo sin mirar los iconos. */}
      <span className="text-muted-foreground">{herramienta}</span>
    </div>
  )
}

function Separador() {
  return <span className="h-3 w-px bg-border" aria-hidden="true" />
}
