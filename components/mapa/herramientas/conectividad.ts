import { unByKey } from "ol/Observable"
import { NOMBRE_VISIBLE } from "@/lib/map/symbology"
import { cubiertaEn, type ContextoHerramienta } from "@/components/mapa/herramientas/contexto"

/**
 * Consulta de conectividad (ribbon: Consultas → Red → «Conectividad fina»).
 * El flujo lo fijó Aurelio: el usuario elige un elemento; si no es una
 * cubierta no pasa nada; si lo es, se pide su conectividad con el UUID y se
 * abre el esquemático de Dario en modo consulta. Antes se preguntaba
 * «¿Consultar la conectividad?»; se quitó porque el equipo lo consideró un
 * paso de más.
 */
export function herramientaConectividad(ctx: ContextoHerramienta) {
  const { map, containerRef, setAvisoConsulta, setConsultada, consultarConectividad } = ctx

  // Sobre una cubierta el cursor pasa a mano, para ver qué se puede pulsar.
  const claveMover = map.on("pointermove", (evt) => {
    if (evt.dragging || !containerRef.current) return
    containerRef.current.style.cursor = cubiertaEn(ctx, evt.pixel) ? "pointer" : "crosshair"
  })

  const claveClick = map.on("singleclick", (evt) => {
    const cubierta = cubiertaEn(ctx, evt.pixel)
    // No es una cubierta: no se hace nada.
    if (!cubierta) return
    setConsultada(cubierta)

    const nombre = (cubierta.get(NOMBRE_VISIBLE) as string | undefined) ?? "la cubierta"
    const id = cubierta.get("id")
    if (typeof id !== "string") {
      setAvisoConsulta({
        texto: `${nombre} se dibujó en el mapa y no existe en la base: no tiene conectividad.`,
        tono: "aviso",
      })
      return
    }
    void consultarConectividad(id, nombre)
  })

  return () => unByKey([claveMover, claveClick])
}
