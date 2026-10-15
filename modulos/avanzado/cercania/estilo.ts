import type Feature from "ol/Feature"
import type { Geometry } from "ol/geom"
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style"

/**
 * El área de «Cercanía» en el mapa: un círculo verde azulado, con relleno
 * apenas visible y borde punteado, y su centro marcado. Distinto del ámbar de
 * la selección y del cian del trace, que pueden estar a la vez.
 */
export const COLOR_CERCANIA = "#0d9488"

const borde = new Style({
  stroke: new Stroke({ color: COLOR_CERCANIA, width: 2, lineDash: [8, 6] }),
  fill: new Fill({ color: "rgba(13, 148, 136, 0.08)" }),
})

const centro = new Style({
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: COLOR_CERCANIA }),
    stroke: new Stroke({ color: "#ffffff", width: 2 }),
    declutterMode: "none",
  }),
})

export function estiloCercania(feature: Feature<Geometry>) {
  return feature.getGeometry()?.getType() === "Point" ? centro : borde
}
