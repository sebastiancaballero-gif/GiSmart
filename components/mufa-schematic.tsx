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
import { parseMufaData, type MufaCampoJSON, type MufaCampoParseada } from "@/lib/schematic/mufa-field-data"
import {
  aplicarEnrutamiento,
  cargarEscenarioCampo,
  cellNamespaceCampo,
  claveEmpalme,
  listarEmpalmesCampo,
  presentarEmpalme,
  resaltarEmpalmeCampo,
  type ModoEnrutamiento,
  type RegistroEmpalmeCampo,
} from "@/lib/schematic/mufa-field-graph"
import { TEMA_CLARO, TEMA_OSCURO } from "@/lib/schematic/tema-lienzo"

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
  /**
   * Reservado para cuando se pueda editar. Hoy el lienzo ignora el valor y
   * se queda en consulta: no se mueven nodos ni se crean enlaces.
   */
  modo?: ModoConectividad | "CONSULTA" | "EDICION"
  className?: string
}

const LIMITES_ZOOM = { min: 0.35, max: 2.2, paso: 0.15 }

/** El lienzo arranca en claro. El interruptor pasa a la paleta slate oscura. */
const MODO_FORZADO = "CONSULTA" as const

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
  const mufaDibujada = useRef<MufaCampoParseada | null>(null)

  const [modoEnrutamiento, setModoEnrutamiento] = useState<ModoEnrutamiento>("ortogonal")
  const [oscuro, setOscuro] = useState(false)
  const tema = oscuro ? TEMA_OSCURO : TEMA_CLARO
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
      drawGrid: { name: "dot", args: { color: TEMA_CLARO.grilla, thickness: 1 } },
      background: { color: TEMA_CLARO.fondo },
      async: true,
      sorting: dia.Paper.sorting.APPROX,
      // Solo lectura: no se crean empalmes desde la interfaz.
      defaultLink: () => new dia.Link(),
      defaultConnectionPoint: { name: "boundary", args: { selector: "body" } },
      validateMagnet: () => false,
      validateConnection: () => false,
      linkPinning: false,
      multiLinks: true,
      // Consulta: JointJS no deja arrastrar elementos ni crear enlaces.
      interactive: false,
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
      mufaDibujada.current = null
    }
  }, [])

  // Redibuja al cambiar los datos o el tema. El encuadre solo se recalcula con
  // datos nuevos: pasar a oscuro no debe perder el zoom.
  useEffect(() => {
    const graph = graphRef.current
    const paper = paperRef.current
    if (!graph || !paper) return
    paper.drawBackground({ color: tema.fondo })
    paper.setGrid({ name: "dot", args: { color: tema.grilla, thickness: 1 } })
    cargarEscenarioCampo(graph, mufa, modoRef.current, tema)
    if (mufaDibujada.current !== mufa) {
      mufaDibujada.current = mufa
      ajustarVista()
    }
  }, [mufa, tema, ajustarVista])

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
    const conexion = mufa.conexionPorDivisor
      ? `${mufa.divisoresInstalados} divisores`
      : mufa.conexionDirecta
        ? "fusión directa"
        : `${mufa.bandejasInstaladas} bandejas`
    void exportar({
      titulo: `Reporte de empalmes · MUFA ${mufa.id}`,
      subtitulo: `${mufa.tipo} · ${mufa.estado} · ${mufa.cables.length} cables · ${empalmes.length} empalmes · ${conexion} · ${new Date().toLocaleString("es")}`,
      nombreArchivo: nombreArchivoPdf(mufa.id),
      filas: empalmes.map((empalme) => {
        const fila = presentarEmpalme(empalme)
        return {
          origenHilo: fila.izquierda.etiqueta,
          origenColor: fila.izquierda.hex,
          origenCable: fila.origenCable,
          destinoHilo: fila.derecha.etiqueta,
          destinoColor: fila.derecha.hex,
          destinoCable: fila.destinoCable,
          traza: fila.traza,
          via: fila.via,
          atenuacion: String(fila.atenuacion),
        }
      }),
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
  const boton = oscuro
    ? "flex h-8 items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2.5 text-xs font-medium text-slate-100 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-50"
    : "flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-50"
  const botonIcono = oscuro
    ? "flex size-8 items-center justify-center rounded-md text-slate-100 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
    : "flex size-8 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"

  return (
    <div
      ref={rootRef}
      className={`flex size-full flex-col overflow-hidden ${oscuro ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"} ${className ?? ""}`}
    >
      <header className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${oscuro ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className="mr-auto min-w-0">
          <h2 className={`truncate text-sm font-semibold tracking-tight ${oscuro ? "text-slate-100" : "text-slate-900"}`}>
            {mufa.id}
          </h2>
          <p className={`text-[11px] ${oscuro ? "text-slate-400" : "text-slate-500"}`}>
            {mufa.tipo} · {mufa.estado} · {mufa.cables.length} cables · {empalmes.length}{" "}
            empalmes
          </p>
        </div>

        <div
          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
            mufa.conexionPorDivisor
              ? oscuro
                ? "border-sky-400/40 bg-sky-500/10 text-sky-200"
                : "border-sky-300 bg-sky-50 text-sky-800"
              : mufa.conexionDirecta
                ? oscuro
                  ? "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200"
                  : "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800"
                : oscuro
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                  : "border-amber-300 bg-amber-50 text-amber-800"
          }`}
          role="status"
          aria-live="polite"
        >
          {mufa.conexionPorDivisor ? (
            `Divisores activos: ${mufa.divisoresInstalados}`
          ) : mufa.conexionDirecta ? (
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
          role="switch"
          aria-checked={oscuro}
          onClick={() => setOscuro((actual) => !actual)}
          title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className={boton}
        >
          <span className={oscuro ? "text-slate-400" : "text-slate-900"}>Claro</span>
          <span
            className={`relative h-4 w-8 rounded-full ${oscuro ? "bg-sky-500" : "bg-slate-300"}`}
          >
            <span
              className={`absolute top-0.5 size-3 rounded-full bg-white transition-transform ${oscuro ? "translate-x-4" : "translate-x-0.5"}`}
            />
          </span>
          <span className={oscuro ? "text-slate-100" : "text-slate-400"}>Oscuro</span>
        </button>

        <button
          type="button"
          onClick={alAlternarEnrutamiento}
          title={ortogonal ? "Cambiar a enrutamiento curvo" : "Cambiar a enrutamiento ortogonal"}
          aria-label={
            ortogonal ? "Cambiar a enrutamiento curvo" : "Cambiar a enrutamiento ortogonal"
          }
          aria-pressed={ortogonal}
          className={boton}
        >
          <IconoRuta className="size-3.5" />
          {ortogonal ? "Ortogonal" : "Curvo"}
        </button>

        <div className={`flex items-center rounded-md border ${oscuro ? "border-slate-600 bg-slate-800" : "border-slate-300 bg-white"}`}>
          <button
            type="button"
            onClick={() => aplicarZoom(zoom - LIMITES_ZOOM.paso)}
            title="Alejar"
            aria-label="Alejar"
            className={botonIcono}
          >
            <ZoomOut className="size-4" />
          </button>
          <span className={`min-w-12 text-center text-[11px] tabular-nums ${oscuro ? "text-slate-300" : "text-slate-500"}`}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => aplicarZoom(zoom + LIMITES_ZOOM.paso)}
            title="Acercar"
            aria-label="Acercar"
            className={botonIcono}
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={ajustarVista}
            title="Ajustar a la vista"
            aria-label="Ajustar a la vista"
            className={botonIcono}
          >
            <Scan className="size-4" />
          </button>
          <button
            type="button"
            onClick={alternarPantallaCompleta}
            title={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
            aria-label={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
            aria-pressed={pantallaCompleta}
            className={botonIcono}
          >
            {pantallaCompleta ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>

        <button
          type="button"
          onClick={descargarPdf}
          disabled={pdf.exportando}
          title="Descargar el reporte de empalmes en PDF"
          className={boton}
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
          className={`border-b px-4 py-2 text-[11px] ${oscuro ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"}`}
        >
          No se pudo generar el PDF: {pdf.error}
        </p>
      )}

      {mufa.avisos.length > 0 && <AvisosDatos avisos={mufa.avisos} oscuro={oscuro} />}

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden"
          role="application"
          aria-label={`Esquema de empalmes de ${mufa.id}`}
        />
        <ListaEmpalmes
          empalmes={empalmes}
          conexionDirecta={mufa.conexionDirecta}
          conexionPorDivisor={mufa.conexionPorDivisor}
          oscuro={oscuro}
        />
      </div>

      <footer className={`border-t px-4 py-2 text-[11px] ${oscuro ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}>
        {MODO_FORZADO === "CONSULTA"
          ? "Modo consulta: el esquema es de solo lectura y no se puede mover ni editar."
          : null}{" "}
        {modo === "escritura" || modo === "EDICION"
          ? "La edición desde el lienzo todavía no está disponible."
          : "Cargado desde el JSON de conectividad."}{" "}
        Ortogonal/Curvo cambia el dibujo de los empalmes. Ctrl + rueda para acercar, arrastre el
        fondo para desplazarse.
      </footer>
    </div>
  )
}

function AvisosDatos({ avisos, oscuro }: { avisos: string[]; oscuro: boolean }) {
  return (
    <div className={`flex items-start gap-2 border-b px-4 py-2 text-xs ${oscuro ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
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
  conexionPorDivisor,
  oscuro,
}: {
  empalmes: RegistroEmpalmeCampo[]
  conexionDirecta: boolean
  conexionPorDivisor: boolean
  oscuro: boolean
}) {
  return (
    <aside className={`flex w-80 shrink-0 flex-col border-l ${oscuro ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
      <h3 className={`flex items-center justify-between border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest ${oscuro ? "border-slate-700 text-sky-300" : "border-slate-200 text-sky-700"}`}>
        Empalmes
        <span className={`border px-2 py-0.5 tabular-nums ${oscuro ? "border-slate-600 text-slate-300" : "border-slate-300 text-slate-600"}`}>
          {empalmes.length}
        </span>
      </h3>

      {empalmes.length === 0 ? (
        <p className={`px-4 py-4 text-xs ${oscuro ? "text-slate-400" : "text-slate-500"}`}>
          {conexionPorDivisor
            ? "Los divisores no tienen puertos conectados."
            : conexionDirecta
              ? "La cubierta no tiene fusiones documentadas."
              : "No hay empalmes documentados en las bandejas instaladas."}
        </p>
      ) : (
        <ul className={`flex-1 divide-y overflow-y-auto ${oscuro ? "divide-slate-800" : "divide-slate-200"}`}>
          {empalmes.map((empalme) => {
            const fila = presentarEmpalme(empalme)
            return (
              <li
                key={claveEmpalme(empalme)}
                className={`border-l-2 border-transparent px-4 py-2.5 text-xs transition-colors ${oscuro ? "hover:border-sky-400 hover:bg-sky-500/10" : "hover:border-sky-500 hover:bg-sky-50"}`}
              >
                <div className="flex items-center gap-2">
                  <InsigniaHilo hex={fila.izquierda.hex} etiqueta={fila.izquierda.etiqueta} oscuro={oscuro} />
                  <span className="text-slate-400">→</span>
                  <InsigniaHilo hex={fila.derecha.hex} etiqueta={fila.derecha.etiqueta} oscuro={oscuro} />
                  <span className={`ml-auto text-[11px] tabular-nums ${oscuro ? "text-amber-200" : "text-amber-700"}`}>
                    {fila.atenuacion} dB
                  </span>
                </div>
                <p className={`mt-1 truncate font-mono text-[11px] ${oscuro ? "text-sky-300" : "text-sky-700"}`} title={fila.traza}>
                  {fila.traza}
                </p>
                <p className={`truncate text-[11px] ${oscuro ? "text-slate-400" : "text-slate-500"}`}>{fila.via}</p>
                <p className={`truncate font-mono text-[11px] ${oscuro ? "text-slate-500" : "text-slate-400"}`}>
                  {fila.recorrido}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

function InsigniaHilo({ hex, etiqueta, oscuro }: { hex: string; etiqueta: string; oscuro: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 font-mono text-[11px] font-semibold tabular-nums ${oscuro ? "text-slate-100" : "text-slate-800"}`}>
      <span
        className={`size-2.5 shrink-0 rounded-full ring-1 ${oscuro ? "ring-white/30" : "ring-slate-400/40"}`}
        style={{ backgroundColor: hex }}
      />
      {etiqueta}
    </span>
  )
}
