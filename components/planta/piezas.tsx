"use client"

import { useState } from "react"
import { FileSpreadsheet, MousePointerClick, Pin, Plug, Save, type LucideIcon } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  BarraDeEstado,
  Boton,
  BotonIcono,
  Campo,
  claseSelect,
  EncabezadoVentana,
  Grupo,
  PENDIENTE,
  Rotulo,
  type Mensaje,
} from "@/components/ventana-sig"

/**
 * Piezas que repiten las ventanas de planta interna y externa (Red de fibra →
 * Puertos OLT, Inventario, OLT-ODF, ODF-ODF, ODF-Cables y las de ocupación).
 *
 * Por ahora todas son solo la vista, como se pidió: los racks, las OLT y los
 * ODF no están cargados en el mapa y las consultas esperan sus funciones en la
 * base. Cada botón que todavía no hace nada lo dice al pulsarlo.
 */

/**
 * Lo que dice la barra de estado de una ventana y su cierre. Sin nada que
 * avisar, la barra dice `porDefecto` (qué hacer para empezar); al cerrar, el
 * último aviso se borra para que no reaparezca al volver a abrirla.
 */
export function useVentana(onOpenChange: (abierto: boolean) => void, porDefecto: string) {
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  return {
    barra: mensaje ?? ({ texto: porDefecto, tono: "info" } satisfies Mensaje),
    /** Un botón que todavía no tiene su función en la base. */
    pendiente: (nombre: string) => setMensaje({ texto: PENDIENTE(nombre), tono: "info" }),
    avisar: (texto: string) => setMensaje({ texto, tono: "aviso" }),
    limpiar: () => setMensaje(null),
    cerrar: (abierto: boolean) => {
      onOpenChange(abierto)
      if (!abierto) setMensaje(null)
    },
  }
}

/** Lo que recibe cada ventana de planta: si está abierta y cómo cerrarla. */
export type PropsDeVentana = { open: boolean; onOpenChange: (abierto: boolean) => void }

/** Ventana con el encabezado, el cuerpo que se desplaza y la barra de estado. */
export function MarcoDePlanta({
  open,
  onOpenChange,
  icono,
  titulo,
  descripcion,
  ancho = "52rem",
  barra,
  pie,
  children,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  icono: LucideIcon
  titulo: string
  descripcion: string
  /** Ancho máximo de la ventana (nunca más que la pantalla). */
  ancho?: string
  /** Lo que dice la barra de estado de abajo. */
  barra: Mensaje
  /** Algo más a la derecha de la barra de estado. */
  pie?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[94vh] max-w-none flex-col overflow-hidden p-0"
        style={{ width: `min(${ancho}, calc(100vw - 2rem))` }}
      >
        <EncabezadoVentana icono={icono} titulo={titulo} descripcion={descripcion} />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/20 p-4">{children}</div>
        <BarraDeEstado mensaje={barra}>{pie}</BarraDeEstado>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Fila de arriba de las ventanas de puertos: el pin para elegir el equipo, los
 * campos que muestran lo elegido (los rosados del SIG anterior) y «Exportar a
 * Excel» a la derecha.
 */
export function SeleccionDeEquipo({
  campos,
  elegir,
  onElegir,
  onExportar,
  children,
}: {
  /** Nombre de cada campo: «Rack», «ODF», «OLT»… */
  campos: string[]
  /** Qué elige el pin, para su etiqueta: «Elegir el rack». */
  elegir: string
  onElegir: () => void
  onExportar: () => void
  /** Botones extra junto al pin. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 self-end">
        <BotonIcono pendiente icono={Pin} etiqueta={elegir} onClick={onElegir} />
        {children}
      </div>
      {campos.map((c) => (
        <div key={c} className="flex min-w-36 flex-1 flex-col gap-1 sm:max-w-56">
          <Rotulo>{c}</Rotulo>
          <Campo etiqueta={c} valor={null} guia="Sin elegir" ancho="w-full" />
        </div>
      ))}
      <span className="hidden flex-1 sm:block" />
      <BotonExportar onClick={onExportar} />
    </div>
  )
}

export function BotonExportar({ onClick }: { onClick: () => void }) {
  return (
    <Boton pendiente icono={FileSpreadsheet} colorIcono="text-emerald-600" onClick={onClick}>
      Exportar a Excel
    </Boton>
  )
}

/**
 * Un control del recuadro de modificación. Va apagado hasta que se elige una
 * fila de la grilla, como en el SIG anterior: hoy la grilla no trae filas.
 */
export function ControlDeCambio({
  etiqueta,
  tipo,
  ancho = "w-24",
}: {
  etiqueta: string
  /** `lista`: se elige de una lista; `dato`: solo se muestra. */
  tipo: "lista" | "dato"
  ancho?: string
}) {
  return (
    <label className="flex items-center gap-2" title="Elige primero una fila de la tabla">
      <span className="w-24 shrink-0 text-[11px] font-semibold text-muted-foreground">{etiqueta}</span>
      {tipo === "lista" ? (
        <select disabled aria-label={etiqueta} className={`${claseSelect} ${ancho}`}>
          <option>—</option>
        </select>
      ) : (
        <Campo etiqueta={etiqueta} valor={null} guia="—" ancho={ancho} chico />
      )}
    </label>
  )
}

/**
 * Recuadro de abajo para cambiar la conectividad de un puerto: sus controles
 * y, a la derecha, los botones (conectar, elegir el puerto y guardar).
 */
export function PanelDeCambio({
  titulo,
  children,
  onPendiente,
  guardar = true,
  columnas = 3,
}: {
  titulo: string
  children: React.ReactNode
  onPendiente: (nombre: string) => void
  /** Con «Guardar» (en ODF-ODF el SIG anterior no lo tenía). */
  guardar?: boolean
  /** En cuántas columnas van los controles en pantallas anchas. */
  columnas?: 2 | 3
}) {
  return (
    <Grupo titulo={titulo}>
      <div className="flex flex-wrap items-end gap-3">
        <div className={`grid min-w-0 flex-1 gap-x-5 gap-y-2 sm:grid-cols-2 ${columnas === 3 ? "lg:grid-cols-3" : ""}`}>{children}</div>
        <div className="flex items-center gap-1.5">
          <BotonIcono pendiente icono={MousePointerClick} etiqueta="Elegir el puerto" onClick={() => onPendiente("Elegir el puerto")} />
          <BotonIcono pendiente icono={Plug} etiqueta="Conectar los puertos" onClick={() => onPendiente("Conectar los puertos")} />
          {guardar && (
            <BotonIcono pendiente icono={Save} etiqueta="Guardar los cambios" onClick={() => onPendiente("Guardar los cambios")} />
          )}
        </div>
      </div>
    </Grupo>
  )
}
