"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Tooltip } from "@/components/ui/tooltip"

/** Lo que la ficha necesita saber cuando hay varios elementos bajo el click. */
export type VariosEnElPunto = {
  /** Cuál se muestra, desde 0. */
  actual: number
  total: number
  onAnterior: () => void
  onSiguiente: () => void
}

/**
 * «‹ 1 de 3 ›» en el encabezado de la ficha: pasa al elemento de abajo o al
 * de arriba entre los que había donde se hizo click.
 */
export function PaginadorDeFicha({ varios }: { varios: VariosEnElPunto }) {
  const clase =
    "flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Elementos en ese punto">
      <Tooltip label="El anterior en ese punto" side="bottom">
        <button type="button" onClick={varios.onAnterior} aria-label="Elemento anterior en ese punto" className={clase}>
          <ChevronLeft className="size-4" />
        </button>
      </Tooltip>
      <span className="min-w-12 text-center text-[11px] font-semibold tabular-nums text-muted-foreground" aria-live="polite">
        {varios.actual + 1} de {varios.total}
      </span>
      <Tooltip label="El siguiente en ese punto" side="bottom">
        <button type="button" onClick={varios.onSiguiente} aria-label="Elemento siguiente en ese punto" className={clase}>
          <ChevronRight className="size-4" />
        </button>
      </Tooltip>
    </div>
  )
}
