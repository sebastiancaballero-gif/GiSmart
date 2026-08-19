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

import { parsearMufa, type MufaJSON } from "@/lib/schematic/mufa-data"
import { MUFA_MOCKUP } from "@/lib/schematic/mufa-mockup"
import {
  cargarEscenario,
  cellNamespace,
  crearEnlacePorDefecto,
  crearValidadorDeConexion,
  crearValidadorDeMagnet,
  empalmarEnOrden,
  exportarEmpalmes,
  listarEmpalmes,
  normalizarEmpalme,
  resaltarEmpalme,
  type RegistroEmpalme,
} from "@/lib/schematic/mufa-graph"

type MufaSchematicProps = {
  /** Escenario a dibujar. Por defecto se usa el mockup de prueba. */
  datos?: MufaJSON
  className?: string
}

const LIMITES_ZOOM = { min: 0.35, max: 2.2, paso: 0.15 }

/**
 * Vista de conectividad interna de una mufa. La cantidad de cables, buffers e
 * hilos proviene íntegramente del JSON: la interfaz sólo permite trazar y
 * borrar empalmes, no alterar la estructura.
 */
export function MufaSchematic({ datos = MUFA_MOCKUP, className }: MufaSchematicProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<dia.Graph | null>(null)
  const paperRef = useRef<dia.Paper | null>(null)

  const [empalmes, setEmpalmes] = useState<RegistroEmpalme[]>([])
  const [zoom, setZoom] = useState(1)

  // Separación de responsabilidades: aquí sólo se parsea el JSON; el dibujo
  // ocurre en los efectos de abajo.
  const mufa = useMemo(() => parsearMufa(datos), [datos])

  const totales = useMemo(
    () => ({
      entrada: mufa.entradas.reduce((suma, cable) => suma + cable.totalHilos, 0),
      salida: mufa.salidas.reduce((suma, cable) => suma + cable.totalHilos, 0),
    }),
    [mufa],
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
      // Conectividad: sólo de hilo a hilo, sin extremos sueltos.
      defaultLink: crearEnlacePorDefecto(),
      // Aunque el ancla del enlace es el hilo (que está dentro del cable), el
      // trazo visible se recorta en el borde del cuerpo. Así la punta de flecha
      // queda a la vista y la línea no tapa los números de los hilos.
      defaultConnectionPoint: { name: "boundary", args: { selector: "body" } },
      validateMagnet: crearValidadorDeMagnet(graph),
      validateConnection: crearValidadorDeConexion(graph),
      linkPinning: false,
      multiLinks: false,
      // El radio debe quedar por debajo de la mitad de la separación entre
      // hilos para que el empalme no salte al hilo vecino.
      snapLinks: { radius: 8 },
      markAvailable: true,
      // Los cables siguen la disposición calculada por `calcularPosiciones`, así
      // que no se arrastran: además, al bloquear un hilo ocupado JointJS
      // reinterpretaría el arrastre como movimiento del cable.
      interactive: { elementMove: false, linkMove: false, labelMove: false },
      // JointJS v4 no trae hoja de estilos, así que el resaltado de los hilos
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

    const refrescarEmpalmes = () => setEmpalmes(listarEmpalmes(graph))
    graph.on("add remove change:source change:target", refrescarEmpalmes)

    // Al pasar el puntero: se resalta la línea para seguir su recorrido y
    // aparece el botón para deshacer el empalme.
    paper.on("link:mouseenter", (linkView) => {
      resaltarEmpalme(linkView, true)
      linkView.addTools(
        new dia.ToolsView({
          tools: [new linkTools.Remove({ distance: "50%" })],
        }),
      )
    })
    paper.on("link:mouseleave", (linkView) => {
      resaltarEmpalme(linkView, false)
      linkView.removeTools()
    })

    // La flecha debe apuntar siempre al hilo de salida, sin importar en qué
    // sentido haya arrastrado el usuario.
    paper.on("link:connect", (linkView) => normalizarEmpalme(graph, linkView.model))

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
  // distintos, así que los empalmes que traza el usuario no se pierden.
  const dibujarEscenario = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    cargarEscenario(graph, mufa)
    setEmpalmes(listarEmpalmes(graph))
    ajustarVista()
  }, [mufa, ajustarVista])

  useEffect(() => {
    dibujarEscenario()
  }, [dibujarEscenario])

  const alEmpalmarEnOrden = useCallback(() => {
    const graph = graphRef.current
    if (graph) empalmarEnOrden(graph, mufa)
  }, [mufa])

  const alQuitarEmpalmes = useCallback(() => {
    const graph = graphRef.current
    if (graph) graph.removeCells(graph.getLinks())
  }, [])

  // Botón temporal de diagnóstico: imprime en consola el JSON de los empalmes.
  const alExportar = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    const exportacion = exportarEmpalmes(graph, mufa)
    console.log("[GiSmart] Empalmes de la mufa:", exportacion)
    console.log(JSON.stringify(exportacion, null, 2))
  }, [mufa])

  const acciones = [
    { id: "auto", label: "Empalmar hilos en orden", icono: Wand2, onClick: alEmpalmarEnOrden },
    { id: "limpiar", label: "Quitar todos los empalmes", icono: Link2Off, onClick: alQuitarEmpalmes },
    {
      id: "recargar",
      label: "Restaurar el escenario del JSON",
      icono: RotateCcw,
      onClick: dibujarEscenario,
    },
    {
      id: "exportar",
      label: "Exportar empalmes a la consola",
      icono: FileJson,
      onClick: alExportar,
    },
  ]

  return (
    <div className={`flex size-full flex-col overflow-hidden bg-background ${className ?? ""}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-foreground">
            Conectividad interna · {mufa.nombre}
          </h2>
          <p className="text-xs text-muted-foreground">
            {mufa.cables.length} cables · {totales.entrada} hilos de entrada · {totales.salida}{" "}
            hilos de salida · {empalmes.length} empalmes
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

      {mufa.avisos.length > 0 && <AvisosDatos avisos={mufa.avisos} />}

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden"
          role="application"
          aria-label="Esquema de empalmes de la mufa"
        />
        <ListaEmpalmes empalmes={empalmes} />
      </div>

      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Arrastre desde un hilo del cable de entrada hasta un hilo de un cable de salida para crear
        el empalme. Ctrl + rueda para acercar, arrastre el fondo para desplazarse.
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

function ListaEmpalmes({ empalmes }: { empalmes: RegistroEmpalme[] }) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Empalmes ({empalmes.length})
      </h3>

      {empalmes.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Aún no hay empalmes registrados.
        </p>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {empalmes.map((empalme) => (
            <li key={empalme.linkId} className="flex items-center gap-2 px-3 py-2 text-xs">
              <InsigniaHilo
                hex={empalme.entrada.color.hex}
                etiqueta={`B${empalme.entrada.buffer}·H${empalme.entrada.hilo}`}
              />
              <span className="text-muted-foreground">→</span>
              <InsigniaHilo
                hex={empalme.salida.color.hex}
                etiqueta={`B${empalme.salida.buffer}·H${empalme.salida.hilo}`}
              />
              <span className="ml-auto truncate text-[11px] text-muted-foreground">
                {empalme.salida.cableEtiqueta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function InsigniaHilo({ hex, etiqueta }: { hex: string; etiqueta: string }) {
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
