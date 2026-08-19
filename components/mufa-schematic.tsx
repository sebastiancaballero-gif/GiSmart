"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { dia } from "@joint/core"
import {
  AlertTriangle,
  Maximize2,
  Route,
  Spline,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import {
  parsearMufaCampo,
  type MufaCampoJSON,
} from "@/lib/schematic/mufa-field-data"
import { MUFA_CAMPO_MOCKUP } from "@/lib/schematic/mufa-field-mockup"
import {
  aplicarEnrutamiento,
  cargarEscenarioCampo,
  cellNamespaceCampo,
  listarEmpalmesCampo,
  resaltarEmpalmeCampo,
  type ModoEnrutamiento,
  type RegistroEmpalmeCampo,
} from "@/lib/schematic/mufa-field-graph"

type MufaSchematicProps = {
  /** JSON de campo de la MUFA. Por defecto se usa el mockup de `JsonMufa.txt`. */
  datos?: MufaCampoJSON
  className?: string
}

const LIMITES_ZOOM = { min: 0.35, max: 2.2, paso: 0.15 }

/**
 * Vista de conectividad interna de una MUFA alimentada por el JSON de campo:
 * cables a los lados, bandejas instaladas al centro y empalmes de solo lectura.
 */
export function MufaSchematic({ datos = MUFA_CAMPO_MOCKUP, className }: MufaSchematicProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<dia.Graph | null>(null)
  const paperRef = useRef<dia.Paper | null>(null)

  const [modoEnrutamiento, setModoEnrutamiento] = useState<ModoEnrutamiento>("ortogonal")
  const [zoom, setZoom] = useState(1)

  const mufa = useMemo(() => parsearMufaCampo(datos), [datos])
  const empalmes = useMemo(() => listarEmpalmesCampo(mufa), [mufa])

  const modoRef = useRef(modoEnrutamiento)
  useEffect(() => {
    modoRef.current = modoEnrutamiento
  }, [modoEnrutamiento])

  const ajustarVista = useCallback(() => {
    const paper = paperRef.current
    if (!paper) return
    paper.transformToFitContent({
      padding: 28,
      useModelGeometry: true,
      minScale: LIMITES_ZOOM.min,
      maxScale: 1.35,
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

  // Creación del Graph y el Paper (una sola vez).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // El lienzo de JointJS se dibuja en <canvas>/SVG, así que no puede resolver
    // clases de Tailwind: se leen los tokens de tema actuales (oklch(...) ya
    // resuelto) para que el fondo y la grilla respeten el modo claro/oscuro.
    const tema = getComputedStyle(document.documentElement)
    const fondoLienzo = tema.getPropertyValue("--card").trim() || "#f8fafc"
    const colorGrilla = tema.getPropertyValue("--border").trim() || "#dbe3ec"

    const graph = new dia.Graph({}, { cellNamespace: cellNamespaceCampo })
    const paper = new dia.Paper({
      model: graph,
      cellViewNamespace: cellNamespaceCampo,
      width: "100%",
      height: "100%",
      gridSize: 10,
      drawGrid: { name: "dot", args: { color: colorGrilla, thickness: 1 } },
      background: { color: fondoLienzo },
      async: true,
      sorting: dia.Paper.sorting.APPROX,
      // Solo lectura: no se crean empalmes desde la interfaz.
      defaultLink: () => new dia.Link(),
      defaultConnectionPoint: { name: "boundary", args: { selector: "body" } },
      validateMagnet: () => false,
      validateConnection: () => false,
      linkPinning: false,
      multiLinks: true,
      interactive: { elementMove: false, linkMove: false, labelMove: false },
      highlighting: {
        magnetAvailability: false,
        elementAvailability: false,
      },
    })

    container.appendChild(paper.el)
    paper.setDimensions("100%", "100%")

    graphRef.current = graph
    paperRef.current = paper

    paper.on("link:mouseenter", (linkView) => resaltarEmpalmeCampo(linkView, true))
    paper.on("link:mouseleave", (linkView) => resaltarEmpalmeCampo(linkView, false))

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

  // Dibuja el escenario cuando llegan datos nuevos.
  const dibujarEscenario = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    cargarEscenarioCampo(graph, mufa, modoRef.current)
    ajustarVista()
  }, [mufa, ajustarVista])

  useEffect(() => {
    dibujarEscenario()
  }, [dibujarEscenario])

  // Al cambiar el modo, se actualizan al instante todos los enlaces del grafo.
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    aplicarEnrutamiento(graph, modoEnrutamiento)
  }, [modoEnrutamiento])

  const alAlternarEnrutamiento = useCallback(() => {
    setModoEnrutamiento((actual) => (actual === "ortogonal" ? "curvo" : "ortogonal"))
  }, [])

  const ortogonal = modoEnrutamiento === "ortogonal"
  const IconoRuta = ortogonal ? Route : Spline

  return (
    <div className={`flex size-full flex-col overflow-hidden bg-background ${className ?? ""}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-foreground">
            Conectividad interna · {mufa.id}
          </h2>
          <p className="text-xs text-muted-foreground">
            {mufa.tipo} · {mufa.estado} · {mufa.cables.length} cables · {empalmes.length}{" "}
            empalmes
          </p>
        </div>

        <div
          className="rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-800 ring-1 ring-orange-500/30 dark:text-orange-200"
          role="status"
          aria-live="polite"
        >
          Bandejas activas: {mufa.bandejasInstaladas} de {mufa.capacidadBandejas}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-card p-1 ring-1 ring-border">
          <button
            type="button"
            onClick={alAlternarEnrutamiento}
            title={
              ortogonal
                ? "Cambiar a enrutamiento curvo"
                : "Cambiar a enrutamiento ortogonal"
            }
            aria-label={
              ortogonal
                ? "Cambiar a enrutamiento curvo"
                : "Cambiar a enrutamiento ortogonal"
            }
            aria-pressed={ortogonal}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            <IconoRuta className="size-4" />
            {ortogonal ? "Ortogonal" : "Curvo"}
          </button>
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
          aria-label={`Esquema de empalmes de ${mufa.id}`}
        />
        <ListaEmpalmes empalmes={empalmes} />
      </div>

      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Vista de solo lectura cargada desde el JSON de campo. Use el botón Ortogonal/Curvo para
        cambiar el dibujo de los empalmes. Ctrl + rueda para acercar, arrastre el fondo para
        desplazarse.
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

function ListaEmpalmes({ empalmes }: { empalmes: RegistroEmpalmeCampo[] }) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Empalmes ({empalmes.length})
      </h3>

      {empalmes.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No hay empalmes documentados en las bandejas instaladas.
        </p>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {empalmes.map((empalme) => (
            <li
              key={`${empalme.bandejaId}-${empalme.slot}`}
              className="px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <InsigniaHilo
                  hex={empalme.origen.color.hex}
                  etiqueta={`H${empalme.origen.numero}`}
                />
                <span className="text-muted-foreground">→</span>
                <InsigniaHilo
                  hex={empalme.destino.color.hex}
                  etiqueta={`H${empalme.destino.numero}`}
                />
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                Bandeja {empalme.numeroBandeja} · Slot {empalme.slot} · {empalme.tipoEmpalme} ·{" "}
                {empalme.atenuacion} dB
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {empalme.origen.cableCodigo} → {empalme.destino.cableCodigo}
              </p>
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
