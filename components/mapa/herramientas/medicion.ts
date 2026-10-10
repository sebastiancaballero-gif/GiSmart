import { unByKey } from "ol/Observable"
import Overlay from "ol/Overlay"
import type LineString from "ol/geom/LineString"
import type Polygon from "ol/geom/Polygon"
import Draw from "ol/interaction/Draw"
import { getLength, getArea } from "ol/sphere"
import { formatArea, formatLength } from "@/lib/map/symbology"
import type { ContextoHerramienta } from "@/components/mapa/herramientas/contexto"

/**
 * «Medir distancia» y «Medir área». Medición «en el aire»: no depende de mufas
 * ni cables reales, solo dibuja una geometría temporal y muestra la distancia
 * o el área en vivo. Las mediciones se borran al salir de las dos
 * herramientas (lo hace el mapa) o con «Limpiar».
 */
export function herramientaMedicion(ctx: ContextoHerramienta) {
  const { map, tool, measureSource, measureOverlaysRef, drawRef } = ctx
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

    // La medición termina de una de dos formas, y la otra deja de aplicar. Antes
    // el «drawabort» de una medición ya terminada quedaba esperando, y la Esc de
    // la siguiente borraba también su rótulo.
    const alTerminar = draw.once("drawend", () => {
      unByKey(alCancelar)
      tooltipEl.style.background = "#334155"
    })
    const alCancelar = draw.once("drawabort", () => {
      unByKey(alTerminar)
      map.removeOverlay(tooltipOverlay)
      measureOverlaysRef.current = measureOverlaysRef.current.filter((o) => o !== tooltipOverlay)
    })
  })

  map.addInteraction(draw)
  drawRef.current = draw
}
