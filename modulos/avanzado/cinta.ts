import {
  Bookmark,
  Bot,
  CircleArrowLeft,
  CircleArrowRight,
  ClipboardCopy,
  Filter,
  Keyboard,
  Layers,
  Map as IconoDeMapa,
  PieChart,
  Printer,
  Radius,
  ScanSearch,
  Table2,
} from "lucide-react"
import type { RibbonTab } from "@/components/dashboard-ribbon-data"

/**
 * Módulo «Avanzado»: lo nuevo que se suma al SIG, tomado de lo que hacen otros
 * SIG web (RustGIS, octubre de 2026). Vive aparte del resto del tablero para
 * que se pueda revisar, probar y crecer sin tocar las ventanas que ya
 * funcionan: el tablero solo le pasa el mapa y le pide abrir cada herramienta.
 */

/** Las herramientas del módulo; cada botón de la pestaña abre una. */
export type HerramientaAvanzada =
  | "asistente"
  | "resumen"
  | "tabla"
  | "consulta"
  | "cercania"
  | "marcadores"
  | "imprimir"
  | "atajos"
  | "anterior"
  | "siguiente"
  | "recuadro"
  | "minimapa"
  | "fondo"
  | "copiar"

/**
 * La pestaña «Avanzado» de la cinta. Un botón sin `accion` todavía no tiene
 * su herramienta y se ve como los demás «próximamente».
 */
export const PESTANA_AVANZADO: RibbonTab = {
  id: "avanzado",
  label: "Avanzado",
  groups: [
    {
      label: "Inteligencia",
      items: [{ icon: Bot, label: "Asistente IA", accion: "modulo", modulo: "asistente", tooltip: "Preguntarle a la IA sobre la red" }],
    },
    {
      label: "Consulta",
      items: [
        { icon: PieChart, label: "Resumen", accion: "modulo", modulo: "resumen", tooltip: "Lo que se ve en pantalla, en cifras" },
        {
          icon: Table2,
          label: "Tabla",
          accion: "modulo",
          modulo: "tabla",
          tooltip: "Tabla de atributos de una capa, debajo del mapa",
        },
        { icon: Filter, label: "Consultar", accion: "modulo", modulo: "consulta", tooltip: "Seleccionar por atributos" },
      ],
    },
    {
      label: "Análisis",
      items: [
        { icon: Radius, label: "Cercanía", accion: "modulo", modulo: "cercania", tooltip: "Lo que hay a cierta distancia de un punto" },
      ],
    },
    {
      label: "Navegar",
      items: [
        { icon: CircleArrowLeft, label: "Anterior", accion: "modulo", modulo: "anterior", tooltip: "Volver a la vista anterior del mapa" },
        { icon: CircleArrowRight, label: "Siguiente", accion: "modulo", modulo: "siguiente", tooltip: "Ir a la vista siguiente del mapa" },
        { icon: ScanSearch, label: "Recuadro", accion: "modulo", modulo: "recuadro", tooltip: "Acercar el mapa dibujando un recuadro" },
        { icon: IconoDeMapa, label: "Minimapa", accion: "modulo", modulo: "minimapa", tooltip: "Mapa chico de ubicación, abajo a la izquierda" },
      ],
    },
    {
      label: "Vista",
      items: [
        {
          icon: Bookmark,
          label: "Marcadores",
          accion: "modulo",
          modulo: "marcadores",
          tooltip: "Guardar vistas del mapa y volver a ellas",
        },
        { icon: Layers, label: "Mapa base", accion: "modulo", modulo: "fondo", tooltip: "Estilo del mapa base y transparencia de las capas" },
        {
          icon: ClipboardCopy,
          label: "Copiar mapa",
          accion: "modulo",
          modulo: "copiar",
          tooltip: "Copiar el mapa como imagen para pegarlo en WhatsApp o un correo",
        },
        { icon: Printer, label: "Imprimir", accion: "modulo", modulo: "imprimir", tooltip: "Exportar el mapa a imagen o PDF" },
      ],
    },
    {
      label: "Ayuda",
      items: [{ icon: Keyboard, label: "Atajos", accion: "modulo", modulo: "atajos", tooltip: "Atajos de teclado del mapa (?)" }],
    },
  ],
}
