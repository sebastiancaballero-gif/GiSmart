"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
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
import { Style, Fill, Stroke, RegularShape, Text as TextStyle } from "ol/style"
import Draw from "ol/interaction/Draw"
import Modify from "ol/interaction/Modify"
import Select from "ol/interaction/Select"
import { click, pointerMove } from "ol/events/condition"
import { defaults as defaultControls } from "ol/control"
import type { Geometry } from "ol/geom"
import { Hand, Box, Spline, Hexagon, Trash2, X, Pencil, Waypoints, Network } from "lucide-react"
import { LAYER_COLORS } from "@/lib/network-colors"
import { MUFA_SCHEMA_EXAMPLE } from "@/lib/mufa-schema"
import { MufaSchemaDialog } from "@/components/mufa-schema-dialog"
import type { MufaCampoJSON } from "@/lib/schematic/mufa-field-data"
import { setSelectedMufaSchema } from "@/lib/schematic/selected-mufa"

type NetworkMapProps = {
  center?: [number, number]
  zoom?: number
  className?: string
  visible?: { nodes: boolean; fibers: boolean; zones: boolean }
  onStatsChange?: (counts: { nodes: number; fibers: number; zones: number }, totalKm: number) => void
  clearTrigger?: number
}

type Tool = "pan" | "edit" | "node" | "fiber" | "zone" | "delete"

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

const COLORS = LAYER_COLORS

// Las mufas (cajas de empalme de fibra) se representan como un marcador
// cuadrado con un glifo "+" (empalme), distinto del punto circular genérico,
// para diferenciarlas de otro tipo de elementos de red a simple vista.
function nodeStyle(feature: Feature<Geometry>) {
  const label = (feature.get("nombre") as string) ?? "Mufa"
  return [
    new Style({
      image: new RegularShape({
        points: 4,
        radius: 9,
        angle: Math.PI / 4,
        fill: new Fill({ color: COLORS.node }),
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
  center = [-76.532, 3.4516],
  zoom = 12,
  className,
  visible: externalVisible,
  onStatsChange,
  clearTrigger,
}: NetworkMapProps) {
  const router = useRouter()
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
  const deleteHoverRef = useRef<Select | null>(null)
  const editSelectRef = useRef<Select | null>(null)
  const editModifyRef = useRef<Modify | null>(null)

  const [coords, setCoords] = useState<{ lon: number; lat: number } | null>(null)
  const [zoomLevel, setZoomLevel] = useState<number>(zoom)
  const [tool, setTool] = useState<Tool>("pan")
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [schemaOpen, setSchemaOpen] = useState(false)

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
    setSelected(null)
    setSchemaOpen(false)

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
      draw.on("drawend", (e) => {
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
  }, [tool, nodeSource, fiberSource, zoneSource])

  useEffect(() => {
    const cursors: Record<Tool, string> = {
      pan: "grab",
      edit: "pointer",
      node: "crosshair",
      fiber: "crosshair",
      zone: "crosshair",
      delete: "pointer",
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTrigger])

  const tools: { id: Tool; label: string; icon: typeof Hand; color?: string }[] = [
    { id: "pan", label: "Mover mapa", icon: Hand },
    { id: "edit", label: "Editar elementos", icon: Pencil },
    { id: "node", label: "Dibujar mufa", icon: Box, color: COLORS.node },
    { id: "fiber", label: "Trazar fibra", icon: Spline, color: COLORS.fiber },
    { id: "zone", label: "Zona de cobertura", icon: Hexagon, color: COLORS.zone },
    { id: "delete", label: "Eliminar geometría", icon: Trash2 },
  ]

  const TYPE_ICONS: Record<FeatureType, typeof Box> = { node: Box, fiber: Spline, zone: Hexagon }

  function handleNameChange(value: string) {
    setNameDraft(value)
    selected?.feature.set("nombre", value)
  }

  function closeSelection() {
    editSelectRef.current?.getFeatures().clear()
    setSelected(null)
    setSchemaOpen(false)
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
    setSelectedMufaSchema(schema)
    router.push("/dashboard/mufa")
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
              className={`flex size-10 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
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

      {/* Panel de información del elemento seleccionado */}
      {selected && (
        <div className="absolute right-3 top-20 z-20 w-64 rounded-xl bg-card/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
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
    </div>
  )
}

function seedExamples(nodeSource: VectorSource, fiberSource: VectorSource, zoneSource: VectorSource) {
  const nodes: [number, number, string][] = [
    [-76.532, 3.4516, "Mufa Central"],
    [-76.545, 3.44, "Mufa Sur"],
    [-76.52, 3.46, "Mufa Norte"],
  ]
  nodes.forEach(([lon, lat, nombre]) => {
    const f = new Feature({ geometry: new Point(fromLonLat([lon, lat])) })
    f.set("nombre", nombre)
    f.set("esquema", { ...MUFA_SCHEMA_EXAMPLE })
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