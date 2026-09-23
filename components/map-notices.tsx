"use client"

import { CircleAlert, Info, Loader2, TriangleAlert, X, type LucideIcon } from "lucide-react"

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
 *
 * El tono se nota en el icono y en el filo de color, no en el fondo: todos van
 * sobre la tarjeta del tema, así que se leen igual en claro y en oscuro y sobre
 * cualquier zona del mapa. Antes todo salía en ámbar, y una indicación de uso,
 * un resultado y un error se veían iguales.
 */
const TONOS: Record<TonoDeAviso, { anillo: string; filo: string; icono: LucideIcon | null; colorIcono: string }> = {
  neutral: { anillo: "ring-border", filo: "bg-transparent", icono: null, colorIcono: "" },
  info: { anillo: "ring-primary/25", filo: "bg-primary", icono: Info, colorIcono: "text-primary" },
  aviso: { anillo: "ring-amber-500/40", filo: "bg-amber-500", icono: TriangleAlert, colorIcono: "text-amber-500" },
  error: { anillo: "ring-destructive/40", filo: "bg-destructive", icono: CircleAlert, colorIcono: "text-destructive" },
}

/**
 * `info`: indicación de uso o resultado de una consulta. `aviso`: algo no salió
 * como se esperaba pero no es un fallo. `error`: la consulta falló. `neutral`:
 * sin icono, para lo que solo acompaña (cargas en curso).
 */
export type TonoDeAviso = "neutral" | "info" | "aviso" | "error"

export function MapNoticeStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex w-[min(28rem,calc(100%-6rem))] -translate-x-1/2 flex-col items-center gap-1.5">
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
  tono?: TonoDeAviso
  /** Muestra el indicador de carga a la izquierda del texto. */
  cargando?: boolean
  /** Recupera el ratón: necesario si el aviso lleva botones dentro. */
  interactivo?: boolean
  /** Si se pasa, añade una equis para descartar el aviso. */
  onCerrar?: () => void
  children: React.ReactNode
}) {
  const { anillo, filo, icono: Icono, colorIcono } = TONOS[tono]
  return (
    <div
      role={tono === "error" ? "alert" : tono === "aviso" ? "status" : undefined}
      className={`relative flex max-w-full items-start gap-2 overflow-hidden rounded-lg bg-card/95 py-2 pl-3.5 pr-2.5 text-xs font-medium leading-snug text-foreground shadow-lg ring-1 backdrop-blur animate-gismart-fade-in ${anillo} ${
        interactivo || onCerrar ? "pointer-events-auto" : ""
      }`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${filo}`} />
      {cargando ? (
        <Loader2 className="mt-px size-3.5 shrink-0 animate-spin text-primary" />
      ) : (
        Icono && <Icono className={`mt-px size-3.5 shrink-0 ${colorIcono}`} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          className="-my-0.5 shrink-0 rounded p-0.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Cerrar aviso"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
