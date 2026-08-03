"use client"

import { useState, useCallback } from "react"
import { DashboardRibbon } from "@/components/dashboard-ribbon"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { NetworkMap } from "@/components/network-map"
import { AuthGuard } from "@/components/auth-guard"

export default function DashboardPage() {
  const [visible, setVisible] = useState({ nodes: true, fibers: true, zones: true })
  const [counts, setCounts] = useState({ nodes: 3, fibers: 1, zones: 1 })
  const [totalKm, setTotalKm] = useState(3.56)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [clearTrigger, setClearTrigger] = useState(0)

  const handleToggleLayer = useCallback((id: string) => {
    setVisible((prev) => {
      const next = { ...prev }
      if (id === "nodes") next.nodes = !next.nodes
      if (id === "fibers") next.fibers = !next.fibers
      if (id === "zones") next.zones = !next.zones
      return next
    })
  }, [])

  const handleStatsChange = useCallback(
    (newCounts: { nodes: number; fibers: number; zones: number }, km: number) => {
      setCounts(newCounts)
      setTotalKm(km)
    },
    []
  )

  const handleClearAll = useCallback(() => {
    setCounts({ nodes: 0, fibers: 0, zones: 0 })
    setTotalKm(0)
    setClearTrigger((v) => v + 1)
  }, [])

  const layers = [
    { id: "nodes", label: "Nodos", color: "#0ea5e9", count: counts.nodes, visible: visible.nodes },
    { id: "fibers", label: "Tendido de fibra", color: "#2563eb", count: counts.fibers, visible: visible.fibers },
    { id: "zones", label: "Zonas", color: "#38bdf8", count: counts.zones, visible: visible.zones },
  ]

  return (
    <AuthGuard>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
        <DashboardHeader />
        <DashboardRibbon />
        <div className="flex flex-1 overflow-hidden">
          <DashboardSidebar
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onClearAll={handleClearAll}
            totalKm={totalKm}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          />
          <main className="relative flex-1 overflow-hidden">
            <NetworkMap
              visible={visible}
              onStatsChange={handleStatsChange}
              clearTrigger={clearTrigger}
            />
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}