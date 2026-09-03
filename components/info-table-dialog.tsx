"use client"

import { Info } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  fieldLabels: Record<string, string>
  data: Record<string, unknown>
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  // Fechas: `fecha_creacion`/`fecha_ult_act` en geo_fiber, `creado_en`/
  // `actualizado_en` en geo_infra.
  if ((/^fecha_/.test(key) || /_en$/.test(key)) && typeof value === "string") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-CO")
  }
  if (typeof value === "number") return value.toLocaleString("es-CO")
  return String(value)
}

// Tabla informativa de solo lectura, genérica: se usa tanto para mufas como
// para cables de fibra (mismo "identificar" que en un visor GIS clásico).
export function InfoTableDialog({ open, onOpenChange, title, description, fieldLabels, data }: Props) {
  const keys = Object.keys(fieldLabels)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Info className="size-5" />
          </span>
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </div>

        <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {keys.map((key, i) => (
                <tr key={key} className={i % 2 === 0 ? "bg-muted/40" : ""}>
                  <td className="w-2/5 px-3 py-2 align-top font-medium text-muted-foreground">
                    {fieldLabels[key]}
                  </td>
                  <td className="px-3 py-2 text-foreground">{formatValue(key, data[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
