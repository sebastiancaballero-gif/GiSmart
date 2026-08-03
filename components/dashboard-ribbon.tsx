"use client"

import { useState } from "react"
import {
  User, LogOut, Settings, Magnet, Search, Eye, GitBranch,
  FolderPlus, FolderOpen, FolderX, Maximize, RefreshCw, ToggleRight,
  FileSpreadsheet, FileSearch, PenLine, SquarePen, Plus, Minus,
  Move, Save, Network, PlusCircle, Trash2, Move3d, Plug, Unplug,
  CircuitBoard, Cable, Wifi, Server, Route, BarChart3, ClipboardList,
  MapPin, Activity, Box, Layers, HardDrive, CableCar, Grid3x3, Map,
  Ruler, Crosshair, Eraser, FileUp, FileDown, Cpu, ChevronDown,
} from "lucide-react"

type RibbonItem = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  disabled?: boolean
  variant?: "default" | "primary" | "destructive"
}

type RibbonGroup = {
  label: string
  items: RibbonItem[]
}

type RibbonTab = {
  id: string
  label: string
  groups: RibbonGroup[]
}

const TABS: RibbonTab[] = [
  {
    id: "inicio",
    label: "Inicio",
    groups: [
      {
        label: "Mapa",
        items: [
          { icon: Map, label: "Mapa de red" },
          { icon: Maximize, label: "Extensión completa" },
          { icon: RefreshCw, label: "Actualizar" },
        ],
      },
      {
        label: "Capas",
        items: [
          { icon: Layers, label: "Activar capa" },
          { icon: Eye, label: "Identificar" },
        ],
      },
    ],
  },
  {
    id: "usuario",
    label: "Usuario",
    groups: [
      {
        label: "Sesión",
        items: [
          { icon: User, label: "Cambiar usuario" },
          { icon: LogOut, label: "Salir", variant: "destructive" },
        ],
      },
    ],
  },
  {
    id: "config",
    label: "Configuración",
    groups: [
      {
        label: "Edición",
        items: [{ icon: Magnet, label: "Snap" }],
      },
    ],
  },
  {
    id: "consultas",
    label: "Consultas",
    groups: [
      {
        label: "Elementos",
        items: [
          { icon: Search, label: "Búsqueda" },
          { icon: Eye, label: "Atributos" },
        ],
      },
      {
        label: "Red",
        items: [{ icon: GitBranch, label: "Conectividad fina" }],
      },
    ],
  },
  {
    id: "proyectos",
    label: "Proyectos",
    groups: [
      {
        label: "Gestión",
        items: [
          { icon: FolderPlus, label: "Crear" },
          { icon: FolderOpen, label: "Abrir" },
          { icon: FolderX, label: "Cerrar" },
        ],
      },
      {
        label: "Extensión",
        items: [
          { icon: Maximize, label: "Acercar ext." },
          { icon: RefreshCw, label: "Actualizar ext." },
          { icon: ToggleRight, label: "Cambiar estado" },
        ],
      },
      {
        label: "BOM",
        items: [
          { icon: FileSpreadsheet, label: "Generar BOM" },
          { icon: FileSearch, label: "Consultar BOM" },
        ],
      },
    ],
  },
  {
    id: "edicion",
    label: "Edición",
    groups: [
      {
        label: "Atributos",
        items: [{ icon: PenLine, label: "Editar atributos" }],
      },
      {
        label: "Geometría",
        items: [
          { icon: Plus, label: "Add vértice" },
          { icon: Minus, label: "Borrar vértice" },
          { icon: Move, label: "Mover vértice" },
          { icon: Save, label: "Guardar", variant: "primary" },
        ],
      },
      {
        label: "Elementos",
        items: [
          { icon: PlusCircle, label: "Crear" },
          { icon: Trash2, label: "Borrar", variant: "destructive" },
          { icon: Move3d, label: "Mover" },
          { icon: Plug, label: "Conectar" },
          { icon: Unplug, label: "Desconectar" },
        ],
      },
      {
        label: "Conectividad",
        items: [{ icon: CircuitBoard, label: "Esquemas empalme" }],
      },
    ],
  },
  {
    id: "fibra",
    label: "Red de fibra",
    groups: [
      {
        label: "Consultas",
        items: [
          { icon: Cable, label: "Hilos" },
          { icon: Wifi, label: "Búsquedas GPON" },
          { icon: Server, label: "Redes/Nodo" },
          { icon: Route, label: "Enrutamiento" },
        ],
      },
      {
        label: "Análisis",
        items: [{ icon: BarChart3, label: "Puertos OLT" }],
      },
      {
        label: "Reportes",
        items: [
          { icon: ClipboardList, label: "Auditoría" },
          { icon: Activity, label: "Trace" },
          { icon: Box, label: "Inventario" },
        ],
      },
      {
        label: "Planta interna",
        items: [
          { icon: HardDrive, label: "OLT-ODF" },
          { icon: CableCar, label: "ODF-ODF" },
          { icon: Cable, label: "ODF-Cables" },
          { icon: MapPin, label: "Ocupación OLT" },
          { icon: Grid3x3, label: "Ocupación ODF" },
        ],
      },
      {
        label: "Planta externa",
        items: [
          { icon: Cable, label: "Ocupación cables" },
          { icon: Box, label: "Inventario ext." },
          { icon: Grid3x3, label: "Cross conexión" },
          { icon: MapPin, label: "Ocupación NAPs" },
        ],
      },
      {
        label: "Cartografía",
        items: [
          { icon: Maximize, label: "Acercamientos" },
          { icon: Map, label: "Extents" },
        ],
      },
    ],
  },
  {
    id: "varios",
    label: "Varios",
    groups: [
      {
        label: "Herramientas",
        items: [
          { icon: Ruler, label: "Mediciones" },
          { icon: Crosshair, label: "A coordenada" },
          { icon: Eraser, label: "Limpiar trace" },
        ],
      },
    ],
  },
  {
    id: "interfaz",
    label: "Interfaz",
    groups: [
      {
        label: "Importar",
        items: [
          { icon: FileUp, label: "Excel" },
          { icon: FileUp, label: "KML/Shape" },
        ],
      },
      {
        label: "Exportar",
        items: [{ icon: FileDown, label: "KML/Shape" }],
      },
    ],
  },
  {
    id: "esquematico",
    label: "Esquemático",
    groups: [
      {
        label: "Consultas",
        items: [{ icon: Cpu, label: "Puertos/equipo" }],
      },
      {
        label: "Conectividad",
        items: [
          { icon: Plug, label: "OLT-ODF" },
          { icon: Cable, label: "ODF-ODF" },
          { icon: CableCar, label: "ODF-Cables" },
          { icon: Box, label: "Empalme" },
        ],
      },
    ],
  },
]

export function DashboardRibbon() {
  const [activeTab, setActiveTab] = useState("inicio")
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const currentTab = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* Pestañas */}
      <div className="flex items-end border-b border-border bg-gradient-to-b from-card to-muted/30 px-1 pt-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative rounded-t-lg px-4 py-2 text-sm font-medium transition-all
                ${isActive
                  ? "bg-card text-primary shadow-sm ring-1 ring-border ring-b-0"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }
              `}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Toolbar de la pestaña activa */}
      <div className="flex h-[88px] items-stretch overflow-x-auto bg-card px-2">
        {currentTab.groups.map((group, gi) => (
          <div key={gi} className="flex items-stretch">
            <div className="flex flex-col justify-center px-2 py-1.5">
              <div className="flex items-center gap-1">
                {group.items.map((item, ii) => {
                  const Icon = item.icon
                  const isPrimary = item.variant === "primary"
                  const isDestructive = item.variant === "destructive"

                  return (
                    <button
                      key={ii}
                      onClick={item.onClick}
                      disabled={item.disabled}
                      title={item.label}
                      className={`
                        group flex flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 transition
                        ${isPrimary
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : isDestructive
                            ? "text-destructive hover:bg-destructive/10"
                            : "text-foreground hover:bg-accent"
                        }
                        ${item.disabled ? "opacity-40 cursor-not-allowed" : ""}
                        min-w-[56px]
                      `}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span className="max-w-[56px] truncate text-[10px] font-medium leading-tight">
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
              <span className="mt-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
            </div>

            {/* Separador entre grupos */}
            {gi < currentTab.groups.length - 1 && (
              <div className="my-2 w-px bg-border" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}