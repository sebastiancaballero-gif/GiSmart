"use client"

import { useEffect } from "react"
import { AlertTriangle, Map as MapaIcono, RotateCcw } from "lucide-react"
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, PantallaAviso } from "@/components/pantalla-aviso"

/**
 * Pantalla de error de la aplicación.
 *
 * Sin esto, un fallo en el mapa dejaba la pantalla en blanco y sin forma de
 * recuperarse salvo recargar a mano. `reset()` reintenta el render sin perder
 * la sesión; si el fallo se repite, volver al mapa lo carga desde cero.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Queda en la consola del navegador para poder diagnosticarlo.
    console.error("Fallo en GiSmart:", error)
  }, [error])

  return (
    <PantallaAviso
      tono="error"
      icono={AlertTriangle}
      titulo="Algo salió mal"
      descripcion="La aplicación encontró un error inesperado. Puedes reintentar sin perder la sesión."
      detalle={
        error.digest && (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 font-mono text-[11px] text-muted-foreground">
            Referencia: {error.digest}
          </p>
        )
      }
    >
      <button type="button" onClick={reset} className={BOTON_PRINCIPAL}>
        <RotateCcw className="size-4" />
        Reintentar
      </button>
      {/* Un enlace normal, no el router: si el error vino de la navegación,
          una carga completa es lo que lo deja limpio. */}
      <a href="/dashboard" className={BOTON_SECUNDARIO}>
        <MapaIcono className="size-4" />
        Volver al mapa de red
      </a>
    </PantallaAviso>
  )
}
