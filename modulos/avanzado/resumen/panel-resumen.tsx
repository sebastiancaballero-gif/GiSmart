"use client"

import { useEffect, useState } from "react"
import { Box, Building2, Hexagon, PieChart, Spline, X } from "lucide-react"
import type { MapaApi } from "@/components/network-map"
import { LAYER_COLORS } from "@/lib/network-colors"
import { resumirEnPantalla, type FilaDeResumen, type ResumenEnPantalla } from "./resumen"

const km = (valor: number) => valor.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Barras de una categoría: el largo es relativo a la mayor del grupo. */
function Barras({ filas, medida }: { filas: FilaDeResumen[]; medida: "cantidad" | "km" }) {
  const valor = (f: FilaDeResumen) => (medida === "km" ? (f.km ?? 0) : f.cantidad)
  const mayor = Math.max(...filas.map(valor), 0) || 1
  return (
    <ul className="mt-2 space-y-1.5">
      {filas.map((f) => (
        <li key={f.etiqueta} className="text-[11px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-foreground">{f.etiqueta}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {medida === "km" ? `${km(f.km ?? 0)} km · ${f.cantidad}` : f.cantidad}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.max(3, (valor(f) / mayor) * 100)}%`, backgroundColor: f.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Tarjeta({
  icono: Icono,
  color,
  titulo,
  cifra,
  detalle,
  children,
}: {
  icono: typeof Box
  color: string
  titulo: string
  cifra: string
  detalle?: string
  children?: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icono className="size-3.5" style={{ color }} aria-hidden="true" />
        {titulo}
      </div>
      <p className="mt-1 text-xl font-bold leading-none tracking-tight text-foreground tabular-nums">
        {cifra}
        {detalle && <span className="ml-1.5 text-xs font-medium text-muted-foreground">{detalle}</span>}
      </p>
      {children}
    </section>
  )
}

/**
 * Resumen de lo que se ve en pantalla (las «infografías» de RustGIS): se
 * rehace solo cada vez que se mueve el mapa, se filtra o se enciende una capa.
 */
export function PanelResumen({
  mapa,
  onCerrar,
  espacioAbajo = 0,
}: {
  mapa: { current: MapaApi | null }
  onCerrar: () => void
  /** Lo que ocupa la tabla de atributos debajo del mapa, en píxeles: el panel no baja más. */
  espacioAbajo?: number
}) {
  const [resumen, setResumen] = useState<ResumenEnPantalla | null>(null)

  useEffect(() => {
    const api = mapa.current
    if (!api) return
    let pendiente: ReturnType<typeof setTimeout> | null = null
    const rehacer = () => {
      const { extension, elementos } = api.elementosDelMapa({ soloEnVista: true })
      setResumen(resumirEnPantalla(elementos, extension))
    }
    // Mientras se arrastra o se acerca llegan muchos avisos: se rehace una vez al final.
    const avisar = () => {
      if (pendiente) clearTimeout(pendiente)
      pendiente = setTimeout(rehacer, 200)
    }
    rehacer()
    const dejar = api.alCambiarLaVista(avisar)
    return () => {
      dejar()
      if (pendiente) clearTimeout(pendiente)
    }
  }, [mapa])

  const vacio =
    resumen && resumen.cubiertas.total + resumen.cables.total + resumen.cabeceras.total + resumen.zonas === 0

  return (
    <aside
      data-tapa-mapa
      aria-label="Resumen de lo que se ve en pantalla"
      // A la altura de la ficha de la derecha (6,5rem): arriba al centro quedan
      // los avisos del mapa, que el panel tapaba («Click sobre un elemento…»).
      style={{ maxHeight: `calc(100% - 13.5rem - ${espacioAbajo}px)` }}
      className="absolute left-[4.5rem] top-[6.5rem] z-20 flex w-72 flex-col overflow-hidden rounded-xl bg-card/95 shadow-xl ring-1 ring-border backdrop-blur gismart-desde-izquierda max-sm:inset-x-3 max-sm:bottom-3 max-sm:left-3 max-sm:top-auto max-sm:max-h-[55%] max-sm:w-auto"
    >
      <div className="flex items-start gap-2 border-b border-border px-3.5 py-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PieChart className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">En pantalla</h2>
          <p className="text-[11px] text-muted-foreground">Se actualiza al mover el mapa</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el resumen"
          className="-mr-1 rounded-md p-1 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {!resumen ? (
          <p className="text-xs text-muted-foreground">Calculando…</p>
        ) : vacio ? (
          <p className="rounded-lg bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
            No hay elementos de la red en esta parte del mapa.
          </p>
        ) : (
          <>
            {resumen.cubiertas.total > 0 && (
              <Tarjeta
                icono={Box}
                color={LAYER_COLORS.node}
                titulo="Cubiertas"
                cifra={String(resumen.cubiertas.total)}
              >
                <Barras filas={resumen.cubiertas.porNivel} medida="cantidad" />
              </Tarjeta>
            )}
            {resumen.cables.total > 0 && (
              <Tarjeta
                icono={Spline}
                color={LAYER_COLORS.fiber}
                titulo="Tendido de fibra"
                cifra={`${km(resumen.cables.km)} km`}
                detalle={`${resumen.cables.total} ${resumen.cables.total === 1 ? "cable" : "cables"}`}
              >
                <Barras filas={resumen.cables.porCapacidad} medida="km" />
              </Tarjeta>
            )}
            {resumen.cabeceras.total > 0 && (
              <Tarjeta
                icono={Building2}
                color={LAYER_COLORS.cabecera}
                titulo="Cabeceras"
                cifra={String(resumen.cabeceras.total)}
                detalle={resumen.cabeceras.nombres.join(", ")}
              />
            )}
            {resumen.zonas > 0 && (
              <Tarjeta icono={Hexagon} color={LAYER_COLORS.zone} titulo="Zonas" cifra={String(resumen.zonas)} />
            )}
          </>
        )}
        {resumen && resumen.ocultos > 0 && (
          <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
            {resumen.ocultos} {resumen.ocultos === 1 ? "elemento no se cuenta" : "elementos no se cuentan"}: su capa
            está apagada o el filtro del panel de capas los oculta.
          </p>
        )}
      </div>
    </aside>
  )
}
