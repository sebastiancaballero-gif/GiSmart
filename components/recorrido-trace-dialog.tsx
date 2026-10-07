"use client"

import { useImperativeHandle, useState, type Ref } from "react"
import { Activity, ArrowDown, ArrowUp, Clock, Ruler } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  BarraDeEstado,
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
        className="left-1/2 top-auto bottom-28 flex w-[min(22rem,calc(100vw-1.5rem))] max-w-none -translate-x-1/2 translate-y-0 flex-col overflow-hidden p-0 shadow-2xl data-[starting-style]:translate-y-2"
      >
        <EncabezadoVentana
          icono={Activity}
          titulo="Recorrido del trace"
          descripcion="Se muestra y se pinta en el mapa."
        />
        <div className="flex flex-col gap-3 bg-muted/20 p-4">
          <div className="grid grid-cols-2 gap-2">
            <BotonDeSentido
              sentido="arriba"
              onClick={() => setMensaje({ texto: PENDIENTE("Hacia arriba"), tono: "info" })}
            />
            <BotonDeSentido
              sentido="abajo"
              onClick={() => setMensaje({ texto: PENDIENTE("Hacia abajo"), tono: "info" })}
            />
          </div>

          {/* El resultado, con el mismo aire que «Fibra total» en el panel. */}
          <div className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary/12 to-primary/5 px-3 py-2 ring-1 ring-primary/15">
            <Ruler className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Longitud</span>
            <output aria-label="Longitud del recorrido" className="ml-auto flex items-baseline gap-1 tabular-nums">
              <span className="text-lg font-bold leading-none tracking-tight text-muted-foreground/50">—</span>
              <span className="text-xs font-semibold text-muted-foreground">m</span>
            </output>
          </div>
        </div>
        <BarraDeEstado mensaje={barra} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Uno de los dos sentidos: un botón con su flecha, que se asoma hacia
 * ese lado al pasar el mouse. Mientras falte la función lo dice debajo.
 */
function BotonDeSentido({ sentido, onClick }: { sentido: "arriba" | "abajo"; onClick: () => void }) {
  const Flecha = sentido === "arriba" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled
      title="Próximamente: todavía no tiene su función en la base"
      className="group flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left shadow-sm outline-none transition hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 transition-colors group-hover:ring-primary/40">
        <Flecha
          className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${
            sentido === "arriba" ? "group-hover:-translate-y-px" : "group-hover:translate-y-px"
          }`}
          aria-hidden="true"
        />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-xs font-semibold text-foreground">{sentido === "arriba" ? "Hacia arriba" : "Hacia abajo"}</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="size-2.5 shrink-0" aria-hidden="true" />
          Próximamente
        </span>
      </span>
    </button>
  )
}
