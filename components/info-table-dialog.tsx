"use client"

import { Info } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { CAMPOS_REFERENCIA, NOMBRE_VISIBLE, TIPO_RED_NOMBRES } from "@/lib/map/symbology"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Nombres legibles y orden de los campos conocidos. */
  fieldLabels: Record<string, string>
  data: Record<string, unknown>
  /**
   * Nombre de otro elemento de la red a partir de su UUID. Si se pasa, los
   * campos que apuntan a otro elemento (origen y destino de un cable) se
   * muestran con ese nombre, y el UUID queda debajo en pequeño.
   */
  nombreDeElemento?: (id: string) => string | null
}

/**
 * Propiedades internas del mapa, no columnas de la base: no tienen sentido en
 * una ficha de datos.
 */
const CAMPOS_INTERNOS = new Set(["geometry", NOMBRE_VISIBLE])

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
  // Fechas: `creado_en`/`modificado_en` desde septiembre de 2026; se aceptan
  // también los nombres anteriores (`fecha_creacion`, `fecha_ult_act`).
  if ((/^fecha_/.test(key) || /_en$/.test(key)) && typeof value === "string") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-CO")
  }
  if (typeof value === "number") return value.toLocaleString("es-CO")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

/** Valor de una fila, con las traducciones que hacen legible la ficha. */
function Valor({
  campo,
  valor,
  nombreDeElemento,
}: {
  campo: string
  valor: unknown
  nombreDeElemento?: (id: string) => string | null
}) {
  if (CAMPOS_REFERENCIA.has(campo) && typeof valor === "string") {
    const nombre = nombreDeElemento?.(valor)
    if (nombre) {
      return (
        <>
          {nombre}
          <span className="block text-[11px] text-muted-foreground">{valor}</span>
        </>
      )
    }
  }
  // El código se conserva al lado: es lo que buscan quienes filtran en la base.
  if (campo === "tipo_red_prin" && typeof valor === "string" && TIPO_RED_NOMBRES[valor]) {
    return <>{`${TIPO_RED_NOMBRES[valor]} (${valor})`}</>
  }
  return <>{formatValue(campo, valor)}</>
}

// Tabla informativa de solo lectura, genérica: se usa tanto para mufas como
// para cables de fibra y cabeceras (el "identificar" de un visor GIS clásico).
export function InfoTableDialog({ open, onOpenChange, title, description, fieldLabels, data, nombreDeElemento }: Props) {
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
                  {/* `break-words`: hay valores largos sin espacios donde
                      partir, como la etiqueta NAP "1/3+5/6+9/11+13+15+17/20",
                      que si no se salen de la celda y descuadran la tabla. */}
                  <td className="px-3 py-2 break-words text-foreground">
                    <Valor campo={key} valor={data[key]} nombreDeElemento={nombreDeElemento} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
