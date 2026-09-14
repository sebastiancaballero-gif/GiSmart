"use client"

import { Loader2, X } from "lucide-react"

/**
 * Avisos apilados sobre el mapa.
 *
 * Antes cada aviso repetía las mismas doce clases de Tailwind, y agregar uno
 * nuevo se hacía copiando y pegando el anterior: cinco bloques que ya se habían
 * ido separando entre sí (uno recuperaba el ratón, otro no; uno usaba
 * `items-center` y otro `items-start`). Aquí el aspecto se decide en un solo
 * sitio y cada aviso solo dice qué contiene.
 *
 * La pila va arriba y al centro, encima del mapa pero por debajo de los
 * diálogos, e ignora el ratón para no robarle clicks al mapa. Los avisos que
 * llevan botón lo recuperan con `interactivo`.
 */
const TONOS = {
  neutral: "bg-card/95 text-foreground ring-border",
  aviso: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300",
} as const

export function MapNoticeStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {children}
    </div>
  )
}

export function MapNotice({
  tono = "neutral",
  cargando = false,
  interactivo = false,
  onCerrar,
  children,
}: {
  /** `aviso` es ámbar (algo no salió bien); `neutral`, gris (solo informa). */
  tono?: "neutral" | "aviso"
  /** Muestra el indicador de carga a la izquierda del texto. */
  cargando?: boolean
  /** Recupera el ratón: necesario si el aviso lleva botones dentro. */
  interactivo?: boolean
  /** Si se pasa, añade una equis para descartar el aviso. */
  onCerrar?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      role={tono === "aviso" ? "status" : undefined}
      className={`flex max-w-md items-start gap-2 rounded-lg px-3 py-1.5 text-xs font-medium shadow-md ring-1 backdrop-blur ${
        TONOS[tono]
      } ${interactivo || onCerrar ? "pointer-events-auto" : ""}`}
    >
      {cargando && <Loader2 className="mt-px size-3.5 shrink-0 animate-spin text-primary" />}
      {children}
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          className="shrink-0 rounded p-0.5 outline-none transition hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Cerrar aviso"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
