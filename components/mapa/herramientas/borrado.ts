import Select from "ol/interaction/Select"
import { click, pointerMove } from "ol/events/condition"
import { Style, Fill, Stroke, RegularShape } from "ol/style"
import { capasDeDatos, type ContextoHerramienta } from "@/components/mapa/herramientas/contexto"

/** «Eliminar geometría»: quita del mapa lo que se pulse, si es de la capa activa. */
export function herramientaBorrado(ctx: ContextoHerramienta) {
  const { map, nodeSource, fiberSource, zoneSource, cabeceraSource, capaDeMapa, capaActivaRef, deleteHoverRef, selectRef } =
    ctx
  const capas = capasDeDatos(ctx)

  // Resalta en rojo la geometría bajo el cursor antes de borrarla, para que el
  // usuario vea qué va a eliminar antes de hacer click.
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
  // Solo se resalta y se quita lo que es de la capa activa.
  const deLaCapaActiva = (_f: unknown, capa: unknown) => capa === capaDeMapa(capaActivaRef.current)
  const hover = new Select({
    condition: pointerMove,
    style: hoverStyle,
    layers: capas,
    filter: deLaCapaActiva,
  })
  map.addInteraction(hover)
  deleteHoverRef.current = hover

  const select = new Select({ condition: click, layers: capas, filter: deLaCapaActiva })
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
