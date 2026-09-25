"use client"

import { createPortal } from "react-dom"
import { Check, Loader2 } from "lucide-react"
import { GismartMark } from "@/components/gismart-mark"

type Props = {
  open: boolean
  usuario?: string
  done?: boolean
  /** Nombre que devolvió el servidor; con él, el saludo final es personal. */
  nombre?: string
}

type EstadoPaso = "hecho" | "en-curso" | "pendiente"

function Paso({ estado, children }: { estado: EstadoPaso; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full transition-colors ${
          estado === "hecho"
            ? "bg-emerald-500 text-white"
            : estado === "en-curso"
              ? "bg-primary/12 text-primary"
              : "border border-border text-transparent"
        }`}
        aria-hidden="true"
      >
        {estado === "hecho" ? (
          <Check className="size-3" strokeWidth={3} />
        ) : estado === "en-curso" ? (
          <Loader2 className="size-3 animate-spin" />
        ) : null}
      </span>
      <span className={estado === "pendiente" ? "text-muted-foreground" : "font-medium text-foreground"}>{children}</span>
    </li>
  )
}

/**
 * Ventana de conexión del login: cubre la pantalla mientras se validan las
 * credenciales y saluda al entrar.
 *
 * Se dibuja en el `body` con un portal. Dentro de la tarjeta del login no
 * podía cubrir la pantalla: la tarjeta entra con una animación que usa
 * `transform`, y un `transform` en un ancestro encierra a los elementos
 * `position: fixed` en su caja. El fondo oscuro quedaba como un recuadro gris
 * del tamaño de la tarjeta en vez de ocupar toda la pantalla.
 */
export function ConnectingModal({ open, usuario, done, nombre }: Props) {
  // Solo se abre después de un click, así que siempre hay `document`; la
  // comprobación es para el render del servidor, donde llega cerrada.
  if (!open || typeof document === "undefined") return null

  // Solo el primer nombre: «Bienvenido, Sebastián» se lee mejor que con el
  // nombre completo en una ventana tan pequeña.
  const primerNombre = nombre?.trim().split(" ")[0]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={done ? "Sesión iniciada" : "Estableciendo conexión"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/55 p-4 backdrop-blur-md animate-gismart-fade-in"
    >
      <div className="gismart-entrada w-full max-w-sm overflow-hidden rounded-2xl bg-card text-center shadow-[0_24px_60px_-12px_rgb(15_23_42/0.35)] ring-1 ring-border">
        <div aria-hidden="true" className="h-1 bg-gradient-to-r from-[#2a9bc4] via-[#6fc5df] to-[#2f6d9e]" />

        <div className="px-7 pb-7 pt-8">
          {/* La marca emite ondas mientras se conecta, como los arcos del logo;
              al entrar, las ondas paran y aparece el visto. */}
          <div className="relative mx-auto flex size-24 items-center justify-center">
            {!done && (
              <>
                <span aria-hidden="true" className="gismart-onda absolute inset-0 rounded-full bg-primary/20" />
                <span
                  aria-hidden="true"
                  className="gismart-onda absolute inset-0 rounded-full bg-primary/20"
                  style={{ animationDelay: "0.8s" }}
                />
              </>
            )}
            <span
              className={`relative flex size-20 items-center justify-center rounded-full ring-1 transition-colors duration-300 ${
                done ? "bg-emerald-500/12 ring-emerald-500/30" : "bg-card ring-border"
              }`}
            >
              {done ? (
                <Check className="size-9 text-emerald-500" strokeWidth={2.5} aria-hidden="true" />
              ) : (
                <GismartMark className="h-11 w-auto" />
              )}
            </span>
          </div>

          <p className="mt-5 text-lg font-bold tracking-tight text-foreground">
            {done ? `Bienvenido${primerNombre ? `, ${primerNombre}` : ""}` : "Conectando…"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {done ? "Todo listo, abriendo el mapa de la red" : "Esto toma solo un momento"}
          </p>

          <ol className="mx-auto mt-6 w-fit space-y-2.5 text-left text-[13px]">
            <Paso estado={done ? "hecho" : "en-curso"}>
              {usuario ? `Validando las credenciales de ${usuario}` : "Validando credenciales"}
            </Paso>
            <Paso estado={done ? "en-curso" : "pendiente"}>Abriendo el mapa de la red</Paso>
          </ol>
        </div>
      </div>
    </div>,
    document.body,
  )
}
