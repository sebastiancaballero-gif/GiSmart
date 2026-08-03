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
  LogOut,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { clearSession } from "@/lib/auth"

type ModuleItem = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
  href?: string
}

const MODULES: ModuleItem[] = [
  { id: "mapa", label: "Mapa de Red", icon: MapIcon, href: "/dashboard" },
  { id: "topologia", label: "Topología", icon: Network, disabled: true },
  { id: "capas", label: "Capas", icon: Layers, disabled: true },
  { id: "fibra", label: "Tendido de Fibra", icon: Cable, disabled: true },
  { id: "nodos", label: "Nodos / Equipos", icon: Router, disabled: true },
  { id: "reportes", label: "Reportes", icon: FileBarChart, disabled: true },
]

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // El item activo se detecta por la ruta actual
  const activeId = MODULES.find((m) => m.href && pathname.startsWith(m.href))?.id ?? "mapa"

  function handleLogout() {
    clearSession()
    router.replace("/")
  }

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-card transition-all duration-300 ease-in-out ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      {/* ── Marca / Logo ── */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <MapIcon className="size-[18px]" />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-foreground">GiSmart</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              SIG · Red FTTH
            </p>
          </div>
        )}
      </div>

      {/* ── Módulos ── */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5" aria-label="Módulos del sistema">
        {MODULES.map((m) => {
          const Icon = m.icon
          const isActive = activeId === m.id

          return (
            <button
              key={m.id}
              onClick={() => {
                if (!m.disabled && m.href) router.push(m.href)
              }}
              disabled={m.disabled}
              title={collapsed ? m.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`
                group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all
                ${isActive && !m.disabled
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-accent hover:text-foreground"
                }
                ${m.disabled ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}
              `}
            >
              <Icon className={`size-[18px] shrink-0 ${isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"}`} />
              
              {!collapsed && (
                <>
                  <span className="truncate">{m.label}</span>
                  {m.disabled && (
                    <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Pronto
                    </span>
                  )}
                </>
              )}

              {/* Tooltip cuando está colapsado */}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-2.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 whitespace-nowrap z-50">
                  {m.label}
                  {m.disabled && " (Pronto)"}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Pie: Configuración + Contraer + Salir ── */}
      <div className="border-t border-border p-2.5 space-y-0.5">
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent"
          title={collapsed ? "Configuración" : undefined}
        >
          <Settings className="size-[18px] shrink-0 text-muted-foreground" />
          {!collapsed && <span>Configuración</span>}
        </button>

        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title={collapsed ? "Expandir menú" : undefined}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          <ChevronLeft className={`size-[18px] shrink-0 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span>Contraer</span>}
        </button>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive/80 transition hover:bg-destructive/10 hover:text-destructive"
          title={collapsed ? "Cerrar sesión" : undefined}
        >
          <LogOut className="size-[18px] shrink-0" />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  )
}