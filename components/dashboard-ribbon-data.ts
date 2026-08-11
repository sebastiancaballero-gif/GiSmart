import {
  User, LogOut, Settings, Magnet, Search, Eye, GitBranch,
  FolderPlus, FolderOpen, FolderX, Maximize, RefreshCw, ToggleRight,
  FileSpreadsheet, FileSearch, PenLine, Plus, Minus,
  Move, Save, PlusCircle, Trash2, Move3d, Plug, Unplug,
  CircuitBoard, Cable, Wifi, Server, Route, BarChart3, ClipboardList,
  MapPin, Activity, Box, Layers, HardDrive, CableCar, Grid3x3, Map,
  Ruler, Crosshair, Eraser, FileUp, FileDown, Cpu,
} from "lucide-react"

export type RibbonItem = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  disabled?: boolean
  variant?: "default" | "primary" | "destructive"
}

export type RibbonGroup = {
  label: string
  items: RibbonItem[]
}

export type RibbonTab = {
  id: string
  label: string
  groups: RibbonGroup[]
}

export const RIBBON_TABS: RibbonTab[] = [
  {
    id: "inicio",
    label: "Inicio",
    groups: [
      {
        label: "Mapa",
        items: [
          { icon: Map, label: "Mapa de red" },
          { icon: Maximize, label: "Extensión" },
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
          { icon: Wifi, label: "GPON" },
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
          { icon: MapPin, label: "Ocup. OLT" },
          { icon: Grid3x3, label: "Ocup. ODF" },
        ],
      },
      {
        label: "Planta externa",
        items: [
          { icon: Cable, label: "Ocup. cables" },
          { icon: Box, label: "Inventario ext." },
          { icon: Grid3x3, label: "Cross conn." },
          { icon: MapPin, label: "Ocup. NAPs" },
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
