import Feature from "ol/Feature"
import Point from "ol/geom/Point"
import type { Geometry } from "ol/geom"
import { fromLonLat } from "ol/proj"
import { unByKey } from "ol/Observable"
import { CABLE_CONSULTADO_COLOR, NOMBRE_VISIBLE, SENTIDO_COLORS } from "@/lib/map/symbology"
import { obtenerExtremosDeCable, type ExtremoDeCable, type RolDeExtremo } from "@/lib/map/extremos-cable"
import { cableEn, datosDelCable, type ContextoHerramienta } from "@/components/mapa/herramientas/contexto"

/**
 * Consulta de cable (ribbon: Consultas → Red → «Cable»). El cable pulsado se
 * pinta de rojo y sus dos puntas se marcan: «Entrada» en la mufa padre y
 * «Salida» en la mufa hija, con los colores de la leyenda. Se probó a pintar
 * el cable en dos colores y el equipo lo encontró enredado: el color va solo
 * en las mufas.
 *
 * Cuál es la entrada y cuál la salida lo dice solo la función propia del
 * cable, `fn_json_extremos_cable` (ruta app/api/cables/[id]/extremos). Si
 * falla, el cable queda en rojo y el aviso muestra el error; no se le pregunta
 * a ninguna otra función.
 */
export function herramientaCable(ctx: ContextoHerramienta) {
  const { map, containerRef, nodeSource, cabeceraSource, extremosSource, sentidoSource, setAvisoConsulta } = ctx

  // Si se pulsan dos cables seguidos, solo cuenta el último; y nada de lo
  // que llegue después de cambiar de herramienta.
  let consultas = 0
  let activa = true

  /** La mufa o cabecera del mapa con ese UUID, si está. */
  const elementoDelMapa = (idElemento: string) => {
    for (const fuente of [nodeSource, cabeceraSource]) {
      const encontrado = fuente.getFeatures().find((f) => f.get("id") === idElemento)
      if (encontrado) return encontrado
    }
    return null
  }
  const nombreDe = (f: Feature<Geometry>) => (f.get(NOMBRE_VISIBLE) as string | undefined) ?? "un elemento sin nombre"

  /**
   * Marca las puntas con lo que devolvió `fn_json_extremos_cable` y deja el
   * aviso. Si la respuesta no alcanza para marcar las dos puntas, no se da por
   * buena: el aviso sale en ámbar y dice qué llegó, para saber que algo falta
   * y no creer que todo salió bien.
   */
  const marcarConExtremos = (extremos: ExtremoDeCable[], datos: string) => {
    const recibido =
      extremos.length === 0
        ? "fn_json_extremos_cable no devolvió ninguna punta"
        : `fn_json_extremos_cable devolvió: ${extremos
            .map((e) => `${e.nombre ?? e.id ?? "sin id"} (${e.rol ?? "no dice si es entrada o salida"})`)
            .join(", ")}`

    const marcadas: { rol: RolDeExtremo; nombre: string }[] = []
    for (const extremo of extremos) {
      if (!extremo.rol) continue
      const enMapa = extremo.id ? elementoDelMapa(extremo.id) : null
      const geometria =
        enMapa?.getGeometry() ?? (extremo.geometria ? new Point(fromLonLat(extremo.geometria.coordinates)) : null)
      if (!geometria) continue
      // El color de la función coincide con la leyenda (PADRE, la entrada, en
      // verde; HIJO, la salida, en naranja); si no manda uno, el de la leyenda.
      const color = extremo.color ?? SENTIDO_COLORS[extremo.rol]
      extremosSource.addFeature(new Feature({ geometry: geometria, rol: extremo.rol, color }))
      marcadas.push({
        rol: extremo.rol,
        nombre: extremo.nombre ?? (enMapa ? nombreDe(enMapa) : (extremo.tipo ?? "un elemento sin nombre")),
      })
    }

    const entrada = marcadas.find((m) => m.rol === "entrada")
    const salida = marcadas.find((m) => m.rol === "salida")
    if (entrada && salida) {
      setAvisoConsulta({ texto: `${datos}: entrada en ${entrada.nombre} y salida en ${salida.nombre}.` })
      return
    }
    if (entrada || salida) {
      const parte = entrada ? `entrada en ${entrada.nombre}` : `salida en ${(salida as NonNullable<typeof salida>).nombre}`
      const falta = entrada ? "la salida" : "la entrada"
      setAvisoConsulta({
        texto: `${datos}: ${parte}, pero no se pudo saber ${falta}.`,
        detalle: recibido,
        tono: "aviso",
      })
      return
    }
    const motivo =
      extremos.length === 0
        ? "la función no devolvió las puntas de este cable"
        : extremos.some((e) => e.rol)
          ? "las puntas que devolvió la función no están en el mapa"
          : "la función no dice cuál punta es la entrada y cuál la salida"
    setAvisoConsulta({ texto: `${datos}: ${motivo}.`, detalle: recibido, tono: "aviso" })
  }

  const claveMover = map.on("pointermove", (evt) => {
    if (evt.dragging || !containerRef.current) return
    containerRef.current.style.cursor = cableEn(ctx, evt.pixel) ? "pointer" : "crosshair"
  })

  const claveClick = map.on("singleclick", (evt) => {
    const cable = cableEn(ctx, evt.pixel)
    // Pulsar otro cable reemplaza lo pintado; pulsar fuera lo quita.
    extremosSource.clear()
    sentidoSource.clear()
    const turno = ++consultas
    if (!cable) {
      setAvisoConsulta(null)
      return
    }

    // El cable se pinta de rojo enseguida, para que se vea cuál se pulsó. Va
    // en la capa de resaltes, debajo de las mufas: así las marcas de sus
    // puntas quedan a la vista.
    const geometriaCable = cable.getGeometry()
    if (geometriaCable) {
      sentidoSource.addFeature(new Feature({ geometry: geometriaCable, color: CABLE_CONSULTADO_COLOR }))
    }

    const datos = datosDelCable(cable).join(" · ")
    const id = cable.get("id")
    if (typeof id !== "string") {
      setAvisoConsulta({ texto: `${datos}: se dibujó en el mapa y no existe en la base.`, tono: "aviso" })
      return
    }

    setAvisoConsulta({ texto: `Consultando los extremos de ${datos}…`, cargando: true })
    void obtenerExtremosDeCable(id).then((resultado) => {
      // Mientras llegaba se pulsó otro cable o se cambió de herramienta.
      if (!activa || turno !== consultas) return
      if (resultado.estado === "error") {
        setAvisoConsulta({
          texto: `${datos}: ${resultado.mensaje}`,
          detalle: `fn_json_extremos_cable${resultado.detalle ? ` → ${resultado.detalle}` : ""}`,
          tono: "error",
        })
        return
      }
      marcarConExtremos(resultado.extremos, datos)
    })
  })

  return () => {
    activa = false
    unByKey([claveMover, claveClick])
    extremosSource.clear()
    sentidoSource.clear()
  }
}
