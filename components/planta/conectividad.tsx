"use client"

import { Cable, CableCar, HardDrive } from "lucide-react"
import { Grilla, Grupo, type Columna } from "@/components/ventana-sig"
import {
  ControlDeCambio,
  MarcoDePlanta,
  PanelDeCambio,
  SeleccionDeEquipo,
  useVentana,
  type PropsDeVentana,
} from "@/components/planta/piezas"

/**
 * Las tres ventanas de conectividad de planta interna (ribbon: Red de fibra →
 * OLT-ODF, ODF-ODF y ODF-Cables), como las del SIG anterior: arriba se elige
 * el equipo, en medio la grilla de puertos conectados y abajo el recuadro para
 * cambiar la conexión de un puerto, apagado hasta elegir una fila.
 *
 * Solo la vista. Las columnas son las del SIG anterior y se ajustan a lo que
 * devuelvan las funciones de la base cuando existan.
 */

const COLUMNAS_OLT_ODF: Columna[] = [
  { titulo: "Rack OLT", ancho: "min-w-32" },
  { titulo: "OLT", ancho: "min-w-20" },
  { titulo: "Tarjeta", ancho: "min-w-16" },
  { titulo: "Puerto", ancho: "min-w-16" },
  { titulo: "Rack ODF", ancho: "min-w-32" },
  { titulo: "ODF", ancho: "min-w-20" },
  { titulo: "Puerto", ancho: "min-w-16" },
]

/** «Conectividad de puertos entre OLT y ODF». */
export function VentanaOltOdf({ open, onOpenChange }: PropsDeVentana) {
  const v = useVentana(onOpenChange, "Elige con el pin el rack y el ODF para ver qué puertos de la OLT llegan a él.")
  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={HardDrive}
      titulo="Conectividad de puertos entre OLT y ODF"
      descripcion="Qué puerto de cada tarjeta de la OLT llega a qué puerto del ODF."
      barra={v.barra}
    >
      <SeleccionDeEquipo
        campos={["Rack", "ODF"]}
        elegir="Elegir el rack y el ODF"
        onElegir={() => v.pendiente("Elegir el rack y el ODF")}
        onExportar={() => v.avisar("No hay datos para exportar.")}
      />
      <Grupo titulo="Conectividad de puertos OLT-ODF">
        <Grilla
          etiqueta="Conectividad de puertos OLT-ODF"
          columnas={COLUMNAS_OLT_ODF}
        />
      </Grupo>
      <PanelDeCambio titulo="Modificación individual de conectividad" onPendiente={v.pendiente}>
        <ControlDeCambio etiqueta="Tarjeta padre" tipo="lista" />
        <ControlDeCambio etiqueta="Puerto padre" tipo="lista" />
        <ControlDeCambio etiqueta="Puerto ODF hijo" tipo="lista" />
      </PanelDeCambio>
    </MarcoDePlanta>
  )
}

// En el SIG anterior la grilla repetía «Rack», «ODF» y «Puerto» para los dos
// lados de la conexión; aquí cada uno dice de qué lado es.
const COLUMNAS_ODF_ODF: Columna[] = [
  { titulo: "Cable desde", ancho: "min-w-32" },
  { titulo: "Hilo desde", ancho: "min-w-20" },
  { titulo: "Rack desde", ancho: "min-w-28" },
  { titulo: "ODF desde", ancho: "min-w-20" },
  { titulo: "Puerto desde", ancho: "min-w-20" },
  { titulo: "Rack hacia", ancho: "min-w-28" },
  { titulo: "ODF hacia", ancho: "min-w-20" },
  { titulo: "Puerto hacia", ancho: "min-w-20" },
  { titulo: "Hilo hacia", ancho: "min-w-20" },
  { titulo: "Cable hacia", ancho: "min-w-32" },
]

/** «Gestión alfanumérica de conectividad de puertos de ODF». */
export function VentanaOdfOdf({ open, onOpenChange }: PropsDeVentana) {
  const v = useVentana(onOpenChange, "Elige con el pin el rack de origen y el de destino para ver cómo se conectan sus ODF.")
  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={CableCar}
      titulo="Gestión alfanumérica de conectividad de puertos de ODF"
      descripcion="Puertos de un ODF conectados a los de otro, con el cable y el hilo de cada lado."
      ancho="58rem"
      barra={v.barra}
    >
      <SeleccionDeEquipo
        campos={["Desde rack", "Hacia rack"]}
        elegir="Elegir los racks"
        onElegir={() => v.pendiente("Elegir los racks")}
        onExportar={() => v.avisar("No hay datos para exportar.")}
      />
      <Grupo titulo="Conectividad entre puertos ODF">
        <Grilla
          etiqueta="Conectividad entre puertos ODF"
          columnas={COLUMNAS_ODF_ODF}
        />
      </Grupo>
      {/* Dos columnas como en el SIG anterior: a la izquierda cable y ODF, a la
          derecha hilo y puerto, cada fila de un lado de la conexión. */}
      <PanelDeCambio titulo="Modificación de conectividad de puerto" onPendiente={v.pendiente} guardar={false} columnas={2}>
        <ControlDeCambio etiqueta="Cable desde" tipo="dato" ancho="w-full" />
        <ControlDeCambio etiqueta="Hilo desde" tipo="dato" />
        <ControlDeCambio etiqueta="ODF padre" tipo="dato" />
        <ControlDeCambio etiqueta="Puerto padre" tipo="lista" />
        <ControlDeCambio etiqueta="ODF hijo" tipo="dato" />
        <ControlDeCambio etiqueta="Puerto hijo" tipo="lista" />
        <ControlDeCambio etiqueta="Cable hacia" tipo="dato" ancho="w-full" />
        <ControlDeCambio etiqueta="Hilo hacia" tipo="dato" />
      </PanelDeCambio>
    </MarcoDePlanta>
  )
}

const COLUMNAS_ODF_CABLES: Columna[] = [
  { titulo: "Rack ODF", ancho: "min-w-32" },
  { titulo: "ODF", ancho: "min-w-20" },
  { titulo: "Puerto", ancho: "min-w-16" },
  { titulo: "Cód. cable", ancho: "min-w-48" },
  { titulo: "Hilo", ancho: "min-w-16" },
]

/** «Conectividad de puertos entre ODF y cables de salida». */
export function VentanaOdfCables({ open, onOpenChange }: PropsDeVentana) {
  const v = useVentana(onOpenChange, "Elige con el pin el rack y el ODF para ver qué cable y qué hilo salen de cada puerto.")
  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={Cable}
      titulo="Conectividad de puertos entre ODF y cables de salida"
      descripcion="Qué cable y qué hilo salen de cada puerto del ODF."
      ancho="48rem"
      barra={v.barra}
    >
      <SeleccionDeEquipo
        campos={["Rack", "ODF"]}
        elegir="Elegir el rack y el ODF"
        onElegir={() => v.pendiente("Elegir el rack y el ODF")}
        onExportar={() => v.avisar("No hay datos para exportar.")}
      />
      <Grupo titulo="Conectividad de puertos ODF">
        <Grilla
          etiqueta="Conectividad de puertos ODF"
          columnas={COLUMNAS_ODF_CABLES}
        />
      </Grupo>
      <PanelDeCambio titulo="Modificación de conectividad de puerto" onPendiente={v.pendiente}>
        <ControlDeCambio etiqueta="Puerto" tipo="lista" />
        <ControlDeCambio etiqueta="Cable" tipo="lista" ancho="w-40" />
        <ControlDeCambio etiqueta="Hilo" tipo="lista" />
      </PanelDeCambio>
    </MarcoDePlanta>
  )
}
