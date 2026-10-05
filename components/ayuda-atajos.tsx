"use client"

import { Keyboard } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

/** Cada atajo: las teclas y lo que hacen. */
const ATAJOS: { teclas: string[]; que: string }[] = [
  { teclas: ["1"], que: "Mover mapa" },
  { teclas: ["2"], que: "Editar elementos" },
  { teclas: ["3"], que: "Dibujar cubierta" },
  { teclas: ["4"], que: "Trazar fibra" },
  { teclas: ["5"], que: "Zona de cobertura" },
  { teclas: ["6"], que: "Eliminar geometría" },
  { teclas: ["7"], que: "Medir distancia" },
  { teclas: ["8"], que: "Medir área" },
  { teclas: ["Ctrl", "K"], que: "Buscar una cubierta, un cable, una dirección o una coordenada" },
  { teclas: ["Esc"], que: "Cancelar el trazo o la medición en curso" },
  { teclas: ["Doble click"], que: "Terminar una línea, una zona o una medición" },
  { teclas: ["?"], que: "Abrir esta ayuda" },
]

/**
 * Los atajos de teclado del mapa en un solo lugar. Existían (teclas 1 a 8,
 * Esc), pero solo se descubrían pasando el ratón por cada botón.
 */
export function AyudaAtajos({ open, onOpenChange }: { open: boolean; onOpenChange: (abierto: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* max-w-lg: en max-w-sm tres de las filas largas («Cancelar el trazo…»)
          se partían en dos renglones. */}
      <DialogContent className="max-w-lg">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Keyboard className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <DialogTitle>Atajos de teclado</DialogTitle>
            <DialogDescription>
              Las teclas 1 a 8 eligen la herramienta en el orden de la barra. Las que editan necesitan su capa activa.
            </DialogDescription>
          </div>
        </div>
        <dl className="mt-4 divide-y divide-border rounded-lg border border-border text-sm">
          {ATAJOS.map(({ teclas, que }) => (
            <div key={que} className="flex items-center justify-between gap-4 px-3 py-2">
              <dt className="text-foreground">{que}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {teclas.map((tecla) => (
                  <kbd
                    key={tecla}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted-foreground"
                  >
                    {tecla}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
