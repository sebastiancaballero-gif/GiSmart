"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { LAYER_COLORS } from "@/lib/network-colors"
import {
  CABLE_CONSULTADO_COLOR,
  EXTREMO_COLORS,
  FUNCION_CUB_COLORS,
  FUNCION_CUB_DEFAULT_COLOR,
  SENTIDO_COLORS,
} from "@/lib/map/symbology"
import { CabeceraSymbol, FiberSymbol, MufaSymbol } from "@/components/map-symbols"

/**
 * Leyenda plegable del mapa, abajo a la derecha.
 *
 * Usa los mismos símbolos que se dibujan sobre el mapa (los de `map-symbols`,
 * simbología SIGETP), no unos parecidos: si se dibujaran aparte, leyenda y mapa
 * podrían dejar de coincidir sin que nadie lo note.
 *
 * Se pliega porque en pantallas chicas tapaba una esquina útil del mapa. Como
 * abierto o cerrado no le importa a nadie más, ese estado se queda aquí.
 *
 * `sentido` y `extremos` agregan los colores de «Entradas y salidas» y de
 * «Cable» mientras esas herramientas están activas: son los únicos momentos en
 * que aparecen en el mapa.
 */
export function MapLegend({ sentido = false, extremos = false }: { sentido?: boolean; extremos?: boolean }) {
  const [abierta, setAbierta] = useState(true)

  return (
    <div className="absolute bottom-3 right-3 z-10 overflow-hidden rounded-lg bg-card/90 text-xs font-medium text-foreground shadow-md ring-1 ring-border backdrop-blur">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ChevronDown className={`size-3 transition-transform ${abierta ? "" : "-rotate-90"}`} />
        Leyenda
      </button>

      {abierta && (
        <div className="flex flex-col gap-1 border-t border-border px-2.5 pb-2 pt-1.5">
          <span className="flex items-center gap-2">
            <CabeceraSymbol size={14} />
            Cabecera central
          </span>

          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cubiertas de empalme
          </span>
          {Object.entries(FUNCION_CUB_COLORS).map(([label, color]) => (
            <span key={label} className="flex items-center gap-2">
              <MufaSymbol color={color} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-2">
            <MufaSymbol color={FUNCION_CUB_DEFAULT_COLOR} />
            Otro / sin dato
          </span>

          <span className="mt-0.5 flex items-center gap-2">
            <FiberSymbol color={LAYER_COLORS.fiber} size={14} />
            Fibra óptica
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            El grosor refleja la cantidad de hilos
          </span>

          {sentido && (
            <>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cables de la cubierta
              </span>
              <span className="flex items-center gap-2">
                <FiberSymbol color={SENTIDO_COLORS.entrada} width={4} size={14} />
                Entrada
              </span>
              <span className="flex items-center gap-2">
                <FiberSymbol color={SENTIDO_COLORS.salida} width={4} size={14} />
                Salida
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                Según la función de cables de la base
              </span>
            </>
          )}

          {extremos && (
            <>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cable consultado
              </span>
              <span className="flex items-center gap-2">
                <FiberSymbol color={CABLE_CONSULTADO_COLOR} width={4} size={14} />
                Cable
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="size-3.5 shrink-0 rounded-full border-[3px]"
                  style={{ borderColor: EXTREMO_COLORS.entrada }}
                  aria-hidden="true"
                />
                Entrada (cubierta padre)
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="size-3.5 shrink-0 rounded-full border-[3px]"
                  style={{ borderColor: EXTREMO_COLORS.salida }}
                  aria-hidden="true"
                />
                Salida (cubierta hija)
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
