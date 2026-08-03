"use client"

import { useState } from "react"
import {
  Map as MapIcon,
  Network,
  Layers,
  Cable,
  Router,
  FileBarChart,
  Settings,
  ChevronLeft,
} from "lucide-react"

type ModuleItem = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
}

const MODULES: ModuleItem[] = [
  { id: "mapa", label: "Mapa de Red", icon: MapIcon },
  { id: "topologia", label: "Topología", icon: Network, disabled: true },
  { id: "capas", label: "Capas", icon: Layers, disabled: true },
  { id: "fibra", label: "Tendido de Fibra", icon: Cable, disabled: true },
  { id: "nodos", label: "Nodos / Equipos", icon: Router, disabled: true },
  { id: "reportes", label: "Reportes", icon: FileBarChart, disabled: true },
]

export function DashboardSidebar() {
  const [active, setActive] = useState("mapa")
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-card transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Marca */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <MapIcon className="size-4" />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-bold text-foreground">GiSmart</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">SIG · Red FTTH</p>
          </div>
        )}
      </div>

      {/* Módulos */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Módulos del sistema">
        {MODULES.map((m) => {
          const Icon = m.icon
          const isActive = active === m.id
          return (
            <button
              key={m.id}
              onClick={() => !m.disabled && setActive(m.id)}
              disabled={m.disabled}
              title={m.label}
              aria-current={isActive ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-accent"
              } ${m.disabled ? "cursor-not-allowed opacity-40 hover:bg-transparent" : ""}`}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{m.label}</span>}
              {!collapsed && m.disabled && (
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                  Pronto
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Pie / acciones */}
      <div className="border-t border-border p-3">
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent"
          title="Configuración"
        >
          <Settings className="size-4 shrink-0" />
          {!collapsed && <span>Configuración</span>}
        </button>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent"
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          <ChevronLeft className={`size-4 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span>Contraer</span>}
        </button>
      </div>
    </aside>
  )
}
