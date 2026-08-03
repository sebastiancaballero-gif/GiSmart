"use client"

import { useState, useCallback } from "react"
import { DashboardRibbon } from "@/components/dashboard-ribbon"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { NetworkMap } from "@/components/network-map"
import { AuthGuard } from "@/components/auth-guard"

const INITIAL_LAYERS = [
  { id: "nodes", label: "Nodos", color: "#0ea5e9", count: 3, visible: true },
  { id: "fibers", label: "Tendido de fibra", color: "#2563eb", count: 1, visible: true },
  { id: "zones", label: "Zonas", color: "#38bdf8", count: 1, visible: true },
]

export default function DashboardPage() {
  const [layers, setLayers] = useState(INITIAL_LAYERS)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [totalKm, setTotalKm] = useState(3.56)

  const handleToggleLayer = useCallback((id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    )
  }, [])

  const handleClearAll = useCallback(() => {
    setLayers((prev) => prev.map((l) => ({ ...l, count: 0, visible: true })))
    setTotalKm(0)
  }, [])

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
            <NetworkMap />
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}