"use client"

import { Loader2, CheckCircle2 } from "lucide-react"
import { GismartMark } from "@/components/gismart-mark"

type Props = {
  open: boolean
  usuario?: string
  done?: boolean
  /** Nombre que devolvió el servidor; con él, el saludo final es personal. */
  nombre?: string
}

export function ConnectingModal({ open, usuario, done, nombre }: Props) {
  if (!open) return null

  // Solo el primer nombre: «Bienvenido, Sebastián» se lee mejor que con el
  // nombre completo en una ventana tan pequeña.
  const primerNombre = nombre?.trim().split(" ")[0]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estableciendo conexión"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs rounded-2xl bg-card p-6 text-center shadow-xl ring-1 ring-border">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent">
          {done ? (
            <CheckCircle2 className="size-8 text-primary" aria-hidden="true" />
          ) : (
            <span className="relative flex items-center justify-center">
              <Loader2 className="absolute size-12 animate-spin text-primary/60" aria-hidden="true" />
              <GismartMark className="h-7 w-auto" />
            </span>
          )}
        </div>

        <p className="text-sm font-semibold text-foreground">
          {done ? (primerNombre ? `Bienvenido, ${primerNombre}` : "Conexión establecida") : "Conectando al servidor..."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {done
            ? "Abriendo el mapa de la red"
            : usuario
              ? `Validando credenciales de "${usuario}"`
              : "Validando credenciales"}
        </p>

        {/* Barra de progreso indeterminada */}
        {!done && (
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/2 animate-[gismart-progress_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        )}
      </div>
    </div>
  )
}
