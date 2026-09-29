import type Map from "ol/Map"
import type Layer from "ol/layer/Layer"
import type RenderEvent from "ol/render/Event"
import type { Geometry } from "ol/geom"
import Point from "ol/geom/Point"
import { getVectorContext } from "ol/render"
import { unByKey } from "ol/Observable"
import { easeOut } from "ol/easing"
import { Circle as CircleStyle, Stroke, Style } from "ol/style"

/** Lo que dura el destello completo, con sus dos ondas. */
const DURACION_MS = 1600

/** La segunda onda sale cuando la primera va por este punto. */
const DESFASE = 0.35

/** Color del destello en RGB: la opacidad la pone cada fotograma. */
export type ColorRGB = readonly [number, number, number]

/** Un elemento de la red: el turquesa de la marca. */
export const DESTELLO_ELEMENTO: ColorRGB = [42, 155, 196]

/** Una dirección o coordenada del buscador: el violeta de su pin. */
export const DESTELLO_DESTINO: ColorRGB = [124, 58, 237]

/**
 * Destello sobre un elemento del mapa: dos ondas que se abren y se apagan donde
 * quedó lo que se buscó o se ubicó.
 *
 * Al elegir un resultado del buscador o pulsar «Ubicar» en una ventana, el mapa
 * viajaba hasta el sitio pero no decía qué mirar: con varias cubiertas juntas
 * había que adivinar cuál era. Un punto recibe anillos; un cable o una zona, un
 * halo que sigue su trazo.
 *
 * Se dibuja sobre `capa` en cada fotograma y se quita solo al terminar. Devuelve
 * con qué cortarlo antes (por ejemplo, si se pide otro). Con «reducir
 * movimiento» activado en el sistema no se dibuja.
 */
export function destellar(mapa: Map, capa: Layer, geometria: Geometry, color: ColorRGB): () => void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {}

  const inicio = Date.now()
  const esPunto = geometria instanceof Point
  const rgba = (alfa: number) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alfa.toFixed(3)})`

  const clave = capa.on("postrender", (evento: RenderEvent) => {
    const t = ((evento.frameState?.time ?? Date.now()) - inicio) / DURACION_MS
    if (t >= 1) {
      unByKey(clave)
      return
    }
    const contexto = getVectorContext(evento)
    for (const retraso of [0, DESFASE]) {
      const p = (t - retraso) / (1 - DESFASE)
      if (p < 0 || p > 1) continue
      const queda = 1 - p
      contexto.setStyle(
        esPunto
          ? new Style({
              image: new CircleStyle({
                radius: 8 + easeOut(p) * 30,
                stroke: new Stroke({ color: rgba(queda * 0.9), width: 1 + queda * 2.5 }),
              }),
            })
          : new Style({
              stroke: new Stroke({
                color: rgba(queda * 0.55),
                width: 4 + easeOut(p) * 14,
                lineCap: "round",
                lineJoin: "round",
              }),
            }),
      )
      contexto.drawGeometry(geometria)
    }
    // Pide el siguiente fotograma: sin esto el mapa solo se redibuja al moverse.
    mapa.render()
  })
  mapa.render()

  return () => {
    unByKey(clave)
    mapa.render()
  }
}
