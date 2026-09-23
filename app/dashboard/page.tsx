"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { DashboardRibbon } from "@/components/dashboard-ribbon"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { NetworkMap } from "@/components/network-map"
import { AuthGuard } from "@/components/auth-guard"
import type { MapTool } from "@/lib/map/herramientas"
import type { NetworkStats } from "@/lib/map/capas"
import { LAYER_COLORS } from "@/lib/network-colors"
import { fetchConSesion } from "@/lib/auth"

export default function DashboardPage() {
  const [visible, setVisible] = useState({ nodes: true, fibers: true, zones: true, cabeceras: true })
  const [counts, setCounts] = useState({ nodes: 0, fibers: 0, zones: 0, cabeceras: 0 })
  const [totalKm, setTotalKm] = useState(0)
  // Lo que queda a la vista con el filtro por categoria puesto: sin esto, el
  // panel anunciaba los kilometros de toda la red mientras el mapa mostraba
  // solo una parte.
  const [enPantalla, setEnPantalla] = useState({ nodes: 0, fibers: 0, km: 0 })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [center, setCenter] = useState<{ lon: number; lat: number } | null>(null)
  const [location, setLocation] = useState("Ubicando…")
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; nonce: number } | null>(null)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [fitTo, setFitTo] = useState<{ capa: "todo" | "nodes" | "fibers" | "cabeceras" | "zones"; nonce: number } | null>(null)
  const [tool, setTool] = useState<MapTool>("pan")
  const [loadingData, setLoadingData] = useState(true)
  const [breakdown, setBreakdown] = useState<NetworkStats["breakdown"]>({ nodes: [], fibers: [] })
  // Categorías marcadas en el desglose. Vacío = sin filtro, se ve todo.
  const [filters, setFilters] = useState<{ nodes: string[]; fibers: string[] }>({
    nodes: [],
    fibers: [],
  })

  const claveDeCapa = (layerId: string): "nodes" | "fibers" | null =>
    layerId === "nodes" ? "nodes" : layerId === "fibers" ? "fibers" : null

  const handleToggleItem = useCallback((layerId: string, item: string) => {
    const clave = claveDeCapa(layerId)
    if (!clave) return
    setFilters((prev) => {
      const actuales = prev[clave]
      return {
        ...prev,
        [clave]: actuales.includes(item)
          ? actuales.filter((x) => x !== item)
          : [...actuales, item],
      }
    })
  }, [])

  // Encuadra el mapa sobre una capa concreta desde el panel lateral.
  const handleZoomLayer = useCallback((layerId: string) => {
    const capa = layerId as "nodes" | "fibers" | "cabeceras" | "zones"
    setFitTo({ capa, nonce: Date.now() })
  }, [])

  const handleClearItems = useCallback((layerId: string) => {
    const clave = claveDeCapa(layerId)
    if (!clave) return
    setFilters((prev) => ({ ...prev, [clave]: [] }))
  }, [])

  const handleNavigate = useCallback((target: { lon: number; lat: number }) => {
    setFlyTo({ ...target, nonce: Date.now() })
  }, [])

  const ribbonActions = useMemo(
    () => ({
      onRefresh: () => setReloadTrigger((v) => v + 1),
      onFitToData: () => setFitTo({ capa: "todo", nonce: Date.now() }),
      onIdentify: () => setTool("edit"),
      onMeasure: () => setTool("measure-length"),
      onDraw: () => setTool("node"),
      onDelete: () => setTool("delete"),
      onEditGeometry: () => setTool("edit"),
      onConnectivity: () => setTool("conectividad"),
      onSentido: () => setTool("sentido"),
      onCable: () => setTool("cable"),
    }),
    [],
  )

  // Botón del ribbon que corresponde a la herramienta activa, para que se vea
  // encendido mientras se usa.
  const botonesActivos = useMemo(() => {
    const porHerramienta: Partial<Record<MapTool, string[]>> = {
      conectividad: ["Conectividad fina"],
      sentido: ["Entradas y salidas"],
      cable: ["Cable"],
      "measure-length": ["Mediciones"],
      "measure-area": ["Mediciones"],
    }
    return porHerramienta[tool] ?? []
  }, [tool])

  const handleCenterChange = useCallback((next: { lon: number; lat: number }) => {
    // Se redondea a ~100 m: evita relanzar la consulta por microdesplazamientos
    // y hace que sectores cercanos compartan la misma respuesta cacheada.
    setCenter({
      lon: Math.round(next.lon * 1000) / 1000,
      lat: Math.round(next.lat * 1000) / 1000,
    })
  }, [])

  // Resuelve el nombre del lugar que se está viendo. El retardo evita consultar
  // el servicio mientras el usuario sigue navegando.
  useEffect(() => {
    if (!center) return
    let cancelled = false

    const timeout = setTimeout(async () => {
      try {
        const res = await fetchConSesion(`/api/reverse-geocode?lon=${center.lon}&lat=${center.lat}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled && data?.label) setLocation(data.label as string)
      } catch {
        // Si falla, se conserva la última ubicación conocida.
      }
    }, 700)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [center])

  const handleToggleLayer = useCallback((id: string) => {
    setVisible((prev) => {
      const next = { ...prev }
      if (id === "nodes") next.nodes = !next.nodes
      if (id === "fibers") next.fibers = !next.fibers
      if (id === "zones") next.zones = !next.zones
      if (id === "cabeceras") next.cabeceras = !next.cabeceras
      return next
    })
  }, [])

  const handleStatsChange = useCallback((stats: NetworkStats) => {
    setCounts(stats.counts)
    setTotalKm(stats.totalKm)
    setEnPantalla(stats.enPantalla)
    setBreakdown(stats.breakdown)
  }, [])

  const layers = [
    { id: "cabeceras", label: "Cabeceras", color: LAYER_COLORS.cabecera, count: counts.cabeceras, visible: visible.cabeceras, symbol: "cabecera" as const },
    { id: "nodes", label: "Mufas", color: LAYER_COLORS.node, count: counts.nodes, visible: visible.nodes, items: breakdown.nodes, activeItems: filters.nodes, symbol: "mufa" as const },
    { id: "fibers", label: "Tendido de fibra", color: LAYER_COLORS.fiber, count: counts.fibers, visible: visible.fibers, items: breakdown.fibers, activeItems: filters.fibers, symbol: "fibra" as const },
    { id: "zones", label: "Zonas", color: LAYER_COLORS.zone, count: counts.zones, visible: visible.zones, symbol: "zona" as const },
  ]

  return (
    <AuthGuard>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
        <DashboardHeader subtitle={location} onNavigate={handleNavigate} />
        <DashboardRibbon actions={ribbonActions} activos={botonesActivos} />
        <div className="flex flex-1 overflow-hidden">
          <DashboardSidebar
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onToggleItem={handleToggleItem}
            onClearItems={handleClearItems}
            onZoomLayer={handleZoomLayer}
            totalKm={totalKm}
            enPantalla={enPantalla}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            loading={loadingData}
          />
          <main id="map-panel" className="relative flex-1 overflow-hidden">
            <NetworkMap
              visible={visible}
              onStatsChange={handleStatsChange}
              onCenterChange={handleCenterChange}
              flyTo={flyTo}
              reloadTrigger={reloadTrigger}
              fitTo={fitTo}
              tool={tool}
              onToolChange={setTool}
              onLoadingChange={setLoadingData}
              filters={filters}
            />
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}