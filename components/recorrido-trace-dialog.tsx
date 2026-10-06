"use client"

import { useImperativeHandle, useState, type Ref } from "react"
import { Activity, ArrowDown, ArrowUp } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  BarraDeEstado,
  Boton,
  Campo,
  EncabezadoVentana,
  PENDIENTE,
  type ManejadorDeVentana,
  type Mensaje,
} from "@/components/ventana-sig"
import type { AccesoAlMapa } from "@/components/network-map"

/**
 * «Recorrido del trace» (ribbon: Red de fibra → Trace): una ventana pequeña con
 * dos botones, hacia arriba y hacia abajo. Cada uno llamará a la función de la
 * base que devuelve el recorrido para mostrarlo y pintarlo en el mapa, con su
 * longitud; mientras esa función no llegue, lo dicen al pulsarlos.
 *
 * No oscurece el fondo ni bloquea el mapa (`modal` en falso): lo que se
 * pinta tiene que verse, y un click en el mapa no la cierra. Esc sí.
 */
export function RecorridoTraceDialog({ ref, mapa }: { ref?: Ref<ManejadorDeVentana>; mapa: AccesoAlMapa }) {
  const [abierta, setAbierta] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  useImperativeHandle(
    ref,
    () => ({
      abrir: () => {
        // Una elección en el mapa que siguiera esperando ya no vale.
        mapa.api.current?.abandonarEleccion()
        setAbierta(true)
      },
    }),
    [mapa.api],
  )

  const barra: Mensaje = mensaje ?? { texto: "Elige hacia dónde recorrer el trace.", tono: "info" }

  return (
    <Dialog
      open={abierta}
      onOpenChange={(abierto) => {
        setAbierta(abierto)
        if (!abierto) setMensaje(null)
      }}
      modal={false}
      disablePointerDismissal
    >
      {/* Abajo y al centro, sobre el mapa: ahí no tapa la barra de
          herramientas, el panel del elemento ni la leyenda. */}
      <DialogContent
        sinFondo
        className="left-1/2 top-auto bottom-28 flex w-[min(22rem,calc(100vw-1.5rem))] max-w-none -translate-x-1/2 translate-y-0 flex-col overflow-hidden p-0 data-[starting-style]:translate-y-2"
      >
        <EncabezadoVentana
          icono={Activity}
          titulo="Recorrido del trace"
          descripcion="Se muestra y se pinta en el mapa."
        />
        <div className="flex flex-col gap-3 bg-muted/20 p-4">
          <div className="flex items-center justify-end gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">Longitud</span>
            <Campo etiqueta="Longitud del recorrido" valor={null} guia="—" ancho="w-28" chico />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Boton pendiente icono={ArrowUp} onClick={() => setMensaje({ texto: PENDIENTE("Hacia arriba"), tono: "info" })}>
              Hacia arriba
            </Boton>
            <Boton pendiente icono={ArrowDown} derecha onClick={() => setMensaje({ texto: PENDIENTE("Hacia abajo"), tono: "info" })}>
              Hacia abajo
            </Boton>
          </div>
        </div>
        <BarraDeEstado mensaje={barra} />
      </DialogContent>
    </Dialog>
  )
}
