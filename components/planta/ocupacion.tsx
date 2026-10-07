"use client"

import { useState } from "react"
import { Cable, FileBarChart, Grid3x3, MapPin } from "lucide-react"
import { BarraDeAvance, Boton, claseSelect, Grilla, Grupo, Rotulo, type Columna } from "@/components/ventana-sig"
import {
  BotonExportar,
  MarcoDePlanta,
  SeleccionDeEquipo,
  useVentana,
  type PropsDeVentana,
} from "@/components/planta/piezas"
import type { NodoDeFibra } from "@/lib/map/red-de-fibra"

/**
 * Reportes de ocupación (ribbon: Red de fibra → Ocup. OLT y Ocup. ODF en
 * planta interna, Ocup. cables en planta externa), como los del SIG anterior.
 *
 * Solo la vista. En el SIG anterior las grillas de OLT y ODF se titulaban
 * «Conectividad de puertos ODF», copiado de otra ventana; aquí dicen lo que
 * muestran.
 */

const COLUMNAS_OLT: Columna[] = [
  { titulo: "Rack OLT", ancho: "min-w-36" },
  { titulo: "OLT", ancho: "min-w-20" },
  { titulo: "Tarjeta", ancho: "min-w-16" },
  { titulo: "Puerto", ancho: "min-w-16" },
  { titulo: "Cód. arpón", ancho: "min-w-40" },
  { titulo: "Divisor", ancho: "min-w-20" },
]

/** «Reporte de ocupación de OLT». */
export function VentanaOcupacionOlt({ open, onOpenChange }: PropsDeVentana) {
  const v = useVentana(onOpenChange, "Elige con el pin el rack y la OLT para ver la ocupación de sus puertos.")
  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={MapPin}
      titulo="Reporte de ocupación de OLT"
      descripcion="Qué puertos de la OLT están ocupados, con su arpón y su divisor."
      ancho="46rem"
      barra={v.barra}
    >
      <SeleccionDeEquipo
        campos={["Rack", "OLT"]}
        elegir="Elegir el rack y la OLT"
        onElegir={() => v.pendiente("Elegir el rack y la OLT")}
        onExportar={() => v.avisar("No hay datos para exportar.")}
      />
      <Grupo titulo="Ocupación de puertos de la OLT">
        <Grilla
          etiqueta="Ocupación de puertos de la OLT"
          columnas={COLUMNAS_OLT}
          alto="h-[min(22rem,46vh)]"
        />
      </Grupo>
    </MarcoDePlanta>
  )
}

const COLUMNAS_ODF: Columna[] = [
  { titulo: "Rack ODF", ancho: "min-w-36" },
  { titulo: "ODF", ancho: "min-w-20" },
  { titulo: "Puerto", ancho: "min-w-16" },
  { titulo: "Cód. arpón", ancho: "min-w-40" },
  { titulo: "Divisor", ancho: "min-w-20" },
]

/** «Reporte de ocupación de ODF». */
export function VentanaOcupacionOdf({ open, onOpenChange }: PropsDeVentana) {
  const v = useVentana(onOpenChange, "Elige con el pin el rack y el ODF para ver la ocupación de sus puertos.")
  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={Grid3x3}
      titulo="Reporte de ocupación de ODF"
      descripcion="Qué puertos del ODF están ocupados, con su arpón y su divisor."
      ancho="42rem"
      barra={v.barra}
    >
      <SeleccionDeEquipo
        campos={["Rack", "ODF"]}
        elegir="Elegir el rack y el ODF"
        onElegir={() => v.pendiente("Elegir el rack y el ODF")}
        onExportar={() => v.avisar("No hay datos para exportar.")}
      />
      <Grupo titulo="Ocupación de puertos del ODF">
        <Grilla
          etiqueta="Ocupación de puertos del ODF"
          columnas={COLUMNAS_ODF}
          alto="h-[min(22rem,46vh)]"
        />
      </Grupo>
    </MarcoDePlanta>
  )
}

const COLUMNAS_CABLES: Columna[] = [
  { titulo: "Código del cable", ancho: "min-w-40" },
  { titulo: "Cant. hilos", ancho: "min-w-20" },
  { titulo: "Cant. libres", ancho: "min-w-20" },
  { titulo: "Cant. conectados", ancho: "min-w-28" },
  { titulo: "Cant. ocupados", ancho: "min-w-24" },
  { titulo: "% Conexión", ancho: "min-w-20" },
  { titulo: "% Ocupación", ancho: "min-w-24" },
]

/**
 * «Reporte gráfico de ocupación de cables de fibra en el nodo». El nodo se
 * elige de la lista, que sale de las cabeceras cargadas en el mapa (igual que
 * en Redes/Nodo); en el SIG anterior era un campo amarillo sin lista.
 */
export function VentanaOcupacionCables({ open, onOpenChange, nodos }: PropsDeVentana & { nodos: NodoDeFibra[] }) {
  const [claveNodo, setClaveNodo] = useState<string | null>(null)
  // Sin elegir, el primero: casi siempre hay un solo nodo.
  const nodo = nodos.find((n) => n.clave === claveNodo) ?? nodos[0] ?? null
  const v = useVentana(
    onOpenChange,
    nodo ? `Elige el nodo y pulsa «Generar reporte».` : "No hay nodos de fibra cargados en el mapa.",
  )

  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={Cable}
      titulo="Reporte gráfico de ocupación de cables de fibra en el nodo"
      descripcion={nodo ? `Nodo ${nodo.nombre}` : "Elige un nodo de fibra."}
      ancho="56rem"
      barra={v.barra}
      pie={<BarraDeAvance texto="Ocupación cables" />}
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <label className="flex min-w-56 flex-1 flex-col gap-1 sm:max-w-80">
          <Rotulo>Nodo de fibra (SDS)</Rotulo>
          <select
            aria-label="Nodo de fibra (SDS)"
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
        </label>
        <Boton
          icono={FileBarChart}
          principal
          deshabilitado={!nodo}
          onClick={() => v.pendiente("Generar reporte")}
        >
          Generar reporte
        </Boton>
        <span className="hidden flex-1 sm:block" />
        <BotonExportar onClick={() => v.avisar("No hay datos para exportar.")} />
      </div>

      <Grupo titulo="Ocupación de cables">
        <Grilla
          etiqueta="Ocupación de cables"
          columnas={COLUMNAS_CABLES}
          alto="h-[min(22rem,46vh)]"
        />
      </Grupo>
    </MarcoDePlanta>
  )
}
