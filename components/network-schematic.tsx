"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { dia, linkTools } from "@joint/core"
import {
  AlertTriangle,
  FileJson,
  Link2Off,
  Maximize2,
  RotateCcw,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { parsearEntrada, type MufaJSON } from "@/lib/schematic/legacy-mufa"
import type { ElementoRedJSON, VocabularioElemento } from "@/lib/schematic/network-data"
import { MUFA_MOCKUP } from "@/lib/schematic/network-mockups"
import {
  cargarEscenario,
  cellNamespace,
  conectarEnOrden,
  crearEnlacePorDefecto,
  crearValidadorDeConexion,
  crearValidadorDeMagnet,
  exportarConexiones,
  exportarElemento,
  listarConexiones,
  normalizarConexion,
  resaltarConexion,
  type RegistroConexion,
} from "@/lib/schematic/network-graph"

type NetworkSchematicProps = {
  /** Elemento a dibujar, en el esquema genérico o en el formato antiguo de mufa. */
  datos?: ElementoRedJSON | MufaJSON
  className?: string
}

const LIMITES_ZOOM = { min: 0.35, max: 2.2, paso: 0.15 }

/**
 * Vista de conectividad interna de un elemento de red (mufa, ODF, NAP o
 * splitter). La estructura proviene íntegramente del JSON: la interfaz sólo
 * permite trazar y borrar conexiones, no alterar las terminaciones.
 */
export function NetworkSchematic({ datos = MUFA_MOCKUP, className }: NetworkSchematicProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<dia.Graph | null>(null)
  const paperRef = useRef<dia.Paper | null>(null)

  const [conexiones, setConexiones] = useState<RegistroConexion[]>([])
  const [zoom, setZoom] = useState(1)

  // Separación de responsabilidades: aquí sólo se parsea el JSON; el dibujo
  // ocurre en los efectos de abajo.
  const elemento = useMemo(() => parsearEntrada(datos), [datos])
  const vocab = elemento.vocabulario

  // El Paper se construye una sola vez, así que sus validaciones leen el
  // elemento vigente a través de esta referencia.
  const elementoRef = useRef(elemento)
  useEffect(() => {
    elementoRef.current = elemento
  }, [elemento])

  const totales = useMemo(
    () => ({
      izquierda: elemento.izquierda.reduce((suma, item) => suma + item.totalPuntos, 0),
      derecha: elemento.derecha.reduce((suma, item) => suma + item.totalPuntos, 0),
    }),
    [elemento],
  )

  const ajustarVista = useCallback(() => {
    const paper = paperRef.current
    if (!paper) return
    paper.transformToFitContent({
      padding: 28,
      useModelGeometry: true,
      minScale: LIMITES_ZOOM.min,
      maxScale: 1.4,
      verticalAlign: "middle",
      horizontalAlign: "middle",
    })
    setZoom(paper.scale().sx)
  }, [])

  const aplicarZoom = useCallback((siguiente: number) => {
    const paper = paperRef.current
    if (!paper) return
    const acotado = Math.min(LIMITES_ZOOM.max, Math.max(LIMITES_ZOOM.min, siguiente))
    paper.scale(acotado, acotado)
    setZoom(acotado)
  }, [])

  // Creación del Graph y el Paper. Se ejecuta una única vez.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const obtenerElemento = () => elementoRef.current

    const graph = new dia.Graph({}, { cellNamespace })
    // El Paper crea su propio elemento y se inserta dentro del contenedor de
    // React: `paper.remove()` borra el nodo que le pertenece, así que pasarle
    // el div de React lo destruiría al desmontar el efecto.
    const paper = new dia.Paper({
      model: graph,
      cellViewNamespace: cellNamespace,
      width: "100%",
      height: "100%",
      gridSize: 10,
      drawGrid: { name: "dot", args: { color: "#dbe3ec", thickness: 1 } },
      background: { color: "#f8fafc" },
      async: true,
      sorting: dia.Paper.sorting.APPROX,
      // Conectividad: sólo de punto a punto, sin extremos sueltos.
      defaultLink: crearEnlacePorDefecto(obtenerElemento),
      // Aunque el ancla del enlace es el punto (que está dentro de la
      // terminación), el trazo visible se recorta en el borde del cuerpo. Así la
      // punta de flecha queda a la vista y la línea no tapa los números.
      defaultConnectionPoint: { name: "boundary", args: { selector: "body" } },
      validateMagnet: crearValidadorDeMagnet(graph, obtenerElemento),
      validateConnection: crearValidadorDeConexion(graph),
      linkPinning: false,
      multiLinks: false,
      // El radio debe quedar por debajo de la mitad de la separación entre
      // puntos para que la conexión no salte al punto vecino.
      snapLinks: { radius: 8 },
      markAvailable: true,
      // Las terminaciones siguen la disposición calculada por
      // `calcularPosiciones`, así que no se arrastran: además, al bloquear un
      // punto ocupado JointJS reinterpretaría el arrastre como movimiento del
      // elemento.
      interactive: { elementMove: false, linkMove: false, labelMove: false },
      // JointJS v4 no trae hoja de estilos, así que el resaltado de los puntos
      // disponibles se define aquí.
      highlighting: {
        magnetAvailability: {
          name: "stroke",
          options: {
            padding: 3,
            attrs: { stroke: "#16a34a", strokeWidth: 2 },
          },
        },
        elementAvailability: false,
      },
    })

    container.appendChild(paper.el)
    // Recalcula las dimensiones ahora que el lienzo ya está en el documento.
    paper.setDimensions("100%", "100%")

    graphRef.current = graph
    paperRef.current = paper

    const refrescarConexiones = () => setConexiones(listarConexiones(graph))
    graph.on("add remove change:source change:target", refrescarConexiones)

    // Al pasar el puntero: se resalta la línea para seguir su recorrido y
    // aparece el botón para deshacer la conexión.
    paper.on("link:mouseenter", (linkView) => {
      resaltarConexion(linkView, true)
      linkView.addTools(
        new dia.ToolsView({
          tools: [new linkTools.Remove({ distance: "50%" })],
        }),
      )
    })
    paper.on("link:mouseleave", (linkView) => {
      resaltarConexion(linkView, false)
      linkView.removeTools()
    })

    // La flecha debe apuntar siempre al punto de destino, sin importar en qué
    // sentido haya arrastrado el usuario.
    paper.on("link:connect", (linkView) => normalizarConexion(graph, linkView.model))

    // Paneo arrastrando el fondo del lienzo.
    let paneo: { clientX: number; clientY: number; tx: number; ty: number } | null = null

    paper.on("blank:pointerdown", (evt) => {
      const { tx, ty } = paper.translate()
      paneo = { clientX: evt.clientX ?? 0, clientY: evt.clientY ?? 0, tx, ty }
      container.style.cursor = "grabbing"
    })

    const terminarPaneo = () => {
      paneo = null
      container.style.cursor = ""
    }
    const moverPaneo = (evt: PointerEvent) => {
      if (!paneo) return
      paper.translate(
        paneo.tx + (evt.clientX - paneo.clientX),
        paneo.ty + (evt.clientY - paneo.clientY),
      )
    }

    window.addEventListener("pointermove", moverPaneo)
    window.addEventListener("pointerup", terminarPaneo)

    // Zoom con la rueda manteniendo Ctrl.
    const alGirarRueda = (evt: WheelEvent) => {
      if (!evt.ctrlKey) return
      evt.preventDefault()
      const actual = paper.scale().sx
      const siguiente = Math.min(
        LIMITES_ZOOM.max,
        Math.max(LIMITES_ZOOM.min, actual * (evt.deltaY < 0 ? 1.1 : 0.9)),
      )
      paper.scale(siguiente, siguiente)
      setZoom(siguiente)
    }
    container.addEventListener("wheel", alGirarRueda, { passive: false })

    return () => {
      window.removeEventListener("pointermove", moverPaneo)
      window.removeEventListener("pointerup", terminarPaneo)
      container.removeEventListener("wheel", alGirarRueda)
      paper.remove()
      graph.off()
      graphRef.current = null
      paperRef.current = null
    }
  }, [])

  // Dibuja el escenario que describe el JSON. Se repite sólo si llegan datos
  // distintos, así que las conexiones que traza el usuario no se pierden.
  const dibujarEscenario = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    cargarEscenario(graph, elemento)
    setConexiones(listarConexiones(graph))
    ajustarVista()
  }, [elemento, ajustarVista])

  useEffect(() => {
    dibujarEscenario()
  }, [dibujarEscenario])

  const alConectarEnOrden = useCallback(() => {
    const graph = graphRef.current
    if (graph) conectarEnOrden(graph, elemento)
  }, [elemento])

  const alQuitarConexiones = useCallback(() => {
    const graph = graphRef.current
    if (graph) graph.removeCells(graph.getLinks())
  }, [])

  // Botón temporal de diagnóstico: imprime en consola el JSON del elemento
  // completo (que se puede volver a cargar) y el detalle de las conexiones.
  const alExportar = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    const elementoJSON = exportarElemento(graph, elemento)
    console.log("[GiSmart] Elemento completo:", elementoJSON)
    console.log("[GiSmart] Conexiones:", exportarConexiones(graph, elemento))
    console.log(JSON.stringify(elementoJSON, null, 2))
  }, [elemento])

  const acciones = [
    {
      id: "auto",
      label: `Conectar ${vocab.puntoPlural} en orden`,
      icono: Wand2,
      onClick: alConectarEnOrden,
    },
    {
      id: "limpiar",
      label: `Quitar todas las ${vocab.conexionPlural}`,
      icono: Link2Off,
      onClick: alQuitarConexiones,
    },
    {
      id: "recargar",
      label: "Restaurar el escenario del JSON",
      icono: RotateCcw,
      onClick: dibujarEscenario,
    },
    {
      id: "exportar",
      label: "Exportar el JSON a la consola",
      icono: FileJson,
      onClick: alExportar,
    },
  ]

  return (
    <div className={`flex size-full flex-col overflow-hidden bg-background ${className ?? ""}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-foreground">
            Conectividad interna · {elemento.nombre}
          </h2>
          <p className="text-xs text-muted-foreground">
            {vocab.elemento} · {elemento.terminaciones.length} {vocab.terminacionPlural} ·{" "}
            {totales.izquierda} {vocab.puntoPlural} de entrada · {totales.derecha} de salida ·{" "}
            {conexiones.length} {vocab.conexionPlural}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-card p-1 ring-1 ring-border">
          {acciones.map((accion) => {
            const Icono = accion.icono
            return (
              <button
                key={accion.id}
                type="button"
                onClick={accion.onClick}
                title={accion.label}
                aria-label={accion.label}
                className="flex size-8 items-center justify-center rounded-md text-foreground transition hover:bg-accent"
              >
                <Icono className="size-4" />
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-card p-1 ring-1 ring-border">
          <button
            type="button"
            onClick={() => aplicarZoom(zoom - LIMITES_ZOOM.paso)}
            title="Alejar"
            aria-label="Alejar"
            className="flex size-8 items-center justify-center rounded-md text-foreground transition hover:bg-accent"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="min-w-11 text-center text-xs font-medium tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => aplicarZoom(zoom + LIMITES_ZOOM.paso)}
            title="Acercar"
            aria-label="Acercar"
            className="flex size-8 items-center justify-center rounded-md text-foreground transition hover:bg-accent"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={ajustarVista}
            title="Ajustar a la vista"
            aria-label="Ajustar a la vista"
            className="flex size-8 items-center justify-center rounded-md text-foreground transition hover:bg-accent"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </header>

      {elemento.avisos.length > 0 && <AvisosDatos avisos={elemento.avisos} />}

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden"
          role="application"
          aria-label={`Esquema de conectividad de ${elemento.nombre}`}
        />
        <ListaConexiones conexiones={conexiones} vocab={vocab} />
      </div>

      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Arrastre desde un {vocab.punto.toLowerCase()} de la columna izquierda hasta uno de la
        derecha para crear la {vocab.conexion.toLowerCase()}. Ctrl + rueda para acercar, arrastre el
        fondo para desplazarse.
      </footer>
    </div>
  )
}

function AvisosDatos({ avisos }: { avisos: string[] }) {
  return (
    <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <ul className="space-y-0.5">
        {avisos.map((aviso) => (
          <li key={aviso}>{aviso}</li>
        ))}
      </ul>
    </div>
  )
}

/** Abrevia el punto con las iniciales del vocabulario: B1·H4 en una mufa, C1·P4 en un ODF. */
function abreviar(vocab: VocabularioElemento, grupo: number, punto: number): string {
  return `${vocab.grupo[0]}${grupo}·${vocab.punto[0]}${punto}`
}

function ListaConexiones({
  conexiones,
  vocab,
}: {
  conexiones: RegistroConexion[]
  vocab: VocabularioElemento
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {vocab.conexionPlural} ({conexiones.length})
      </h3>

      {conexiones.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Aún no hay {vocab.conexionPlural} registradas.
        </p>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {conexiones.map((conexion) => (
            <li key={conexion.linkId} className="px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <InsigniaPunto
                  hex={conexion.desde.color.hex}
                  etiqueta={abreviar(vocab, conexion.desde.grupo, conexion.desde.punto)}
                />
                <span className="text-muted-foreground">→</span>
                <InsigniaPunto
                  hex={conexion.hasta.color.hex}
                  etiqueta={abreviar(vocab, conexion.hasta.grupo, conexion.hasta.punto)}
                />
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {conexion.tipo} · {conexion.hasta.terminacionEtiqueta}
                {conexion.etiqueta ? ` · ${conexion.etiqueta}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function InsigniaPunto({ hex, etiqueta }: { hex: string; etiqueta: string }) {
  return (
    <span className="flex items-center gap-1.5 font-medium tabular-nums text-foreground">
      <span
        className="size-2.5 shrink-0 rounded-sm ring-1 ring-slate-400"
        style={{ backgroundColor: hex }}
      />
      {etiqueta}
    </span>
  )
}
