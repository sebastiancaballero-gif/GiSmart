"use client"

import { useState } from "react"
import {
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ListTree,
  MonitorDown,
  Route,
  Save,
  Table2,
  TableProperties,
  ZoomIn,
  type LucideIcon,
} from "lucide-react"
import { BotonIcono, claseSelect, Grilla, Opciones, Pestanas, type Columna } from "@/components/ventana-sig"
import { MarcoDePlanta, useVentana, type PropsDeVentana } from "@/components/planta/piezas"
import type { CubiertaNivel1, NodoDeFibra } from "@/lib/map/red-de-fibra"

/**
 * «Enrutamiento de hilos» (ribbon: Red de fibra → Enrutamiento), como la del
 * SIG anterior: el nodo de fibra y el arpón con sus herramientas, los
 * parámetros del enrutamiento y las pestañas con OLT, cables, arpones,
 * enrutamientos y presupuesto óptico.
 *
 * Solo la vista. Todavía no está confirmado qué columnas lleva cada pestaña:
 * por ahora todas llevan las de «OLTs», como se pidió. Los nombres de los
 * botones de icono son provisionales (el SIG anterior no los decía). El nodo
 * sale de las cabeceras del mapa y el arpón de las cubiertas de primer nivel
 * (las «CEO»), igual que en Redes/Nodo y GPON.
 */

type PestanaId = "olts" | "cables-sal" | "arpones" | "cables-arpon" | "enrut-nodo" | "enrut-arpon" | "presupuesto"

const PESTANAS: { id: PestanaId; titulo: string }[] = [
  { id: "olts", titulo: "OLTs" },
  { id: "cables-sal", titulo: "Cables Sal" },
  { id: "arpones", titulo: "Arpones" },
  { id: "cables-arpon", titulo: "Cables Arpón" },
  { id: "enrut-nodo", titulo: "Enrut Nodo" },
  { id: "enrut-arpon", titulo: "Enrut Arpón" },
  { id: "presupuesto", titulo: "Presup Opt. Fwd." },
]

// Las de «OLTs» para todas mientras no se confirmen las demás.
const COLUMNAS: Columna[] = [
  { titulo: "Identificador", ancho: "min-w-36" },
  { titulo: "Cod Rack", ancho: "min-w-28" },
  { titulo: "Código OLT", ancho: "min-w-28" },
  { titulo: "Fecha Presup", ancho: "min-w-28" },
  { titulo: "Observación", ancho: "min-w-64" },
]

/** Las herramientas de la fila del nodo y de la del arpón (en el SIG anterior, las mismas). */
const HERRAMIENTAS: { icono: LucideIcon; nombre: string }[] = [
  { icono: TableProperties, nombre: "Datos" },
  { icono: ZoomIn, nombre: "Acercar el mapa" },
  { icono: ListTree, nombre: "Enrutar" },
  { icono: FileText, nombre: "Ver el enrutamiento" },
  { icono: Save, nombre: "Guardar" },
  { icono: FolderOpen, nombre: "Abrir" },
]

function FilaDeElemento({
  etiqueta,
  opciones,
  vacio,
  valor,
  onChange,
  sufijo,
  extra,
  onPendiente,
}: {
  etiqueta: string
  opciones: { clave: string; nombre: string }[]
  vacio: string
  valor: string
  onChange: (clave: string) => void
  /** A quién se refieren las herramientas: «del nodo», «del arpón». */
  sufijo: string
  /** El botón suelto de la derecha. */
  extra: { icono: LucideIcon; nombre: string }
  onPendiente: (nombre: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-sm">
      <span className="w-28 shrink-0 text-xs font-bold text-foreground">{etiqueta}</span>
      <select
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={opciones.length === 0}
        className={`${claseSelect} min-w-48 flex-1 sm:max-w-80`}
      >
        {opciones.length === 0 && <option value="">{vacio}</option>}
        {opciones.map((o) => (
          <option key={o.clave} value={o.clave}>
            {o.nombre}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-1.5">
        {HERRAMIENTAS.map((h) => (
          <BotonIcono
            key={h.nombre}
            pendiente
            icono={h.icono}
            etiqueta={`${h.nombre} ${sufijo}`}
            onClick={() => onPendiente(`${h.nombre} ${sufijo}`)}
          />
        ))}
      </div>
      <span className="flex-1" />
      <BotonIcono pendiente icono={extra.icono} etiqueta={extra.nombre} onClick={() => onPendiente(extra.nombre)} />
    </div>
  )
}

export function VentanaEnrutamiento({
  open,
  onOpenChange,
  nodos,
  arpones,
}: PropsDeVentana & { nodos: NodoDeFibra[]; arpones: CubiertaNivel1[] }) {
  const [red, setRed] = useState<"proyectada" | "existente">("existente")
  const [claveNodo, setClaveNodo] = useState<string | null>(null)
  const [claveArpon, setClaveArpon] = useState<string | null>(null)
  const [potencia, setPotencia] = useState("100")
  const [margen, setMargen] = useState(false)
  const [asignar, setAsignar] = useState<"lejano" | "cercano">("lejano")
  const [pestana, setPestana] = useState<PestanaId>("olts")
  // Sin elegir, el primero: casi siempre hay un solo nodo.
  const nodo = nodos.find((n) => n.clave === claveNodo) ?? nodos[0] ?? null
  const arpon = arpones.find((a) => a.clave === claveArpon) ?? arpones[0] ?? null
  const actual = PESTANAS.find((p) => p.id === pestana) ?? PESTANAS[0]
  const v = useVentana(onOpenChange, "Elige el nodo de fibra y el arpón para enrutar sus hilos.")

  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={Route}
      titulo="Enrutamiento de hilos"
      descripcion={nodo ? `Nodo ${nodo.nombre} · red existente` : "Elige un nodo de fibra para enrutar sus hilos."}
      ancho="60rem"
      barra={v.barra}
      pie={
        // Todavía no mide nada: se ve como en el SIG anterior, pero los
        // lectores de pantalla no la anuncian.
        <span aria-hidden="true" className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-muted-foreground">
          Avance
          <span className="h-2 w-40 overflow-hidden rounded-full bg-muted ring-1 ring-border">
            <span className="block h-full w-0 rounded-full bg-primary" />
          </span>
        </span>
      }
    >
      {/* En un div: suelto en la columna se estiraba a todo el ancho. */}
      <div>
        <Opciones
          etiqueta="Qué red enrutar"
          valor={red}
          onChange={setRed}
          opciones={[
            { id: "proyectada", texto: "Nodos de la red proyectada", deshabilitada: true, titulo: "Todavía no disponible" },
            { id: "existente", texto: "Nodos de la red existente" },
          ]}
        />
      </div>

      <FilaDeElemento
        etiqueta="Nodo Fo (SDS)"
        opciones={nodos}
        vacio="Sin nodos cargados"
        valor={nodo?.clave ?? ""}
        onChange={(clave) => {
          setClaveNodo(clave)
          v.limpiar()
        }}
        sufijo="del nodo"
        extra={{ icono: Table2, nombre: "Tabla del nodo" }}
        onPendiente={v.pendiente}
      />
      <FilaDeElemento
        etiqueta="Arpón (CEO)"
        opciones={arpones}
        vacio="Sin cubiertas de primer nivel"
        valor={arpon?.clave ?? ""}
        onChange={(clave) => {
          setClaveArpon(clave)
          v.limpiar()
        }}
        sufijo="del arpón"
        extra={{ icono: FileSpreadsheet, nombre: "Exportar a Excel" }}
        onPendiente={v.pendiente}
      />

      {/* Parámetros del enrutamiento */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-xs font-bold text-foreground">Parámetros variables</span>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Porcentaje máximo de potencia de salida OLT (%)
            <input
              type="number"
              min={0}
              max={100}
              value={potencia}
              onChange={(e) => setPotencia(e.target.value)}
              className="h-8 w-20 rounded-lg border border-input bg-card px-2.5 text-xs font-semibold tabular-nums text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <span className="flex-1" />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={margen}
              onChange={(e) => setMargen(e.target.checked)}
              className="size-3.5 accent-[var(--primary)]"
            />
            ¿Usar margen de guarda?
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-xs font-bold text-foreground">Al enrutar, asignar el hilo más bajo al elemento</span>
          <Opciones
            etiqueta="A qué elemento se asigna el hilo más bajo"
            valor={asignar}
            onChange={setAsignar}
            opciones={[
              { id: "lejano", texto: "Más lejano" },
              { id: "cercano", texto: "Más cercano" },
            ]}
          />
        </div>
      </div>

      <Pestanas etiqueta="Enrutamiento" valor={pestana} onChange={setPestana} pestanas={PESTANAS}>
        <Grilla marco={false} etiqueta={actual.titulo} columnas={COLUMNAS} alto="h-[min(16rem,25vh)]" />
      </Pestanas>

      <div className="flex flex-wrap items-center gap-1.5">
        <BotonIcono pendiente icono={MonitorDown} etiqueta="Cargar la tabla" onClick={() => v.pendiente("Cargar la tabla")} />
        <BotonIcono pendiente icono={Save} etiqueta="Guardar la tabla" onClick={() => v.pendiente("Guardar la tabla")} />
        <BotonIcono pendiente icono={FolderOpen} etiqueta="Abrir una tabla guardada" onClick={() => v.pendiente("Abrir una tabla guardada")} />
      </div>
    </MarcoDePlanta>
  )
}
