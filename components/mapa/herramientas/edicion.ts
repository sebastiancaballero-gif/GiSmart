import type Feature from "ol/Feature"
import type { Geometry } from "ol/geom"
import Modify from "ol/interaction/Modify"
import Select from "ol/interaction/Select"
import { click } from "ol/events/condition"
import { NOMBRE_VISIBLE, seleccionStyle } from "@/lib/map/symbology"
import { capasDeDatos, type ContextoHerramienta } from "@/components/mapa/herramientas/contexto"

/**
 * «Editar elementos»: click para seleccionar un elemento (abre el panel de
 * info) y arrastrar sus vértices para corregir el trazado. «Mover mapa» queda
 * libre solo para desplazarse, sin interceptar clicks. Se puede seleccionar
 * cualquier elemento para consultarlo, pero solo se arrastra lo que es de la
 * capa activa (`modificables`).
 */
export function herramientaEdicion(ctx: ContextoHerramienta) {
  const { map, tipoDeFeature, modificables, setSelected, setNameDraft, editSelectRef, editModifyRef } = ctx

  const editSelect = new Select({
    condition: click,
    layers: capasDeDatos(ctx),
    // Resalta lo seleccionado sobre el mapa, no solo en el panel lateral.
    style: ((f: Feature<Geometry>, r: number) => {
      const tipo = tipoDeFeature(f)
      return tipo ? seleccionStyle(f, r, tipo) : undefined
    }) as never,
  })
  editSelect.on("select", (e) => {
    const feature = e.selected[0]
    if (!feature) {
      setSelected(null)
      return
    }
    const type = tipoDeFeature(feature)
    // Si el elemento no pertenece a ninguna capa de datos (por ejemplo, un
    // manejador de vértice que la herramienta de edición dibuja encima de lo
    // seleccionado), se conserva la selección actual en vez de abrir el panel
    // con una ficha vacía.
    if (!type) return
    setSelected({ feature, type })
    setNameDraft((feature.get(NOMBRE_VISIBLE) as string) ?? "")
  })
  map.addInteraction(editSelect)
  editSelectRef.current = editSelect

  const editModify = new Modify({ features: modificables })
  map.addInteraction(editModify)
  editModifyRef.current = editModify
}
