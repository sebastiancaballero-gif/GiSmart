"use client"

import { useState } from "react"
import { Box, Search } from "lucide-react"
import { Boton, claseSelect, Grilla, Opciones, Pestanas, type Columna } from "@/components/ventana-sig"
import { BotonExportar, MarcoDePlanta, useVentana, VacioPendiente, type PropsDeVentana } from "@/components/planta/piezas"
import type { NodoDeFibra } from "@/lib/map/red-de-fibra"

/**
 * «Reporte de inventario de red de fibra óptica» (ribbon: Red de fibra →
 * Inventario), como la del SIG anterior: el inventario de un nodo o de un
 * contrato, resumido por tipo de elemento o en detalle.
 *
 * Solo la vista. La lista de nodos sale de las cabeceras del mapa (igual que en
 * Redes/Nodo); los contratos y la red proyectada todavía no están. Los botones
 * «Seleccionado» del SIG anterior dicen aquí «Consultar», que es lo que hacen.
 */

type PestanaId = "resumen-nodo" | "detalle-nodo" | "resumen-contrato" | "detalle-contrato"

const RESUMEN: Columna[] = [
  { titulo: "Código de nodo", ancho: "min-w-36" },
  { titulo: "Tipo de elemento", ancho: "min-w-40" },
  { titulo: "Unidad", ancho: "min-w-20" },
  { titulo: "Cantidad", ancho: "min-w-24" },
]

const DETALLE: Columna[] = [
  { titulo: "Código de nodo", ancho: "min-w-36" },
  { titulo: "Elemento", ancho: "min-w-32" },
  { titulo: "Tipo", ancho: "min-w-32" },
  { titulo: "Unidad", ancho: "min-w-20" },
  { titulo: "Cantidad", ancho: "min-w-24" },
]

const PESTANAS: { id: PestanaId; titulo: string; columnas: Columna[]; queMuestra: string }[] = [
  { id: "resumen-nodo", titulo: "Resumen / Nodo", columnas: RESUMEN, queMuestra: "las cantidades del nodo por tipo de elemento" },
  { id: "detalle-nodo", titulo: "Detalle / Nodo", columnas: DETALLE, queMuestra: "cada elemento del nodo con su cantidad" },
  { id: "resumen-contrato", titulo: "Resumen contrato", columnas: RESUMEN, queMuestra: "las cantidades del contrato por tipo de elemento" },
  { id: "detalle-contrato", titulo: "Detalle contrato", columnas: DETALLE, queMuestra: "cada elemento del contrato con su cantidad" },
]

export function VentanaInventario({ open, onOpenChange, nodos }: PropsDeVentana & { nodos: NodoDeFibra[] }) {
  const [red, setRed] = useState<"existente" | "proyectada">("existente")
  const [claveNodo, setClaveNodo] = useState<string | null>(null)
  const [pestana, setPestana] = useState<PestanaId>("resumen-nodo")
  // Sin elegir, el primero: casi siempre hay un solo nodo.
  const nodo = nodos.find((n) => n.clave === claveNodo) ?? nodos[0] ?? null
  const actual = PESTANAS.find((p) => p.id === pestana) ?? PESTANAS[0]
  const v = useVentana(
    onOpenChange,
    nodo ? "Elige el nodo y pulsa «Consultar» para ver su inventario." : "No hay nodos de fibra cargados en el mapa.",
  )

  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={Box}
      titulo="Reporte de inventario de red de fibra óptica"
      descripcion={nodo ? `Nodo ${nodo.nombre} · red existente` : "Elige un nodo de fibra o un contrato."}
      ancho="50rem"
      barra={v.barra}
    >
      <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <Opciones
          etiqueta="Qué red consultar"
          valor={red}
          onChange={setRed}
          opciones={[
            { id: "existente", texto: "Nodos de la red existente" },
            { id: "proyectada", texto: "Nodos de la red proyectada", deshabilitada: true, titulo: "Todavía no disponible" },
          ]}
        />

        <div className="mt-3.5 grid items-center gap-x-3 gap-y-2.5 sm:grid-cols-[9rem_1fr_auto]">
          <span className="text-xs font-semibold text-muted-foreground">Código de contrato</span>
          <select disabled className={`${claseSelect} w-full`} title="Todavía no disponible" aria-label="Código de contrato">
            <option>—</option>
          </select>
          <Boton pendiente icono={Search} onClick={() => v.pendiente("Consultar el contrato")}>
            Consultar
          </Boton>

          <span className="text-xs font-semibold text-muted-foreground">Nombre de nodo</span>
          <select
            aria-label="Nombre de nodo"
            value={nodo?.clave ?? ""}
            onChange={(e) => {
              setClaveNodo(e.target.value)
              v.limpiar()
            }}
            disabled={nodos.length === 0}
            className={`${claseSelect} w-full`}
          >
            {nodos.length === 0 && <option value="">Sin nodos cargados</option>}
            {nodos.map((n) => (
              <option key={n.clave} value={n.clave}>
                {n.nombre}
              </option>
            ))}
          </select>
          <Boton pendiente icono={Search} onClick={() => (nodo ? v.pendiente("Consultar el nodo") : v.avisar("Primero elige un nodo de fibra."))}>
            Consultar
          </Boton>
        </div>
      </div>

      <Pestanas etiqueta="Inventario" valor={pestana} onChange={setPestana} pestanas={PESTANAS}>
        <Grilla
          marco={false}
          etiqueta={actual.titulo}
          columnas={actual.columnas}
          alto="h-[min(18rem,36vh)]"
          vacio={
            <VacioPendiente
              como={actual.id.endsWith("contrato") ? "Al consultar un contrato" : "Al consultar el nodo"}
              queMuestra={actual.queMuestra}
            />
          }
        />
      </Pestanas>

      <div className="flex justify-end">
        <BotonExportar onClick={() => v.avisar(`No hay datos para exportar en «${actual.titulo}».`)} />
      </div>
    </MarcoDePlanta>
  )
}
