"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { DashboardRibbon } from "@/components/dashboard-ribbon"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { NetworkMap, type MapTool, type NetworkStats } from "@/components/network-map"
import { AuthGuard } from "@/components/auth-guard"
import { LAYER_COLORS } from "@/lib/network-colors"

export default function DashboardPage() {
  const [visible, setVisible] = useState({ nodes: true, fibers: true, zones: true, cabeceras: true })
  const [counts, setCounts] = useState({ nodes: 0, fibers: 0, zones: 0, cabeceras: 0 })
  const [totalKm, setTotalKm] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [center, setCenter] = useState<{ lon: number; lat: number } | null>(null)
  const [location, setLocation] = useState("Ubicando…")
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; nonce: number } | null>(null)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [fitTrigger, setFitTrigger] = useState(0)
  const [tool, setTool] = useState<MapTool>("pan")
  const [loadingData, setLoadingData] = useState(true)
  const [breakdown, setBreakdown] = useState<NetworkStats["breakdown"]>({ nodes: [], fibers: [] })

  const handleNavigate = useCallback((target: { lon: number; lat: number }) => {
    setFlyTo({ ...target, nonce: Date.now() })
  }, [])

  const ribbonActions = useMemo(
    () => ({
      onRefresh: () => setReloadTrigger((v) => v + 1),
      onFitToData: () => setFitTrigger((v) => v + 1),
      onIdentify: () => setTool("edit"),
      onMeasure: () => setTool("measure-length"),
      onDraw: () => setTool("node"),
      onDelete: () => setTool("delete"),
      onEditGeometry: () => setTool("edit"),
    }),
    [],
  )

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
        const res = await fetch(`/api/reverse-geocode?lon=${center.lon}&lat=${center.lat}`)
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
    setBreakdown(stats.breakdown)
  }, [])

  const layers = [
    { id: "cabeceras", label: "Cabeceras", color: LAYER_COLORS.cabecera, count: counts.cabeceras, visible: visible.cabeceras },
    { id: "nodes", label: "Mufas", color: LAYER_COLORS.node, count: counts.nodes, visible: visible.nodes, items: breakdown.nodes },
    { id: "fibers", label: "Tendido de fibra", color: LAYER_COLORS.fiber, count: counts.fibers, visible: visible.fibers, items: breakdown.fibers },
    { id: "zones", label: "Zonas", color: LAYER_COLORS.zone, count: counts.zones, visible: visible.zones },
  ]

  return (
    <AuthGuard>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
        <DashboardHeader subtitle={location} onNavigate={handleNavigate} />
        <DashboardRibbon actions={ribbonActions} />
        <div className="flex flex-1 overflow-hidden">
          <DashboardSidebar
            layers={layers}
            onToggleLayer={handleToggleLayer}
            totalKm={totalKm}
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
              fitTrigger={fitTrigger}
              tool={tool}
              onToolChange={setTool}
              onLoadingChange={setLoadingData}
            />
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}