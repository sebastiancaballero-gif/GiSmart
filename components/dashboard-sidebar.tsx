"use client"

import { useState } from "react"
import { Eye, EyeOff, Ruler, ChevronLeft, ChevronRight, Layers, Crosshair, FilterX } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { GismartLogo } from "@/components/gismart-mark"
import { CabeceraSymbol, FiberSymbol, MufaSymbol, ZonaSymbol } from "@/components/map-symbols"
import { Tooltip } from "@/components/ui/tooltip"

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
  /** Kilómetros y cables que quedan a la vista con el filtro puesto. */
  enPantalla?: { fibers: number; km: number }
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
  enPantalla,
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
          <Tooltip label="Expandir panel de capas">
            <button
              onClick={onToggleCollapse}
              className="mb-3 rounded-lg p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Expandir panel de capas"
            >
              <ChevronRight className="size-5" />
            </button>
          </Tooltip>
          {layers.map((l) => (
            <Tooltip key={l.id} label={l.label}>
              <button
                onClick={() => onToggleLayer(l.id)}
                aria-label={l.label}
                aria-pressed={l.visible}
                className={`mb-1.5 rounded-lg p-1.5 outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${l.visible ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"}`}
              >
                <SimboloDeCapa symbol={l.symbol} color={l.color} size={18} />
              </button>
            </Tooltip>
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
          enPantalla={enPantalla}
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
  enPantalla,
  onToggleCollapse,
  loading,
}: {
  layers: LayerDef[]
  onToggleLayer: (id: string) => void
  onToggleItem?: (layerId: string, item: string) => void
  onClearItems?: (layerId: string) => void
  onZoomLayer?: (layerId: string) => void
  totalKm: number
  enPantalla?: { fibers: number; km: number }
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
        <div className="flex flex-col gap-1">
          <GismartLogo tamanoMarca="h-7" tamanoNombre="text-lg" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            SIG · Red FTTH
          </p>
        </div>
        <Tooltip label="Contraer panel">
          <button
            onClick={onToggleCollapse}
            className="rounded-lg p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Contraer panel"
          >
            <ChevronLeft className="size-4" />
          </button>
        </Tooltip>
      </div>

      {/* Capas */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Layers className="size-3.5 text-primary" />
          Capas de red
        </div>

        <div className="space-y-1">
          {layers.map((layer) => {
            // Solo tiene sentido desplegar si hay más de una categoría.
            const desglosable = !loading && (layer.items?.length ?? 0) > 1
            const abierta = expandidas.has(layer.id)

            // Cuántos elementos deja ver el filtro. Se calcula aquí sumando las
            // categorías marcadas, sin pedirle nada al mapa.
            const filtrada = (layer.activeItems?.length ?? 0) > 0
            const visibles = filtrada
              ? (layer.items ?? [])
                  .filter((i) => layer.activeItems?.includes(i.label))
                  .reduce((total, i) => total + i.count, 0)
              : layer.count

            return (
              <div key={layer.id}>
                {/* La capa apagada se atenúa entera. Antes solo cambiaba el
                    icono del ojo, y con cuatro capas costaba ver cuál estaba
                    fuera del mapa. */}
                <div
                  className={`flex items-center gap-1.5 rounded-lg pl-1 pr-2.5 py-2 transition hover:bg-accent ${
                    layer.visible ? "" : "opacity-45"
                  }`}
                >
                  <Tooltip label={desglosable ? (abierta ? "Ocultar desglose" : "Ver desglose") : undefined}>
                  <button
                    type="button"
                    onClick={() => desglosable && toggleExpandida(layer.id)}
                    disabled={!desglosable}
                    aria-expanded={desglosable ? abierta : undefined}
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
                  </Tooltip>

                  {loading ? (
                    <span
                      className="h-5 w-8 animate-pulse rounded-md bg-muted"
                      aria-label="Cargando conteo"
                    />
                  ) : (
                    // Con filtro puesto se muestran las dos cifras. Antes decía
                    // «185» mientras el mapa enseñaba 21, y con el desglose
                    // plegado no había forma de notar que había un filtro.
                    <Badge variant={filtrada ? "default" : "secondary"} className="tabular-nums">
                      {filtrada ? (
                        <>
                          {visibles}
                          <span className="opacity-60">/{layer.count}</span>
                        </>
                      ) : (
                        layer.count
                      )}
                    </Badge>
                  )}

                  {/* Quitar el filtro sin tener que desplegar el desglose. */}
                  {filtrada && (
                    <Tooltip label={`Quitar el filtro de ${layer.label}`}>
                      <button
                        type="button"
                        onClick={() => onClearItems?.(layer.id)}
                        className="rounded-md p-1 text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={`Quitar el filtro de ${layer.label}`}
                      >
                        <FilterX className="size-4" />
                      </button>
                    </Tooltip>
                  )}
                  {/* Encuadrar sobre la capa: útil para saltar a una capa con
                      pocos elementos, como las cabeceras, sin buscarla a mano. */}
                  {layer.count > 0 && (
                    <Tooltip label={`Encuadrar el mapa sobre ${layer.label}`}>
                      <button
                        type="button"
                        onClick={() => onZoomLayer?.(layer.id)}
                        className="rounded-md p-1 text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={`Encuadrar el mapa sobre ${layer.label}`}
                      >
                        <Crosshair className="size-4" />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip label={layer.visible ? `Ocultar ${layer.label}` : `Mostrar ${layer.label}`}>
                    <button
                      onClick={() => onToggleLayer(layer.id)}
                      className="rounded-md p-1 text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                      aria-label={layer.visible ? `Ocultar ${layer.label}` : `Mostrar ${layer.label}`}
                    >
                      {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </button>
                  </Tooltip>
                </div>

                {desglosable && abierta && (
                  <ul className="mb-1 ml-[1.6rem] space-y-0.5 border-l border-border pl-2">
                    {layer.items?.map((item) => {
                      const activa = layer.activeItems?.includes(item.label) ?? false
                      // Sin ninguna marcada no hay filtro, así que todas están
                      // a la vista; con alguna marcada, el resto se atenúa.
                      const hayFiltro = (layer.activeItems?.length ?? 0) > 0
                      // Qué parte de la capa es esta categoría. Con 162 mufas
                      // de segundo nivel frente a 21 y 2, los números sueltos
                      // obligaban a hacer la cuenta mentalmente.
                      const proporcion = layer.count > 0 ? item.count / layer.count : 0
                      return (
                        <li key={item.label}>
                          <Tooltip
                            label={
                              activa
                                ? `Dejar de mostrar solo ${item.label}`
                                : `Mostrar solo ${item.label} en el mapa`
                            }
                          >
                          <button
                            type="button"
                            onClick={() => onToggleItem?.(layer.id, item.label)}
                            aria-pressed={activa}
                            className={`flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                              activa ? "bg-primary/10" : "hover:bg-accent"
                            } ${hayFiltro && !activa ? "opacity-45" : ""}`}
                          >
                            <SimboloDeCapa
                              symbol={layer.symbol}
                              color={item.color}
                              width={item.width}
                              size={14}
                            />
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span
                                className={`truncate text-left ${
                                  activa ? "font-semibold text-foreground" : "text-muted-foreground"
                                }`}
                              >
                                {item.label}
                              </span>
                              {/* Barra de proporción sobre el total de la capa.
                                  Es decorativa: el dato exacto está en el número
                                  de al lado, por eso queda oculta al lector de
                                  pantalla. */}
                              <span
                                aria-hidden="true"
                                className="h-1 w-full overflow-hidden rounded-full bg-border"
                              >
                                <span
                                  className="block h-full rounded-full transition-[width] duration-300"
                                  style={{
                                    width: `${Math.max(proporcion * 100, 2)}%`,
                                    backgroundColor: item.color,
                                  }}
                                />
                              </span>
                            </span>
                            <span className="shrink-0 self-start font-semibold tabular-nums text-foreground">
                              {item.count}
                            </span>
                          </button>
                          </Tooltip>
                        </li>
                      )
                    })}

                    {/* El botón de quitar el filtro que había aquí se movió a
                        la fila de la capa: allí se ve también con el desglose
                        plegado, y tenerlo en dos sitios era repetirse. */}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        {/* Fibra total: el dato que resume la red, así que se lee grande. */}
        <div className="mt-4 rounded-xl bg-gradient-to-br from-primary/12 to-primary/5 px-3.5 py-3 ring-1 ring-primary/15">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Ruler className="size-3.5 text-primary" />
            Fibra total
          </div>
          {loading ? (
            <span className="mt-1.5 block h-7 w-28 animate-pulse rounded bg-muted" aria-label="Calculando" />
          ) : (
            <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {totalKm.toFixed(2)}
              <span className="ml-1 text-sm font-semibold text-muted-foreground">km</span>
            </p>
          )}

          {/* Con un filtro puesto, «Fibra total» sigue siendo la red entera y
              no lo que se ve. Esta línea aparece solo cuando difieren, para
              poder saber cuánto es lo que está en pantalla. */}
          {!loading && enPantalla && enPantalla.fibers > 0 && enPantalla.km < totalKm - 0.005 && (
            <div className="mt-1.5 flex items-center gap-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
              <span>En pantalla</span>
              <span className="ml-auto tabular-nums">
                <span className="font-semibold text-foreground">{enPantalla.km.toFixed(2)} km</span>
                {" · "}
                {enPantalla.fibers} {enPantalla.fibers === 1 ? "cable" : "cables"}
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Footer info */}
      <div className="border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        <p>Sistema de Información Geográfica</p>
        <p className="font-semibold text-foreground/70">G&amp;G Technology SAS</p>
      </div>
    </div>
  )
}