import Feature from "ol/Feature"
import type { Geometry } from "ol/geom"
import { unByKey } from "ol/Observable"
import { NOMBRE_VISIBLE } from "@/lib/map/symbology"
import { obtenerCablesDeMufa } from "@/lib/map/cables-de-mufa"
import { cableEn, cubiertaEn, describirCable, type ContextoHerramienta } from "@/components/mapa/herramientas/contexto"

const contar = (n: number, palabra: string) => `${n} ${palabra}${n === 1 ? "" : "s"}`

/**
 * «Entradas y salidas» (ribbon: Consultas → Red). Pinta los cables de la mufa
 * pulsada en una capa aparte que solo es visual, y quedan pintados hasta
 * pulsar otra mufa (que los reemplaza), pulsar fuera de las mufas o cambiar de
 * herramienta. Mismo reparto que la conectividad fina: se manda el UUID de la
 * cubierta, la función de Carlos dice qué cable entra, cuál sale y de qué
 * color, y aquí solo se dibuja (ver lib/map/cables-de-mufa.ts).
 */
export function herramientaSentido(ctx: ContextoHerramienta) {
  const { map, containerRef, fiberSource, sentidoSource, setAvisoConsulta, setConsultada } = ctx

  // Si se pulsan dos mufas seguidas, solo se pinta la última; y nada de lo
  // que llegue después de cambiar de herramienta.
  let consultas = 0
  let activa = true

  const claveMover = map.on("pointermove", (evt) => {
    if (evt.dragging || !containerRef.current) return
    containerRef.current.style.cursor =
      cubiertaEn(ctx, evt.pixel) || cableEn(ctx, evt.pixel) ? "pointer" : "crosshair"
  })

  const claveClick = map.on("singleclick", (evt) => {
    const cubierta = cubiertaEn(ctx, evt.pixel)
    // Pulsar otra mufa reemplaza lo pintado; pulsar fuera lo quita.
    sentidoSource.clear()
    const turno = ++consultas
    if (!cubierta) {
      // Sobre un cable: se resalta y se dice cuál es. Fuera de todo, se
      // limpia lo que hubiera.
      const cable = cableEn(ctx, evt.pixel)
      setConsultada(cable)
      setAvisoConsulta(cable ? { texto: describirCable(ctx, cable) } : null)
      return
    }
    setConsultada(cubierta)

    const nombre = (cubierta.get(NOMBRE_VISIBLE) as string | undefined) ?? "La cubierta"
    const id = cubierta.get("id")
    if (typeof id !== "string") {
      setAvisoConsulta({
        texto: `${nombre} se dibujó en el mapa y no existe en la base: no se sabe qué cables le llegan.`,
        tono: "aviso",
      })
      return
    }

    setAvisoConsulta({ texto: `Consultando los cables de ${nombre}…`, cargando: true })
    void obtenerCablesDeMufa(id).then((resultado) => {
      // Mientras llegaba se pulsó otra mufa o se cambió de herramienta.
      if (!activa || turno !== consultas) return
      if (resultado.estado === "error") {
        setAvisoConsulta({
          texto: `${nombre}: ${resultado.mensaje}`,
          detalle: `fn_json_conectividad_cubierta${resultado.detalle ? ` → ${resultado.detalle}` : ""}`,
          tono: "error",
        })
        return
      }
      if (resultado.cables.length === 0) {
        setAvisoConsulta({ texto: `La base no devolvió cables para ${nombre}.`, tono: "aviso" })
        return
      }

      // La geometría sale de la capa de cables que ya está en el mapa: de la
      // función solo interesan el UUID, el sentido y el color.
      const enElMapa = new Map<string, Feature<Geometry>>()
      for (const cable of fiberSource.getFeatures()) {
        const idCable = cable.get("id")
        if (typeof idCable === "string") enElMapa.set(idCable, cable)
      }

      let entradas = 0
      let salidas = 0
      let fuera = 0
      for (const cable of resultado.cables) {
        const geometria = enElMapa.get(cable.id)?.getGeometry()
        if (!geometria) {
          fuera++
          continue
        }
        if (cable.sentido === "entrada") entradas++
        else salidas++
        sentidoSource.addFeature(new Feature({ geometry: geometria.clone(), sentido: cable.sentido, color: cable.color }))
      }

      const noEstan = fuera ? `; ${contar(fuera, "cable")} de la respuesta no ${fuera === 1 ? "está" : "están"} en el mapa` : ""
      setAvisoConsulta({ texto: `${nombre}: ${contar(entradas, "entrada")} y ${contar(salidas, "salida")}${noEstan}.` })
    })
  })

  return () => {
    activa = false
    unByKey([claveMover, claveClick])
    sentidoSource.clear()
  }
}
