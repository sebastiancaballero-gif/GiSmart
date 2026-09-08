"use client"

import { Info } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Nombres legibles y orden de los campos conocidos. */
  fieldLabels: Record<string, string>
  data: Record<string, unknown>
}

/**
 * Propiedades internas del mapa, no columnas de la base: no tienen sentido en
 * una ficha de datos.
 */
const CAMPOS_INTERNOS = new Set(["geometry", "esquema"])

/**
 * Nombre legible para una columna que no está en `fieldLabels`.
 * `direccion_catastral` → `Direccion catastral`. No siempre queda perfecto
 * (las abreviaturas se mantienen tal cual), pero es mejor que ocultar el dato.
 */
function humanizarCampo(key: string): string {
  const texto = key.replace(/_/g, " ").trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
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
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

// Tabla informativa de solo lectura, genérica: se usa tanto para mufas como
// para cables de fibra y cabeceras (el "identificar" de un visor GIS clásico).
export function InfoTableDialog({ open, onOpenChange, title, description, fieldLabels, data }: Props) {
  // Primero los campos conocidos, en el orden curado; después cualquier columna
  // nueva de la base, para que un cambio de esquema se vea sin tocar el código.
  const conocidos = Object.keys(fieldLabels).filter((key) => key in data)
  const nuevos = Object.keys(data).filter(
    (key) => !(key in fieldLabels) && !CAMPOS_INTERNOS.has(key),
  )
  const campos = [...conocidos, ...nuevos]

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
              {campos.map((key, i) => (
                <tr key={key} className={i % 2 === 0 ? "bg-muted/40" : ""}>
                  <td className="w-2/5 px-3 py-2 align-top font-medium text-muted-foreground">
                    {fieldLabels[key] ?? humanizarCampo(key)}
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
