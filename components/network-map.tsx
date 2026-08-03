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
import Point from "ol/geom/Point"
import LineString from "ol/geom/LineString"
import Polygon from "ol/geom/Polygon"
import { fromLonLat, toLonLat } from "ol/proj"
import { getLength } from "ol/sphere"
import { Style, Fill, Stroke, Circle as CircleStyle, Text as TextStyle } from "ol/style"
import Draw from "ol/interaction/Draw"
import Modify from "ol/interaction/Modify"
import Select from "ol/interaction/Select"
import { click } from "ol/events/condition"
import { defaults as defaultControls } from "ol/control"
import type { Geometry } from "ol/geom"
import {
  Hand,
  Radio,
  Spline,
  Hexagon,
  Trash2,
  Layers,
  Eye,
  EyeOff,
  Ruler,
} from "lucide-react"

type NetworkMapProps = {
  center?: [number, number]
  zoom?: number
  className?: string
}

type Tool = "pan" | "node" | "fiber" | "zone" | "delete"

// Paleta coherente con el tema (celeste/azul)
const COLORS = {
  node: "#0ea5e9",
  fiber: "#2563eb",
  zone: "#38bdf8",
}

// ---- Estilos de las geometrías ----
function nodeStyle(feature: Feature<Geometry>) {
  const label = (feature.get("nombre") as string) ?? "Nodo"
  return new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: COLORS.node }),
      stroke: new Stroke({ color: "#ffffff", width: 2 }),
    }),
    text: new TextStyle({
      text: label,
      offsetY: -16,
      font: "600 11px Inter, sans-serif",
      fill: new Fill({ color: "#0f172a" }),
      stroke: new Stroke({ color: "#ffffff", width: 3 }),
    }),
  })
}

function fiberStyle(feature: Feature<Geometry>) {
  const geom = feature.getGeometry() as LineString
  const km = geom ? getLength(geom) / 1000 : 0
  return [
    new Style({
      stroke: new Stroke({ color: COLORS.fiber, width: 3.5 }),
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

function zoneStyle() {
  return new Style({
    fill: new Fill({ color: "rgba(56, 189, 248, 0.18)" }),
    stroke: new Stroke({ color: COLORS.zone, width: 2, lineDash: [6, 4] }),
  })
}

/**
 * <NetworkMap /> — Mapa interactivo de OpenLayers con capas vectoriales
 * para geometrías de la red de fibra: nodos (puntos), tendido (líneas) y
 * zonas de cobertura (polígonos), con herramientas de dibujo y edición.
 */
export function NetworkMap({ center = [-76.532, 3.4516], zoom = 12, className }: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)

  // Fuentes vectoriales por tipo de geometría
  const nodeSource = useRef(new VectorSource()).current
  const fiberSource = useRef(new VectorSource()).current
  const zoneSource = useRef(new VectorSource()).current

  // Referencias a capas e interacciones
  const nodeLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const fiberLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const zoneLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const drawRef = useRef<Draw | null>(null)
  const selectRef = useRef<Select | null>(null)

  const [coords, setCoords] = useState<{ lon: number; lat: number } | null>(null)
  const [zoomLevel, setZoomLevel] = useState<number>(zoom)
  const [tool, setTool] = useState<Tool>("pan")
  const [counts, setCounts] = useState({ nodes: 0, fibers: 0, zones: 0 })
  const [totalKm, setTotalKm] = useState(0)
  const [visible, setVisible] = useState({ nodes: true, fibers: true, zones: true })
  const [showPanel, setShowPanel] = useState(true)

  // Recalcula contadores y kilómetros totales de fibra
  const recalc = useCallback(() => {
    const nodes = nodeSource.getFeatures().length
    const fibers = fiberSource.getFeatures().length
    const zones = zoneSource.getFeatures().length
    const km = fiberSource.getFeatures().reduce((acc, f) => {
      const g = f.getGeometry() as LineString | undefined
      return acc + (g ? getLength(g) / 1000 : 0)
    }, 0)
    setCounts({ nodes, fibers, zones })
    setTotalKm(km)
  }, [nodeSource, fiberSource, zoneSource])

  // ---- Inicialización del mapa (una sola vez) ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const view = new View({ center: fromLonLat(center), zoom })

    zoneLayer.current = new VectorLayer({ source: zoneSource, style: zoneStyle })
    fiberLayer.current = new VectorLayer({ source: fiberSource, style: fiberStyle as never })
    nodeLayer.current = new VectorLayer({ source: nodeSource, style: nodeStyle as never })

    const map = new Map({
      target: containerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        zoneLayer.current,
        fiberLayer.current,
        nodeLayer.current,
      ],
      view,
      controls: defaultControls({ attributionOptions: { collapsible: true } }),
    })

    // Edición de geometrías existentes (arrastrar vértices)
    const modify = new Modify({
      source: nodeSource,
    })
    map.addInteraction(modify)

    map.on("pointermove", (evt) => {
      const [lon, lat] = toLonLat(evt.coordinate)
      setCoords({ lon, lat })
    })
    view.on("change:resolution", () => {
      const z = view.getZoom()
      if (typeof z === "number") setZoomLevel(Math.round(z * 10) / 10)
    })

    // Semillas de ejemplo para que se vean las capas al entrar.
    // Se limpian antes de sembrar para evitar duplicados por el doble
    // montaje de efectos de React en modo desarrollo (Strict Mode).
    nodeSource.clear()
    fiberSource.clear()
    zoneSource.clear()
    seedExamples(nodeSource, fiberSource, zoneSource)

    ;[nodeSource, fiberSource, zoneSource].forEach((s) => {
      s.on("addfeature", recalc)
      s.on("removefeature", recalc)
    })

    mapRef.current = map
    recalc()

    return () => {
      map.setTarget(undefined)
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Gestión de la herramienta activa (dibujo / borrado) ----
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Limpia interacciones previas
    if (drawRef.current) {
      map.removeInteraction(drawRef.current)
      drawRef.current = null
    }
    if (selectRef.current) {
      map.removeInteraction(selectRef.current)
      selectRef.current = null
    }

    if (tool === "node" || tool === "fiber" || tool === "zone") {
      const cfg = {
        node: { source: nodeSource, type: "Point" as const, prefix: "Nodo" },
        fiber: { source: fiberSource, type: "LineString" as const, prefix: "Fibra" },
        zone: { source: zoneSource, type: "Polygon" as const, prefix: "Zona" },
      }[tool]

      const draw = new Draw({ source: cfg.source, type: cfg.type })
      draw.on("drawend", (e) => {
        const count = cfg.source.getFeatures().length + 1
        e.feature.set("nombre", `${cfg.prefix} ${count}`)
      })
      map.addInteraction(draw)
      drawRef.current = draw
    }

    if (tool === "delete") {
      const select = new Select({ condition: click })
      select.on("select", (e) => {
        e.selected.forEach((f) => {
          ;[nodeSource, fiberSource, zoneSource].forEach((s) => {
            if (s.hasFeature(f)) s.removeFeature(f)
          })
        })
        select.getFeatures().clear()
      })
      map.addInteraction(select)
      selectRef.current = select
    }
  }, [tool, nodeSource, fiberSource, zoneSource])

  // ---- Visibilidad de capas ----
  useEffect(() => {
    nodeLayer.current?.setVisible(visible.nodes)
    fiberLayer.current?.setVisible(visible.fibers)
    zoneLayer.current?.setVisible(visible.zones)
  }, [visible])

  function clearAll() {
    nodeSource.clear()
    fiberSource.clear()
    zoneSource.clear()
  }

  const tools: { id: Tool; label: string; icon: typeof Hand; color?: string }[] = [
    { id: "pan", label: "Mover mapa", icon: Hand },
    { id: "node", label: "Dibujar nodo", icon: Radio, color: COLORS.node },
    { id: "fiber", label: "Trazar fibra", icon: Spline, color: COLORS.fiber },
    { id: "zone", label: "Zona de cobertura", icon: Hexagon, color: COLORS.zone },
    { id: "delete", label: "Eliminar geometría", icon: Trash2 },
  ]

  return (
    <div className={`relative size-full ${className ?? ""}`}>
      <div
        ref={containerRef}
        className="size-full [&_.ol-zoom]:!left-auto [&_.ol-zoom]:!right-3 [&_.ol-zoom]:!top-3"
        role="application"
        aria-label="Mapa interactivo de la red de fibra"
      />

      {/* Barra de herramientas de dibujo (izquierda) */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl bg-card/95 p-1.5 shadow-lg ring-1 ring-border backdrop-blur">
        {tools.map((t) => {
          const Icon = t.icon
          const active = tool === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              title={t.label}
              aria-label={t.label}
              aria-pressed={active}
              className={`flex size-10 items-center justify-center rounded-lg transition ${
                active
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <Icon className="size-5" style={!active && t.color ? { color: t.color } : undefined} />
            </button>
          )
        })}
      </div>

      {/* Panel de capas y estadísticas (derecha) */}
      {showPanel ? (
        <div className="absolute right-3 top-16 z-10 w-60 rounded-xl bg-card/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Layers className="size-4 text-primary" />
              Capas
            </div>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Ocultar panel de capas"
            >
              <EyeOff className="size-4" />
            </button>
          </div>

          <ul className="flex flex-col gap-1">
            <LayerRow
              color={COLORS.node}
              label="Nodos"
              count={counts.nodes}
              visible={visible.nodes}
              onToggle={() => setVisible((v) => ({ ...v, nodes: !v.nodes }))}
            />
            <LayerRow
              color={COLORS.fiber}
              label="Tendido de fibra"
              count={counts.fibers}
              visible={visible.fibers}
              onToggle={() => setVisible((v) => ({ ...v, fibers: !v.fibers }))}
            />
            <LayerRow
              color={COLORS.zone}
              label="Zonas"
              count={counts.zones}
              visible={visible.zones}
              onToggle={() => setVisible((v) => ({ ...v, zones: !v.zones }))}
            />
          </ul>

          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-2 text-xs text-secondary-foreground">
            <Ruler className="size-3.5 text-primary" />
            Fibra total: <span className="ml-auto font-semibold tabular-nums text-primary">{totalKm.toFixed(2)} km</span>
          </div>

          <button
            type="button"
            onClick={clearAll}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/20"
          >
            <Trash2 className="size-3.5" />
            Limpiar todo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPanel(true)}
          className="absolute right-3 top-16 z-10 flex items-center gap-1.5 rounded-lg bg-card/95 px-3 py-2 text-sm font-medium text-foreground shadow-lg ring-1 ring-border backdrop-blur transition hover:bg-accent"
          aria-label="Mostrar panel de capas"
        >
          <Eye className="size-4 text-primary" />
          Capas
        </button>
      )}

      {/* Barra de estado del mapa */}
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
    </div>
  )
}

function LayerRow({
  color,
  label,
  count,
  visible,
  onToggle,
}: {
  color: string
  label: string
  count: number
  visible: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-accent">
      <span className="size-3 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{label}</span>
      <span className="rounded-md bg-secondary px-1.5 text-xs font-semibold tabular-nums text-secondary-foreground">
        {count}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className="rounded-md p-0.5 text-muted-foreground transition hover:text-foreground"
        aria-label={`${visible ? "Ocultar" : "Mostrar"} capa ${label}`}
        aria-pressed={visible}
      >
        {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </li>
  )
}

// Geometrías de ejemplo para poblar las capas al iniciar
function seedExamples(nodeSource: VectorSource, fiberSource: VectorSource, zoneSource: VectorSource) {
  const nodes: [number, number, string][] = [
    [-76.532, 3.4516, "Central Cali"],
    [-76.545, 3.44, "Nodo Sur"],
    [-76.52, 3.46, "Nodo Norte"],
  ]
  nodes.forEach(([lon, lat, nombre]) => {
    const f = new Feature({ geometry: new Point(fromLonLat([lon, lat])) })
    f.set("nombre", nombre)
    nodeSource.addFeature(f)
  })

  const fiber = new Feature({
    geometry: new LineString(
      [
        [-76.545, 3.44],
        [-76.532, 3.4516],
        [-76.52, 3.46],
      ].map((c) => fromLonLat(c)),
    ),
  })
  fiber.set("nombre", "Troncal principal")
  fiberSource.addFeature(fiber)

  const zone = new Feature({
    geometry: new Polygon([
      [
        [-76.56, 3.43],
        [-76.5, 3.43],
        [-76.5, 3.47],
        [-76.56, 3.47],
        [-76.56, 3.43],
      ].map((c) => fromLonLat(c)),
    ]),
  })
  zone.set("nombre", "Cobertura Centro")
  zoneSource.addFeature(zone)
}
