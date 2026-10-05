"use client"

import { useImperativeHandle, useMemo, useState, type Ref } from "react"
import type { AccesoAlMapa } from "@/components/network-map"
import { nodosDeFibra } from "@/lib/map/red-de-fibra"
import { VentanaOdfCables, VentanaOdfOdf, VentanaOltOdf } from "@/components/planta/conectividad"
import { VentanaInventario } from "@/components/planta/inventario"
import { VentanaOcupacionCables, VentanaOcupacionOdf, VentanaOcupacionOlt } from "@/components/planta/ocupacion"
import { VentanaPuertosDeEquipos } from "@/components/planta/puertos-equipos"

/**
 * Ventanas de planta interna y externa del ribbon «Red de fibra», tomadas de
 * las pantallas del SIG anterior que mandaron en «Conectividad Fina.pptx»:
 *
 * | Botón        | Ventana                                                   |
 * | ------------ | --------------------------------------------------------- |
 * | Puertos OLT  | Gestión de puertos de equipos                              |
 * | Inventario   | Reporte de inventario de red de fibra óptica               |
 * | OLT-ODF      | Conectividad de puertos entre OLT y ODF                    |
 * | ODF-ODF      | Gestión alfanumérica de conectividad de puertos de ODF     |
 * | ODF-Cables   | Conectividad de puertos entre ODF y cables de salida       |
 * | Ocup. OLT    | Reporte de ocupación de OLT                                |
 * | Ocup. ODF    | Reporte de ocupación de ODF                                |
 * | Ocup. cables | Reporte gráfico de ocupación de cables de fibra en el nodo |
 *
 * Por ahora son solo la vista: botones, grillas y pestañas. Lo que consulta o
 * guarda espera sus funciones en la base y lo dice al pulsarlo.
 */

export type VentanaDePlanta =
  | "puertosEquipos"
  | "inventario"
  | "oltOdf"
  | "odfOdf"
  | "odfCables"
  | "ocupacionOlt"
  | "ocupacionOdf"
  | "ocupacionCables"

/** Lo que el tablero puede hacer con estas ventanas: abrir una. */
export type ManejadorDeVentanasDePlanta = { abrir: (ventana: VentanaDePlanta) => void }

export function VentanasDePlanta({ ref, mapa }: { ref?: Ref<ManejadorDeVentanasDePlanta>; mapa: AccesoAlMapa }) {
  const [abierta, setAbierta] = useState<VentanaDePlanta | null>(null)
  useImperativeHandle(
    ref,
    () => ({
      abrir: (ventana) => {
        // Una elección en el mapa que siguiera esperando ya no vale.
        mapa.api.current?.abandonarEleccion()
        setAbierta(ventana)
      },
    }),
    [mapa.api],
  )
  // Inventario y Ocup. cables eligen el nodo de las cabeceras del mapa.
  const nodos = useMemo(() => nodosDeFibra(mapa.indice), [mapa.indice])

  const props = (ventana: VentanaDePlanta) => ({
    open: abierta === ventana,
    onOpenChange: (abierto: boolean) => {
      if (!abierto) setAbierta(null)
    },
  })

  return (
    <>
      <VentanaPuertosDeEquipos {...props("puertosEquipos")} />
      <VentanaInventario {...props("inventario")} nodos={nodos} />
      <VentanaOltOdf {...props("oltOdf")} />
      <VentanaOdfOdf {...props("odfOdf")} />
      <VentanaOdfCables {...props("odfCables")} />
      <VentanaOcupacionOlt {...props("ocupacionOlt")} />
      <VentanaOcupacionOdf {...props("ocupacionOdf")} />
      <VentanaOcupacionCables {...props("ocupacionCables")} nodos={nodos} />
    </>
  )
}
