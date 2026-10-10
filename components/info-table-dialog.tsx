"use client"

import { useState } from "react"
import { Check, Copy, Info, Search } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { CAMPOS_REFERENCIA, NOMBRE_VISIBLE, TIPO_RED_NOMBRES } from "@/lib/map/symbology"
import { normalizar } from "@/lib/map/busqueda"
import { copiarTexto } from "@/lib/portapapeles"

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

/** Con más campos que estos aparece el buscador de la ficha. */
const CAMPOS_PARA_BUSCAR = 8

/**
 * Nombre legible para una columna que no está en `fieldLabels`.
 * `direccion_catastral` → `Direccion catastral`. No siempre queda perfecto
 * (las abreviaturas se mantienen tal cual), pero es mejor que ocultar el dato.
 */
function humanizarCampo(key: string): string {
  const texto = key.replace(/_/g, " ").trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const vacio = (value: unknown) => value === null || value === undefined || value === ""

/**
 * Identificadores y códigos (`id_legacy`, `id_proyecto`, `codigo`, `cod_…`): van
 * tal cual. Con separador de miles, el `id_legacy` 1555766 salía «1.555.766» y
 * así se copiaba, y eso no sirve para buscarlo en la base.
 */
const ES_IDENTIFICADOR = /^(id|id_.+|.+_id|codigo|cod_.+)$/

function formatValue(key: string, value: unknown): string {
  if (vacio(value)) return "—"
  // Fechas: `creado_en`/`modificado_en` desde septiembre de 2026; se aceptan
  // también los nombres anteriores (`fecha_creacion`, `fecha_ult_act`).
  if ((/^fecha_/.test(key) || /_en$/.test(key)) && typeof value === "string") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-CO")
  }
  if (typeof value === "number") return ES_IDENTIFICADOR.test(key) ? String(value) : value.toLocaleString("es-CO")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

/** Lo que se copia de una fila: lo que se ve, salvo en las referencias, donde va el UUID. */
function textoParaCopiar(key: string, value: unknown): string {
  if (CAMPOS_REFERENCIA.has(key) && typeof value === "string") return value
  return formatValue(key, value)
}

/** Valor de una fila, con las traducciones que hacen legible la ficha. */
/** Un UUID de la base: se muestra como identificador, en letra de ancho fijo. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
          <span className="block font-mono text-[11px] text-muted-foreground">{valor}</span>
        </>
      )
    }
  }
  // El código se conserva al lado: es lo que buscan quienes filtran en la base.
  if (campo === "tipo_red_prin" && typeof valor === "string" && TIPO_RED_NOMBRES[valor]) {
    return <>{`${TIPO_RED_NOMBRES[valor]} (${valor})`}</>
  }
  // En letra de ancho fijo y algo más chico: en la de texto se leía como una
  // frase partida en dos renglones, y es un código que se copia tal cual.
  if (typeof valor === "string" && UUID.test(valor)) {
    return <span className="font-mono text-[11px]">{valor}</span>
  }
  return <>{formatValue(campo, valor)}</>
}

// Tabla informativa de solo lectura, genérica: se usa tanto para mufas como
// para cables de fibra y cabeceras (el "identificar" de un visor GIS clásico).
//
// Una ficha de cable pasa de 30 filas y muchas vienen vacías: por eso se
// ocultan los campos sin dato (se pueden ver con un click), hay un buscador
// cuando la ficha es larga y cada valor se copia con su botón, que es lo que
// se hace con un UUID o un código para llevarlo a la base o a un reporte.
export function InfoTableDialog({ open, onOpenChange, title, description, fieldLabels, data, nombreDeElemento }: Props) {
  const [filtro, setFiltro] = useState("")
  const [verVacios, setVerVacios] = useState(false)
  const [copiado, setCopiado] = useState<{ campo: string; ok: boolean } | null>(null)

  // Primero los campos conocidos, en el orden curado; después cualquier columna
  // nueva de la base, para que un cambio de esquema se vea sin tocar el código.
  const conocidos = Object.keys(fieldLabels).filter((key) => key in data)
  const nuevos = Object.keys(data).filter(
    (key) => !(key in fieldLabels) && !CAMPOS_INTERNOS.has(key),
  )
  const campos = [...conocidos, ...nuevos]
  const etiqueta = (key: string) => fieldLabels[key] ?? humanizarCampo(key)

  const vacios = campos.filter((key) => vacio(data[key])).length
  const q = normalizar(filtro)
  const visibles = campos.filter((key) => {
    if (!verVacios && vacio(data[key])) return false
    if (!q) return true
    return normalizar(etiqueta(key)).includes(q) || normalizar(textoParaCopiar(key, data[key])).includes(q)
  })

  async function copiar(key: string, boton: HTMLElement) {
    const ok = await copiarTexto(textoParaCopiar(key, data[key]), boton.closest("[role=dialog]") ?? document.body)
    setCopiado({ campo: key, ok })
    setTimeout(() => setCopiado((actual) => (actual?.campo === key ? null : actual)), 1500)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        onOpenChange(abierto)
        // La próxima ficha empieza limpia.
        if (!abierto) setFiltro("")
      }}
    >
      {/* max-w-xl: con max-w-lg un UUID no cabía en un renglón. */}
      <DialogContent className="max-w-xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Info className="size-5" />
          </span>
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </div>

        {campos.length > CAMPOS_PARA_BUSCAR && (
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar un campo o un valor…"
              aria-label="Buscar un campo o un valor"
              className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}

        <div className={`${campos.length > CAMPOS_PARA_BUSCAR ? "mt-2" : "mt-4"} max-h-80 overflow-y-auto rounded-lg border border-border`}>
          {visibles.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {q ? `Ningún campo coincide con «${filtro.trim()}».` : "Este elemento no tiene datos cargados."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {visibles.map((key, i) => {
                  const estado = copiado?.campo === key ? copiado : null
                  return (
                    <tr key={key} className={`group ${i % 2 === 0 ? "bg-muted/40" : ""}`}>
                      <td className="w-2/5 px-3 py-2 align-top font-medium text-muted-foreground">{etiqueta(key)}</td>
                      {/* `break-words`: hay valores largos sin espacios donde
                          partir, como la etiqueta NAP "1/3+5/6+9/11+13+15+17/20",
                          que si no se salen de la celda y descuadran la tabla. */}
                      <td className="px-3 py-2 break-words text-foreground">
                        <Valor campo={key} valor={data[key]} nombreDeElemento={nombreDeElemento} />
                      </td>
                      <td className="w-8 py-1.5 pr-1.5 align-top">
                        {!vacio(data[key]) && (
                          <button
                            type="button"
                            onClick={(e) => void copiar(key, e.currentTarget)}
                            aria-label={`Copiar ${etiqueta(key)}`}
                            title={estado ? (estado.ok ? "Copiado" : "No se pudo copiar") : "Copiar"}
                            className={`flex size-6 items-center justify-center rounded-md outline-none transition focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 ${
                              estado
                                ? estado.ok
                                  ? "text-emerald-600 opacity-100 dark:text-emerald-400"
                                  : "text-destructive opacity-100"
                                : "text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                            }`}
                          >
                            {estado?.ok ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {vacios > 0 && (
          <p className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {verVacios
                ? `Se ven también ${vacios} ${vacios === 1 ? "campo" : "campos"} sin dato.`
                : `${vacios} ${vacios === 1 ? "campo sin dato oculto" : "campos sin dato ocultos"}.`}
            </span>
            <button
              type="button"
              onClick={() => setVerVacios((v) => !v)}
              className="rounded-md px-1.5 py-0.5 font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {verVacios ? "Ocultarlos" : "Mostrarlos"}
            </button>
          </p>
        )}
        {/* Anuncia el resultado de copiar a los lectores de pantalla. */}
        <span role="status" className="sr-only">
          {copiado ? (copiado.ok ? `${etiqueta(copiado.campo)} copiado` : "No se pudo copiar") : ""}
        </span>
      </DialogContent>
    </Dialog>
  )
}
