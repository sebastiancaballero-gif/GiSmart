"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { dia } from "@joint/core"
import {
  AlertTriangle,
  FileDown,
  Loader2,
  Maximize,
  Minimize,
  Route,
  Scan,
  Spline,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { useExportarPdf } from "@/hooks/use-exportar-pdf"
import type { ModoConectividad } from "@/lib/map/conectividad"
import { parseMufaData, type MufaCampoJSON } from "@/lib/schematic/mufa-field-data"
import {
  aplicarEnrutamiento,
  cargarEscenarioCampo,
  cellNamespaceCampo,
  claveEmpalme,
  etiquetaOrigen,
  listarEmpalmesCampo,
  resaltarEmpalmeCampo,
  type ModoEnrutamiento,
  type RegistroEmpalmeCampo,
} from "@/lib/schematic/mufa-field-graph"
import { TEMA_CYBER } from "@/lib/schematic/tema-lienzo"

type MufaSchematicProps = {
  /**
   * JSON de conectividad de la mufa, tal como lo devuelve
   * `GET /api/mufas/{id}/conectividad`. Es obligatorio a propósito: antes tenía
   * el mockup como valor por defecto y una mufa sin datos mostraba el diagrama
   * de ejemplo como si fuera el suyo.
   */
  datos: MufaCampoJSON
  /**
   * Para qué se abre el esquema. `escritura` todavía no habilita la creación de
   * empalmes desde el lienzo: el dibujado es igual en los dos modos y sólo
   * cambia lo que se le dice al usuario. Está declarado para que quien lo abre
   * pueda expresar la intención sin forzar tipos.
   */
  modo?: ModoConectividad
  className?: string
}

const LIMITES_ZOOM = { min: 0.35, max: 2.2, paso: 0.15 }

/**
 * El esquema es una consola de ingeniería oscura sea cual sea el tema de la
 * página: la barra, el panel y el lienzo comparten la paleta de `TEMA_CYBER`.
 */
const TEMA = TEMA_CYBER

const CLASE_BOTON =
  "flex h-8 items-center gap-1.5 rounded-none border border-cyan-500/30 bg-slate-900 px-2.5 font-mono text-[11px] uppercase tracking-wider text-cyan-100 transition hover:border-cyan-400/80 hover:text-white hover:shadow-[0_0_12px_rgba(34,211,238,0.45)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-50"

const CLASE_BOTON_ICONO =
  "flex size-8 items-center justify-center rounded-none text-cyan-100 transition hover:bg-cyan-500/10 hover:text-white hover:shadow-[0_0_10px_rgba(34,211,238,0.35)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"

function nombreArchivoPdf(id: string): string {
  return `empalmes-${id.replace(/[^\w.-]+/g, "_")}.pdf`
}

/**
 * Vista de conectividad interna de una MUFA alimentada por el JSON de campo:
 * cables a los lados, bandejas instaladas al centro y empalmes de solo lectura.
 */
export function MufaSchematic({ datos, modo = "consulta", className }: MufaSchematicProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<dia.Graph | null>(null)
  const paperRef = useRef<dia.Paper | null>(null)

  const [modoEnrutamiento, setModoEnrutamiento] = useState<ModoEnrutamiento>("ortogonal")
  const [zoom, setZoom] = useState(1)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)

  // El JSON se normaliza durante el render, antes de que ningún efecto toque
  // el lienzo: así los cables, las bandejas y los empalmes ya están resueltos
  // cuando JointJS dibuja por primera vez.
  const mufa = useMemo(() => parseMufaData(datos), [datos])
  const empalmes = useMemo(() => listarEmpalmesCampo(mufa), [mufa])

  const pdf = useExportarPdf()

  const modoRef = useRef(modoEnrutamiento)
  useEffect(() => {
    modoRef.current = modoEnrutamiento
  }, [modoEnrutamiento])

  const ajustarVista = useCallback(() => {
    const paper = paperRef.current
    // Sin celdas no hay contenido que encuadrar y el ajuste devolvería una
    // escala sin sentido.
    if (!paper || paper.model.getCells().length === 0) return
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

    const graph = new dia.Graph({}, { cellNamespace: cellNamespaceCampo })
    const paper = new dia.Paper({
      model: graph,
      cellViewNamespace: cellNamespaceCampo,
      width: "100%",
      height: "100%",
      gridSize: 10,
      drawGrid: { name: "dot", args: { color: TEMA.grilla, thickness: 1 } },
      background: { color: TEMA.fondo },
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
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    cargarEscenarioCampo(graph, mufa, modoRef.current, TEMA)
    ajustarVista()
  }, [mufa, ajustarVista])

  // Al cambiar el modo, se actualizan al instante todos los enlaces del grafo.
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    aplicarEnrutamiento(graph, modoEnrutamiento)
  }, [modoEnrutamiento])

  const alAlternarEnrutamiento = useCallback(() => {
    setModoEnrutamiento((actual) => (actual === "ortogonal" ? "curvo" : "ortogonal"))
  }, [])

  const alternarPantallaCompleta = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    void rootRef.current?.requestFullscreen()
  }, [])

  const { exportar } = pdf
  const descargarPdf = useCallback(() => {
    const conexion = mufa.conexionDirecta
      ? "fusión directa"
      : `${mufa.bandejasInstaladas} bandejas`
    void exportar({
      titulo: `Reporte de empalmes · MUFA ${mufa.id}`,
      subtitulo: `${mufa.tipo} · ${mufa.estado} · ${mufa.cables.length} cables · ${empalmes.length} empalmes · ${conexion} · ${new Date().toLocaleString("es")}`,
      nombreArchivo: nombreArchivoPdf(mufa.id),
      filas: empalmes.map((empalme) => ({
        origenHilo: `H${empalme.origen.numero}`,
        origenColor: empalme.origen.color.hex,
        origenCable: empalme.origen.cableCodigo,
        destinoHilo: `H${empalme.destino.numero}`,
        destinoColor: empalme.destino.color.hex,
        destinoCable: empalme.destino.cableCodigo,
        traza: etiquetaOrigen(empalme.origen),
        via:
          empalme.via === "directo"
            ? `Fusión directa ${empalme.numero} · ${empalme.tipoEmpalme}`
            : `Bandeja ${empalme.numeroBandeja} · Slot ${empalme.slot} · ${empalme.tipoEmpalme}`,
        atenuacion: String(empalme.atenuacion),
      })),
    })
  }, [exportar, mufa, empalmes])

  // El lienzo ocupa "100%" del contenedor, pero al cambiar de tamaño hay que
  // recalcular el encuadre para que el esquema aproveche el espacio nuevo.
  useEffect(() => {
    function alCambiarPantallaCompleta() {
      const activa = document.fullscreenElement === rootRef.current
      setPantallaCompleta(activa)
      // El navegador todavía está redimensionando cuando dispara el evento.
      requestAnimationFrame(() => ajustarVista())
    }
    document.addEventListener("fullscreenchange", alCambiarPantallaCompleta)
    return () => document.removeEventListener("fullscreenchange", alCambiarPantallaCompleta)
  }, [ajustarVista])

  // Cuando el esquema se abre dentro del modal, el contenedor todavía está
  // creciendo mientras JointJS dibuja: sin reencuadrar queda a la escala del
  // primer fotograma y los empalmes se ven desfasados.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let pendiente = 0
    const observador = new ResizeObserver(() => {
      cancelAnimationFrame(pendiente)
      pendiente = requestAnimationFrame(ajustarVista)
    })
    observador.observe(container)

    return () => {
      cancelAnimationFrame(pendiente)
      observador.disconnect()
    }
  }, [ajustarVista])

  // En pantalla completa, Escape debe salir de ella sin cerrar además el modal
  // que envuelve al esquema (el navegador sale igual: esto solo frena al diálogo).
  useEffect(() => {
    if (!pantallaCompleta) return
    function frenarEscape(evt: KeyboardEvent) {
      if (evt.key === "Escape") evt.stopPropagation()
    }
    document.addEventListener("keydown", frenarEscape, true)
    return () => document.removeEventListener("keydown", frenarEscape, true)
  }, [pantallaCompleta])

  const ortogonal = modoEnrutamiento === "ortogonal"
  const IconoRuta = ortogonal ? Route : Spline

  return (
    <div
      ref={rootRef}
      className={`flex size-full flex-col overflow-hidden bg-slate-950 text-slate-100 ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-cyan-500/20 bg-slate-950 px-4 py-2.5">
        <div className="mr-auto min-w-0">
          <h2 className="truncate font-mono text-sm font-semibold tracking-tight text-slate-100">
            <span className="text-slate-400">MUFA::</span>
            <span className="text-cyan-300">{mufa.id}</span>
          </h2>
          <p className="font-mono text-[11px] text-slate-400">
            {mufa.tipo} · {mufa.estado} · {mufa.cables.length} cables · {empalmes.length}{" "}
            empalmes
          </p>
        </div>

        <div
          className={`rounded-none border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
            mufa.conexionDirecta
              ? "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200"
              : "border-amber-400/40 bg-amber-500/10 text-amber-200"
          }`}
          role="status"
          aria-live="polite"
        >
          {mufa.conexionDirecta ? (
            "Fusión directa · sin bandejas"
          ) : (
            <>
              Bandejas activas: {mufa.bandejasInstaladas}
              {mufa.capacidadBandejas !== null && ` de ${mufa.capacidadBandejas}`}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={alAlternarEnrutamiento}
          title={ortogonal ? "Cambiar a enrutamiento curvo" : "Cambiar a enrutamiento ortogonal"}
          aria-label={
            ortogonal ? "Cambiar a enrutamiento curvo" : "Cambiar a enrutamiento ortogonal"
          }
          aria-pressed={ortogonal}
          className={CLASE_BOTON}
        >
          <IconoRuta className="size-3.5" />
          {ortogonal ? "Ortogonal" : "Curvo"}
        </button>

        <div className="flex items-center border border-cyan-500/30 bg-slate-900">
          <button
            type="button"
            onClick={() => aplicarZoom(zoom - LIMITES_ZOOM.paso)}
            title="Alejar"
            aria-label="Alejar"
            className={CLASE_BOTON_ICONO}
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="min-w-12 text-center font-mono text-[11px] tabular-nums text-cyan-200">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => aplicarZoom(zoom + LIMITES_ZOOM.paso)}
            title="Acercar"
            aria-label="Acercar"
            className={CLASE_BOTON_ICONO}
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={ajustarVista}
            title="Ajustar a la vista"
            aria-label="Ajustar a la vista"
            className={CLASE_BOTON_ICONO}
          >
            <Scan className="size-4" />
          </button>
          <button
            type="button"
            onClick={alternarPantallaCompleta}
            title={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
            aria-label={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
            aria-pressed={pantallaCompleta}
            className={CLASE_BOTON_ICONO}
          >
            {pantallaCompleta ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>

        <button
          type="button"
          onClick={descargarPdf}
          disabled={pdf.exportando}
          title="Descargar el reporte de empalmes en PDF"
          className={`${CLASE_BOTON} border-fuchsia-400/50 text-fuchsia-100 hover:border-fuchsia-300 hover:shadow-[0_0_14px_rgba(232,121,249,0.5)] focus-visible:ring-fuchsia-300`}
        >
          {pdf.exportando ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileDown className="size-3.5" />
          )}
          {pdf.exportando ? "Generando…" : "Descargar PDF"}
        </button>
      </header>

      {pdf.error && (
        <p
          role="alert"
          className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 font-mono text-[11px] text-rose-200"
        >
          No se pudo generar el PDF: {pdf.error}
        </p>
      )}

      {mufa.avisos.length > 0 && <AvisosDatos avisos={mufa.avisos} />}

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden"
          role="application"
          aria-label={`Esquema de empalmes de ${mufa.id}`}
        />
        <ListaEmpalmes empalmes={empalmes} conexionDirecta={mufa.conexionDirecta} />
      </div>

      <footer className="border-t border-cyan-500/20 px-4 py-2 font-mono text-[11px] text-slate-400">
        {modo === "escritura"
          ? "Cargado desde el JSON de conectividad. Cambiar los empalmes desde el lienzo todavía no está disponible."
          : "Vista de solo lectura cargada desde el JSON de conectividad."}{" "}
        Ortogonal/Curvo cambia el dibujo de los empalmes. Ctrl + rueda para acercar, arrastre el
        fondo para desplazarse.
      </footer>
    </div>
  )
}

function AvisosDatos({ avisos }: { avisos: string[] }) {
  return (
    <div className="flex items-start gap-2 border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <ul className="space-y-0.5">
        {avisos.map((aviso) => (
          <li key={aviso}>{aviso}</li>
        ))}
      </ul>
    </div>
  )
}

function ListaEmpalmes({
  empalmes,
  conexionDirecta,
}: {
  empalmes: RegistroEmpalmeCampo[]
  conexionDirecta: boolean
}) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-cyan-500/20 bg-slate-900/70">
      <h3 className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-cyan-300">
        Empalmes
        <span className="border border-cyan-500/30 px-2 py-0.5 tabular-nums text-cyan-200">
          {empalmes.length}
        </span>
      </h3>

      {empalmes.length === 0 ? (
        <p className="px-4 py-4 text-xs text-slate-400">
          {conexionDirecta
            ? "La cubierta no tiene fusiones documentadas."
            : "No hay empalmes documentados en las bandejas instaladas."}
        </p>
      ) : (
        <ul className="flex-1 divide-y divide-slate-800 overflow-y-auto">
          {empalmes.map((empalme) => (
            <li
              key={claveEmpalme(empalme)}
              className="border-l-2 border-transparent px-4 py-2.5 text-xs transition-colors hover:border-cyan-400 hover:bg-cyan-500/5"
            >
              <div className="flex items-center gap-2">
                <InsigniaHilo
                  hex={empalme.origen.color.hex}
                  etiqueta={`H${empalme.origen.numero}`}
                />
                <span className="text-slate-500">→</span>
                <InsigniaHilo
                  hex={empalme.destino.color.hex}
                  etiqueta={`H${empalme.destino.numero}`}
                />
                <span className="ml-auto font-mono text-[11px] tabular-nums text-amber-200">
                  {empalme.atenuacion} dB
                </span>
              </div>
              <p
                className="mt-1 truncate font-mono text-[11px] text-cyan-300"
                title={`Origen: ${empalme.origen.cableCodigo} · Buffer ${empalme.origen.buffer} · Hilo ${empalme.origen.numero}`}
              >
                {etiquetaOrigen(empalme.origen)}
              </p>
              <p className="truncate text-[11px] text-slate-400">
                {empalme.via === "directo"
                  ? `Fusión directa ${empalme.numero} · ${empalme.tipoEmpalme}`
                  : `Bandeja ${empalme.numeroBandeja} · Slot ${empalme.slot} · ${empalme.tipoEmpalme}`}
              </p>
              <p className="truncate font-mono text-[11px] text-slate-500">
                {empalme.origen.cableCodigo} → {empalme.destino.cableCodigo} · B
                {empalme.destino.buffer}-H{empalme.destino.numero}
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
    <span className="flex items-center gap-1.5 font-mono font-semibold tabular-nums text-slate-100">
      <span
        className="size-2.5 shrink-0 rounded-full ring-1 ring-white/30"
        style={{ backgroundColor: hex, boxShadow: `0 0 6px ${hex}` }}
      />
      {etiqueta}
    </span>
  )
}
