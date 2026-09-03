"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import "ol/ol.css"
import Map from "ol/Map"
import View from "ol/View"
import TileLayer from "ol/layer/Tile"
import OSM from "ol/source/OSM"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import Feature from "ol/Feature"
import LineString from "ol/geom/LineString"
import Polygon from "ol/geom/Polygon"
import Overlay from "ol/Overlay"
import { fromLonLat, toLonLat } from "ol/proj"
import { getLength, getArea } from "ol/sphere"
import { Style, Fill, Stroke, RegularShape } from "ol/style"
import Draw from "ol/interaction/Draw"
import Modify from "ol/interaction/Modify"
import Select from "ol/interaction/Select"
import Snap from "ol/interaction/Snap"
import DoubleClickZoom from "ol/interaction/DoubleClickZoom"
import { click, pointerMove } from "ol/events/condition"
import { defaults as defaultControls } from "ol/control"
import type { Geometry } from "ol/geom"
import {
  Hand,
  Box,
  Spline,
  Hexagon,
  Trash2,
  X,
  Pencil,
  Waypoints,
  Network,
  Info,
  Ruler,
  Square,
  Loader2,
  Building2,
  ChevronDown,
} from "lucide-react"
import { LAYER_COLORS } from "@/lib/network-colors"
import { MEASURE_COLOR } from "@/lib/map/symbology"
import { MUFA_SCHEMA_EXAMPLE } from "@/lib/mufa-schema"
import {
  CABECERA_COLOR,
  CABECERA_FIELD_LABELS,
  FIBER_FIELD_LABELS,
  FIBER_HINT,
  FUNCION_CUB_COLORS,
  FUNCION_CUB_DEFAULT_COLOR,
  MUFA_FIELD_LABELS,
  TYPE_LABELS,
  cabeceraStyle,
  colorForFuncionCub,
  fiberStyle,
  formatArea,
  formatLength,
  isNearNode,
  measureStyle,
  nodeStyle,
  zoneStyle,
  type FeatureType,
} from "@/lib/map/symbology"
import { loadRealCabeceras, loadRealFiberCables, loadRealMufas } from "@/lib/map/loaders"
import { MufaSchemaDialog } from "@/components/mufa-schema-dialog"
import { MufaConnectivityModal } from "@/components/mufa-connectivity-modal"
import { InfoTableDialog } from "@/components/info-table-dialog"
import { GismartMark } from "@/components/gismart-mark"
import type { MufaCampoJSON } from "@/lib/schematic/mufa-field-data"

type NetworkMapProps = {
  center?: [number, number]
  zoom?: number
  className?: string
  visible?: { nodes: boolean; fibers: boolean; zones: boolean; cabeceras: boolean }
  onStatsChange?: (stats: NetworkStats) => void
  /** Se dispara al terminar cada desplazamiento, con el centro actual del mapa. */
  onCenterChange?: (center: { lon: number; lat: number }) => void
  /** Centra el mapa en un punto. `nonce` permite repetir el mismo destino. */
  flyTo?: { lon: number; lat: number; zoom?: number; nonce: number } | null
  /** Al incrementarse, recarga los datos reales desde los endpoints. */
  reloadTrigger?: number
  /** Al incrementarse, reencuadra el mapa sobre los datos de red cargados. */
  fitTrigger?: number
  /** Herramienta activa controlada desde fuera (ribbon). */
  tool?: Tool
  onToolChange?: (tool: Tool) => void
  /** Avisa mientras se están pidiendo los datos reales a los endpoints. */
  onLoadingChange?: (loading: boolean) => void
}

type Tool = "pan" | "edit" | "node" | "fiber" | "zone" | "delete" | "measure-length" | "measure-area"

/** Herramientas del mapa, para que el ribbon pueda activarlas desde fuera. */
export type MapTool = Tool

type SelectedFeature = {
  feature: Feature<Geometry>
  type: FeatureType
}

/** Una categoría del desglose de una capa, para el panel de capas. */
export type LayerBucket = { label: string; count: number; color: string }

/** Resumen de lo cargado en el mapa, que consume el panel lateral. */
export type NetworkStats = {
  counts: { nodes: number; fibers: number; zones: number; cabeceras: number }
  totalKm: number
  /** Conteo por categoría de cada capa, para desplegar en el panel. */
  breakdown: { nodes: LayerBucket[]; fibers: LayerBucket[] }
}

/**
 * Cuenta los elementos por categoría, ordenados de mayor a menor. `clasificar`
 * define a qué categoría pertenece cada elemento y de qué color se muestra.
 */
function agrupar(
  features: Feature<Geometry>[],
  clasificar: (f: Feature<Geometry>) => { label: string; color: string },
): LayerBucket[] {
  // Objeto plano y no `Map`: en este archivo `Map` es el de OpenLayers.
  const buckets: Record<string, LayerBucket> = {}
  features.forEach((f) => {
    const { label, color } = clasificar(f)
    if (buckets[label]) buckets[label].count += 1
    else buckets[label] = { label, color, count: 1 }
  })
  return Object.values(buckets).sort((a, b) => b.count - a.count)
}

// Réplica en SVG del símbolo que dibuja `nodeStyle`, para que la leyenda y el
// mapa muestren exactamente la misma marca.
function MufaSymbol({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="6" fill="#ffffff" stroke={color} strokeWidth="2" />
      <line x1="8" y1="2" x2="8" y2="14" stroke={color} strokeWidth="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

export function NetworkMap({
  // Centro/zoom iniciales sobre La Unión, Valle del Cauca, donde está la red
  // real cargada hoy — el mapa además se reencuadra solo apenas llegan las
  // mufas (ver loadRealMufas), así que esto es solo el punto de partida.
  center = [-76.0883, 4.5333],
  zoom = 14,
  className,
  visible: externalVisible,
  onStatsChange,
  onCenterChange,
  flyTo,
  reloadTrigger,
  fitTrigger,
  tool: externalTool,
  onToolChange,
  onLoadingChange,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)

  const nodeSource = useRef(new VectorSource()).current
  const fiberSource = useRef(new VectorSource()).current
  const zoneSource = useRef(new VectorSource()).current
  const cabeceraSource = useRef(new VectorSource()).current
  const measureSource = useRef(new VectorSource()).current

  const nodeLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const fiberLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const zoneLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const cabeceraLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const measureLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const drawRef = useRef<Draw | null>(null)
  const selectRef = useRef<Select | null>(null)
  const deleteHoverRef = useRef<Select | null>(null)
  const editSelectRef = useRef<Select | null>(null)
  const editModifyRef = useRef<Modify | null>(null)
  const fiberSnapRef = useRef<Snap | null>(null)
  const fiberNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const measureOverlaysRef = useRef<Overlay[]>([])

  const [coords, setCoords] = useState<{ lon: number; lat: number } | null>(null)
  const [zoomLevel, setZoomLevel] = useState<number>(zoom)
  // La herramienta puede venir de fuera (ribbon) o manejarse sola: si llega
  // `tool` por props manda esa, y los clicks del propio mapa se notifican arriba.
  const [internalTool, setInternalTool] = useState<Tool>("pan")
  const tool = externalTool ?? internalTool
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [schemaOpen, setSchemaOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [fiberLoadError, setFiberLoadError] = useState<string | null>(null)
  const [mufaLoadError, setMufaLoadError] = useState<string | null>(null)
  const [cabeceraLoadError, setCabeceraLoadError] = useState<string | null>(null)
  const [connectivityOpen, setConnectivityOpen] = useState(false)
  const [connectivitySchema, setConnectivitySchema] = useState<MufaCampoJSON | null>(null)
  const [fiberNotice, setFiberNotice] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  // La cortina de bienvenida solo cubre el arranque; las recargas posteriores
  // usan el aviso discreto para no tapar el mapa que el usuario está mirando.
  const [firstLoadDone, setFirstLoadDone] = useState(false)
  const [legendOpen, setLegendOpen] = useState(true)

  const onStatsChangeRef = useRef(onStatsChange)
  onStatsChangeRef.current = onStatsChange

  const onCenterChangeRef = useRef(onCenterChange)
  onCenterChangeRef.current = onCenterChange

  const onToolChangeRef = useRef(onToolChange)
  onToolChangeRef.current = onToolChange

  const onLoadingChangeRef = useRef(onLoadingChange)
  onLoadingChangeRef.current = onLoadingChange

  const setTool = useCallback((next: Tool) => {
    setInternalTool(next)
    onToolChangeRef.current?.(next)
  }, [])

  /**
   * A qué capa de datos pertenece un elemento. Devuelve `null` si no pertenece
   * a ninguna: las interacciones de OpenLayers dibujan sus propios elementos
   * auxiliares (manejadores de vértice, bocetos) que no son datos de la red.
   */
  const tipoDeFeature = useCallback(
    (feature: Feature<Geometry>): FeatureType | null => {
      if (nodeSource.hasFeature(feature)) return "node"
      if (fiberSource.hasFeature(feature)) return "fiber"
      if (cabeceraSource.hasFeature(feature)) return "cabecera"
      if (zoneSource.hasFeature(feature)) return "zone"
      return null
    },
    [nodeSource, fiberSource, cabeceraSource, zoneSource],
  )

  const recalc = useCallback(() => {
    const nodeFeatures = nodeSource.getFeatures()
    const fiberFeatures = fiberSource.getFeatures()
    const km = fiberFeatures.reduce((acc, f) => {
      const g = f.getGeometry() as LineString | undefined
      return acc + (g ? getLength(g) / 1000 : 0)
    }, 0)

    onStatsChangeRef.current?.({
      counts: {
        nodes: nodeFeatures.length,
        fibers: fiberFeatures.length,
        zones: zoneSource.getFeatures().length,
        cabeceras: cabeceraSource.getFeatures().length,
      },
      totalKm: km,
      // El desglose usa el mismo campo que define la simbología de cada capa,
      // así el panel explica lo que se está viendo en el mapa.
      breakdown: {
        nodes: agrupar(nodeFeatures, (f) => {
          const funcion = (f.get("funcion_cub") as string | null) || "Otro / sin dato"
          return { label: funcion, color: colorForFuncionCub(f.get("funcion_cub") as string) }
        }),
        fibers: agrupar(fiberFeatures, (f) => {
          const hilos = f.get("cant_hilo") as number | null
          return {
            label: hilos ? `${hilos} hilos` : "Sin dato de hilos",
            color: LAYER_COLORS.fiber,
          }
        }),
      },
    })
  }, [nodeSource, fiberSource, zoneSource, cabeceraSource])

  // Encuadra el mapa sobre los datos de red que estén cargados.
  const encuadrarEnDatos = useCallback(() => {
    const view = mapRef.current?.getView()
    if (!view) return
    const extent = nodeSource.getExtent()
    if (extent && extent.every((v) => Number.isFinite(v))) {
      view.fit(extent, { padding: [60, 60, 60, 60], maxZoom: 16, duration: 300 })
    }
  }, [nodeSource])

  // Carga (o recarga) las tres capas reales. `encuadrar` solo se pide en el
  // arranque: al actualizar manualmente conviene respetar la vista del usuario.
  const cargarDatosReales = useCallback(
    (isCancelled: () => boolean, encuadrar: boolean) => {
      nodeSource.clear()
      fiberSource.clear()
      cabeceraSource.clear()
      setMufaLoadError(null)
      setFiberLoadError(null)
      setCabeceraLoadError(null)
      setLoadingData(true)
      onLoadingChangeRef.current?.(true)

      const mufasDone = loadRealMufas(nodeSource, isCancelled).then((error) => {
        if (isCancelled()) return
        if (error) {
          setMufaLoadError(error)
          return
        }
        // Encuadra en la zona real donde están las mufas cargadas, en vez de
        // depender de un centro fijo que puede no coincidir con la data.
        if (encuadrar) encuadrarEnDatos()
      })
      const cablesDone = loadRealFiberCables(fiberSource, isCancelled).then((error) => {
        if (error && !isCancelled()) setFiberLoadError(error)
      })
      const cabecerasDone = loadRealCabeceras(cabeceraSource, isCancelled).then((error) => {
        if (error && !isCancelled()) setCabeceraLoadError(error)
      })
      // El indicador se apaga cuando todos los endpoints terminaron, con éxito o no.
      Promise.allSettled([mufasDone, cablesDone, cabecerasDone]).then(() => {
        if (isCancelled()) return
        setLoadingData(false)
        setFirstLoadDone(true)
        onLoadingChangeRef.current?.(false)
      })
    },
    [nodeSource, fiberSource, cabeceraSource, encuadrarEnDatos],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const view = new View({ center: fromLonLat(center), zoom })

    // `declutter` descarta las etiquetas que se solapan. Los símbolos llevan
    // `declutterMode: "none"` en la simbología, así que siempre se dibujan:
    // se ordenan los rótulos sin llegar a esconder elementos de la red.
    zoneLayer.current = new VectorLayer({ source: zoneSource, style: zoneStyle as never })
    fiberLayer.current = new VectorLayer({
      source: fiberSource,
      style: fiberStyle as never,
      declutter: true,
    })
    nodeLayer.current = new VectorLayer({
      source: nodeSource,
      style: nodeStyle as never,
      declutter: true,
    })
    cabeceraLayer.current = new VectorLayer({
      source: cabeceraSource,
      style: cabeceraStyle as never,
      declutter: true,
    })
    measureLayer.current = new VectorLayer({ source: measureSource, style: measureStyle as never })

    const map = new Map({
      target: containerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        zoneLayer.current,
        fiberLayer.current,
        nodeLayer.current,
        // La cabecera va encima de las mufas: es el elemento jerárquicamente
        // más importante y no debe quedar tapada.
        cabeceraLayer.current,
        measureLayer.current,
      ],
      view,
      controls: defaultControls({ attributionOptions: { collapsible: true } }),
    })

    map.on("pointermove", (evt) => {
      const [lon, lat] = toLonLat(evt.coordinate)
      setCoords({ lon, lat })
    })
    view.on("change:resolution", () => {
      const z = view.getZoom()
      if (typeof z === "number") setZoomLevel(Math.round(z * 10) / 10)
    })

    // "moveend" agrupa el final de cada paneo/zoom, así que evita disparar la
    // geocodificación inversa en cada cuadro de la animación.
    map.on("moveend", () => {
      const center = view.getCenter()
      if (!center) return
      const [lon, lat] = toLonLat(center)
      onCenterChangeRef.current?.({ lon, lat })
    })

    // React StrictMode monta este efecto dos veces seguidas en desarrollo
    // (monta → limpia → monta). Como la carga es asíncrona, sin este guard
    // las dos llamadas podían resolver después de la limpieza y sumar los
    // datos por duplicado (ej. 370 mufas en vez de 185).
    let cancelled = false
    const isCancelled = () => cancelled

    cargarDatosReales(isCancelled, true)

    ;[nodeSource, fiberSource, zoneSource, cabeceraSource].forEach((s) => {
      s.on("addfeature", recalc)
      s.on("removefeature", recalc)
    })

    mapRef.current = map
    recalc()

    // Esc cancela el trazo en curso (mufa, fibra o zona), sin dejar nada a medias.
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") drawRef.current?.abortDrawing()
    }
    window.addEventListener("keydown", handleEscape)

    return () => {
      cancelled = true
      window.removeEventListener("keydown", handleEscape)
      map.setTarget(undefined)
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (drawRef.current) {
      map.removeInteraction(drawRef.current)
      drawRef.current = null
    }
    if (selectRef.current) {
      map.removeInteraction(selectRef.current)
      selectRef.current = null
    }
    if (deleteHoverRef.current) {
      map.removeInteraction(deleteHoverRef.current)
      deleteHoverRef.current = null
    }
    if (editSelectRef.current) {
      map.removeInteraction(editSelectRef.current)
      editSelectRef.current = null
    }
    if (editModifyRef.current) {
      map.removeInteraction(editModifyRef.current)
      editModifyRef.current = null
    }
    if (fiberSnapRef.current) {
      map.removeInteraction(fiberSnapRef.current)
      fiberSnapRef.current = null
    }
    // Las mediciones son efímeras: se limpian solo al salir por completo de
    // las herramientas de medir (cambiar entre distancia y área las conserva).
    if (tool !== "measure-length" && tool !== "measure-area") {
      measureSource.clear()
      measureOverlaysRef.current.forEach((o) => map.removeOverlay(o))
      measureOverlaysRef.current = []
    }
    setSelected(null)
    setSchemaOpen(false)
    setInfoOpen(false)
    if (fiberNoticeTimeoutRef.current) {
      clearTimeout(fiberNoticeTimeoutRef.current)
      fiberNoticeTimeoutRef.current = null
    }
    setFiberNotice(tool === "fiber" ? FIBER_HINT : null)

    // Con una herramienta de selección activa, el doble click debe actuar sobre
    // el elemento: el zoom por doble click desplazaba el mapa y hacía que el
    // segundo click cayera al vacío, perdiendo lo que estabas consultando.
    const zoomPorDobleClick = map
      .getInteractions()
      .getArray()
      .find((interaccion) => interaccion instanceof DoubleClickZoom)
    zoomPorDobleClick?.setActive(tool !== "edit" && tool !== "delete")

    // Las interacciones de selección solo deben ver las capas de datos: si no
    // se limitan, también alcanzan los elementos auxiliares que dibujan otras
    // interacciones encima del mapa.
    const capasDeDatos = [
      nodeLayer.current,
      fiberLayer.current,
      zoneLayer.current,
      cabeceraLayer.current,
    ].filter((capa): capa is VectorLayer<VectorSource> => capa !== null)

    if (tool === "edit") {
      // En modo "Editar": click para seleccionar un elemento (abre el panel
      // de info) y arrastrar sus vértices para corregir el trazado. "Mover mapa"
      // queda libre solo para desplazarse, sin interceptar clicks.
      const editSelect = new Select({ condition: click, layers: capasDeDatos })
      editSelect.on("select", (e) => {
        const feature = e.selected[0]
        if (!feature) {
          setSelected(null)
          return
        }
        const type = tipoDeFeature(feature)
        // Si el elemento no pertenece a ninguna capa de datos (por ejemplo, un
        // manejador de vértice que la herramienta de edición dibuja encima de
        // lo seleccionado), se conserva la selección actual en vez de abrir el
        // panel con una ficha vacía.
        if (!type) return
        setSelected({ feature, type })
        setNameDraft((feature.get("nombre") as string) ?? "")
      })
      map.addInteraction(editSelect)
      editSelectRef.current = editSelect

      const editModify = new Modify({ features: editSelect.getFeatures() })
      map.addInteraction(editModify)
      editModifyRef.current = editModify
    }

    if (tool === "node" || tool === "fiber" || tool === "zone") {
      const cfg = {
        node: { source: nodeSource, type: "Point" as const, prefix: "Mufa" },
        fiber: { source: fiberSource, type: "LineString" as const, prefix: "Fibra" },
        zone: { source: zoneSource, type: "Polygon" as const, prefix: "Zona" },
      }[tool]

      const draw = new Draw({ source: cfg.source, type: cfg.type })

      if (tool === "fiber") {
        // La fibra siempre debe unir dos mufas: si no arranca sobre una, se
        // aborta el trazo de inmediato en vez de dejar dibujar al aire.
        draw.on("drawstart", (e) => {
          const start = (e.feature.getGeometry() as LineString).getFirstCoordinate()
          if (!isNearNode(start, nodeSource)) {
            draw.abortDrawing()
            setFiberNotice("Debes iniciar el trazado sobre una mufa.")
            if (fiberNoticeTimeoutRef.current) clearTimeout(fiberNoticeTimeoutRef.current)
            fiberNoticeTimeoutRef.current = setTimeout(() => setFiberNotice(FIBER_HINT), 2800)
          }
        })
      }

      draw.on("drawend", (e) => {
        if (tool === "fiber") {
          const end = (e.feature.getGeometry() as LineString).getLastCoordinate()
          if (!isNearNode(end, nodeSource)) {
            fiberSource.removeFeature(e.feature)
            setFiberNotice("Debes terminar el trazado sobre una mufa. Inténtalo de nuevo.")
            if (fiberNoticeTimeoutRef.current) clearTimeout(fiberNoticeTimeoutRef.current)
            fiberNoticeTimeoutRef.current = setTimeout(() => setFiberNotice(FIBER_HINT), 2800)
            return
          }
        }

        const count = cfg.source.getFeatures().length + 1
        e.feature.set("nombre", `${cfg.prefix} ${count}`)
        // Cada mufa lleva su propio esquema de empalme (cables/hilos/bandejas).
        // Por ahora se siembra con el ejemplo hasta que haya un backend real.
        if (tool === "node") {
          e.feature.set("esquema", { ...MUFA_SCHEMA_EXAMPLE })
        }
      })
      map.addInteraction(draw)
      drawRef.current = draw

      if (tool === "fiber") {
        // Se agrega después del Draw para que el snap ajuste el punto justo
        // antes de que Draw lo use (según la documentación de OpenLayers).
        const snap = new Snap({ source: nodeSource })
        map.addInteraction(snap)
        fiberSnapRef.current = snap
      }
    }

    if (tool === "delete") {
      // Resalta en rojo la geometría bajo el cursor antes de borrarla,
      // para que el usuario vea qué va a eliminar antes de hacer click.
      const hoverStyle = new Style({
        image: new RegularShape({
          points: 4,
          radius: 10,
          angle: Math.PI / 4,
          fill: new Fill({ color: "#ef4444" }),
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
        }),
        fill: new Fill({ color: "rgba(239, 68, 68, 0.25)" }),
        stroke: new Stroke({ color: "#ef4444", width: 3 }),
      })
      const hover = new Select({
        condition: pointerMove,
        style: hoverStyle,
        layers: capasDeDatos,
      })
      map.addInteraction(hover)
      deleteHoverRef.current = hover

      const select = new Select({ condition: click, layers: capasDeDatos })
      select.on("select", (e) => {
        e.selected.forEach((f) => {
          ;[nodeSource, fiberSource, zoneSource, cabeceraSource].forEach((s) => {
            if (s.hasFeature(f)) s.removeFeature(f)
          })
        })
        select.getFeatures().clear()
        hover.getFeatures().clear()
      })
      map.addInteraction(select)
      selectRef.current = select
    }

    if (tool === "measure-length" || tool === "measure-area") {
      // Medición "en el aire": no depende de mufas ni cables reales, solo
      // dibuja una geometría temporal y muestra distancia/área en vivo.
      const geomType = tool === "measure-length" ? "LineString" : "Polygon"
      const draw = new Draw({ source: measureSource, type: geomType })

      draw.on("drawstart", (e) => {
        const tooltipEl = document.createElement("div")
        tooltipEl.style.cssText =
          "background:#0f172a;color:#fff;padding:2px 8px;border-radius:6px;font:600 12px Inter, sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;"
        const tooltipOverlay = new Overlay({
          element: tooltipEl,
          offset: [0, -8],
          positioning: "bottom-center",
          stopEvent: false,
        })
        map.addOverlay(tooltipOverlay)
        measureOverlaysRef.current.push(tooltipOverlay)

        const geom = e.feature.getGeometry()
        geom?.on("change", () => {
          if (tool === "measure-length") {
            const line = geom as LineString
            tooltipEl.textContent = formatLength(getLength(line))
            tooltipOverlay.setPosition(line.getLastCoordinate())
          } else {
            const poly = geom as Polygon
            tooltipEl.textContent = formatArea(getArea(poly))
            tooltipOverlay.setPosition(poly.getInteriorPoint().getCoordinates())
          }
        })

        draw.once("drawend", () => {
          tooltipEl.style.background = "#334155"
        })
        draw.once("drawabort", () => {
          map.removeOverlay(tooltipOverlay)
          measureOverlaysRef.current = measureOverlaysRef.current.filter((o) => o !== tooltipOverlay)
        })
      })

      map.addInteraction(draw)
      drawRef.current = draw
    }
  }, [tool, nodeSource, fiberSource, zoneSource, cabeceraSource, measureSource, tipoDeFeature])

  useEffect(() => {
    const cursors: Record<Tool, string> = {
      pan: "grab",
      edit: "pointer",
      node: "crosshair",
      fiber: "crosshair",
      zone: "crosshair",
      delete: "pointer",
      "measure-length": "crosshair",
      "measure-area": "crosshair",
    }
    if (containerRef.current) containerRef.current.style.cursor = cursors[tool]
  }, [tool])

  useEffect(() => {
    if (externalVisible) {
      nodeLayer.current?.setVisible(externalVisible.nodes)
      fiberLayer.current?.setVisible(externalVisible.fibers)
      zoneLayer.current?.setVisible(externalVisible.zones)
      cabeceraLayer.current?.setVisible(externalVisible.cabeceras)
    }
  }, [externalVisible])

  // Centrar el mapa en el resultado del buscador.
  useEffect(() => {
    if (!flyTo) return
    const view = mapRef.current?.getView()
    if (!view) return
    view.animate({
      center: fromLonLat([flyTo.lon, flyTo.lat]),
      zoom: flyTo.zoom ?? 15,
      duration: 600,
    })
    // `nonce` permite repetir el mismo destino: se ignora el resto del objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.nonce])

  // "Actualizar" del ribbon: vuelve a pedir los datos a los endpoints. Se
  // cancela igual que la carga inicial, para no escribir estado si el usuario
  // sale de la vista mientras las respuestas siguen en camino.
  useEffect(() => {
    if (!reloadTrigger) return
    let cancelled = false
    cargarDatosReales(() => cancelled, false)
    return () => {
      cancelled = true
    }
  }, [reloadTrigger, cargarDatosReales])

  // "Mapa de red" del ribbon: reencuadra sobre la red cargada.
  useEffect(() => {
    if (!fitTrigger) return
    encuadrarEnDatos()
  }, [fitTrigger, encuadrarEnDatos])

  const tools: { id: Tool; label: string; icon: typeof Hand; color?: string; separator?: boolean }[] = [
    { id: "pan", label: "Mover mapa", icon: Hand },
    { id: "edit", label: "Editar elementos", icon: Pencil },
    { id: "node", label: "Dibujar mufa", icon: Box, color: LAYER_COLORS.node },
    { id: "fiber", label: "Trazar fibra", icon: Spline, color: LAYER_COLORS.fiber },
    { id: "zone", label: "Zona de cobertura", icon: Hexagon, color: LAYER_COLORS.zone },
    { id: "delete", label: "Eliminar geometría", icon: Trash2 },
    { id: "measure-length", label: "Medir distancia", icon: Ruler, color: MEASURE_COLOR, separator: true },
    { id: "measure-area", label: "Medir área", icon: Square, color: MEASURE_COLOR },
  ]

  function clearMeasurements() {
    measureSource.clear()
    const map = mapRef.current
    if (map) measureOverlaysRef.current.forEach((o) => map.removeOverlay(o))
    measureOverlaysRef.current = []
    drawRef.current?.abortDrawing()
  }

  const TYPE_ICONS: Record<FeatureType, typeof Box> = {
    node: Box,
    fiber: Spline,
    zone: Hexagon,
    cabecera: Building2,
  }


  function handleNameChange(value: string) {
    setNameDraft(value)
    selected?.feature.set("nombre", value)
  }

  function closeSelection() {
    editSelectRef.current?.getFeatures().clear()
    setSelected(null)
    setSchemaOpen(false)
    setInfoOpen(false)
  }

  function handleDeleteSelected() {
    if (!selected) return
    const sources: Record<FeatureType, VectorSource> = {
      node: nodeSource,
      fiber: fiberSource,
      zone: zoneSource,
      cabecera: cabeceraSource,
    }
    sources[selected.type].removeFeature(selected.feature)
    closeSelection()
  }

  function handleViewConnections() {
    if (!selected || selected.type !== "node") return
    const schema = (selected.feature.get("esquema") as MufaCampoJSON | undefined) ?? MUFA_SCHEMA_EXAMPLE
    setConnectivitySchema(schema)
    setConnectivityOpen(true)
  }

  const selectedLength =
    selected?.type === "fiber"
      ? getLength(selected.feature.getGeometry() as LineString) / 1000
      : null

  return (
    <div className={`relative size-full ${className ?? ""}`}>
      <div
        ref={containerRef}
        /* Los controles propios de OpenLayers se reestilizan acá para que
           coincidan con los botones de la aplicación. */
        className="size-full
          [&_.ol-zoom]:!left-auto [&_.ol-zoom]:!right-3 [&_.ol-zoom]:!top-3
          [&_.ol-zoom]:flex [&_.ol-zoom]:flex-col [&_.ol-zoom]:gap-0.5
          [&_.ol-zoom]:rounded-xl [&_.ol-zoom]:bg-card/95 [&_.ol-zoom]:p-1
          [&_.ol-zoom]:shadow-lg [&_.ol-zoom]:ring-1 [&_.ol-zoom]:ring-border
          [&_.ol-zoom]:backdrop-blur
          [&_.ol-zoom_button]:!m-0 [&_.ol-zoom_button]:size-9
          [&_.ol-zoom_button]:!rounded-lg [&_.ol-zoom_button]:!bg-transparent
          [&_.ol-zoom_button]:!text-base [&_.ol-zoom_button]:!font-medium
          [&_.ol-zoom_button]:!text-foreground
          [&_.ol-zoom_button:hover]:!bg-accent"
        role="application"
        aria-label="Mapa interactivo de la red de fibra"
      />

      {/* Cortina del primer arranque: evita mostrar un mapa vacío mientras
          llegan las capas, que se leía como si no hubiera datos. */}
      {!firstLoadDone && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm">
          <GismartMark className="size-14 rounded-2xl shadow-lg" />
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Cargando la red de fibra…
          </div>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/2 animate-[gismart-progress_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </div>
      )}

      {/* Avisos apilados (carga de datos reales, guía de herramientas) */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {loadingData && firstLoadDone && (
          <div className="flex items-center gap-2 rounded-lg bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md ring-1 ring-border backdrop-blur">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            Cargando red desde Supabase…
          </div>
        )}

        {mufaLoadError && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive shadow-md ring-1 ring-destructive/30 backdrop-blur">
            <span>{mufaLoadError}</span>
            <button
              type="button"
              onClick={() => setMufaLoadError(null)}
              className="rounded p-0.5 outline-none transition hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Cerrar aviso"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {cabeceraLoadError && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive shadow-md ring-1 ring-destructive/30 backdrop-blur">
            <span>{cabeceraLoadError}</span>
            <button
              type="button"
              onClick={() => setCabeceraLoadError(null)}
              className="rounded p-0.5 outline-none transition hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Cerrar aviso"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {fiberLoadError && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive shadow-md ring-1 ring-destructive/30 backdrop-blur">
            <span>{fiberLoadError}</span>
            <button
              type="button"
              onClick={() => setFiberLoadError(null)}
              className="rounded p-0.5 outline-none transition hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Cerrar aviso"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {fiberNotice && (
          <div className="pointer-events-auto rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-md ring-1 ring-amber-500/30 backdrop-blur dark:text-amber-300">
            {fiberNotice}
          </div>
        )}

        {(tool === "measure-length" || tool === "measure-area") && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-card/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-md ring-1 ring-border backdrop-blur">
            <span>
              {tool === "measure-length"
                ? "Click para trazar, doble click para terminar. Esc cancela."
                : "Click para dibujar el área, doble click para terminar. Esc cancela."}
            </span>
            <button
              type="button"
              onClick={clearMeasurements}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Herramientas de dibujo (izquierda) */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-0.5 rounded-xl bg-card/95 p-1 shadow-lg ring-1 ring-border backdrop-blur">
        {tools.map((t) => {
          const Icon = t.icon
          const active = tool === t.id
          return (
            <span key={t.id} className="flex flex-col gap-0.5">
              {t.separator && <span className="mx-1 my-1 h-px bg-border" />}
              <button
                type="button"
                onClick={() => setTool(t.id)}
                title={t.label}
                aria-label={t.label}
                aria-pressed={active}
                className={`flex size-9 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <Icon
                  className="size-[18px]"
                  style={!active && t.color ? { color: t.color } : undefined}
                />
              </button>
            </span>
          )
        })}
      </div>

      {/* Barra de estado */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-lg bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md ring-1 ring-border backdrop-blur">
        <span>
          Lon: <span className="tabular-nums text-primary">{coords ? coords.lon.toFixed(5) : "—"}</span>
        </span>
        <span className="h-3 w-px bg-border" />
        <span>
          Lat: <span className="tabular-nums text-primary">{coords ? coords.lat.toFixed(5) : "—"}</span>
        </span>
        <span className="h-3 w-px bg-border" />
        <span>
          Zoom: <span className="tabular-nums text-primary">{zoomLevel}</span>
        </span>
      </div>

      {/* Leyenda plegable: mismos símbolos que se dibujan en el mapa (SIGETP).
          Se puede cerrar para no tapar el mapa en pantallas chicas. */}
      <div className="absolute bottom-3 right-3 z-10 overflow-hidden rounded-lg bg-card/90 text-xs font-medium text-foreground shadow-md ring-1 ring-border backdrop-blur">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronDown className={`size-3 transition-transform ${legendOpen ? "" : "-rotate-90"}`} />
          Leyenda
        </button>

        {legendOpen && (
          <div className="flex flex-col gap-1 border-t border-border px-2.5 pb-2 pt-1.5">
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <circle cx="8" cy="8" r="7" fill="#ffffff" stroke={CABECERA_COLOR} strokeWidth="1.8" />
                <polygon points="8,4 11.5,10 4.5,10" fill={CABECERA_COLOR} />
              </svg>
              Cabecera central
            </span>

            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cubiertas de empalme
            </span>
            {Object.entries(FUNCION_CUB_COLORS).map(([label, color]) => (
              <span key={label} className="flex items-center gap-2">
                <MufaSymbol color={color} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-2">
              <MufaSymbol color={FUNCION_CUB_DEFAULT_COLOR} />
              Otro / sin dato
            </span>

            <span className="mt-0.5 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <line x1="1" y1="8" x2="15" y2="8" stroke={LAYER_COLORS.fiber} strokeWidth="3" strokeLinecap="round" />
              </svg>
              Fibra óptica
            </span>
            <span className="text-[10px] leading-tight text-muted-foreground">
              El grosor refleja la cantidad de hilos
            </span>
          </div>
        )}
      </div>

      {/* Panel de información del elemento seleccionado */}
      {selected && (
        <div className="absolute right-3 top-20 z-20 w-64 animate-gismart-fade-in rounded-xl bg-card/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {(() => {
                const Icon = TYPE_ICONS[selected.type]
                return <Icon className="size-3.5" style={{ color: LAYER_COLORS[selected.type] }} />
              })()}
              {TYPE_LABELS[selected.type]}
            </div>
            <button
              type="button"
              onClick={closeSelection}
              className="rounded-md p-1 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Cerrar panel"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <label htmlFor="feature-nombre" className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
            <Pencil className="size-3" />
            Nombre
          </label>
          <input
            id="feature-nombre"
            type="text"
            value={nameDraft}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
          />

          {selectedLength !== null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Longitud: <span className="font-semibold tabular-nums text-primary">{selectedLength.toFixed(2)} km</span>
            </p>
          )}

          {selected.type === "node" && (
            <button
              type="button"
              onClick={() => setSchemaOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Waypoints className="size-3.5" />
              Gestionar esquema
            </button>
          )}

          {selected.type === "node" && (
            <button
              type="button"
              onClick={handleViewConnections}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Network className="size-3.5" />
              Ver conexiones
            </button>
          )}

          {(selected.type === "node" || selected.type === "fiber" || selected.type === "cabecera") && (
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Info className="size-3.5" />
              Ver información
            </button>
          )}

          <button
            type="button"
            onClick={handleDeleteSelected}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 py-1.5 text-xs font-semibold text-destructive outline-none transition hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Trash2 className="size-3.5" />
            Eliminar
          </button>
        </div>
      )}

      {selected?.type === "node" && (
        <MufaSchemaDialog
          open={schemaOpen}
          onOpenChange={setSchemaOpen}
          mufaName={nameDraft || "Mufa"}
          schema={selected.feature.get("esquema") ?? MUFA_SCHEMA_EXAMPLE}
        />
      )}

      {selected?.type === "node" && (
        <InfoTableDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title={`Información de la cubierta — ${nameDraft || "Mufa"}`}
          description="Datos de geo_fiber.cubierta_empalme."
          fieldLabels={MUFA_FIELD_LABELS}
          data={selected.feature.getProperties()}
        />
      )}

      {selected?.type === "fiber" && (
        <InfoTableDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title={`Información del cable — ${nameDraft || "Fibra"}`}
          description="Datos de geo_fiber.cable_fibra."
          fieldLabels={FIBER_FIELD_LABELS}
          data={selected.feature.getProperties()}
        />
      )}

      {selected?.type === "cabecera" && (
        <InfoTableDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title={`Información de la cabecera — ${nameDraft || "Cabecera"}`}
          description="Datos de geo_infra.cabecera_central."
          fieldLabels={CABECERA_FIELD_LABELS}
          data={selected.feature.getProperties()}
        />
      )}

      <MufaConnectivityModal
        open={connectivityOpen}
        onOpenChange={setConnectivityOpen}
        schema={connectivitySchema}
      />
    </div>
  )
}
