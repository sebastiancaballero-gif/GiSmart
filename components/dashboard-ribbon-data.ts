import {
  User, LogOut, Settings, Magnet, Search, Eye, GitBranch,
  FolderPlus, FolderOpen, FolderX, Maximize, RefreshCw, ToggleRight,
  FileSpreadsheet, FileSearch, PenLine, Plus, Minus,
  Move, Save, PlusCircle, Trash2, Move3d, Plug, Unplug,
  CircuitBoard, Cable, Wifi, Server, Route, BarChart3, ClipboardList,
  MapPin, Activity, Box, Layers, HardDrive, CableCar, Grid3x3, Map,
  Ruler, Crosshair, Eraser, FileUp, FileDown, Cpu, ArrowLeftRight,
} from "lucide-react"
import type { VentanaDePlanta } from "@/components/planta"

/**
 * Lo que hace un botón del ribbon. Los botones sin `accion` son la maqueta
 * del SIG anterior: se ven apagados, dicen «próximamente» y, al pulsarlos,
 * avisan que todavía no están. Antes todos se veían iguales y solo se sabía
 * cuáles funcionaban probándolos uno por uno.
 */
export type AccionDeRibbon =
  | "encuadrar"
  | "pantallaCompleta"
  | "actualizar"
  | "activarCapa"
  | "identificar"
  | "salir"
  | "buscar"
  | "aCoordenada"
  | "conectividad"
  | "sentido"
  | "cable"
  | "editar"
  | "crear"
  | "borrar"
  | "hilos"
  | "gpon"
  | "redesNodo"
  | "medir"
  /** Abre una de las ventanas de planta (ver `ventana`). */
  | "ventana"

export type RibbonItem = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** Qué hace, en la etiqueta emergente. Sin él se muestra el nombre. */
  tooltip?: string
  /** Sin acción, el botón todavía no tiene su función (ver `AccionDeRibbon`). */
  accion?: AccionDeRibbon
  /** Con `accion: "ventana"`, cuál de las ventanas de planta abre. */
  ventana?: VentanaDePlanta
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
          { icon: Map, label: "Mapa de red", accion: "encuadrar", tooltip: "Encuadrar toda la red" },
          { icon: Maximize, label: "Extensión", accion: "pantallaCompleta", tooltip: "Ver el mapa en pantalla completa" },
          { icon: RefreshCw, label: "Actualizar", accion: "actualizar", tooltip: "Volver a cargar las capas desde la base" },
        ],
      },
      {
        label: "Capas",
        items: [
          { icon: Layers, label: "Activar capa", accion: "activarCapa", tooltip: "Elegir la capa en la que se edita, mueve o crea" },
          { icon: Eye, label: "Identificar", accion: "identificar", tooltip: "Click sobre un elemento para ver su información" },
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
          { icon: User, label: "Cambiar usuario", accion: "salir", tooltip: "Cerrar la sesión para entrar con otro usuario" },
          { icon: LogOut, label: "Salir", variant: "destructive", accion: "salir", tooltip: "Cerrar la sesión" },
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
          { icon: Search, label: "Búsqueda", accion: "buscar", tooltip: "Buscar por nombre, código, dirección o coordenada (Ctrl+K)" },
          { icon: Eye, label: "Atributos", accion: "identificar", tooltip: "Click sobre un elemento para ver sus datos" },
        ],
      },
      {
        label: "Red",
        items: [
          { icon: GitBranch, label: "Conectividad fina", accion: "conectividad", tooltip: "Click sobre una cubierta para ver su conectividad" },
          { icon: ArrowLeftRight, label: "Entradas y salidas", accion: "sentido", tooltip: "Click sobre una cubierta para ver los cables que entran y salen" },
          { icon: Cable, label: "Cable", accion: "cable", tooltip: "Click sobre un cable para ver su entrada y su salida" },
        ],
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
          { icon: Maximize, label: "Acercar ext.", accion: "encuadrar", tooltip: "Encuadrar toda la red" },
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
        items: [{ icon: PenLine, label: "Editar atributos", accion: "editar", tooltip: "Seleccionar un elemento de la capa activa para renombrarlo" }],
      },
      {
        label: "Geometría",
        items: [
          { icon: Plus, label: "Add vértice" },
          { icon: Minus, label: "Borrar vértice" },
          { icon: Move, label: "Mover vértice", accion: "editar", tooltip: "Arrastrar los vértices de un elemento de la capa activa" },
          { icon: Save, label: "Guardar", variant: "primary" },
        ],
      },
      {
        label: "Elementos",
        items: [
          { icon: PlusCircle, label: "Crear", accion: "crear", tooltip: "Dibujar en la capa activa" },
          { icon: Trash2, label: "Borrar", variant: "destructive", accion: "borrar", tooltip: "Quitar del mapa elementos de la capa activa" },
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
          { icon: Cable, label: "Hilos", accion: "hilos", tooltip: "Gestión de hilos de un cable" },
          { icon: Wifi, label: "GPON", accion: "gpon", tooltip: "Elementos alimentados por fibra óptica" },
          { icon: Server, label: "Redes/Nodo", accion: "redesNodo", tooltip: "Consulta de redes por nodo de fibra óptica" },
          { icon: Route, label: "Enrutamiento", accion: "ventana", ventana: "enrutamiento", tooltip: "Enrutamiento de hilos" },
        ],
      },
      {
        label: "Análisis",
        items: [
          {
            icon: BarChart3,
            label: "Puertos OLT",
            accion: "ventana",
            ventana: "puertosEquipos",
            tooltip: "Gestión de puertos de equipos",
          },
        ],
      },
      {
        label: "Reportes",
        items: [
          { icon: ClipboardList, label: "Auditoría" },
          { icon: Activity, label: "Trace" },
          { icon: Box, label: "Inventario", accion: "ventana", ventana: "inventario", tooltip: "Reporte de inventario de red de fibra óptica" },
        ],
      },
      {
        label: "Planta interna",
        items: [
          { icon: HardDrive, label: "OLT-ODF", accion: "ventana", ventana: "oltOdf", tooltip: "Conectividad de puertos entre OLT y ODF" },
          { icon: CableCar, label: "ODF-ODF", accion: "ventana", ventana: "odfOdf", tooltip: "Conectividad de puertos de ODF" },
          { icon: Cable, label: "ODF-Cables", accion: "ventana", ventana: "odfCables", tooltip: "Conectividad de puertos entre ODF y cables de salida" },
          { icon: MapPin, label: "Ocup. OLT", accion: "ventana", ventana: "ocupacionOlt", tooltip: "Reporte de ocupación de OLT" },
          { icon: Grid3x3, label: "Ocup. ODF", accion: "ventana", ventana: "ocupacionOdf", tooltip: "Reporte de ocupación de ODF" },
        ],
      },
      {
        label: "Planta externa",
        items: [
          { icon: Cable, label: "Ocup. cables", accion: "ventana", ventana: "ocupacionCables", tooltip: "Ocupación de cables de fibra en el nodo" },
          { icon: Box, label: "Inventario ext." },
          {
            icon: Grid3x3,
            label: "Cross conn.",
            accion: "ventana",
            ventana: "importarExcel",
            tooltip: "Cargue de un archivo Excel de conectividades",
          },
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
          { icon: Ruler, label: "Mediciones", accion: "medir", tooltip: "Medir distancias y áreas" },
          { icon: Crosshair, label: "A coordenada", accion: "aCoordenada", tooltip: "Ir a una latitud y longitud" },
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
