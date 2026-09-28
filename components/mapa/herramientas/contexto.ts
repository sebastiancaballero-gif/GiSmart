import type { RefObject } from "react"
import type Map from "ol/Map"
import type Feature from "ol/Feature"
import type Collection from "ol/Collection"
import type Overlay from "ol/Overlay"
import type VectorLayer from "ol/layer/Vector"
import type VectorSource from "ol/source/Vector"
import type Draw from "ol/interaction/Draw"
import type Modify from "ol/interaction/Modify"
import type Select from "ol/interaction/Select"
import type Snap from "ol/interaction/Snap"
import type { Geometry } from "ol/geom"
import { NOMBRE_VISIBLE, TIPO_RED_NOMBRES, type FeatureType } from "@/lib/map/symbology"
import type { CapaEditable } from "@/lib/map/capa-activa"
import type { MapTool } from "@/lib/map/herramientas"

/** El elemento elegido en el mapa, con la capa de datos a la que pertenece. */
export type SelectedFeature = {
  feature: Feature<Geometry>
  type: FeatureType
}

/**
 * Resultado de una herramienta de consulta cuando no hay nada que abrir.
 * Sin tono es «info»: el resultado de una consulta o una indicación.
 */
export type AvisoDeConsulta = {
  texto: string
  /** Segunda línea: qué función se llamó y qué respondió, cuando algo falla. */
  detalle?: string
  cargando?: boolean
  tono?: "info" | "aviso" | "error"
}

type Capa = RefObject<VectorLayer<VectorSource> | null>

/**
 * Lo que una herramienta necesita del mapa. Lo arma el efecto de herramientas
 * de components/network-map.tsx cada vez que cambia la herramienta, con los
 * mismos nombres que tienen allí, para que el código de cada herramienta se
 * lea igual que cuando estaba dentro del componente.
 */
export type ContextoHerramienta = {
  map: Map
  tool: MapTool
  /** El contenedor del mapa: las consultas cambian el cursor sobre lo que se puede pulsar. */
  containerRef: RefObject<HTMLDivElement | null>

  nodeSource: VectorSource
  fiberSource: VectorSource
  zoneSource: VectorSource
  cabeceraSource: VectorSource
  measureSource: VectorSource
  /** Copias de los cables que pinta «Entradas y salidas» (y el cable rojo del botón «Cable»). */
  sentidoSource: VectorSource
  /** Puntas del cable consultado con el botón «Cable». */
  extremosSource: VectorSource

  nodeLayer: Capa
  fiberLayer: Capa
  zoneLayer: Capa
  cabeceraLayer: Capa

  // Las interacciones quedan en refs porque el mapa las quita al cambiar de
  // herramienta (ver `quitarInteracciones`) y algunas se usan desde fuera:
  // Esc aborta el trazo en curso y cerrar el panel limpia la selección.
  drawRef: RefObject<Draw | null>
  selectRef: RefObject<Select | null>
  deleteHoverRef: RefObject<Select | null>
  editSelectRef: RefObject<Select | null>
  editModifyRef: RefObject<Modify | null>
  fiberSnapRef: RefObject<Snap | null>

  /** Lo que «Editar elementos» deja arrastrar: lo seleccionado, si es de la capa activa. */
  modificables: Collection<Feature<Geometry>>
  measureOverlaysRef: RefObject<Overlay[]>
  fiberNoticeTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>
  capaActivaRef: RefObject<CapaEditable | null>

  tipoDeFeature: (feature: Feature<Geometry>) => FeatureType | null
  capaDeMapa: (capa: CapaEditable | null) => VectorLayer<VectorSource> | null
  nombreDeElemento: (id: string) => string | null
  consultarConectividad: (id: string, nombre: string) => Promise<void>

  setAvisoConsulta: (aviso: AvisoDeConsulta | null) => void
  setConsultada: (feature: Feature<Geometry> | null) => void
  setSelected: (seleccion: SelectedFeature | null) => void
  setNameDraft: (nombre: string) => void
  setFiberNotice: (texto: string | null) => void
  setNombreEnPregunta: (nombre: string) => void
  setMufaPendiente: (feature: Feature<Geometry> | null) => void
}

/**
 * Las capas de datos de la red. Las interacciones de selección solo deben ver
 * estas: si no se limitan, también alcanzan los elementos auxiliares que
 * dibujan otras interacciones encima del mapa.
 */
export function capasDeDatos(ctx: ContextoHerramienta) {
  return [ctx.nodeLayer.current, ctx.fiberLayer.current, ctx.zoneLayer.current, ctx.cabeceraLayer.current].filter(
    (capa): capa is VectorLayer<VectorSource> => capa !== null,
  )
}

// Cubierta y cable bajo el puntero, para las herramientas de consulta del
// ribbon, que se usan pulsando un elemento del mapa.

export function cubiertaEn(ctx: ContextoHerramienta, pixel: number[]) {
  return (
    ctx.map.forEachFeatureAtPixel(pixel, (f) => f as Feature<Geometry>, {
      layerFilter: (capa) => capa === ctx.nodeLayer.current,
      hitTolerance: 6,
    }) ?? null
  )
}

export function cableEn(ctx: ContextoHerramienta, pixel: number[]) {
  return (
    ctx.map.forEachFeatureAtPixel(pixel, (f) => f as Feature<Geometry>, {
      layerFilter: (capa) => capa === ctx.fiberLayer.current,
      hitTolerance: 6,
    }) ?? null
  )
}

/** Código, hilos y tipo de red del cable, con lo que ya está cargado en el mapa. */
export function datosDelCable(cable: Feature<Geometry>) {
  const partes: string[] = [(cable.get(NOMBRE_VISIBLE) as string | undefined) ?? "Cable"]
  const hilos = cable.get("cant_hilo")
  if (typeof hilos === "number" && hilos > 0) partes.push(`${hilos} hilo${hilos === 1 ? "" : "s"}`)
  const tipoRed = TIPO_RED_NOMBRES[cable.get("tipo_red_prin") as string]
  if (tipoRed) partes.push(tipoRed)
  return partes
}

/** Lo anterior más los dos elementos que une, según la capa de cables. */
export function describirCable(ctx: ContextoHerramienta, cable: Feature<Geometry>) {
  const partes = datosDelCable(cable)
  const extremos = [cable.get("id_elem_from"), cable.get("id_elem_to")].map((id) =>
    typeof id === "string" ? (ctx.nombreDeElemento(id) ?? "un elemento que no está en el mapa") : null,
  )
  partes.push(
    extremos[0] && extremos[1] ? `une ${extremos[0]} con ${extremos[1]}` : "sin sus extremos registrados en la base",
  )
  return partes.join(" · ")
}
