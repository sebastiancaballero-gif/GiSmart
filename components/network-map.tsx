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
import { Hand, Radio, Spline, Hexagon, Trash2 } from "lucide-react"

type NetworkMapProps = {
  center?: [number, number]
  zoom?: number
  className?: string
  visible?: { nodes: boolean; fibers: boolean; zones: boolean }
  onStatsChange?: (counts: { nodes: number; fibers: number; zones: number }, totalKm: number) => void
  clearTrigger?: number
}

type Tool = "pan" | "node" | "fiber" | "zone" | "delete"

const COLORS = {
  node: "#0ea5e9",
  fiber: "#2563eb",
  zone: "#38bdf8",
}

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

export function NetworkMap({
  center = [-76.532, 3.4516],
  zoom = 12,
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

  const nodeLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const fiberLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const zoneLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const drawRef = useRef<Draw | null>(null)
  const selectRef = useRef<Select | null>(null)

  const [coords, setCoords] = useState<{ lon: number; lat: number } | null>(null)
  const [zoomLevel, setZoomLevel] = useState<number>(zoom)
  const [tool, setTool] = useState<Tool>("pan")

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

    const modify = new Modify({ source: nodeSource })
    map.addInteraction(modify)

    map.on("pointermove", (evt) => {
      const [lon, lat] = toLonLat(evt.coordinate)
      setCoords({ lon, lat })
    })
    view.on("change:resolution", () => {
      const z = view.getZoom()
      if (typeof z === "number") setZoomLevel(Math.round(z * 10) / 10)
    })

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

  useEffect(() => {
    if (externalVisible) {
      nodeLayer.current?.setVisible(externalVisible.nodes)
      fiberLayer.current?.setVisible(externalVisible.fibers)
      zoneLayer.current?.setVisible(externalVisible.zones)
    }
  }, [externalVisible])

  useEffect(() => {
    if (typeof clearTrigger === "number") {
      nodeSource.clear()
      fiberSource.clear()
      zoneSource.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTrigger])

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

      {/* Herramientas de dibujo (izquierda) */}
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
    </div>
  )
}

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