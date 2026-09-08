"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { GismartMark } from "@/components/gismart-mark"

/**
 * Pantalla de error de la aplicación.
 *
 * Sin esto, un fallo en el mapa dejaba la pantalla en blanco y sin forma de
 * recuperarse salvo recargar a mano. `reset()` reintenta el render sin perder
 * la sesión.
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
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-7 text-center shadow-xl ring-1 ring-border">
        <GismartMark className="mx-auto size-11 rounded-xl shadow-sm" />

        <div className="mt-5 flex items-center justify-center gap-2 text-destructive">
          <AlertTriangle className="size-5" />
          <h1 className="text-lg font-bold tracking-tight">Algo salió mal</h1>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          La aplicación encontró un error inesperado. Puedes reintentar sin perder la sesión.
        </p>

        {error.digest && (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 font-mono text-[11px] text-muted-foreground">
            Referencia: {error.digest}
          </p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <RotateCcw className="size-4" />
          Reintentar
        </button>
      </div>
    </main>
  )
}
