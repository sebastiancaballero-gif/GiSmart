import type LineString from "ol/geom/LineString"
import Draw from "ol/interaction/Draw"
import Snap from "ol/interaction/Snap"
import { FIBER_HINT, NOMBRE_VISIBLE, isNearNode } from "@/lib/map/symbology"
import type { ContextoHerramienta } from "@/components/mapa/herramientas/contexto"

/**
 * «Dibujar cubierta», «Trazar fibra» y «Zona de cobertura». El elemento
 * queda solo en el mapa: todavía no se guarda en la base.
 */
export function herramientaDibujo(ctx: ContextoHerramienta) {
  const {
    map,
    tool,
    nodeSource,
    fiberSource,
    zoneSource,
    drawRef,
    fiberSnapRef,
    fiberNoticeTimeoutRef,
    setFiberNotice,
    setNombreEnPregunta,
    setMufaPendiente,
  } = ctx
  if (tool !== "node" && tool !== "fiber" && tool !== "zone") return

  const cfg = {
    node: { source: nodeSource, type: "Point" as const, prefix: "Cubierta" },
    fiber: { source: fiberSource, type: "LineString" as const, prefix: "Fibra" },
    zone: { source: zoneSource, type: "Polygon" as const, prefix: "Zona" },
  }[tool]

  /** Dice por qué no se aceptó el trazo y, al rato, vuelve a la indicación. */
  const rechazarTrazo = (texto: string) => {
    setFiberNotice(texto)
    if (fiberNoticeTimeoutRef.current) clearTimeout(fiberNoticeTimeoutRef.current)
    fiberNoticeTimeoutRef.current = setTimeout(() => setFiberNotice(FIBER_HINT), 2800)
  }

  // Sin `source`: el elemento se añade a mano al terminar (ver drawend).
  const draw = new Draw({ type: cfg.type })

  if (tool === "fiber") {
    // La fibra siempre debe unir dos mufas: si no arranca sobre una, se aborta
    // el trazo de inmediato en vez de dejar dibujar al aire.
    draw.on("drawstart", (e) => {
      const start = (e.feature.getGeometry() as LineString).getFirstCoordinate()
      if (!isNearNode(start, nodeSource)) {
        draw.abortDrawing()
        rechazarTrazo("Debes iniciar el trazado sobre una cubierta.")
      }
    })
  }

  draw.on("drawend", (e) => {
    if (tool === "fiber") {
      const end = (e.feature.getGeometry() as LineString).getLastCoordinate()
      if (!isNearNode(end, nodeSource)) {
        rechazarTrazo("Debes terminar el trazado sobre una cubierta. Inténtalo de nuevo.")
        return
      }
    }

    const count = cfg.source.getFeatures().length + 1
    e.feature.set(NOMBRE_VISIBLE, `${cfg.prefix} ${count}`)
    // Una mufa recién dibujada no existe en la base, así que no tiene
    // conectividad que consultar. Antes se le ponía el esquema de ejemplo.

    // Se añade aquí y no con la opción `source` del Draw. OpenLayers avisa del
    // fin del dibujo antes de añadir el elemento, así que borrarlo en este
    // punto no servía: el borrado llegaba antes que el alta y un cable que no
    // terminaba en una mufa se quedaba igual. Añadiéndolo a mano, lo inválido
    // simplemente no entra.
    cfg.source.addFeature(e.feature)

    // La mufa ya se ve en su sitio, pero queda pendiente de confirmar.
    if (tool === "node") {
      setNombreEnPregunta(e.feature.get(NOMBRE_VISIBLE) as string)
      setMufaPendiente(e.feature)
    }
  })
  map.addInteraction(draw)
  drawRef.current = draw

  if (tool === "fiber") {
    // Se agrega después del Draw para que el snap ajuste el punto justo antes
    // de que Draw lo use (según la documentación de OpenLayers).
    const snap = new Snap({ source: nodeSource })
    map.addInteraction(snap)
    fiberSnapRef.current = snap
  }
}
