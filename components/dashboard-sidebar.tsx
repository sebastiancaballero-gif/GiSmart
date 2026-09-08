"use client"

import { useState } from "react"
import { Eye, EyeOff, Ruler, ChevronLeft, ChevronRight, Layers, X, Crosshair } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { GismartMark } from "@/components/gismart-mark"
import { CabeceraSymbol, FiberSymbol, MufaSymbol, ZonaSymbol } from "@/components/map-symbols"

type LayerDef = {
  id: string
  label: string
  color: string
  count: number
  visible: boolean
  /** Desglose por categoría (p. ej. mufas por nivel), si la capa lo tiene. */
  items?: { label: string; count: number; color: string; width?: number }[]
  /** Categorías marcadas para ver solo esas en el mapa. */
  activeItems?: string[]
  /** Qué símbolo del mapa representa esta capa. */
  symbol?: "cabecera" | "mufa" | "fibra" | "zona"
}

/**
 * Dibuja el mismo símbolo que el mapa. El panel usaba puntos de color, así que
 * no se parecía a lo que se ve sobre la cartografía ni a la leyenda.
 */
function SimboloDeCapa({
  symbol,
  color,
  width,
  size = 16,
}: {
  symbol: LayerDef["symbol"]
  color: string
  width?: number
  size?: number
}) {
  if (symbol === "cabecera") return <CabeceraSymbol size={size} />
  if (symbol === "mufa") return <MufaSymbol color={color} size={size} />
  if (symbol === "fibra") return <FiberSymbol color={color} width={width} size={size} />
  if (symbol === "zona") return <ZonaSymbol color={color} size={size} />
  return (
    <span
      className="size-3.5 shrink-0 rounded-full shadow-sm ring-2 ring-white"
      style={{ backgroundColor: color }}
    />
  )
}

type DashboardSidebarProps = {
  layers: LayerDef[]
  onToggleLayer: (id: string) => void
  /** Marca o desmarca una categoría del desglose para filtrar el mapa. */
  onToggleItem?: (layerId: string, item: string) => void
  /** Quita el filtro de categorías de una capa. */
  onClearItems?: (layerId: string) => void
  /** Encuadra el mapa sobre los elementos de esa capa. */
  onZoomLayer?: (layerId: string) => void
  totalKm: number
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** Mientras los endpoints responden se muestran marcadores en vez de ceros. */
  loading?: boolean
}

export function DashboardSidebar({
  layers,
  onToggleLayer,
  onToggleItem,
  onClearItems,
  onZoomLayer,
  totalKm,
  collapsed = false,
  onToggleCollapse,
  loading = false,
}: DashboardSidebarProps) {
  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-12 items-center py-3" : "w-64"
      }`}
    >
      {collapsed ? (
        <>
          <button
            onClick={onToggleCollapse}
            className="mb-3 rounded-lg p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            title="Expandir panel de capas"
            aria-label="Expandir panel de capas"
          >
            <ChevronRight className="size-5" />
          </button>
          {layers.map((l) => (
            <button
              key={l.id}
              onClick={() => onToggleLayer(l.id)}
              title={l.label}
              aria-label={l.label}
              aria-pressed={l.visible}
              className={`mb-1.5 rounded-lg p-1.5 outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${l.visible ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"}`}
            >
              <SimboloDeCapa symbol={l.symbol} color={l.color} size={18} />
            </button>
          ))}
        </>
      ) : (
        <SidebarExpandedContent
          layers={layers}
          onToggleLayer={onToggleLayer}
          onToggleItem={onToggleItem}
          onClearItems={onClearItems}
          onZoomLayer={onZoomLayer}
          totalKm={totalKm}
          onToggleCollapse={onToggleCollapse}
          loading={loading}
        />
      )}
    </aside>
  )
}

function SidebarExpandedContent({
  layers,
  onToggleLayer,
  onToggleItem,
  onClearItems,
  onZoomLayer,
  totalKm,
  onToggleCollapse,
  loading,
}: {
  layers: LayerDef[]
  onToggleLayer: (id: string) => void
  onToggleItem?: (layerId: string, item: string) => void
  onClearItems?: (layerId: string) => void
  onZoomLayer?: (layerId: string) => void
  totalKm: number
  onToggleCollapse?: () => void
  loading: boolean
}) {
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())

  function toggleExpandida(id: string) {
    setExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full w-64 flex-col animate-gismart-fade-in">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2.5">
          <GismartMark className="size-9 shrink-0 rounded-lg shadow-sm" />
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-foreground">GiSmart</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              SIG · Red FTTH
            </p>
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          title="Contraer panel"
          aria-label="Contraer panel"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {/* Capas */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Layers className="size-4 text-primary" />
          Capas de red
        </div>

        <div className="space-y-1">
          {layers.map((layer) => {
            // Solo tiene sentido desplegar si hay más de una categoría.
            const desglosable = !loading && (layer.items?.length ?? 0) > 1
            const abierta = expandidas.has(layer.id)

            return (
              <div key={layer.id}>
                <div className="flex items-center gap-1.5 rounded-lg pl-1 pr-2.5 py-2 transition hover:bg-accent">
                  <button
                    type="button"
                    onClick={() => desglosable && toggleExpandida(layer.id)}
                    disabled={!desglosable}
                    aria-expanded={desglosable ? abierta : undefined}
                    title={desglosable ? (abierta ? "Ocultar desglose" : "Ver desglose") : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
                  >
                    <ChevronRight
                      className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                        abierta ? "rotate-90" : ""
                      } ${desglosable ? "" : "invisible"}`}
                    />
                    <SimboloDeCapa symbol={layer.symbol} color={layer.color} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {layer.label}
                    </span>
                  </button>

                  {loading ? (
                    <span
                      className="h-5 w-8 animate-pulse rounded-md bg-muted"
                      aria-label="Cargando conteo"
                    />
                  ) : (
                    <Badge variant="secondary" className="tabular-nums">
                      {layer.count}
                    </Badge>
                  )}
                  {/* Encuadrar sobre la capa: útil para saltar a una capa con
                      pocos elementos, como las cabeceras, sin buscarla a mano. */}
                  {layer.count > 0 && (
                    <button
                      type="button"
                      onClick={() => onZoomLayer?.(layer.id)}
                      className="rounded-md p-1 text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                      title={`Encuadrar el mapa sobre ${layer.label}`}
                      aria-label={`Encuadrar el mapa sobre ${layer.label}`}
                    >
                      <Crosshair className="size-4" />
                    </button>
                  )}
                  <button
                    onClick={() => onToggleLayer(layer.id)}
                    className="rounded-md p-1 text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    title={layer.visible ? "Ocultar" : "Mostrar"}
                    aria-label={layer.visible ? `Ocultar ${layer.label}` : `Mostrar ${layer.label}`}
                  >
                    {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                </div>

                {desglosable && abierta && (
                  <ul className="mb-1 ml-[1.6rem] space-y-0.5 border-l border-border pl-2">
                    {layer.items?.map((item) => {
                      const activa = layer.activeItems?.includes(item.label) ?? false
                      // Sin ninguna marcada no hay filtro, así que todas están
                      // a la vista; con alguna marcada, el resto se atenúa.
                      const hayFiltro = (layer.activeItems?.length ?? 0) > 0
                      return (
                        <li key={item.label}>
                          <button
                            type="button"
                            onClick={() => onToggleItem?.(layer.id, item.label)}
                            aria-pressed={activa}
                            title={
                              activa
                                ? `Dejar de mostrar solo ${item.label}`
                                : `Mostrar solo ${item.label} en el mapa`
                            }
                            className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                              activa ? "bg-primary/10" : "hover:bg-accent"
                            } ${hayFiltro && !activa ? "opacity-45" : ""}`}
                          >
                            <SimboloDeCapa
                              symbol={layer.symbol}
                              color={item.color}
                              width={item.width}
                              size={14}
                            />
                            <span
                              className={`min-w-0 flex-1 truncate text-left ${
                                activa ? "font-semibold text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {item.label}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-foreground">
                              {item.count}
                            </span>
                          </button>
                        </li>
                      )
                    })}

                    {(layer.activeItems?.length ?? 0) > 0 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => onClearItems?.(layer.id)}
                          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <X className="size-3" />
                          Quitar filtro
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        {/* Stats */}
        <div className="mt-3 rounded-lg bg-secondary px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-secondary-foreground">
            <Ruler className="size-3.5 text-primary" />
            <span>Fibra total</span>
            {loading ? (
              <span className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" aria-label="Calculando" />
            ) : (
              <span className="ml-auto font-bold tabular-nums text-primary">
                {totalKm.toFixed(2)} km
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Footer info */}
      <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
        <p>Sistema de Información Geográfica</p>
      </div>
    </div>
  )
}