"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import "ol/ol.css"
import Map from "ol/Map"
import View from "ol/View"
import TileLayer from "ol/layer/Tile"
import OSM from "ol/source/OSM"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import GeoJSON from "ol/format/GeoJSON"
import Feature from "ol/Feature"
import Point from "ol/geom/Point"
import LineString from "ol/geom/LineString"
import Polygon from "ol/geom/Polygon"
import Overlay from "ol/Overlay"
import { fromLonLat, toLonLat } from "ol/proj"
import { getLength, getArea } from "ol/sphere"
import { Style, Fill, Stroke, RegularShape, Text as TextStyle } from "ol/style"
import Draw from "ol/interaction/Draw"
import Modify from "ol/interaction/Modify"
import Select from "ol/interaction/Select"
import Snap from "ol/interaction/Snap"
import { click, pointerMove } from "ol/events/condition"
import { defaults as defaultControls } from "ol/control"
import type { Geometry } from "ol/geom"
import { Hand, Box, Spline, Hexagon, Trash2, X, Pencil, Waypoints, Network, Info, Ruler, Square } from "lucide-react"
import { LAYER_COLORS } from "@/lib/network-colors"
import { MUFA_SCHEMA_EXAMPLE } from "@/lib/mufa-schema"
import { MufaSchemaDialog } from "@/components/mufa-schema-dialog"
import { MufaConnectivityModal } from "@/components/mufa-connectivity-modal"
import { InfoTableDialog } from "@/components/info-table-dialog"
import type { MufaCampoJSON } from "@/lib/schematic/mufa-field-data"

type NetworkMapProps = {
  center?: [number, number]
  zoom?: number
  className?: string
  visible?: { nodes: boolean; fibers: boolean; zones: boolean }
  onStatsChange?: (counts: { nodes: number; fibers: number; zones: number }, totalKm: number) => void
  clearTrigger?: number
}

type Tool = "pan" | "edit" | "node" | "fiber" | "zone" | "delete" | "measure-length" | "measure-area"

type FeatureType = "node" | "fiber" | "zone"

type SelectedFeature = {
  feature: Feature<Geometry>
  type: FeatureType
}

const TYPE_LABELS: Record<FeatureType, string> = {
  node: "Mufa",
  fiber: "Fibra",
  zone: "Zona",
}

// Campos de geo_fiber.cubierta_empalme y geo_fiber.cable_fibra que se
// muestran en el modal "Ver información" (identify) de cada elemento.
const MUFA_FIELD_LABELS: Record<string, string> = {
  id: "ID",
  etiqueta: "Etiqueta",
  tipo_carcasa: "Tipo de carcasa",
  funcion_cub: "Función",
  tipo_empalme: "Tipo de empalme",
  cod_fabricante: "Fabricante",
  tipo_instala: "Tipo de instalación",
  estado_const: "Estado",
  id_proyecto: "Proyecto",
  direccion: "Dirección",
  ubicacion: "Ubicación",
  capacidad_bandejas: "Capacidad de bandejas",
  fecha_creacion: "Creado",
  fecha_ult_act: "Última actualización",
}

const FIBER_FIELD_LABELS: Record<string, string> = {
  id: "ID",
  nombre: "Nombre",
  codigo: "Código",
  cod_fabricante: "Fabricante",
  estado_const: "Estado",
  id_proyecto: "Proyecto",
  etq_naps: "Etiqueta NAP",
  tipo_red_prin: "Tipo de red",
  tipo_fibra: "Tipo de fibra",
  atenuacion_1490: "Atenuación 1490nm (dB/km)",
  atenuacion_1550: "Atenuación 1550nm (dB/km)",
  tipo_instala: "Tipo de instalación",
  tipo_cable: "Tipo de cable",
  marca: "Marca",
  modelo: "Modelo",
  cant_buff: "Cantidad de buffers",
  cant_hilo: "Cantidad de hilos",
  longitud_medida: "Longitud medida (m)",
  longitud_calc: "Longitud calculada (m)",
}

const COLORS = LAYER_COLORS

// Color de la mufa según `funcion_cub` (pedido del ingeniero de red), para
// distinguir de un vistazo el nivel/función de cada cubierta de empalme.
const FUNCION_CUB_COLORS: Record<string, string> = {
  "Segundo nivel": COLORS.node,
  "Primer nivel": "#7c3aed",
  "Empalme pasivo": "#f59e0b",
}
const FUNCION_CUB_DEFAULT_COLOR = "#64748b"

function colorForFuncionCub(funcionCub: string | undefined | null): string {
  if (!funcionCub) return FUNCION_CUB_DEFAULT_COLOR
  return FUNCION_CUB_COLORS[funcionCub] ?? FUNCION_CUB_DEFAULT_COLOR
}

const FIBER_HINT =
  "Haz click sobre una mufa para iniciar el trazado de fibra y sobre otra para terminarlo. Esc para cancelar."

// La fibra siempre debe unir dos mufas: exige que el punto quede exactamente
// sobre una (el Snap hacia nodeSource hace que esto sea fácil de lograr).
function isNearNode(coord: number[], nodeSource: VectorSource, epsilon = 1): boolean {
  return nodeSource.getFeatures().some((f) => {
    const geom = f.getGeometry()
    if (!(geom instanceof Point)) return false
    const [x, y] = geom.getCoordinates()
    return Math.abs(x - coord[0]) < epsilon && Math.abs(y - coord[1]) < epsilon
  })
}

// Las mufas (cajas de empalme de fibra) se representan como un marcador
// cuadrado con un glifo "+" (empalme), distinto del punto circular genérico,
// para diferenciarlas de otro tipo de elementos de red a simple vista.
function nodeStyle(feature: Feature<Geometry>) {
  const label = (feature.get("nombre") as string) ?? "Mufa"
  const color = colorForFuncionCub(feature.get("funcion_cub") as string | undefined)
  return [
    new Style({
      image: new RegularShape({
        points: 4,
        radius: 9,
        angle: Math.PI / 4,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    }),
    new Style({
      text: new TextStyle({
        text: "+",
        font: "bold 12px Inter, sans-serif",
        fill: new Fill({ color: "#ffffff" }),
        offsetY: -1,
      }),
    }),
    new Style({
      text: new TextStyle({
        text: label,
        offsetY: -18,
        font: "600 11px Inter, sans-serif",
        fill: new Fill({ color: "#0f172a" }),
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
      }),
    }),
  ]
}

// Un cable con más hilos es físicamente más grueso: se refleja en el ancho
// del trazo (pedido: "que se vea físico"), acotado para que siga siendo legible.
function fiberWidth(cantHilo: number | null | undefined): number {
  if (!cantHilo || cantHilo <= 0) return 2.5
  return Math.min(7, Math.max(2, 2 + cantHilo / 12))
}

function fiberStyle(feature: Feature<Geometry>) {
  const geom = feature.getGeometry() as LineString
  const km = geom ? getLength(geom) / 1000 : 0
  const width = fiberWidth(feature.get("cant_hilo") as number | undefined)
  return [
    new Style({
      stroke: new Stroke({ color: COLORS.fiber, width }),
    }),
    new Style({
      text: new TextStyle({
        text: `${km.toFixed(2)} km`,
        placement: "line",
        font: "600 11px Inter, sans-serif",
        fill: new Fill({ color: COLORS.fiber }),
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
      }),
    }),
  ]
}

// Color de acento para la herramienta de medición (distancia/área "en el
// aire", sin necesidad de mufas ni fibra real de por medio).
const MEASURE_COLOR = "#0ea5e9"

function measureStyle(feature: Feature<Geometry>) {
  const isPolygon = feature.getGeometry()?.getType() === "Polygon"
  return new Style({
    fill: new Fill({ color: "rgba(14, 165, 233, 0.15)" }),
    stroke: new Stroke({ color: MEASURE_COLOR, width: 2, lineDash: isPolygon ? undefined : [8, 6] }),
  })
}

function formatLength(lengthM: number): string {
  return lengthM >= 1000 ? `${(lengthM / 1000).toFixed(2)} km` : `${lengthM.toFixed(1)} m`
}

function formatArea(areaM2: number): string {
  if (areaM2 >= 1_000_000) return `${(areaM2 / 1_000_000).toFixed(2)} km²`
  if (areaM2 >= 10_000) return `${(areaM2 / 10_000).toFixed(2)} ha`
  return `${areaM2.toFixed(1)} m²`
}

function zoneStyle(feature: Feature<Geometry>) {
  const label = feature.get("nombre") as string | undefined
  return new Style({
    fill: new Fill({ color: "rgba(56, 189, 248, 0.18)" }),
    stroke: new Stroke({ color: COLORS.zone, width: 2, lineDash: [6, 4] }),
    text: label
      ? new TextStyle({
          text: label,
          font: "600 12px Inter, sans-serif",
          fill: new Fill({ color: "#0f172a" }),
          stroke: new Stroke({ color: "#ffffff", width: 3 }),
        })
      : undefined,
  })
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
  clearTrigger,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)

  const nodeSource = useRef(new VectorSource()).current
  const fiberSource = useRef(new VectorSource()).current
  const zoneSource = useRef(new VectorSource()).current
  const measureSource = useRef(new VectorSource()).current

  const nodeLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const fiberLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const zoneLayer = useRef<VectorLayer<VectorSource> | null>(null)
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
  const [tool, setTool] = useState<Tool>("pan")
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [schemaOpen, setSchemaOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [fiberLoadError, setFiberLoadError] = useState<string | null>(null)
  const [mufaLoadError, setMufaLoadError] = useState<string | null>(null)
  const [connectivityOpen, setConnectivityOpen] = useState(false)
  const [connectivitySchema, setConnectivitySchema] = useState<MufaCampoJSON | null>(null)
  const [fiberNotice, setFiberNotice] = useState<string | null>(null)

  const onStatsChangeRef = useRef(onStatsChange)
  onStatsChangeRef.current = onStatsChange

  const recalc = useCallback(() => {
    const nodes = nodeSource.getFeatures().length
    const fibers = fiberSource.getFeatures().length
    const zones = zoneSource.getFeatures().length
    const km = fiberSource.getFeatures().reduce((acc, f) => {
      const g = f.getGeometry() as LineString | undefined
      return acc + (g ? getLength(g) / 1000 : 0)
    }, 0)
    onStatsChangeRef.current?.({ nodes, fibers, zones }, km)
  }, [nodeSource, fiberSource, zoneSource])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const view = new View({ center: fromLonLat(center), zoom })

    zoneLayer.current = new VectorLayer({ source: zoneSource, style: zoneStyle as never })
    fiberLayer.current = new VectorLayer({ source: fiberSource, style: fiberStyle as never })
    nodeLayer.current = new VectorLayer({ source: nodeSource, style: nodeStyle as never })
    measureLayer.current = new VectorLayer({ source: measureSource, style: measureStyle as never })

    const map = new Map({
      target: containerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        zoneLayer.current,
        fiberLayer.current,
        nodeLayer.current,
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

    // React StrictMode monta este efecto dos veces seguidas en desarrollo
    // (monta → limpia → monta). Como la carga es asíncrona, sin este guard
    // las dos llamadas podían resolver después de la limpieza y sumar los
    // datos por duplicado (ej. 370 mufas en vez de 185).
    let cancelled = false
    const isCancelled = () => cancelled

    nodeSource.clear()
    fiberSource.clear()
    zoneSource.clear()
    loadRealMufas(nodeSource, isCancelled).then((error) => {
      if (isCancelled()) return
      if (error) {
        setMufaLoadError(error)
        return
      }
      // Encuadra el mapa en la zona real donde están las mufas cargadas, en
      // vez de depender de un centro fijo que puede no coincidir con la data.
      const extent = nodeSource.getExtent()
      if (extent && extent.every((v) => Number.isFinite(v))) {
        view.fit(extent, { padding: [60, 60, 60, 60], maxZoom: 16, duration: 300 })
      }
    })
    loadRealFiberCables(fiberSource, isCancelled).then((error) => {
      if (error && !isCancelled()) setFiberLoadError(error)
    })

    ;[nodeSource, fiberSource, zoneSource].forEach((s) => {
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

    if (tool === "edit") {
      // En modo "Editar": click para seleccionar un elemento (abre el panel
      // de info) y arrastrar sus vértices para corregir el trazado. "Mover mapa"
      // queda libre solo para desplazarse, sin interceptar clicks.
      const editSelect = new Select({ condition: click })
      editSelect.on("select", (e) => {
        const feature = e.selected[0]
        if (!feature) {
          setSelected(null)
          return
        }
        const type: FeatureType = nodeSource.hasFeature(feature)
          ? "node"
          : fiberSource.hasFeature(feature)
            ? "fiber"
            : "zone"
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
      const hover = new Select({ condition: pointerMove, style: hoverStyle })
      map.addInteraction(hover)
      deleteHoverRef.current = hover

      const select = new Select({ condition: click })
      select.on("select", (e) => {
        e.selected.forEach((f) => {
          ;[nodeSource, fiberSource, zoneSource].forEach((s) => {
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
  }, [tool, nodeSource, fiberSource, zoneSource, measureSource])

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
    }
  }, [externalVisible])

  useEffect(() => {
    // clearTrigger nace en 0 (aún no se ha pedido limpiar) y solo sube a partir
    // de 1 cuando el usuario pulsa "Limpiar todo". clearTrigger > 0 evita que
    // este efecto borre los datos semilla en el primer render.
    if (typeof clearTrigger === "number" && clearTrigger > 0) {
      nodeSource.clear()
      fiberSource.clear()
      zoneSource.clear()
      editSelectRef.current?.getFeatures().clear()
      setSelected(null)
      setSchemaOpen(false)
      setInfoOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTrigger])

  const tools: { id: Tool; label: string; icon: typeof Hand; color?: string; separator?: boolean }[] = [
    { id: "pan", label: "Mover mapa", icon: Hand },
    { id: "edit", label: "Editar elementos", icon: Pencil },
    { id: "node", label: "Dibujar mufa", icon: Box, color: COLORS.node },
    { id: "fiber", label: "Trazar fibra", icon: Spline, color: COLORS.fiber },
    { id: "zone", label: "Zona de cobertura", icon: Hexagon, color: COLORS.zone },
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

  const TYPE_ICONS: Record<FeatureType, typeof Box> = { node: Box, fiber: Spline, zone: Hexagon }

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
    const source = selected.type === "node" ? nodeSource : selected.type === "fiber" ? fiberSource : zoneSource
    source.removeFeature(selected.feature)
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
        className="size-full [&_.ol-zoom]:!left-auto [&_.ol-zoom]:!right-3 [&_.ol-zoom]:!top-3"
        role="application"
        aria-label="Mapa interactivo de la red de fibra"
      />

      {/* Avisos apilados (carga de datos reales, guía de herramientas) */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
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
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl bg-card/95 p-1.5 shadow-lg ring-1 ring-border backdrop-blur">
        {tools.map((t) => {
          const Icon = t.icon
          const active = tool === t.id
          return (
            <span key={t.id} className="flex flex-col gap-1">
              {t.separator && <span className="my-0.5 h-px bg-border" />}
              <button
                type="button"
                onClick={() => setTool(t.id)}
                title={t.label}
                aria-label={t.label}
                aria-pressed={active}
                className={`flex size-10 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="size-5" style={!active && t.color ? { color: t.color } : undefined} />
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

      {/* Leyenda de colores de mufa según función de la cubierta */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-lg bg-card/90 px-3 py-2 text-xs font-medium text-foreground shadow-md ring-1 ring-border backdrop-blur">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mufas</span>
        {Object.entries(FUNCION_CUB_COLORS).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: FUNCION_CUB_DEFAULT_COLOR }} />
          Otro / sin dato
        </span>
      </div>

      {/* Panel de información del elemento seleccionado */}
      {selected && (
        <div className="absolute right-3 top-20 z-20 w-64 animate-gismart-fade-in rounded-xl bg-card/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {(() => {
                const Icon = TYPE_ICONS[selected.type]
                return <Icon className="size-3.5" style={{ color: COLORS[selected.type] }} />
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

          {(selected.type === "node" || selected.type === "fiber") && (
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

      <MufaConnectivityModal
        open={connectivityOpen}
        onOpenChange={setConnectivityOpen}
        schema={connectivitySchema}
      />
    </div>
  )
}

// Carga las mufas reales desde Supabase (vía /api/mufas, que expone
// geo_fiber.cubierta_empalme_geojson). El esquema de empalme (cables/bandejas)
// todavía no viene de esa tabla, así que se siembra con el ejemplo hasta que
// haya una fuente real para "Gestionar esquema"/"Ver conexiones".
async function loadRealMufas(nodeSource: VectorSource, isCancelled: () => boolean): Promise<string | null> {
  try {
    const res = await fetch("/api/mufas")
    const data = await res.json()
    if (isCancelled()) return null
    if (!res.ok) {
      return (data?.message as string) ?? "No se pudieron cargar las mufas reales."
    }

    const features = new GeoJSON().readFeatures(data, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    })
    features.forEach((f) => {
      const etiqueta = f.get("etiqueta") as string | null
      f.set("nombre", etiqueta || `Mufa ${f.get("id")}`)
      f.set("esquema", { ...MUFA_SCHEMA_EXAMPLE })
    })
    if (isCancelled()) return null
    nodeSource.addFeatures(features)
    return null
  } catch {
    return isCancelled() ? null : "No se pudo conectar con Supabase para cargar las mufas."
  }
}

// Carga el tendido de fibra real desde Supabase (vía /api/fiber-cables, que
// expone geo_fiber.cable_fibra_geojson desde el servidor).
// Devuelve un mensaje de error si algo falla, o null si todo salió bien.
async function loadRealFiberCables(fiberSource: VectorSource, isCancelled: () => boolean): Promise<string | null> {
  try {
    const res = await fetch("/api/fiber-cables")
    const data = await res.json()
    if (isCancelled()) return null
    if (!res.ok) {
      return (data?.message as string) ?? "No se pudo cargar el tendido de fibra real."
    }

    const features = new GeoJSON().readFeatures(data, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    })
    features.forEach((f) => {
      const nombre = f.get("nombre") as string | null
      const codigo = f.get("codigo") as string | null
      f.set("nombre", nombre || codigo || `Fibra ${f.get("id")}`)
    })
    if (isCancelled()) return null
    fiberSource.addFeatures(features)
    return null
  } catch {
    return isCancelled() ? null : "No se pudo conectar con Supabase para cargar el tendido de fibra."
  }
}