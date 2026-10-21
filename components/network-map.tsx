"use client"

import { useEffect, useRef, useState, useCallback, memo } from "react"
import "ol/ol.css"
import Map from "ol/Map"
import View from "ol/View"
import TileLayer from "ol/layer/Tile"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import Feature, { type FeatureLike } from "ol/Feature"
import GeoJSON from "ol/format/GeoJSON"
import Collection from "ol/Collection"
import Point from "ol/geom/Point"
import type Overlay from "ol/Overlay"
import { fromLonLat, toLonLat } from "ol/proj"
import type Draw from "ol/interaction/Draw"
import type Modify from "ol/interaction/Modify"
import type Select from "ol/interaction/Select"
import type Snap from "ol/interaction/Snap"
import DoubleClickZoom from "ol/interaction/DoubleClickZoom"
import DragBox from "ol/interaction/DragBox"
import DragPan from "ol/interaction/DragPan"
import OverviewMap from "ol/control/OverviewMap"
import { always } from "ol/events/condition"
import { Stroke, Style } from "ol/style"
import type { CapaConOpacidad, EstiloDeFondo } from "@/modulos/avanzado/vista/apariencia"
import { defaults as defaultControls } from "ol/control"
import ScaleLine from "ol/control/ScaleLine"
import type { Geometry, LineString, MultiLineString } from "ol/geom"
import { createEmpty, extend, getCenter, getHeight, getWidth, isEmpty } from "ol/extent"
import { unByKey } from "ol/Observable"
import { getUid } from "ol/util"
import { Hand, Box, Spline, Hexagon, Trash2, Pencil, Ruler, Square, Loader2, Keyboard } from "lucide-react"
import { LAYER_COLORS } from "@/lib/network-colors"
import {
  ESTILO_FLUJO_TRACE,
  FLUJO_TRACE,
  MEASURE_COLOR,
  PERIODO_FLUJO_TRACE,
  TIPO_RED_NOMBRES,
  brilloDeCableStyle,
  destinoStyle,
  extremoStyle,
  largoEnKm,
  marcadorStyle,
  resalteStyle,
  sentidoStyle,
  textoDeLongitud,
  traceStyle,
} from "@/lib/map/symbology"
import type { DireccionTrace, GeometriaDeTramo } from "@/lib/map/trace"
import { getVectorContext } from "ol/render"
import {
  CABECERA_FIELD_LABELS,
  FIBER_FIELD_LABELS,
  MUFA_FIELD_LABELS,
  TYPE_LABELS,
  cabeceraStyle,
  categoriaDeCable,
  categoriaDeMufa,
  colorForFuncionCub,
  colorForTipoRed,
  fiberStyle,
  nivelDeLeyenda,
  fiberWidth,
  measureStyle,
  nodeStyle,
  ponerFondoOscuro,
  SENTIDO_SENAL,
  tipoDeRed,
  zoneStyle,
  NOMBRE_VISIBLE,
  type FeatureType,
} from "@/lib/map/symbology"
import { getCurrentTheme } from "@/lib/theme"
import { sentidoDeLaSenal } from "@/lib/map/sentido-senal"
import { loadRealCabeceras, loadRealFiberCables, loadRealMufas, type ErrorDeCapa } from "@/lib/map/loaders"
import { agrupar, categoriaVisible, type NetworkStats } from "@/lib/map/capas"
import { guardarVista, leerVistaGuardada, type VistaGuardada } from "@/lib/map/vista-guardada"
import { DESTELLO_DESTINO, DESTELLO_ELEMENTO, DESTELLO_RESALTE, destellar, type ColorRGB } from "@/lib/map/destello"
import { espacioLibre, margenParaZona, type Recuadro } from "@/lib/map/espacio-libre"
import { limpiarNombre } from "@/lib/texto"
import { fuenteDelMapaBase } from "@/lib/map/mapa-base"
import { TOOL_HINTS, TOOL_ORDER, type MapTool } from "@/lib/map/herramientas"
import type { ElementoBuscable } from "@/lib/map/busqueda"
import {
  CAPA_DE_TIPO,
  HERRAMIENTAS_DE_EDICION,
  NOMBRE_DE_CAPA,
  motivoHerramientaBloqueada,
  type CapaEditable,
} from "@/lib/map/capa-activa"
import {
  HERRAMIENTAS,
  quitarInteracciones,
  type AvisoDeConsulta,
  type ContextoHerramienta,
  type SelectedFeature,
} from "@/components/mapa/herramientas"
import { PanelSeleccion } from "@/components/mapa/panel-seleccion"
import type { VariosEnElPunto } from "@/modulos/avanzado/ficha/paginador"
import { estiloCercania } from "@/modulos/avanzado/cercania/estilo"
import { circular } from "ol/geom/Polygon"
import { MufaSchemaDialog } from "@/components/mufa-schema-dialog"
import { MufaConnectivityModal } from "@/components/mufa-connectivity-modal"
import { InfoTableDialog } from "@/components/info-table-dialog"
import { GismartMark } from "@/components/gismart-mark"
import { MapLegend } from "@/components/map-legend"
import { MapNotice, MapNoticeStack } from "@/components/map-notices"
import { MapStatusBar } from "@/components/map-status-bar"
import { LimiteDeError } from "@/components/limite-de-error"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { AyudaAtajos } from "@/components/ayuda-atajos"
import {
  crearConsultor,
  obtenerConectividad,
  resultadoAGuardar,
  type EstadoConectividad,
} from "@/lib/map/conectividad"
import { Tooltip } from "@/components/ui/tooltip"
import type { MufaCampoJSON } from "@/lib/schematic/mufa-field-data"

/** Un cable del mapa, con lo que muestra «Gestión de hilos». */
export type CableElegido = {
  /** UUID en la base; `null` si se dibujó en el mapa y no existe allí. */
  id: string | null
  codigo: string
  /** Cantidad de hilos según la capa de cables. */
  hilos: number | null
  /** Largo medido sobre el mapa, en metros. */
  largoM: number
  origen: string | null
  destino: string | null
}

/**
 * Cómo terminó una elección en el mapa (ver `MapaApi.elegirCable`).
 *
 * - `elegido`: se hizo click sobre un elemento.
 * - `cancelada`: Esc o la ✕ del aviso; quien la pidió vuelve a lo que estaba.
 * - `abandonada`: se abrió otra ventana (o la misma) antes de elegir; quien la
 *   pidió no debe volver a abrirse por su cuenta.
 */
export type Eleccion<T> = { estado: "elegido"; valor: T } | { estado: "cancelada" } | { estado: "abandonada" }

/** Lo que el tablero le puede pedir al mapa desde fuera (el buscador, los hilos). */
export type MapaApi = {
  /** Centra el mapa en el elemento y lo selecciona. `false` si ya no está. */
  enfocarElemento: (clave: string) => boolean
  /** El cable seleccionado en el mapa, si lo hay. */
  cableSeleccionado: () => CableElegido | null
  /**
   * Espera a que se haga click sobre un cable y lo devuelve. Mientras tanto el
   * mapa lo dice en un aviso y vuelve a «Mover mapa», para que ninguna
   * herramienta se quede con el click.
   */
  elegirCable: () => Promise<Eleccion<CableElegido>>
  /**
   * Lo mismo con una cabecera o una cubierta: devuelve su clave (la del índice
   * del buscador) y su nombre. El aviso dice para qué se elige.
   */
  elegirElemento: (tipo: "cabecera" | "node", aviso: string) => Promise<Eleccion<{ clave: string; nombre: string }>>
  /**
   * Deja sin efecto la elección que esté esperando un click (la termina como
   * `abandonada`). Lo llama cada ventana al abrirse, para que una elección
   * vieja no la vuelva a abrir ni deje el aviso del mapa colgado.
   */
  abandonarEleccion: () => void
  /**
   * Pinta el recorrido de un trace: resalta los cables del mapa con esos UUID
   * y las geometrías que lleguen (GeoJSON en EPSG:4326), marca con un punto las
   * `cubiertas` (UUID) por donde pasa, y encuadra el recorrido. Reemplaza el
   * anterior. `ventana` es el recuadro (en píxeles de pantalla) de la ventana
   * del trace: el recorrido se encuadra en el espacio libre más grande que deja
   * alrededor, esté donde esté. Con `encuadrar` en falso no mueve el mapa
   * (quien pinta encuadra después, con `encuadrarRecorrido`, cuando su ventana
   * ya tiene su tamaño: así el mapa se mueve una sola vez). Devuelve cuántos
   * cables se pintaron, cuáles no están en el mapa y el largo total en metros.
   */
  pintarRecorrido: (recorrido: {
    cables: string[]
    geometrias: GeometriaDeTramo[]
    cubiertas?: string[]
    ventana?: Recuadro
    encuadrar?: boolean
    /** Hacia dónde se recorrió: una raya corre sobre el recorrido en ese sentido. */
    direccion?: DireccionTrace
  }) => {
    pintados: number
    faltan: string[]
    largoM: number
  }
  /** Quita del mapa el recorrido pintado. */
  limpiarRecorrido: () => void
  /**
   * Lleva el mapa a la cubierta con ese UUID, la destella y la deja resaltada
   * en ámbar (ver `resalteStyle`), sin seleccionarla. `ventana` es el recuadro
   * (en píxeles de pantalla) de una ventana que tapa parte del mapa: la cubierta
   * queda en el centro del espacio libre más grande que deja (arriba, abajo o a
   * un costado), no debajo de ella. El resalte queda hasta que se muestre otra
   * cosa, se llame `quitarResalte` o se quite el recorrido. `false` si no está.
   */
  mostrarCubierta: (id: string, ventana?: Recuadro) => boolean
  /**
   * Lo mismo con el cable de ese UUID: queda entero en el espacio libre (si no
   * cabe, el mapa se aleja lo justo), se destella y queda resaltado. `false` si no está.
   */
  mostrarCable: (id: string, ventana?: Recuadro) => boolean
  /** Quita el resalte que dejaron `mostrarCubierta` o `mostrarCable`. */
  quitarResalte: () => void
  /**
   * Vuelve a encuadrar el recorrido pintado: después de que la ventana del
   * trace cambió de tamaño o se movió. `ventana`, como en `pintarRecorrido`.
   */
  encuadrarRecorrido: (ventana?: Recuadro) => void
  /** Centro (lon, lat) y zoom de lo que se está viendo; `null` si el mapa no está listo. */
  vistaActual: () => VistaGuardada | null
  /** Lleva el mapa a esa vista (centro y zoom), con una animación corta. */
  irAVista: (vista: VistaGuardada) => void
  /** Abre la ventana de atajos de teclado (la misma que la tecla «?»). */
  abrirAtajos: () => void
  /**
   * Los elementos de la red cargados en el mapa, para el módulo «Avanzado»
   * (resumen, tabla, consultas). Con `soloEnVista`, los que tocan lo que se
   * está viendo; `extension` es eso mismo, en Web Mercator.
   */
  elementosDelMapa: (opciones?: { soloEnVista?: boolean; conPropiedades?: boolean }) => {
    extension: number[]
    elementos: ElementoDelMapa[]
  }
  /**
   * Avisa cada vez que cambia lo que se ve: se mueve el mapa, se enciende o
   * apaga una capa, se filtra o se recargan los datos. Devuelve cómo dejar de avisar.
   */
  alCambiarLaVista: (aviso: () => void) => () => void
  /**
   * Resalta en ámbar esos elementos (por su clave) en una capa propia del
   * módulo «Avanzado»; con la lista vacía quita el resalte. Con `encuadrar`
   * lleva el mapa a ellos. Devuelve cuántos encontró.
   */
  resaltarElementos: (claves: string[], opciones?: { encuadrar?: boolean }) => number
  /** Espera un click en cualquier lugar del mapa y devuelve ese punto (longitud, latitud). */
  elegirPunto: (aviso: string) => Promise<Eleccion<[number, number]>>
  /**
   * Dibuja el círculo de «Cercanía» (centro en longitud, latitud y radio en
   * metros); `null` lo quita. Con `encuadrar`, el mapa lo muestra entero.
   */
  pintarCercania: (area: { centro: [number, number]; radioM: number } | null, opciones?: { encuadrar?: boolean }) => void
  /** La cubierta o cabecera que muestra la ficha, si es un punto: su nombre y dónde está. */
  puntoDeLaFicha: () => { nombre: string; punto: [number, number] } | null
  /**
   * El mapa tal como se ve, en un lienzo (todas sus capas, sin los controles),
   * y cuántos metros del terreno mide un píxel en el centro, para la escala.
   */
  /** El mapa como imagen, con el fondo y sin él (para imprimir con o sin el mapa base). */
  capturarMapa: () => Promise<{
    lienzo: HTMLCanvasElement
    lienzoSinFondo: HTMLCanvasElement
    metrosPorPixel: number
    /** El mapa base no terminó de bajar en 10 s: la imagen puede salir sin algunas teselas. */
    incompleta?: boolean
  } | null>
  /** Vuelve a la vista anterior o a la siguiente, como atrás y adelante en el navegador. `false` si no hay. */
  vistaAnterior: () => boolean
  vistaSiguiente: () => boolean
  /** Espera que se dibuje un recuadro sobre el mapa y se acerca a él; `false` si se canceló (Esc). */
  acercarConRecuadro: (aviso: string) => Promise<boolean>
  /** Muestra u oculta el minimapa de ubicación (abajo a la izquierda). */
  ponerMinimapa: (visible: boolean) => void
  /** Cómo se ve el mapa base (ver modulos/avanzado/vista/apariencia.ts). */
  ponerFondo: (estilo: EstiloDeFondo) => void
  /** La opacidad de una capa, de 0 a 1. */
  ponerOpacidad: (capa: CapaConOpacidad, opacidad: number) => void
}

/** Una vista del historial de «Anterior / Siguiente», en Web Mercator. */
type VistaDelHistorial = { centro: number[]; resolucion: number; rotacion: number }
/** Hasta cuántas vistas se recuerdan para volver atrás. */
const MAX_HISTORIAL = 50
/** Dos vistas casi iguales (lo que mueve un pellizco del mouse) cuentan como una. */
function vistasParecidas(a: VistaDelHistorial, b: VistaDelHistorial): boolean {
  return (
    Math.abs(a.resolucion / b.resolucion - 1) < 0.01 &&
    Math.hypot(a.centro[0] - b.centro[0], a.centro[1] - b.centro[1]) < b.resolucion * 3 &&
    Math.abs(a.rotacion - b.rotacion) < 1e-3
  )
}
/** Cuántos segundos corre la raya del recorrido del trace después de pintarlo. */
const SEGUNDOS_DE_FLUJO = 15

/** Cuánto espera la captura del mapa (Imprimir, Copiar mapa) a que termine de dibujarse. */
const ESPERA_CAPTURA_MS = 10_000

// El tendido de fibra en el minimapa: una línea fina, para ver la forma de la
// red, con el color de su tipo de red (feeder azul, distribución magenta), como el mapa.
const estilosDelMinimapa = new globalThis.Map<string, Style>()
function estiloDelMinimapa(f: FeatureLike): Style {
  const color = colorForTipoRed(f.get("tipo_red_prin") as string | undefined)
  let estilo = estilosDelMinimapa.get(color)
  if (!estilo) {
    estilo = new Style({ stroke: new Stroke({ color, width: 1.2 }) })
    estilosDelMinimapa.set(color, estilo)
  }
  return estilo
}

/** El minimapa: el mapa base y el tendido de fibra en chico, con el recuadro de lo que se ve. */
function crearMinimapa(tendido: VectorSource): OverviewMap {
  return new OverviewMap({
    className: "ol-overviewmap gismart-minimapa",
    collapsed: false,
    collapsible: false,
    layers: [
      new TileLayer({ source: fuenteDelMapaBase(), className: "gismart-basemap" }),
      new VectorLayer({ source: tendido, style: estiloDelMinimapa }),
    ],
  })
}

/** Un elemento de la red tal como lo ve el módulo «Avanzado», sin OpenLayers de por medio. */
export type ElementoDelMapa = {
  /** La del índice del buscador: sirve para `enfocarElemento`. */
  clave: string
  tipo: FeatureType
  nombre: string
  /** Nivel de la cubierta o capacidad del cable, como en el panel de capas. */
  categoria: string
  color: string
  /** Su capa está encendida y el filtro de categorías lo deja pintado. */
  visible: boolean
  hilos: number | null
  /** Cables: el largo medido si la base lo tiene; si no, el de su línea. */
  largoM: number | null
  /** Cables: sus líneas en Web Mercator, para medir lo que cae en pantalla. */
  lineas: number[][][] | null
  /** Cubiertas y cabeceras: longitud y latitud. */
  punto: [number, number] | null
  /** Si toca lo que se está viendo ahora. */
  enVista: boolean
  /** Con `conPropiedades`: sus atributos tal como vienen de la base. */
  propiedades?: Record<string, unknown>
}

/**
 * Lo que flota sobre el mapa y tapa parte de él: las herramientas, la leyenda,
 * la ficha del elemento, la barra de estado (con `data-tapa-mapa`) y los
 * controles de OpenLayers (acercar, escala). El encuadre del trace y «mostrar»
 * lo esquivan, para que lo que se muestra no quede debajo.
 */
function lasTapasDelMapa(): Recuadro[] {
  return [...document.querySelectorAll<HTMLElement>("[data-tapa-mapa], .ol-control")]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
}

/** El largo de un cable en metros: el medido en campo si la base lo tiene; si no, el de su línea. */
function largoDeCableM(f: Feature<Geometry>): number {
  const medido = f.get("longitud_medida")
  return typeof medido === "number" && medido > 0
    ? Math.round(medido * 100) / 100
    : Math.round(largoEnKm(f.getGeometry()) * 1000)
}

/**
 * Lo que una ventana del tablero (hilos, GPON, redes por nodo) recibe del
 * mapa. Con esto cada ventana maneja su propio estado y el tablero solo la
 * abre.
 */
export type AccesoAlMapa = {
  /** Lo cargado en el mapa: el mismo índice que usa el buscador. */
  indice: ElementoBuscable[]
  /** Las acciones del mapa; `current` es `null` mientras el mapa no está montado. */
  api: { current: MapaApi | null }
  /**
   * Lleva el mapa a un elemento del índice como el buscador: muestra su capa
   * si estaba oculta, lo centra y abre su ficha. `false` si ya no está.
   */
  ubicar: (clave: string) => boolean
  /**
   * Muestra una capa si estaba oculta. Se usa antes de elegir en el mapa: una
   * capa oculta no responde al click y la elección quedaría esperando.
   */
  mostrarCapa: (capa: "nodes" | "fibers" | "cabeceras" | "zones") => void
}

type NetworkMapProps = {
  center?: [number, number]
  zoom?: number
  className?: string
  visible?: { nodes: boolean; fibers: boolean; zones: boolean; cabeceras: boolean }
  onStatsChange?: (stats: NetworkStats) => void
  /** Se dispara al terminar cada desplazamiento, con el centro actual del mapa. */
  onCenterChange?: (center: { lon: number; lat: number }) => void
  /**
   * Centra el mapa en un punto y lo marca con un pin (el resultado del
   * buscador). `etiqueta` es el texto que lleva el pin; `nonce` permite repetir
   * el mismo destino.
   */
  flyTo?: { lon: number; lat: number; zoom?: number; etiqueta?: string; nonce: number } | null
  /** Al incrementarse, recarga los datos reales desde los endpoints. */
  reloadTrigger?: number
  /**
   * Reencuadra el mapa. `capa` acota a una sola capa; `"todo"` usa la red
   * completa. `nonce` permite repetir el mismo encuadre.
   */
  fitTo?: { capa: "todo" | "nodes" | "fibers" | "cabeceras" | "zones"; nonce: number } | null
  /** Herramienta activa controlada desde fuera (ribbon). */
  tool?: MapTool
  onToolChange?: (tool: MapTool) => void
  /** Avisa mientras se están pidiendo los datos reales a los endpoints. */
  onLoadingChange?: (loading: boolean) => void
  /**
   * Categorías a mostrar dentro de cada capa (las del desglose del panel).
   * Una lista vacía significa "sin filtro": se muestran todas.
   */
  filters?: { nodes: string[]; fibers: string[] }
  /**
   * Capa activa: la que se activa antes de editar, mover o crear (ver
   * lib/map/capa-activa.ts). Sin capa activa el mapa solo se consulta.
   */
  capaActiva?: CapaEditable | null
  /** Índice de lo cargado, para buscar elementos por nombre (ver lib/map/busqueda.ts). */
  onIndiceChange?: (indice: ElementoBuscable[]) => void
  /** El mapa deja aquí sus acciones para quien las necesite (el buscador). */
  apiRef?: { current: MapaApi | null }
}

function MapaDeRed({
  // Centro/zoom iniciales sobre La Unión, Valle del Cauca, donde está la red
  // real cargada hoy — el mapa además se reencuadra solo apenas llegan las
  // mufas (ver loadRealMufas), así que esto es solo el punto de partida.
  center = [-76.0883, 4.5333],
  zoom = 14,
  className,
  visible: externalVisible,
  onStatsChange,
  onCenterChange,
  flyTo,
  reloadTrigger,
  fitTo,
  tool: externalTool,
  onToolChange,
  onLoadingChange,
  filters,
  capaActiva = null,
  onIndiceChange,
  apiRef,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)

  // Inicialización perezosa: con `useRef(new VectorSource())` se construía una
  // fuente nueva en cada render solo para descartarla acto seguido.
  const [nodeSource] = useState(() => new VectorSource())
  const [fiberSource] = useState(() => new VectorSource())
  // La capa del mapa base (para su estilo y su opacidad), el minimapa y el
  // historial de vistas de «Anterior / Siguiente».
  const baseLayerRef = useRef<TileLayer | null>(null)
  const minimapaRef = useRef<OverviewMap | null>(null)
  // Lo último que se pidió del aspecto (Avanzado › Mapa base y Minimapa): si el
  // mapa se vuelve a crear (en desarrollo React lo monta dos veces) se repone.
  const aparienciaRef = useRef<{ fondo: EstiloDeFondo; opacidades: Partial<Record<CapaConOpacidad, number>>; minimapa: boolean }>({
    fondo: "tema",
    opacidades: {},
    minimapa: false,
  })
  const historialRef = useRef<{ pila: VistaDelHistorial[]; indice: number; destino: VistaDelHistorial | null }>({
    pila: [],
    indice: -1,
    destino: null,
  })
  const [zoneSource] = useState(() => new VectorSource())
  const [cabeceraSource] = useState(() => new VectorSource())
  const [measureSource] = useState(() => new VectorSource())
  // Copias de los cables que pinta «Entradas y salidas». Van en una capa
  // aparte, solo visual: los cables reales no se tocan.
  const [sentidoSource] = useState(() => new VectorSource())
  // Punto rojo sobre el elemento activo (ver el efecto del marcador).
  const [marcadorSource] = useState(() => new VectorSource())
  // Brillo del cable bajo el puntero (ver procesarPuntero).
  const [brilloSource] = useState(() => new VectorSource())
  // Puntas del cable consultado con el botón «Cable».
  const [extremosSource] = useState(() => new VectorSource())
  // Pin del punto buscado (dirección o coordenada).
  const [destinoSource] = useState(() => new VectorSource())
  // Recorrido del trace: copias de los cables por donde pasa (ver pintarRecorrido).
  const [traceSource] = useState(() => new VectorSource())
  // Lo ubicado desde la tabla del trace, resaltado en ámbar (ver mostrarCubierta).
  const [resalteSource] = useState(() => new VectorSource())
  const [hayResalte, setHayResalte] = useState(false)
  // Lo seleccionado en la tabla o con una consulta del módulo «Avanzado», en
  // el mismo ámbar pero en su propia capa: no se mezcla con lo del trace.
  const [seleccionAvanzadaSource] = useState(() => new VectorSource())
  // El círculo de «Cercanía» del mismo módulo.
  const [cercaniaSource] = useState(() => new VectorSource())
  // Si hay un recorrido pintado: la leyenda lo explica mientras tanto.
  const [hayRecorrido, setHayRecorrido] = useState(false)
  // Hasta cuándo corre la raya del recorrido (ver la capa del trace): unos
  // segundos después de pintarlo, para mostrar el sentido sin gastar CPU todo
  // el rato que el recorrido queda en el mapa.
  const flujoHastaRef = useRef(0)
  // OpenStreetMap, o el proveedor configurado en NEXT_PUBLIC_TESELAS_URL.
  const [baseMapSource] = useState(fuenteDelMapaBase)

  const nodeLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const fiberLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const zoneLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const cabeceraLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const measureLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const sentidoLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const marcadorLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const brilloLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const extremosLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const destinoLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const traceLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const resalteLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const seleccionAvanzadaLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const cercaniaLayer = useRef<VectorLayer<VectorSource> | null>(null)
  /** Corta el destello en curso si se pide otro antes de que termine. */
  const detenerDestelloRef = useRef<(() => void) | null>(null)
  const drawRef = useRef<Draw | null>(null)
  const selectRef = useRef<Select | null>(null)
  const deleteHoverRef = useRef<Select | null>(null)
  const editSelectRef = useRef<Select | null>(null)
  const editModifyRef = useRef<Modify | null>(null)
  const fiberSnapRef = useRef<Snap | null>(null)
  // Lo que «Editar elementos» deja arrastrar: lo seleccionado, solo si es de la
  // capa activa (ver el efecto que lo rehace).
  const [modificables] = useState(() => new Collection<Feature<Geometry>>())
  const fiberNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const measureOverlaysRef = useRef<Overlay[]>([])

  // La lectura de coordenadas y la etiqueta del cursor se actualizan por DOM,
  // no por estado: son las dos cosas que cambian con cada movimiento del ratón
  // y pasarlas por React obligaba a re-renderizar todo el mapa cada vez.
  const lonRef = useRef<HTMLSpanElement>(null)
  const latRef = useRef<HTMLSpanElement>(null)
  const zoomRef = useRef<HTMLSpanElement>(null)
  const hoverRef = useRef<HTMLDivElement>(null)
  // La herramienta puede venir de fuera (ribbon) o manejarse sola: si llega
  // `tool` por props manda esa, y los clicks del propio mapa se notifican arriba.
  const [internalTool, setInternalTool] = useState<MapTool>("pan")
  const tool = externalTool ?? internalTool
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  // Todo lo que había bajo el click que abrió la ficha (módulo «Avanzado»):
  // la ficha deja pasar de uno a otro.
  const [candidatos, setCandidatos] = useState<Feature<Geometry>[]>([])
  const [nameDraft, setNameDraft] = useState("")
  const [schemaOpen, setSchemaOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  // Ventana con los atajos de teclado (botón al pie de la barra o la tecla «?»).
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  const [fiberLoadError, setFiberLoadError] = useState<ErrorDeCapa | null>(null)
  const [mufaLoadError, setMufaLoadError] = useState<ErrorDeCapa | null>(null)
  const [cabeceraLoadError, setCabeceraLoadError] = useState<ErrorDeCapa | null>(null)
  const [baseMapError, setBaseMapError] = useState(false)
  const [connectivityOpen, setConnectivityOpen] = useState(false)
  const [connectivitySchema, setConnectivitySchema] = useState<MufaCampoJSON | null>(null)
  // Última conectividad consultada de cada mufa, por UUID. Solo la llena el
  // botón «Conectividad fina» del ribbon: una mufa no tiene conectividad en la
  // app hasta que se consulta con él, aunque la base ya la tenga. Elegir una
  // mufa no pregunta nada. El panel la usa para volver a abrir el esquema sin
  // repetir la consulta. Se vacía al recargar.
  const [conectividades, setConectividades] = useState<Record<string, EstadoConectividad>>({})
  // Pregunta a la base cada vez, salvo que ya haya una pregunta en camino por
  // la misma mufa (un doble click no lanza dos).
  const [consultar] = useState(() => crearConsultor((id) => obtenerConectividad(id)))
  // Sube al recargar los datos. Una respuesta que llega después pertenece a la
  // carga anterior y no se guarda.
  const cargaRef = useRef(0)
  // Resultado de la herramienta de consulta cuando no hay nada que abrir.
  // Sin tono es «info»: el resultado de una consulta o una indicación.
  const [avisoConsulta, setAvisoConsulta] = useState<AvisoDeConsulta | null>(null)
  // Sube solo cuando el esquemático falla al dibujar: cambia la `key` del
  // límite de error y lo deja listo para el siguiente intento. Con una `key`
  // atada a abierto/cerrado, el modal se desmontaba en cada apertura y cierre
  // y perdía la animación.
  const [intentoDibujo, setIntentoDibujo] = useState(0)
  // Si se pulsan dos cubiertas seguidas, solo cuenta la última.
  const turnoConsultaRef = useRef(0)
  // Mufa recién colocada a la espera de confirmación. Ya se ve en el mapa; si
  // se cancela, se quita.
  const [mufaPendiente, setMufaPendiente] = useState<Feature<Geometry> | null>(null)
  // Mufa pulsada con una herramienta de consulta del ribbon: lleva el punto rojo
  // mientras esa herramienta esté activa.
  const [consultada, setConsultada] = useState<Feature<Geometry> | null>(null)
  // Nombre que muestra la pregunta abierta. No se borra al cerrar: si se
  // borrara, el texto quedaría vacío durante la animación de cierre.
  const [nombreEnPregunta, setNombreEnPregunta] = useState("")
  const [fiberNotice, setFiberNotice] = useState<string | null>(null)
  // Mientras se elige un cable para «Gestión de hilos».
  const [avisoEleccion, setAvisoEleccion] = useState<string | null>(null)
  const cancelarEleccionRef = useRef<((estado: "cancelada" | "abandonada") => void) | null>(null)
  // Por qué no se pudo usar una herramienta de edición: le falta la capa
  // activa. Se guarda la herramienta para ocultar el aviso en cuanto se active
  // la capa que pedía.
  const [avisoBloqueo, setAvisoBloqueo] = useState<{ texto: string; herramienta: MapTool } | null>(null)
  const avisoBloqueoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const avisarBloqueo = useCallback((herramienta: MapTool, texto: string) => {
    setAvisoBloqueo({ texto, herramienta })
    if (avisoBloqueoTimeoutRef.current) clearTimeout(avisoBloqueoTimeoutRef.current)
    avisoBloqueoTimeoutRef.current = setTimeout(() => setAvisoBloqueo(null), 5000)
  }, [])
  const [loadingData, setLoadingData] = useState(true)
  // La cortina de bienvenida solo cubre el arranque; las recargas posteriores
  // usan el aviso discreto para no tapar el mapa que el usuario está mirando.
  const [firstLoadDone, setFirstLoadDone] = useState(false)
  // Al terminar la primera carga la cortina se desvanece y después se quita.
  // Antes desaparecía de golpe y la red saltaba a la vista de un fotograma a
  // otro. Se quita con un temporizador y no con `transitionend`, que no llega
  // si el sistema tiene las animaciones reducidas.
  const [cortinaFuera, setCortinaFuera] = useState(false)
  useEffect(() => {
    if (!firstLoadDone) return
    const id = window.setTimeout(() => setCortinaFuera(true), 600)
    return () => window.clearTimeout(id)
  }, [firstLoadDone])

  // Los callbacks se guardan en refs para que los manejadores de OpenLayers,
  // registrados una sola vez, siempre llamen a la versión más reciente sin
  // tener que recrear el mapa. La asignación va en un efecto porque escribir
  // en una ref durante el render es un efecto secundario encubierto.
  const onStatsChangeRef = useRef(onStatsChange)
  const onCenterChangeRef = useRef(onCenterChange)
  const onToolChangeRef = useRef(onToolChange)
  const onLoadingChangeRef = useRef(onLoadingChange)
  const capaActivaRef = useRef(capaActiva)
  const onIndiceChangeRef = useRef(onIndiceChange)

  // El filtro se lee desde el estilo, que OpenLayers ejecuta en cada dibujado.
  // Guardarlo en una ref evita tener que reconstruir las capas al cambiarlo.
  const filtersRef = useRef(filters)

  // Tipos de red ocultos desde la leyenda (click en «Feeder» o «Distribución»).
  // Como el filtro del panel, se lee desde el estilo.
  const [tiposOcultos, setTiposOcultos] = useState<string[]>([])
  const tiposOcultosRef = useRef<ReadonlySet<string>>(new Set())

  /** Si un cable se dibuja: su grupo de hilos pasa el filtro del panel y su tipo no se ocultó en la leyenda. */
  const cableVisible = useCallback(
    (f: Feature<Geometry>) =>
      categoriaVisible(filtersRef.current?.fibers, categoriaDeCable(f)) && !tiposOcultosRef.current.has(tipoDeRed(f)),
    [],
  )

  // Lo mismo con las cubiertas: los niveles ocultos desde la leyenda.
  const [nivelesOcultos, setNivelesOcultos] = useState<string[]>([])
  const nivelesOcultosRef = useRef<ReadonlySet<string>>(new Set())

  /** Si una cubierta se dibuja: su nivel pasa el filtro del panel y no se ocultó en la leyenda. */
  const cubiertaVisible = useCallback(
    (f: Feature<Geometry>) =>
      categoriaVisible(filtersRef.current?.nodes, categoriaDeMufa(f)) && !nivelesOcultosRef.current.has(nivelDeLeyenda(f)),
    [],
  )

  // El efecto del filtro está por encima de donde se define `pedirRecalculo`,
  // así que se llega a él por referencia en vez de reordenar el componente.
  const pedirRecalculoRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onStatsChangeRef.current = onStatsChange
    onCenterChangeRef.current = onCenterChange
    onToolChangeRef.current = onToolChange
    onLoadingChangeRef.current = onLoadingChange
    capaActivaRef.current = capaActiva
    onIndiceChangeRef.current = onIndiceChange
  })

  /**
   * Pregunta a la base por la conectividad de una mufa y la recuerda para el
   * panel. Consultar otra vez la misma mufa vuelve a preguntar: el JSON se arma
   * en el momento y puede haber cambiado.
   */
  const pedirConectividad = useCallback(
    async (id: string): Promise<EstadoConectividad> => {
      const carga = cargaRef.current
      const resultado = await consultar(id)
      if (carga === cargaRef.current) {
        setConectividades((previas) => ({ ...previas, [id]: resultadoAGuardar(previas[id], resultado) }))
      }
      return resultado
    },
    [consultar],
  )

  /**
   * Consulta la conectividad de una cubierta y, si hay algo que dibujar, abre
   * el esquemático en modo consulta. La llama la herramienta «Conectividad
   * fina» al pulsar la cubierta, sin preguntar antes.
   */
  const consultarConectividad = useCallback(
    async (id: string, nombre: string) => {
      const turno = ++turnoConsultaRef.current
      setAvisoConsulta({ texto: `Consultando la conectividad de ${nombre}…`, cargando: true })
      const resultado = await pedirConectividad(id)
      // Mientras llegaba se cambió de herramienta o se pulsó otra cubierta.
      if (turno !== turnoConsultaRef.current) return

      if (resultado.estado === "disponible") {
        setAvisoConsulta(null)
        setConnectivitySchema(resultado.esquema)
        setConnectivityOpen(true)
      } else if (resultado.estado === "sin-conectividad") {
        setAvisoConsulta({
          texto: `${nombre} no tiene conectividad: la base todavía no tiene cables registrados para esta cubierta.`,
          tono: "aviso",
        })
      } else if (resultado.estado === "no-dibujable") {
        setAvisoConsulta({
          texto: `${nombre} tiene conectividad en la base, pero el esquema no se puede dibujar: ${resultado.motivo}.`,
          tono: "aviso",
        })
      } else {
        setAvisoConsulta({
          texto: `${nombre}: ${resultado.mensaje}`,
          // La función que tocaba por el nivel de la cubierta (_n0 o _n12), si la ruta llegó a elegirla.
          detalle: `${resultado.funcion ?? "get_json_conectividad_cubierta_n0 / _n12"}${resultado.detalle ? ` → ${resultado.detalle}` : ""}`,
          tono: "error",
        })
      }
    },
    [pedirConectividad],
  )

  // Elegir una mufa no consulta su conectividad: eso solo lo hace el botón
  // «Conectividad fina». El panel se limita a mostrar lo ya consultado.
  /**
   * Nombre de una mufa o cabecera a partir de su UUID. Así el origen y el
   * destino de un cable se leen «CO02» y no como un UUID, tanto en la ficha
   * como en el aviso de la herramienta de entradas y salidas.
   */
  const nombreDeElemento = useCallback(
    (id: string): string | null => {
      for (const fuente of [nodeSource, cabeceraSource]) {
        const encontrado = fuente.getFeatures().find((f) => f.get("id") === id)
        if (encontrado) return (encontrado.get(NOMBRE_VISIBLE) as string | undefined) ?? null
      }
      return null
    },
    [nodeSource, cabeceraSource],
  )

  // Marca roja sobre el elemento activo, para saber cuál es entre muchas mufas
  // juntas o entre cables que se cruzan: con las herramientas de consulta del
  // ribbon, la mufa que se está consultando; con las demás, el elemento
  // seleccionado, sea mufa, cabecera, cable o zona. La marca usa la misma
  // geometría que el elemento, así que lo sigue si se mueve al editarlo.
  // Lo seleccionado se puede arrastrar solo si es de la capa activa: al cambiar
  // de capa o de selección se rehace la lista de lo que «Editar elementos»
  // deja mover.
  useEffect(() => {
    modificables.clear()
    if (selected && CAPA_DE_TIPO[selected.type] === capaActiva) modificables.push(selected.feature)
  }, [selected, capaActiva, modificables])

  const enConsulta = tool === "conectividad" || tool === "sentido"
  const marcado = enConsulta ? consultada : (selected?.feature ?? null)
  useEffect(() => {
    marcadorSource.clear()
    const geometria = marcado?.getGeometry()
    // Con los hilos y el tipo de red: la marca de un cable redibuja su trazo
    // (grosor y color) dentro del contorno rojo.
    if (geometria) {
      marcadorSource.addFeature(
        new Feature({ geometry: geometria, cant_hilo: marcado?.get("cant_hilo"), tipo_red_prin: marcado?.get("tipo_red_prin") }),
      )
    }
  }, [marcado, marcadorSource])

  const idMufaSeleccionada =
    selected?.type === "node" && typeof selected.feature.get("id") === "string"
      ? (selected.feature.get("id") as string)
      : null

  // Al cambiar el filtro basta con pedir un redibujado: el estilo vuelve a
  // consultarlo y deja fuera las categorías que no estén seleccionadas. El
  // recuento también se rehace, porque el panel informa de cuánto queda a la
  // vista y eso sí depende del filtro.
  useEffect(() => {
    filtersRef.current = filters
    nodeLayer.current?.changed()
    fiberLayer.current?.changed()
    pedirRecalculoRef.current?.()
  }, [filters])

  useEffect(() => {
    tiposOcultosRef.current = new Set(tiposOcultos)
    fiberLayer.current?.changed()
    pedirRecalculoRef.current?.()
  }, [tiposOcultos])

  const alternarTipoDeRed = useCallback((tipo: string) => {
    setTiposOcultos((ocultos) => (ocultos.includes(tipo) ? ocultos.filter((t) => t !== tipo) : [...ocultos, tipo]))
  }, [])

  useEffect(() => {
    nivelesOcultosRef.current = new Set(nivelesOcultos)
    nodeLayer.current?.changed()
    pedirRecalculoRef.current?.()
  }, [nivelesOcultos])

  const alternarNivel = useCallback((nivel: string) => {
    setNivelesOcultos((ocultos) => (ocultos.includes(nivel) ? ocultos.filter((n) => n !== nivel) : [...ocultos, nivel]))
  }, [])

  const setTool = useCallback((next: MapTool) => {
    setInternalTool(next)
    onToolChangeRef.current?.(next)
  }, [])

  /** La capa de OpenLayers de cada capa editable. */
  const capaDeMapa = useCallback((capa: CapaEditable | null) => {
    if (capa === "nodes") return nodeLayer.current
    if (capa === "fibers") return fiberLayer.current
    if (capa === "zones") return zoneLayer.current
    if (capa === "cabeceras") return cabeceraLayer.current
    return null
  }, [])

  // Qué herramienta se puede usar con qué capa lo decide quien la pide: la
  // barra y los atajos de aquí, y el ribbon y el panel de capas en el tablero
  // (app/dashboard/page.tsx), que al cambiar de capa vuelven a «Mover mapa» si
  // la herramienta en uso deja de servir.
  useEffect(
    () => () => {
      if (avisoBloqueoTimeoutRef.current) clearTimeout(avisoBloqueoTimeoutRef.current)
    },
    [],
  )

  /**
   * A qué capa de datos pertenece un elemento. Devuelve `null` si no pertenece
   * a ninguna: las interacciones de OpenLayers dibujan sus propios elementos
   * auxiliares (manejadores de vértice, bocetos) que no son datos de la red.
   */
  const tipoDeFeature = useCallback(
    (feature: Feature<Geometry>): FeatureType | null => {
      if (nodeSource.hasFeature(feature)) return "node"
      if (fiberSource.hasFeature(feature)) return "fiber"
      if (cabeceraSource.hasFeature(feature)) return "cabecera"
      if (zoneSource.hasFeature(feature)) return "zone"
      return null
    },
    [nodeSource, fiberSource, cabeceraSource, zoneSource],
  )

  const recalcPendienteRef = useRef<number | null>(null)

  const recalcAhora = useCallback(() => {
    const nodeFeatures = nodeSource.getFeatures()
    const fiberFeatures = fiberSource.getFeatures()
    const largoKm = (f: Feature<Geometry>) => largoEnKm(f.getGeometry())
    const km = fiberFeatures.reduce((acc, f) => acc + largoKm(f), 0)

    // Lo mismo, pero contando solo lo que el filtro deja pintado. El filtro
    // oculta desde el estilo, así que los elementos siguen en la fuente y hay
    // que aplicar aquí la misma condición que usa la capa al dibujar.
    const mufasVisibles = nodeFeatures.filter(cubiertaVisible)
    const cablesVisibles = fiberFeatures.filter(cableVisible)

    // Sentido de la señal en cada cable (las flechas de cerca), recorriendo la
    // red desde la cabecera: no se toma del dibujo, que puede ir al revés. Se
    // guarda en el cable sin avisar del cambio (no es un dato que se edite) y
    // solo se redibuja si alguno cambió.
    const idDe = (v: unknown) => (typeof v === "string" && v ? v : null)
    const sentidos = sentidoDeLaSenal(
      fiberFeatures.map((f) => ({ clave: getUid(f), desde: idDe(f.get("id_elem_from")), hasta: idDe(f.get("id_elem_to")) })),
      cabeceraSource.getFeatures().flatMap((f) => idDe(f.get("id")) ?? []),
    )
    let sentidoCambio = false
    for (const f of fiberFeatures) {
      const sentido = sentidos.get(getUid(f)) ?? 0
      if (f.get(SENTIDO_SENAL) !== sentido) {
        f.set(SENTIDO_SENAL, sentido, true)
        sentidoCambio = true
      }
    }
    if (sentidoCambio) fiberLayer.current?.changed()

    onStatsChangeRef.current?.({
      counts: {
        nodes: nodeFeatures.length,
        fibers: fiberFeatures.length,
        zones: zoneSource.getFeatures().length,
        cabeceras: cabeceraSource.getFeatures().length,
      },
      totalKm: km,
      enPantalla: {
        nodes: mufasVisibles.length,
        fibers: cablesVisibles.length,
        km: cablesVisibles.reduce((acc, f) => acc + largoKm(f), 0),
      },
      // El desglose usa el mismo campo que define la simbología de cada capa,
      // así el panel explica lo que se está viendo en el mapa.
      breakdown: {
        nodes: agrupar(nodeFeatures, (f) => ({
          label: categoriaDeMufa(f),
          color: colorForFuncionCub(f.get("funcion_cub") as string),
        })),
        fibers: agrupar(fiberFeatures, (f) => ({
          label: categoriaDeCable(f),
          // El color de su tipo de red (feeder azul, distribución magenta),
          // como en el mapa.
          color: colorForTipoRed(f.get("tipo_red_prin") as string | undefined),
          // Mismo grosor que en el mapa: un cable de 144 hilos se ve más
          // grueso que uno de 48 también en el panel.
          width: fiberWidth(f.get("cant_hilo") as number | undefined),
        })),
      },
    })

    // Índice para el buscador: nombre, una línea de contexto y los otros
    // textos por los que alguien podría buscarlo (código, UUID…).
    if (onIndiceChangeRef.current) {
      // Los números también (el `id_legacy` llega como número y no entraba).
      const textos = (f: Feature<Geometry>, campos: string[]) =>
        campos
          .map((c) => f.get(c))
          .map((v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : v))
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      const entrada = (
        f: Feature<Geometry>,
        tipo: ElementoBuscable["tipo"],
        detalle: string,
        alias: string[],
        categoria?: string,
      ) => ({
        clave: getUid(f),
        tipo,
        nombre: ((f.get(NOMBRE_VISIBLE) as string | undefined) ?? "").trim(),
        detalle,
        alias,
        ...(categoria ? { categoria } : {}),
      })
      const indice: ElementoBuscable[] = [
        ...nodeFeatures.map((f) =>
          entrada(f, "node", `Cubierta · ${categoriaDeMufa(f)}`, textos(f, ["etiqueta", "id_legacy", "id"]), categoriaDeMufa(f)),
        ),
        ...fiberFeatures.map((f) => {
          const hilos = f.get("cant_hilo")
          return entrada(
            f,
            "fiber",
            typeof hilos === "number" && hilos > 0 ? `Cable · ${hilos} hilos` : "Cable",
            // También la etiqueta NAP («1/8+13/16»): 97 cables la tienen.
            textos(f, ["codigo", "nombre", "id", "etq_naps"]),
            categoriaDeCable(f),
          )
        }),
        ...cabeceraSource
          .getFeatures()
          .map((f) => entrada(f, "cabecera", "Cabecera central", textos(f, ["codigo", "etiqueta", "nombre", "id"]))),
        ...zoneSource.getFeatures().map((f) => entrada(f, "zone", "Zona", [])),
      ].filter((e) => e.nombre !== "")
      onIndiceChangeRef.current(indice)
    }
  }, [nodeSource, fiberSource, zoneSource, cabeceraSource, cableVisible, cubiertaVisible])

  /**
   * Recuento agrupado.
   *
   * `addfeature` se dispara por cada elemento, así que cargar las capas
   * lanzaba el recuento 368 veces seguidas: cada una recorría todos los
   * elementos y provocaba un render del dashboard. Agrupando las llamadas en
   * un fotograma, una carga completa hace un solo recuento.
   */
  const pedirRecalculo = useCallback(() => {
    if (recalcPendienteRef.current !== null) return
    recalcPendienteRef.current = requestAnimationFrame(() => {
      recalcPendienteRef.current = null
      recalcAhora()
    })
  }, [recalcAhora])

  useEffect(() => {
    pedirRecalculoRef.current = pedirRecalculo
  }, [pedirRecalculo])

  /**
   * Encuadra el mapa sobre una extensión concreta. Se usa para la red
   * completa, para una sola capa y para el elemento seleccionado.
   */
  const encuadrarEn = useCallback(
    (extent: number[] | null | undefined, maxZoom = 16, alTerminar?: (completo: boolean) => void) => {
      const view = mapRef.current?.getView()
      if (!view || !extent || !extent.every((v) => Number.isFinite(v))) return
      view.fit(extent, { padding: [80, 80, 80, 80], maxZoom, duration: 400, callback: alTerminar })
    },
    [],
  )

  /**
   * Destello donde terminó un viaje del mapa, para que se vea qué mirar (ver
   * lib/map/destello.ts). Va sobre la capa del pin, que está encima de la red.
   */
  const destellarEn = useCallback((geometria: Geometry, color: ColorRGB) => {
    const mapa = mapRef.current
    const capa = destinoLayer.current
    if (!mapa || !capa) return
    detenerDestelloRef.current?.()
    detenerDestelloRef.current = destellar(mapa, capa, geometria, color)
  }, [])

  /**
   * Centra el mapa en un elemento y lo selecciona (abre su ficha). Lo usa el
   * buscador de arriba con la clave que le dio el índice.
   */
  const enfocarElemento = useCallback(
    (clave: string) => {
      for (const fuente of [nodeSource, fiberSource, cabeceraSource, zoneSource]) {
        const feature = fuente.getFeatures().find((f) => getUid(f) === clave)
        if (!feature) continue
        const tipo = tipoDeFeature(feature)
        const geometria = feature.getGeometry()
        if (!tipo || !geometria) return false
        const view = mapRef.current?.getView()
        // Al llegar, un destello marca cuál es. Si el usuario mueve el mapa a
        // mitad del viaje (`completo` en falso), ya no hace falta.
        const alLlegar = (completo: boolean) => {
          if (completo) destellarEn(geometria, DESTELLO_ELEMENTO)
        }
        if (geometria instanceof Point) {
          view?.animate(
            { center: geometria.getCoordinates(), zoom: Math.max(view.getZoom() ?? 0, 18.5), duration: 450 },
            alLlegar,
          )
        } else {
          encuadrarEn(geometria.getExtent(), 18.5, alLlegar)
        }
        editSelectRef.current?.getFeatures().clear()
        setSelected({ feature, type: tipo })
        setCandidatos([])
        setNameDraft((feature.get(NOMBRE_VISIBLE) as string) ?? "")
        return true
      }
      return false
    },
    [nodeSource, fiberSource, cabeceraSource, zoneSource, tipoDeFeature, encuadrarEn, destellarEn],
  )

  /** Lo que «Gestión de hilos» necesita saber de un cable del mapa. */
  const datosDeCable = useCallback(
    (f: Feature<Geometry>): CableElegido => {
      const id = f.get("id")
      const hilos = f.get("cant_hilo")
      const desde = f.get("id_elem_from")
      const hasta = f.get("id_elem_to")
      return {
        id: typeof id === "string" ? id : null,
        codigo: ((f.get(NOMBRE_VISIBLE) as string | undefined) ?? (f.get("codigo") as string | undefined) ?? "Cable").trim(),
        hilos: typeof hilos === "number" && hilos > 0 ? hilos : null,
        largoM: largoDeCableM(f),
        origen: typeof desde === "string" ? nombreDeElemento(desde) : null,
        destino: typeof hasta === "string" ? nombreDeElemento(hasta) : null,
      }
    },
    [nombreDeElemento],
  )

  const cableSeleccionado = useCallback(
    () => (selected?.type === "fiber" ? datosDeCable(selected.feature) : null),
    [selected, datosDeCable],
  )

  /**
   * Espera un click sobre un elemento de una capa y lo devuelve convertido
   * (ver `Eleccion`). Mientras tanto el mapa lo dice en un aviso y el cursor
   * pasa a mano sobre lo que se puede elegir.
   */
  const esperarClick = useCallback(
    <T,>(capa: () => VectorLayer<VectorSource> | null, aviso: string, convertir: (f: Feature<Geometry>) => T) =>
      new Promise<Eleccion<T>>((resolve) => {
        const map = mapRef.current
        if (!map) {
          resolve({ estado: "cancelada" })
          return
        }
        // Una elección anterior que siguiera esperando queda sin efecto.
        cancelarEleccionRef.current?.("abandonada")
        // Ninguna herramienta debe quedarse con el click que elige.
        setTool("pan")

        const elementoEn = (pixel: number[]) =>
          (map.forEachFeatureAtPixel(pixel, (f) => f as Feature<Geometry>, {
            layerFilter: (c) => c === capa(),
            hitTolerance: 6,
          }) ?? null) as Feature<Geometry> | null

        const cursorAnterior = containerRef.current?.style.cursor ?? ""
        setAvisoEleccion(aviso)

        const claveMover = map.on("pointermove", (evt) => {
          if (evt.dragging || !containerRef.current) return
          containerRef.current.style.cursor = elementoEn(evt.pixel) ? "pointer" : "crosshair"
        })
        const claveClick = map.on("singleclick", (evt) => {
          const elemento = elementoEn(evt.pixel)
          if (elemento) terminar({ estado: "elegido", valor: convertir(elemento) })
        })
        const alTeclear = (e: KeyboardEvent) => {
          if (e.key === "Escape") terminar({ estado: "cancelada" })
        }
        window.addEventListener("keydown", alTeclear)

        function terminar(resultado: Eleccion<T>) {
          unByKey([claveMover, claveClick])
          window.removeEventListener("keydown", alTeclear)
          if (containerRef.current) containerRef.current.style.cursor = cursorAnterior
          cancelarEleccionRef.current = null
          setAvisoEleccion(null)
          resolve(resultado)
        }
        cancelarEleccionRef.current = (estado) => terminar({ estado })
      }),
    [setTool],
  )

  const elegirCable = useCallback(
    () => esperarClick(() => fiberLayer.current, "Haz click sobre un cable para ver sus hilos. Esc cancela.", datosDeCable),
    [esperarClick, datosDeCable],
  )

  const elegirElemento = useCallback(
    (tipo: "cabecera" | "node", aviso: string) =>
      esperarClick(
        () => (tipo === "cabecera" ? cabeceraLayer.current : nodeLayer.current),
        `${aviso} Esc cancela.`,
        (f) => ({ clave: getUid(f), nombre: ((f.get(NOMBRE_VISIBLE) as string | undefined) ?? "").trim() }),
      ),
    [esperarClick],
  )

  const abandonarEleccion = useCallback(() => cancelarEleccionRef.current?.("abandonada"), [])

  /**
   * Encuadre del recorrido como lo definió el ingeniero: 50 px de margen y
   * 400 ms. Con la ventana del trace encima, el recorrido va al espacio libre
   * más grande que ella deja (a 24 px de su borde); si ninguno alcanza para
   * verlo (unos 180 × 140 px), al mapa entero, y la ventana se puede mover o
   * minimizar.
   */
  const encuadrarRecorrido = useCallback(
    (ventana?: Recuadro) => {
      const view = mapRef.current?.getView()
      const caja = mapRef.current?.getTargetElement()?.getBoundingClientRect()
      const extent = traceSource.getExtent()
      if (!view || !caja || !extent || traceSource.getFeatures().length === 0 || !extent.every((v) => Number.isFinite(v))) return
      const libre = espacioLibre(caja, ventana, { ancho: 180, alto: 140 }, lasTapasDelMapa())
      view.fit(extent, { padding: margenParaZona(caja, libre), maxZoom: 18, duration: 400 })
    },
    [traceSource],
  )

  const pintarRecorrido = useCallback(
    ({
      cables,
      geometrias,
      cubiertas = [],
      ventana,
      encuadrar = true,
      direccion,
    }: {
      cables: string[]
      geometrias: GeometriaDeTramo[]
      cubiertas?: string[]
      ventana?: Recuadro
      encuadrar?: boolean
      direccion?: DireccionTrace
    }) => {
      traceSource.clear()
      // Un recorrido nuevo: lo resaltado del anterior ya no vale.
      resalteSource.clear()
      setHayResalte(false)
      // La ficha del elemento seleccionado (el cable de Gestión de hilos)
      // tapaba el único espacio libre al lado de la ventana del trace, y en
      // 1366×768 el recorrido no se veía. Se cierra; Gestión de hilos guarda
      // su cable igual.
      editSelectRef.current?.getFeatures().clear()
      setSelected(null)
      setSchemaOpen(false)
      setInfoOpen(false)
      const porId = new globalThis.Map<unknown, Feature<Geometry>>(fiberSource.getFeatures().map((f) => [f.get("id"), f]))
      const faltan: string[] = []
      let largoM = 0
      for (const id of cables) {
        const cable = porId.get(id)
        const linea = cable?.getGeometry()
        if (!cable || !linea) {
          faltan.push(id)
          continue
        }
        // Una copia: el cable real no se toca, y el recorrido sigue en pie
        // aunque se actualicen las capas. La raya animada corre en el sentido
        // del trace: con la señal hacia abajo, en contra hacia arriba (y sin
        // animar si no se sabe el sentido de la señal en ese cable).
        const sentido = cable.get(SENTIDO_SENAL)
        const flujo = !direccion || (sentido !== 1 && sentido !== -1) ? 0 : direccion === "DOWNSTREAM" ? sentido : -sentido
        traceSource.addFeature(new Feature({ geometry: linea.clone(), [FLUJO_TRACE]: flujo }))
        largoM += largoDeCableM(cable)
      }
      const formato = new GeoJSON()
      for (const g of geometrias) {
        try {
          const tramo = formato.readGeometry(g, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" })
          traceSource.addFeature(new Feature({ geometry: tramo }))
          // Si llegan cables, el largo ya salió de ellos.
          if (cables.length === 0) largoM += largoEnKm(tramo) * 1000
        } catch {
          // Una geometría que no se puede leer no impide pintar las demás.
        }
      }
      // Las cubiertas del recorrido, con el punto rojo del estilo del trace.
      // Van después de las líneas para quedar encima de ellas.
      const nodos = new globalThis.Map<unknown, Feature<Geometry>>(nodeSource.getFeatures().map((f) => [f.get("id"), f]))
      for (const id of cubiertas) {
        const punto = nodos.get(id)?.getGeometry()
        if (punto) traceSource.addFeature(new Feature({ geometry: punto.clone() }))
      }
      setHayRecorrido(traceSource.getFeatures().length > 0)
      flujoHastaRef.current = Date.now() + SEGUNDOS_DE_FLUJO * 1000
      mapRef.current?.render()

      if (encuadrar) encuadrarRecorrido(ventana)
      return { pintados: cables.length - faltan.length, faltan, largoM: Math.round(largoM) }
    },
    [traceSource, resalteSource, fiberSource, nodeSource, encuadrarRecorrido],
  )

  const quitarResalte = useCallback(() => {
    resalteSource.clear()
    setHayResalte(false)
  }, [resalteSource])

  const limpiarRecorrido = useCallback(() => {
    traceSource.clear()
    setHayRecorrido(false)
    quitarResalte()
  }, [traceSource, quitarResalte])

  /**
   * Lleva el mapa a una geometría, la destella y la deja resaltada en ámbar
   * (sobre el cian del recorrido, un destello solo se perdía), sin seleccionar
   * nada. Queda en
   * el centro del espacio libre más grande que deja `ventana` (arriba, abajo o
   * a un costado), no debajo de ella; una línea que no cabe en ese espacio se
   * ve entera alejando el mapa lo justo.
   */
  const llevarAlEspacioLibre = useCallback(
    (geometria: Geometry, ventana?: Recuadro) => {
      const mapa = mapRef.current
      const caja = mapa?.getTargetElement()?.getBoundingClientRect()
      const view = mapa?.getView()
      const actual = view?.getResolution()
      if (!mapa || !caja || !view || !actual) return false

      // El espacio donde debe quedar, en píxeles del mapa.
      const libre = espacioLibre(caja, ventana, { ancho: 60, alto: 60 }, lasTapasDelMapa())
      const extent = geometria.getExtent()
      // Con un margen del 20 %. Un punto no cambia la resolución; una línea se
      // ve entera y también se acerca (hasta el zoom 18): antes solo se
      // alejaba, y un cable corto quedaba en un recuadro de 8 × 4 px.
      const paraVerla = Math.max(getWidth(extent) / ((libre.x1 - libre.x0) * 0.8), getHeight(extent) / ((libre.y1 - libre.y0) * 0.8))
      const resolucion =
        geometria instanceof Point ? Math.max(actual, paraVerla) : Math.max(paraVerla, view.getResolutionForZoom(18))
      const [x, y] = getCenter(extent)
      const dx = (libre.x0 + libre.x1) / 2 - caja.width / 2
      const dy = (libre.y0 + libre.y1) / 2 - caja.height / 2
      view.animate({ center: [x - dx * resolucion, y + dy * resolucion], resolution: resolucion, duration: 400 })
      resalteSource.clear()
      resalteSource.addFeature(new Feature({ geometry: geometria.clone() }))
      setHayResalte(true)
      destellarEn(geometria, DESTELLO_RESALTE)
      return true
    },
    [destellarEn, resalteSource],
  )

  const mostrarCubierta = useCallback(
    (id: string, ventana?: Recuadro) => {
      const geometria = nodeSource.getFeatures().find((f) => f.get("id") === id)?.getGeometry()
      return geometria ? llevarAlEspacioLibre(geometria, ventana) : false
    },
    [nodeSource, llevarAlEspacioLibre],
  )

  const mostrarCable = useCallback(
    (id: string, ventana?: Recuadro) => {
      const geometria = fiberSource.getFeatures().find((f) => f.get("id") === id)?.getGeometry()
      return geometria ? llevarAlEspacioLibre(geometria, ventana) : false
    },
    [fiberSource, llevarAlEspacioLibre],
  )

  // Para los marcadores del módulo «Avanzado»: la vista que se ve y volver a una.
  const vistaActual = useCallback((): VistaGuardada | null => {
    const view = mapRef.current?.getView()
    const centro = view?.getCenter()
    const zoomActual = view?.getZoom()
    if (!centro || typeof zoomActual !== "number") return null
    const [lon, lat] = toLonLat(centro)
    return { centro: [lon, lat], zoom: zoomActual }
  }, [])

  const irAVista = useCallback((vista: VistaGuardada) => {
    mapRef.current?.getView().animate({ center: fromLonLat(vista.centro), zoom: vista.zoom, duration: 450 })
  }, [])

  const abrirAtajos = useCallback(() => setAyudaAbierta(true), [])

  // Para el módulo «Avanzado»: los elementos de la red, en datos simples.
  const elementosDelMapa = useCallback(
    (opciones: { soloEnVista?: boolean; conPropiedades?: boolean } = {}) => {
      const mapa = mapRef.current
      const extension = mapa ? mapa.getView().calculateExtent(mapa.getSize()) : [0, 0, 0, 0]
      const capas: [FeatureType, VectorSource, VectorLayer<VectorSource> | null][] = [
        ["cabecera", cabeceraSource, cabeceraLayer.current],
        ["node", nodeSource, nodeLayer.current],
        ["fiber", fiberSource, fiberLayer.current],
        ["zone", zoneSource, zoneLayer.current],
      ]
      const elementos: ElementoDelMapa[] = []
      for (const [tipo, fuente, capa] of capas) {
        const capaVisible = capa?.getVisible() ?? false
        const filtro = tipo === "node" ? filtersRef.current?.nodes : tipo === "fiber" ? filtersRef.current?.fibers : undefined
        for (const f of fuente.getFeatures()) {
          const geometria = f.getGeometry()
          if (!geometria) continue
          const enVista = geometria.intersectsExtent(extension)
          if (opciones.soloEnVista && !enVista) continue
          const categoria =
            tipo === "node" ? categoriaDeMufa(f) : tipo === "fiber" ? categoriaDeCable(f) : TYPE_LABELS[tipo]
          const hilos = f.get("cant_hilo")
          const forma = geometria.getType()
          const lineas =
            forma === "LineString"
              ? [(geometria as LineString).getCoordinates()]
              : forma === "MultiLineString"
                ? (geometria as MultiLineString).getCoordinates()
                : null
          let propiedades: Record<string, unknown> | undefined
          if (opciones.conPropiedades) {
            propiedades = { ...f.getProperties() }
            delete propiedades[f.getGeometryName()]
          }
          elementos.push({
            clave: getUid(f),
            tipo,
            nombre: ((f.get(NOMBRE_VISIBLE) as string | undefined) ?? "").trim() || TYPE_LABELS[tipo],
            categoria,
            color:
              tipo === "node"
                ? colorForFuncionCub(f.get("funcion_cub") as string)
                : tipo === "fiber"
                  ? colorForTipoRed(f.get("tipo_red_prin") as string | undefined)
                  : LAYER_COLORS[tipo],
            visible:
              capaVisible &&
              (tipo === "fiber" ? cableVisible(f) : tipo === "node" ? cubiertaVisible(f) : categoriaVisible(filtro, categoria)),
            hilos: typeof hilos === "number" && hilos > 0 ? hilos : null,
            largoM: tipo === "fiber" ? largoDeCableM(f) : null,
            lineas: tipo === "fiber" ? lineas : null,
            punto: geometria instanceof Point ? (toLonLat(geometria.getCoordinates()) as [number, number]) : null,
            enVista,
            ...(propiedades ? { propiedades } : {}),
          })
        }
      }
      return { extension, elementos }
    },
    [cabeceraSource, nodeSource, fiberSource, zoneSource, cableVisible, cubiertaVisible],
  )

  const alCambiarLaVista = useCallback(
    (aviso: () => void) => {
      const mapa = mapRef.current
      if (!mapa) return () => {}
      const capas = [nodeLayer.current, fiberLayer.current, cabeceraLayer.current, zoneLayer.current].filter(
        (c): c is VectorLayer<VectorSource> => c !== null,
      )
      const claves = [
        mapa.on("moveend", aviso),
        ...capas.map((c) => c.on("change", aviso)),
        ...capas.map((c) => c.on("change:visible", aviso)),
        ...[nodeSource, fiberSource, cabeceraSource, zoneSource].map((s) => s.on("change", aviso)),
      ]
      return () => unByKey(claves)
    },
    [nodeSource, fiberSource, cabeceraSource, zoneSource],
  )

  const resaltarElementos = useCallback(
    (claves: string[], opciones: { encuadrar?: boolean } = {}) => {
      seleccionAvanzadaSource.clear()
      if (claves.length === 0) return 0
      const buscadas = new Set(claves)
      const extension = createEmpty()
      let encontrados = 0
      for (const fuente of [nodeSource, fiberSource, cabeceraSource, zoneSource]) {
        for (const f of fuente.getFeatures()) {
          if (!buscadas.has(getUid(f))) continue
          const geometria = f.getGeometry()
          if (!geometria) continue
          seleccionAvanzadaSource.addFeature(new Feature({ geometry: geometria.clone() }))
          extend(extension, geometria.getExtent())
          encontrados++
        }
      }
      if (opciones.encuadrar && encontrados > 0 && !isEmpty(extension)) encuadrarEn(extension, 18)
      return encontrados
    },
    [seleccionAvanzadaSource, nodeSource, fiberSource, cabeceraSource, zoneSource, encuadrarEn],
  )

  // «Cercanía»: un click en cualquier lugar del mapa da el centro.
  const elegirPunto = useCallback(
    (aviso: string) =>
      new Promise<Eleccion<[number, number]>>((resolve) => {
        const map = mapRef.current
        if (!map) {
          resolve({ estado: "cancelada" })
          return
        }
        cancelarEleccionRef.current?.("abandonada")
        setTool("pan")
        const cursorAnterior = containerRef.current?.style.cursor ?? ""
        if (containerRef.current) containerRef.current.style.cursor = "crosshair"
        setAvisoEleccion(`${aviso} Esc cancela.`)
        const claveClick = map.on("singleclick", (evt) => {
          terminar({ estado: "elegido", valor: toLonLat(evt.coordinate) as [number, number] })
        })
        const alTeclear = (e: KeyboardEvent) => {
          if (e.key === "Escape") terminar({ estado: "cancelada" })
        }
        window.addEventListener("keydown", alTeclear)
        function terminar(resultado: Eleccion<[number, number]>) {
          unByKey(claveClick)
          window.removeEventListener("keydown", alTeclear)
          if (containerRef.current) containerRef.current.style.cursor = cursorAnterior
          cancelarEleccionRef.current = null
          setAvisoEleccion(null)
          resolve(resultado)
        }
        cancelarEleccionRef.current = (estado) => terminar({ estado })
      }),
    [setTool],
  )

  const pintarCercania = useCallback(
    (area: { centro: [number, number]; radioM: number } | null, opciones: { encuadrar?: boolean } = {}) => {
      cercaniaSource.clear()
      if (!area) return
      // Un círculo de verdad sobre la Tierra (64 lados), no uno en Web Mercator.
      const circulo = circular(area.centro, area.radioM, 64).transform("EPSG:4326", "EPSG:3857")
      cercaniaSource.addFeatures([
        new Feature({ geometry: circulo }),
        new Feature({ geometry: new Point(fromLonLat(area.centro)) }),
      ])
      if (opciones.encuadrar) encuadrarEn(circulo.getExtent(), 19)
    },
    [cercaniaSource, encuadrarEn],
  )

  const puntoDeLaFicha = useCallback(() => {
    const geometria = selected?.feature.getGeometry()
    if (!selected || !(geometria instanceof Point)) return null
    const nombre = ((selected.feature.get(NOMBRE_VISIBLE) as string | undefined) ?? "").trim() || TYPE_LABELS[selected.type]
    return { nombre, punto: toLonLat(geometria.getCoordinates()) as [number, number] }
  }, [selected])

  // Si el mapa base se ve oscuro, la camisa de los cables y el halo de los
  // rótulos van oscuros (ver ponerFondoOscuro). Depende del tema y del estilo
  // de Mapa base: «Calles» y «Gris» se ven claros aunque el tema sea oscuro.
  const aplicarFondoOscuro = useCallback(() => {
    const fondo = aparienciaRef.current.fondo
    const oscuro = fondo === "oscuro" || ((fondo === "tema" || fondo === "ninguno") && getCurrentTheme() === "dark")
    if (ponerFondoOscuro(oscuro)) {
      for (const capa of [fiberLayer.current, nodeLayer.current, cabeceraLayer.current, zoneLayer.current]) capa?.changed()
    }
  }, [])

  // Imprimir: el mapa como imagen, juntando el lienzo de cada capa como en el
  // ejemplo de exportación de OpenLayers (los controles son HTML y no salen).
  //
  // El mapa base va en su propio contenedor (`gismart-basemap`, la clase que
  // usa el tema oscuro para su filtro) y no en `.ol-layer`: por eso antes no
  // salía en la lámina. Se arman dos imágenes, con el fondo y sin él, para
  // que la casilla «Fondo del mapa» cambie la lámina sin volver a capturar.
  const capturarMapa = useCallback(
    () =>
      new Promise<{
        lienzo: HTMLCanvasElement
        lienzoSinFondo: HTMLCanvasElement
        metrosPorPixel: number
        /** El mapa no terminó de dibujarse (una tesela que no bajó): se capturó lo que había. */
        incompleta?: boolean
      } | null>((resolve) => {
        const map = mapRef.current
        const tamano = map?.getSize()
        if (!map || !tamano) {
          resolve(null)
          return
        }
        // La lámina lleva el mapa base sin oscurecer (el lienzo no tiene el
        // filtro del tema): mientras se captura, cables y rótulos van con su
        // camisa clara, y después vuelven a como estaban.
        const aclarado = ponerFondoOscuro(false)
        if (aclarado) {
          for (const capa of [fiberLayer.current, nodeLayer.current, cabeceraLayer.current, zoneLayer.current]) capa?.changed()
        }
        // Se compone una sola vez: al terminar de dibujar o, si eso no llega, al
        // vencer el tope (ver abajo).
        let hecho = false
        // En un objeto: `componer` puede correr (si el mapa ya estaba dibujado)
        // antes de que se arme el tope.
        const tope: { id?: number } = {}
        const componer = (incompleta: boolean) => {
          if (hecho) return
          hecho = true
          window.clearTimeout(tope.id)
          const escala = window.devicePixelRatio || 1
          const nuevoLienzo = () => {
            const l = document.createElement("canvas")
            l.width = Math.round(tamano[0] * escala)
            l.height = Math.round(tamano[1] * escala)
            return l
          }
          const lienzo = nuevoLienzo()
          const lienzoSinFondo = nuevoLienzo()
          const ctx = lienzo.getContext("2d")
          const ctxSinFondo = lienzoSinFondo.getContext("2d")
          if (!ctx || !ctxSinFondo) {
            if (aclarado) aplicarFondoOscuro()
            resolve(null)
            return
          }
          const capas = map.getViewport().querySelectorAll<HTMLCanvasElement>(".ol-layer canvas, canvas.ol-layer, .gismart-basemap canvas")
          for (const capa of capas) {
            if (capa.width === 0) continue
            const esFondo = capa.closest(".gismart-basemap") !== null
            const padre = capa.parentElement
            const opacidad = padre?.style.opacity || capa.style.opacity
            const transformacion = capa.style.transform.match(/^matrix\(([^(]*)\)$/)
            const m = transformacion
              ? transformacion[1].split(",").map(Number)
              : [parseFloat(capa.style.width) / capa.width, 0, 0, parseFloat(capa.style.height) / capa.height, 0, 0]
            for (const c of esFondo ? [ctx] : [ctx, ctxSinFondo]) {
              c.globalAlpha = opacidad === "" ? 1 : Number(opacidad)
              c.setTransform(m[0] * escala, m[1] * escala, m[2] * escala, m[3] * escala, m[4] * escala, m[5] * escala)
              const fondo = padre?.style.backgroundColor
              if (fondo) {
                c.fillStyle = fondo
                c.fillRect(0, 0, capa.width, capa.height)
              }
              c.drawImage(capa, 0, 0)
            }
          }
          for (const c of [ctx, ctxSinFondo]) {
            c.globalAlpha = 1
            c.setTransform(1, 0, 0, 1, 0, 0)
          }
          if (aclarado) aplicarFondoOscuro()
          const view = map.getView()
          const centro = view.getCenter()
          const lat = centro ? toLonLat(centro)[1] : 0
          // En Web Mercator un metro del mapa mide 1/cos(latitud) metros del terreno.
          const metrosPorPixel = (view.getResolution() ?? 1) * Math.cos((lat * Math.PI) / 180)
          resolve({ lienzo, lienzoSinFondo, metrosPorPixel, ...(incompleta ? { incompleta } : {}) })
        }
        const clave = map.once("rendercomplete", () => componer(false))
        // `rendercomplete` espera a que bajen todas las teselas del mapa base: si
        // una se queda colgada no llega nunca, e «Imprimir» y «Copiar mapa» se
        // quedaban esperando. A los 10 s se compone con lo que ya está dibujado.
        tope.id = window.setTimeout(() => {
          unByKey(clave)
          componer(true)
        }, ESPERA_CAPTURA_MS)
        map.renderSync()
      }),
    [aplicarFondoOscuro],
  )

  const irEnElHistorial = useCallback((paso: -1 | 1) => {
    const view = mapRef.current?.getView()
    const h = historialRef.current
    const destino = h.pila[h.indice + paso]
    if (!view || !destino) return false
    h.indice += paso
    h.destino = destino
    view.animate({ center: destino.centro, resolution: destino.resolucion, rotation: destino.rotacion, duration: 350 })
    return true
  }, [])
  const vistaAnterior = useCallback(() => irEnElHistorial(-1), [irEnElHistorial])
  const vistaSiguiente = useCallback(() => irEnElHistorial(1), [irEnElHistorial])

  // Acercar con un recuadro: mientras se espera, arrastrar dibuja el recuadro
  // en vez de mover el mapa. Igual que elegir un punto: aviso arriba y Esc cancela.
  const acercarConRecuadro = useCallback(
    (aviso: string) =>
      new Promise<boolean>((resolve) => {
        const map = mapRef.current
        if (!map) {
          resolve(false)
          return
        }
        cancelarEleccionRef.current?.("abandonada")
        setTool("pan")
        const arrastres = map
          .getInteractions()
          .getArray()
          .filter((i): i is DragPan => i instanceof DragPan)
        const recuadro = new DragBox({ condition: always, className: "gismart-recuadro" })
        const cursorAnterior = containerRef.current?.style.cursor ?? ""
        const alTeclear = (e: KeyboardEvent) => {
          if (e.key === "Escape") terminar(false)
        }
        const terminar = (acercado: boolean) => {
          map.removeInteraction(recuadro)
          arrastres.forEach((i) => i.setActive(true))
          window.removeEventListener("keydown", alTeclear)
          if (containerRef.current) containerRef.current.style.cursor = cursorAnterior
          cancelarEleccionRef.current = null
          setAvisoEleccion(null)
          resolve(acercado)
        }
        recuadro.on("boxend", () => {
          const extension = recuadro.getGeometry().getExtent()
          // Un click sin arrastrar es un recuadro de nada: se sigue esperando.
          if (getWidth(extension) === 0 || getHeight(extension) === 0) return
          encuadrarEn(extension, 21)
          terminar(true)
        })
        arrastres.forEach((i) => i.setActive(false))
        map.addInteraction(recuadro)
        if (containerRef.current) containerRef.current.style.cursor = "crosshair"
        setAvisoEleccion(`${aviso} Esc cancela.`)
        window.addEventListener("keydown", alTeclear)
        cancelarEleccionRef.current = () => terminar(false)
      }),
    [setTool, encuadrarEn],
  )

  // El minimapa: el mapa base y el tendido de fibra en chico, con el recuadro
  // de lo que se ve; arrastrar el recuadro mueve el mapa.
  const ponerMinimapa = useCallback(
    (visible: boolean) => {
      aparienciaRef.current.minimapa = visible
      const map = mapRef.current
      if (!map) return
      const actual = minimapaRef.current
      if (visible && (!actual || actual.getMap() !== map)) {
        const control = crearMinimapa(fiberSource)
        map.addControl(control)
        minimapaRef.current = control
      } else if (!visible && actual) {
        actual.getMap()?.removeControl(actual)
        minimapaRef.current = null
      }
    },
    [fiberSource],
  )

  // El estilo del mapa base va como `data-fondo` en el contenedor (los filtros
  // están en globals.css); «Sin fondo» apaga la capa, que así ni se descarga.
  const ponerFondo = useCallback(
    (estilo: EstiloDeFondo) => {
      aparienciaRef.current.fondo = estilo
      baseLayerRef.current?.setVisible(estilo !== "ninguno")
      if (containerRef.current) containerRef.current.dataset.fondo = estilo
      aplicarFondoOscuro()
    },
    [aplicarFondoOscuro],
  )

  // El tema cambia con el botón de la cabecera (una clase en <html>) o con el
  // del sistema, si se sigue al sistema.
  useEffect(() => {
    aplicarFondoOscuro()
    const observador = new MutationObserver(aplicarFondoOscuro)
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    const sistema = window.matchMedia?.("(prefers-color-scheme: dark)")
    sistema?.addEventListener?.("change", aplicarFondoOscuro)
    return () => {
      observador.disconnect()
      sistema?.removeEventListener?.("change", aplicarFondoOscuro)
    }
  }, [aplicarFondoOscuro])

  const ponerOpacidad = useCallback((capa: CapaConOpacidad, opacidad: number) => {
    aparienciaRef.current.opacidades[capa] = Math.min(1, Math.max(0, opacidad))
    const destino = {
      base: baseLayerRef.current,
      zones: zoneLayer.current,
      fibers: fiberLayer.current,
      nodes: nodeLayer.current,
      cabeceras: cabeceraLayer.current,
    }[capa]
    destino?.setOpacity(Math.min(1, Math.max(0, opacidad)))
  }, [])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      enfocarElemento,
      cableSeleccionado,
      elegirCable,
      elegirElemento,
      abandonarEleccion,
      pintarRecorrido,
      limpiarRecorrido,
      mostrarCubierta,
      mostrarCable,
      quitarResalte,
      encuadrarRecorrido,
      vistaActual,
      irAVista,
      abrirAtajos,
      elementosDelMapa,
      alCambiarLaVista,
      resaltarElementos,
      elegirPunto,
      pintarCercania,
      puntoDeLaFicha,
      capturarMapa,
      vistaAnterior,
      vistaSiguiente,
      acercarConRecuadro,
      ponerMinimapa,
      ponerFondo,
      ponerOpacidad,
    }
    return () => {
      apiRef.current = null
    }
  }, [
    apiRef,
    enfocarElemento,
    cableSeleccionado,
    elegirCable,
    elegirElemento,
    abandonarEleccion,
    pintarRecorrido,
    limpiarRecorrido,
    mostrarCubierta,
    mostrarCable,
    quitarResalte,
    encuadrarRecorrido,
    vistaActual,
    irAVista,
    abrirAtajos,
    elementosDelMapa,
    alCambiarLaVista,
    resaltarElementos,
    elegirPunto,
    pintarCercania,
    puntoDeLaFicha,
    capturarMapa,
    vistaAnterior,
    vistaSiguiente,
    acercarConRecuadro,
    ponerMinimapa,
    ponerFondo,
    ponerOpacidad,
  ])

  // Si el mapa se desmonta con una elección a medias, queda sin efecto.
  useEffect(() => () => cancelarEleccionRef.current?.("abandonada"), [])

  // Elegir otra herramienta mientras una ventana espera un click también la
  // deja sin efecto. Antes la espera seguía activa y el click de la herramienta
  // nueva (medir, dibujar…) elegía además el elemento para la ventana.
  useEffect(() => {
    if (tool !== "pan") cancelarEleccionRef.current?.("abandonada")
  }, [tool])

  // Extensión combinada de las capas con datos de red.
  const extensionDeRed = useCallback(() => {
    const juntas = createEmpty()
    ;[nodeSource, fiberSource, cabeceraSource].forEach((s) => {
      const e = s.getExtent()
      if (e && e.every((v) => Number.isFinite(v))) extend(juntas, e)
    })
    return isEmpty(juntas) ? null : juntas
  }, [nodeSource, fiberSource, cabeceraSource])

  /**
   * Extensión de una capa contando solo lo que se está viendo.
   *
   * Filtrar por categoría oculta elementos desde el estilo, pero siguen en la
   * fuente: usar `getExtent()` de la fuente encuadraba también sobre los
   * ocultos. Con el filtro en "Primer nivel" se veían dos mufas y el botón de
   * la capa alejaba el mapa hasta abarcar las 185.
   */
  const extensionVisible = useCallback(
    (source: VectorSource, sePinta?: (f: Feature<Geometry>) => boolean) => {
      if (!sePinta) return source.getExtent()
      const juntas = createEmpty()
      source.getFeatures().forEach((f) => {
        if (!sePinta(f)) return
        const e = f.getGeometry()?.getExtent()
        if (e && e.every((v) => Number.isFinite(v))) extend(juntas, e)
      })
      return isEmpty(juntas) ? null : juntas
    },
    [],
  )

  const encuadrarEnDatos = useCallback(() => {
    encuadrarEn(extensionDeRed())
  }, [encuadrarEn, extensionDeRed])

  // Lo seleccionado, para leerlo desde la carga sin rehacerla en cada selección.
  const selectedRef = useRef(selected)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  // Carga (o recarga) las tres capas reales. `encuadrar` solo se pide en el
  // arranque: al actualizar manualmente conviene respetar la vista del usuario.
  const cargarDatosReales = useCallback(
    (isCancelled: () => boolean, encuadrar: boolean) => {
      nodeSource.clear()
      fiberSource.clear()
      cabeceraSource.clear()
      setMufaLoadError(null)
      setFiberLoadError(null)
      setCabeceraLoadError(null)
      // La conectividad se arma en la base en el momento: al recargar se
      // olvida la consultada, y lo que llegue de la carga anterior se ignora.
      cargaRef.current++
      // Una carga anterior que siga en camino (la inicial, si se pulsa
      // «Actualizar» antes de que termine) ya no escribe: sumaba sus elementos a
      // los de esta y quedaban duplicados (370 cubiertas en vez de 185).
      const generacion = cargaRef.current
      const vieja = () => isCancelled() || cargaRef.current !== generacion
      setConsultada(null)
      setConectividades({})
      // Los elementos se reemplazan por los que lleguen, así que lo que
      // estuviera seleccionado ya no existe: el panel se quedaba abierto sobre
      // una mufa fantasma, y el punto rojo marcándola. Se vacía mientras carga
      // y al terminar se vuelve a elegir el mismo, buscado por su id de la base
      // (la clave de OpenLayers cambia al recargar). Antes «Actualizar» cerraba
      // el panel de lo que se estaba mirando.
      const seleccionPrevia = selectedRef.current
      const idPrevio = seleccionPrevia?.feature.get("id")
      setSelected(null)
      // También la referencia, ya: si la carga termina antes de que React
      // aplique el cambio, seguiría con lo anterior y parecería que se eligió
      // otra cosa mientras cargaba.
      selectedRef.current = null
      editSelectRef.current?.getFeatures().clear()
      setLoadingData(true)
      onLoadingChangeRef.current?.(true)

      const mufasDone = loadRealMufas(nodeSource, vieja).then((error) => {
        if (vieja()) return
        if (error) {
          setMufaLoadError(error)
          return
        }
        // Encuadra en la zona real donde están las mufas cargadas, en vez de
        // depender de un centro fijo que puede no coincidir con la data.
        if (encuadrar) encuadrarEnDatos()
      })
      const cablesDone = loadRealFiberCables(fiberSource, vieja).then((error) => {
        if (error && !vieja()) setFiberLoadError(error)
      })
      const cabecerasDone = loadRealCabeceras(cabeceraSource, vieja).then((error) => {
        if (error && !vieja()) setCabeceraLoadError(error)
      })
      // El indicador se apaga cuando todos los endpoints terminaron, con éxito o no.
      Promise.allSettled([mufasDone, cablesDone, cabecerasDone]).then(() => {
        if (vieja()) return
        setLoadingData(false)
        setFirstLoadDone(true)
        onLoadingChangeRef.current?.(false)
        // Solo si mientras cargaba no se eligió otra cosa.
        if (seleccionPrevia && typeof idPrevio === "string" && selectedRef.current === null) {
          const fuente = { node: nodeSource, fiber: fiberSource, cabecera: cabeceraSource, zone: zoneSource }[seleccionPrevia.type]
          const misma = fuente.getFeatures().find((f) => f.get("id") === idPrevio)
          if (misma) {
            setSelected({ feature: misma, type: seleccionPrevia.type })
            setNameDraft((misma.get(NOMBRE_VISIBLE) as string) ?? "")
          }
        }
      })
    },
    [nodeSource, fiberSource, cabeceraSource, zoneSource, encuadrarEnDatos],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Se retoma la última vista para no volver siempre al encuadre completo:
    // quien trabaja sobre un sector concreto lo recupera al recargar.
    const guardada = leerVistaGuardada()
    const view = new View({
      center: fromLonLat(guardada?.centro ?? center),
      zoom: guardada?.zoom ?? zoom,
    })

    // `declutter` descarta las etiquetas que se solapan. Los símbolos llevan
    // `declutterMode: "none"` en la simbología, así que siempre se dibujan:
    // se ordenan los rótulos sin llegar a esconder elementos de la red.
    zoneLayer.current = new VectorLayer({ source: zoneSource, style: zoneStyle as never })
    // Devolver `undefined` deja el elemento sin dibujar, y OpenLayers tampoco
    // lo detecta al hacer click: filtrar oculta y además vuelve inseleccionable.
    fiberLayer.current = new VectorLayer({
      source: fiberSource,
      style: ((f: Feature<Geometry>, r: number) => (cableVisible(f) ? fiberStyle(f, r) : undefined)) as never,
      declutter: true,
    })
    nodeLayer.current = new VectorLayer({
      source: nodeSource,
      style: ((f: Feature<Geometry>, r: number) => (cubiertaVisible(f) ? nodeStyle(f, r) : undefined)) as never,
      declutter: true,
    })
    cabeceraLayer.current = new VectorLayer({
      source: cabeceraSource,
      style: cabeceraStyle as never,
      declutter: true,
    })
    measureLayer.current = new VectorLayer({ source: measureSource, style: measureStyle as never })
    sentidoLayer.current = new VectorLayer({ source: sentidoSource, style: sentidoStyle as never })
    marcadorLayer.current = new VectorLayer({ source: marcadorSource, style: marcadorStyle as never })
    brilloLayer.current = new VectorLayer({ source: brilloSource, style: brilloDeCableStyle as never })
    extremosLayer.current = new VectorLayer({ source: extremosSource, style: extremoStyle as never })
    destinoLayer.current = new VectorLayer({ source: destinoSource, style: destinoStyle as never })
    // `zIndex: 10`, como en el código del ingeniero: el recorrido queda por
    // encima de toda la red.
    traceLayer.current = new VectorLayer({ source: traceSource, style: traceStyle as never, zIndex: 10 })
    // Encima del recorrido: lo ubicado desde su tabla no queda tapado por el cian.
    resalteLayer.current = new VectorLayer({ source: resalteSource, style: resalteStyle as never, zIndex: 11 })
    // Selección del módulo «Avanzado»: debajo del trace (zIndex 9), encima de la red.
    seleccionAvanzadaLayer.current = new VectorLayer({
      source: seleccionAvanzadaSource,
      style: resalteStyle as never,
      zIndex: 9,
    })
    // Cercanía: debajo de la red, para no tapar lo que queda dentro del círculo.
    cercaniaLayer.current = new VectorLayer({ source: cercaniaSource, style: estiloCercania as never })

    // El `className` hace que OpenLayers dibuje la capa base en su propio
    // lienzo, y eso permite oscurecerla por CSS en modo oscuro (o con el estilo
    // que se elija en Avanzado › Mapa base) sin tocar los datos de la red.
    const capaBase = new TileLayer({ source: baseMapSource, className: "gismart-basemap" })
    baseLayerRef.current = capaBase
    const map = new Map({
      target: containerRef.current,
      layers: [
        capaBase,
        cercaniaLayer.current,
        zoneLayer.current,
        // Debajo del tendido: el brillo asoma alrededor del cable sin taparlo.
        brilloLayer.current,
        fiberLayer.current,
        // Encima del tendido, para taparlo mientras dura, y debajo de las
        // mufas, para que la mufa pulsada se siga viendo.
        sentidoLayer.current,
        // El recorrido del trace (con zIndex 10 se dibuja encima de todo).
        traceLayer.current,
        resalteLayer.current,
        seleccionAvanzadaLayer.current,
        nodeLayer.current,
        // La cabecera va encima de las mufas: es el elemento jerárquicamente
        // más importante y no debe quedar tapada.
        cabeceraLayer.current,
        // El punto rojo va encima de todo lo que es red, para que se vea
        // aunque la mufa esté tapada por otras.
        marcadorLayer.current,
        extremosLayer.current,
        destinoLayer.current,
        measureLayer.current,
      ],
      view,
      controls: defaultControls({ attributionOptions: { collapsible: true } }).extend([
        // Barra de escala: en un SIG es la referencia para juzgar distancias
        // de un vistazo, sin tener que usar la herramienta de medir.
        new ScaleLine({ units: "metric", bar: true, steps: 2, text: true, minWidth: 90 }),
      ]),
    })

    // El puntero se maneja fuera de React a propósito.
    //
    // Antes cada `pointermove` hacía `setState`, y eso volvía a renderizar el
    // componente entero decenas de veces por segundo con solo mover el ratón
    // sobre el mapa. Acá se escribe directo en el DOM y se limita el trabajo a
    // un fotograma, así que mover el ratón deja de costar renders de React.
    let pendiente: { pixel: number[]; coordinate: number[] } | null = null
    let cuadroPedido = false
    let ultimoResaltado: Feature<Geometry> | null = null

    const capasConsultables = () =>
      [nodeLayer.current, fiberLayer.current, cabeceraLayer.current, zoneLayer.current].filter(
        (capa): capa is VectorLayer<VectorSource> => capa !== null,
      )

    function procesarPuntero() {
      cuadroPedido = false
      if (!pendiente) return
      const { pixel, coordinate } = pendiente

      const [lon, lat] = toLonLat(coordinate)
      if (lonRef.current) lonRef.current.textContent = lon.toFixed(5)
      if (latRef.current) latRef.current.textContent = lat.toFixed(5)

      // Nombre del elemento bajo el cursor, a cualquier zoom: las etiquetas del
      // mapa solo salen de cerca, así que sin esto había que hacer click para
      // saber qué era cada punto.
      const capas = capasConsultables()
      const encontrado =
        map.forEachFeatureAtPixel(pixel, (f) => f as Feature<Geometry>, {
          hitTolerance: 4,
          layerFilter: (capa) => capas.includes(capa as VectorLayer<VectorSource>),
        }) ?? null

      const globo = hoverRef.current
      if (!globo) return

      if (!encontrado) {
        ultimoResaltado = null
        globo.hidden = true
        apagarBrillo()
        return
      }

      globo.hidden = false
      globo.style.transform = `translate(${pixel[0]}px, ${pixel[1]}px)`

      // El texto (y el brillo) solo se rearman cuando cambia el elemento, no en cada píxel.
      if (encontrado !== ultimoResaltado) {
        ultimoResaltado = encontrado
        const tipo = tipoDeFeature(encontrado)
        globo.textContent =
          tipo === "fiber"
            ? textoDelGloboDeCable(encontrado)
            : tipo === "node"
              ? // «Cubierta CO06 · Primer nivel»: el nivel, que antes solo se veía en la ficha.
                [`Cubierta ${(encontrado.get(NOMBRE_VISIBLE) as string) || ""}`.trim(), encontrado.get("funcion_cub") as string | undefined]
                  .filter(Boolean)
                  .join(" · ")
              : tipo
                ? `${TYPE_LABELS[tipo]} · ${(encontrado.get(NOMBRE_VISIBLE) as string) || TYPE_LABELS[tipo]}`
                : ""
        apagarBrillo()
        // El cable o la cubierta bajo el puntero brillan en su color: se sabe
        // cuál se va a elegir cuando hay varios juntos.
        if (tipo === "fiber" || tipo === "node" || tipo === "cabecera") {
          brilloSource.addFeature(
            new Feature({
              geometry: encontrado.getGeometry(),
              cant_hilo: encontrado.get("cant_hilo"),
              tipo_red_prin: encontrado.get("tipo_red_prin"),
              funcion_cub: encontrado.get("funcion_cub"),
              es_cabecera: tipo === "cabecera",
            }),
          )
        }
      }
    }

    /** Quita el brillo del cable, si lo hay (sin redibujar cuando no hay nada). */
    function apagarBrillo() {
      if (brilloSource.getFeatures().length > 0) brilloSource.clear()
    }

    /** «Cable 2107434 · Feeder · 144 hilos · 946 m»: lo que se lee del cable sin hacer click. */
    function textoDelGloboDeCable(f: Feature<Geometry>): string {
      const tipoRed = String(f.get("tipo_red_prin") ?? "").trim().toUpperCase()
      const hilos = f.get("cant_hilo")
      return [
        `Cable ${(f.get(NOMBRE_VISIBLE) as string) || ""}`.trim(),
        TIPO_RED_NOMBRES[tipoRed],
        typeof hilos === "number" && hilos > 0 ? `${hilos} hilos` : null,
        textoDeLongitud(largoDeCableM(f)),
      ]
        .filter(Boolean)
        .join(" · ")
    }

    map.on("pointermove", (evt) => {
      // Mientras se arrastra el mapa no interesa lo que hay bajo el cursor.
      if (evt.dragging) {
        if (hoverRef.current) hoverRef.current.hidden = true
        ultimoResaltado = null
        apagarBrillo()
        return
      }
      pendiente = { pixel: evt.pixel, coordinate: evt.coordinate }
      if (cuadroPedido) return
      cuadroPedido = true
      requestAnimationFrame(procesarPuntero)
    })

    // Al salir del mapa no debe quedar una etiqueta flotando.
    map.getViewport().addEventListener("pointerleave", () => {
      ultimoResaltado = null
      if (hoverRef.current) hoverRef.current.hidden = true
      apagarBrillo()
    })
    // El zoom se escribe en la barra de estado directamente, como las
    // coordenadas: cambia en cada cuadro de la animación de acercar, y por
    // estado de React eso repintaba el mapa entero una decena de veces.
    const mostrarZoom = () => {
      const z = view.getZoom()
      if (typeof z === "number" && zoomRef.current) zoomRef.current.textContent = String(Math.round(z * 10) / 10)
    }
    mostrarZoom()
    view.on("change:resolution", mostrarZoom)

    // React StrictMode monta este efecto dos veces seguidas en desarrollo
    // (monta → limpia → monta). Como la carga es asíncrona, sin este guard
    // las dos llamadas podían resolver después de la limpieza y sumar los
    // datos por duplicado (ej. 370 mufas en vez de 185).
    let cancelled = false
    const isCancelled = () => cancelled

    // Si la cartografía de fondo no carga, el mapa queda en negro sin explicar
    // nada. Se avisa solo tras varios fallos seguidos, para no alarmar por una
    // tesela suelta, y el aviso se retira en cuanto vuelve a cargar alguna.
    let teselasFallidas = 0
    baseMapSource.on("tileloaderror", () => {
      teselasFallidas += 1
      if (teselasFallidas >= 6 && !isCancelled()) setBaseMapError(true)
    })
    baseMapSource.on("tileloadend", () => {
      teselasFallidas = 0
      if (!isCancelled()) setBaseMapError(false)
    })

    // El pin del punto buscado ya cumplió al primer click sobre el mapa: si se
    // quedara, se leería como un elemento más.
    map.on("singleclick", () => destinoSource.clear())

    // "moveend" agrupa el final de cada paneo/zoom, así que evita disparar la
    // geocodificación inversa en cada cuadro de la animación.
    map.on("moveend", () => {
      const center = view.getCenter()
      if (!center) return
      const [lon, lat] = toLonLat(center)
      onCenterChangeRef.current?.({ lon, lat })

      // Historial de «Anterior / Siguiente»: cada vista nueva se anota; la
      // que resulta de ir atrás o adelante no, para no perder lo de adelante.
      const resolucion = view.getResolution()
      if (resolucion) {
        const h = historialRef.current
        const aqui = { centro: [...center], resolucion, rotacion: view.getRotation() }
        if (h.destino && vistasParecidas(aqui, h.destino)) {
          h.destino = null
        } else if (!h.pila[h.indice] || !vistasParecidas(aqui, h.pila[h.indice])) {
          h.destino = null
          h.pila = [...h.pila.slice(0, h.indice + 1), aqui].slice(-MAX_HISTORIAL)
          h.indice = h.pila.length - 1
        }
      }

      const zoomActual = view.getZoom()
      if (typeof zoomActual === "number") {
        guardarVista({ centro: [lon, lat], zoom: zoomActual })
      }
    })

    // Solo se reencuadra sobre los datos si no había una vista guardada: si la
    // hay, respetarla es justamente el sentido de haberla guardado.
    cargarDatosReales(isCancelled, !guardada)

    ;[nodeSource, fiberSource, zoneSource, cabeceraSource].forEach((s) => {
      s.on("addfeature", pedirRecalculo)
      s.on("removefeature", pedirRecalculo)
    })

    mapRef.current = map
    recalcAhora()

    // El aspecto que ya se había pedido (si el mapa se crea de nuevo).
    const aspecto = aparienciaRef.current
    capaBase.setVisible(aspecto.fondo !== "ninguno")
    const capasConOpacidad = {
      base: capaBase,
      zones: zoneLayer.current,
      fibers: fiberLayer.current,
      nodes: nodeLayer.current,
      cabeceras: cabeceraLayer.current,
    }
    for (const [capa, opacidad] of Object.entries(aspecto.opacidades)) {
      capasConOpacidad[capa as CapaConOpacidad]?.setOpacity(opacidad as number)
    }
    if (aspecto.minimapa) {
      const control = crearMinimapa(fiberSource)
      map.addControl(control)
      minimapaRef.current = control
    }

    // La raya que corre sobre el recorrido del trace (ver FLUJO_TRACE). Se
    // dibuja encima de la capa en cada cuadro y, durante unos segundos después
    // de pintar el recorrido, pide el siguiente a unos 25 cuadros por segundo.
    // Después queda quieta: correr todo el rato costaba un 12 % de CPU. Con la
    // pestaña oculta no se pide ningún cuadro; con «reducir movimiento», tampoco.
    let cuadroDelFlujo: ReturnType<typeof setTimeout> | null = null
    const reducirMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    traceLayer.current.on("postrender", (evento) => {
      const lineas = traceSource.getFeatures().filter((f) => f.get(FLUJO_TRACE))
      if (lineas.length === 0) return
      const contexto = getVectorContext(evento)
      const corre = !reducirMovimiento && Date.now() < flujoHastaRef.current
      // Quieta, la raya queda en su posición inicial.
      const avance = corre ? ((evento.frameState?.time ?? 0) / 40) % PERIODO_FLUJO_TRACE : 0
      const trazo = ESTILO_FLUJO_TRACE.getStroke()
      for (const f of lineas) {
        const geometria = f.getGeometry()
        if (!geometria) continue
        trazo?.setLineDashOffset(-(f.get(FLUJO_TRACE) as number) * avance)
        contexto.setStyle(ESTILO_FLUJO_TRACE)
        contexto.drawGeometry(geometria)
      }
      if (!corre || document.hidden || cuadroDelFlujo) return
      cuadroDelFlujo = setTimeout(() => {
        cuadroDelFlujo = null
        map.render()
      }, 40)
    })
    const alVolverALaPestana = () => {
      if (!document.hidden) map.render()
    }
    document.addEventListener("visibilitychange", alVolverALaPestana)

    // Esc cancela el trazo en curso (mufa, fibra o zona), sin dejar nada a medias.
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") drawRef.current?.abortDrawing()
    }
    window.addEventListener("keydown", handleEscape)

    return () => {
      cancelled = true
      window.removeEventListener("keydown", handleEscape)
      document.removeEventListener("visibilitychange", alVolverALaPestana)
      if (cuadroDelFlujo) clearTimeout(cuadroDelFlujo)
      map.setTarget(undefined)
      mapRef.current = null
      minimapaRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cada herramienta vive en su archivo (components/mapa/herramientas). Aquí
  // queda lo que es igual para todas: al cambiar de herramienta se quita lo
  // que dejó la anterior, se cierra la selección y se limpian los avisos.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const ctx: ContextoHerramienta = {
      map,
      tool,
      containerRef,
      nodeSource,
      fiberSource,
      zoneSource,
      cabeceraSource,
      measureSource,
      sentidoSource,
      extremosSource,
      nodeLayer,
      fiberLayer,
      zoneLayer,
      cabeceraLayer,
      drawRef,
      selectRef,
      deleteHoverRef,
      editSelectRef,
      editModifyRef,
      fiberSnapRef,
      modificables,
      measureOverlaysRef,
      fiberNoticeTimeoutRef,
      capaActivaRef,
      tipoDeFeature,
      capaDeMapa,
      nombreDeElemento,
      consultarConectividad,
      setAvisoConsulta,
      setConsultada,
      setSelected,
      setCandidatos,
      setNameDraft,
      setFiberNotice,
      setNombreEnPregunta,
      setMufaPendiente,
    }

    quitarInteracciones(ctx)
    // Las mediciones son efímeras: se limpian solo al salir por completo de
    // las herramientas de medir (cambiar entre distancia y área las conserva).
    if (tool !== "measure-length" && tool !== "measure-area") {
      measureSource.clear()
      measureOverlaysRef.current.forEach((o) => map.removeOverlay(o))
      measureOverlaysRef.current = []
    }
    setSelected(null)
    setSchemaOpen(false)
    setInfoOpen(false)
    if (fiberNoticeTimeoutRef.current) {
      clearTimeout(fiberNoticeTimeoutRef.current)
      fiberNoticeTimeoutRef.current = null
    }
    setFiberNotice(TOOL_HINTS[tool] ?? null)
    setAvisoConsulta(null)
    setConsultada(null)
    // Una consulta que siga en camino ya no debe abrir nada con otra herramienta.
    turnoConsultaRef.current++

    // Con una herramienta de selección activa, el doble click debe actuar sobre
    // el elemento: el zoom por doble click desplazaba el mapa y hacía que el
    // segundo click cayera al vacío, perdiendo lo que estabas consultando.
    const zoomPorDobleClick = map
      .getInteractions()
      .getArray()
      .find((interaccion) => interaccion instanceof DoubleClickZoom)
    zoomPorDobleClick?.setActive(
      tool !== "edit" && tool !== "delete" && tool !== "conectividad" && tool !== "sentido" && tool !== "cable",
    )

    return HERRAMIENTAS[tool]?.(ctx)
  }, [
    tool,
    nodeSource,
    fiberSource,
    zoneSource,
    cabeceraSource,
    measureSource,
    sentidoSource,
    extremosSource,
    tipoDeFeature,
    consultarConectividad,
    nombreDeElemento,
    modificables,
    capaDeMapa,
  ])

  useEffect(() => {
    const cursors: Record<MapTool, string> = {
      pan: "grab",
      edit: "pointer",
      node: "crosshair",
      fiber: "crosshair",
      zone: "crosshair",
      delete: "pointer",
      "measure-length": "crosshair",
      "measure-area": "crosshair",
      // Mira para elegir; sobre una cubierta pasa a mano (ver la herramienta).
      conectividad: "crosshair",
      sentido: "crosshair",
      cable: "crosshair",
    }
    if (containerRef.current) containerRef.current.style.cursor = cursors[tool]
  }, [tool])

  useEffect(() => {
    if (externalVisible) {
      nodeLayer.current?.setVisible(externalVisible.nodes)
      fiberLayer.current?.setVisible(externalVisible.fibers)
      zoneLayer.current?.setVisible(externalVisible.zones)
      cabeceraLayer.current?.setVisible(externalVisible.cabeceras)
    }
  }, [externalVisible])

  // Centrar el mapa en el resultado del buscador y marcar el punto: la
  // dirección o la coordenada no es un elemento de la red, y sin el pin no se
  // sabía cuál era el lugar exacto dentro de la vista.
  useEffect(() => {
    if (!flyTo) return
    const view = mapRef.current?.getView()
    if (!view) return
    destinoSource.clear()
    const destino = new Point(fromLonLat([flyTo.lon, flyTo.lat]))
    destinoSource.addFeature(new Feature({ geometry: destino, etiqueta: flyTo.etiqueta }))
    view.animate({ center: destino.getCoordinates(), zoom: flyTo.zoom ?? 15, duration: 600 }, (completo) => {
      if (completo) destellarEn(destino, DESTELLO_DESTINO)
    })
    // `nonce` permite repetir el mismo destino: se ignora el resto del objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.nonce])

  // "Actualizar" del ribbon: vuelve a pedir los datos a los endpoints. Se
  // cancela igual que la carga inicial, para no escribir estado si el usuario
  // sale de la vista mientras las respuestas siguen en camino. El encendido
  // del indicador de carga es justamente el efecto que se busca aquí.
  useEffect(() => {
    if (!reloadTrigger) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatosReales(() => cancelled, false)
    return () => {
      cancelled = true
    }
  }, [reloadTrigger, cargarDatosReales])

  // Encuadre pedido desde fuera: la red completa (ribbon) o una capa concreta
  // (panel de capas).
  useEffect(() => {
    if (!fitTo) return
    if (fitTo.capa === "todo") {
      encuadrarEnDatos()
      return
    }
    // Cada capa se encuadra sobre lo que realmente se ve: las que se pueden
    // filtrar por categoría pasan también su condición de pintado.
    const fuentes = {
      nodes: [nodeSource, cubiertaVisible],
      fibers: [fiberSource, cableVisible],
      cabeceras: [cabeceraSource, undefined],
      zones: [zoneSource, undefined],
    } as const

    const [fuente, sePinta] = fuentes[fitTo.capa]
    encuadrarEn(extensionVisible(fuente, sePinta))
    // `nonce` es lo que marca una petición nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTo?.nonce])

  // Atajos: las teclas 1..8 activan las herramientas en el orden de la barra.
  // Se ignoran mientras se escribe en un campo, para no cambiar de herramienta
  // al teclear un nombre.
  useEffect(() => {
    function alPulsarTecla(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const activo = document.activeElement
      const escribiendo =
        activo instanceof HTMLInputElement ||
        activo instanceof HTMLTextAreaElement ||
        (activo instanceof HTMLElement && activo.isContentEditable)
      if (escribiendo) return
      // Con un diálogo abierto las teclas son suyas: cambiar de herramienta por
      // detrás dejaba, por ejemplo, una mufa a medio confirmar.
      if (document.querySelector('[data-slot="dialog-content"]')) return

      if (e.key === "?") {
        setAyudaAbierta(true)
        return
      }

      const indice = Number(e.key) - 1
      const herramienta = TOOL_ORDER[indice]
      if (!herramienta) return
      const motivo = motivoHerramientaBloqueada(herramienta, capaActivaRef.current)
      if (motivo) avisarBloqueo(herramienta, motivo)
      else setTool(herramienta)
    }
    window.addEventListener("keydown", alPulsarTecla)
    return () => window.removeEventListener("keydown", alPulsarTecla)
  }, [setTool, avisarBloqueo])

  const tools: { id: MapTool; label: string; icon: typeof Hand; color?: string; separator?: boolean }[] = [
    { id: "pan", label: "Mover mapa", icon: Hand },
    { id: "edit", label: "Editar elementos", icon: Pencil },
    { id: "node", label: "Dibujar cubierta", icon: Box, color: LAYER_COLORS.node },
    { id: "fiber", label: "Trazar fibra", icon: Spline, color: LAYER_COLORS.fiber },
    { id: "zone", label: "Zona de cobertura", icon: Hexagon, color: LAYER_COLORS.zone },
    { id: "delete", label: "Eliminar geometría", icon: Trash2 },
    { id: "measure-length", label: "Medir distancia", icon: Ruler, color: MEASURE_COLOR, separator: true },
    { id: "measure-area", label: "Medir área", icon: Square, color: MEASURE_COLOR },
  ]

  // En la barra de estado: la herramienta y, si cambia el mapa, sobre qué capa.
  const nombreHerramienta =
    tools.find((t) => t.id === tool)?.label ??
    (tool === "conectividad"
      ? "Consulta de conectividad"
      : tool === "sentido"
        ? "Entradas y salidas"
        : tool === "cable"
          ? "Consulta de cable"
          : "")
  const etiquetaHerramienta =
    capaActiva && HERRAMIENTAS_DE_EDICION.includes(tool)
      ? `${nombreHerramienta} · ${NOMBRE_DE_CAPA[capaActiva]}`
      : nombreHerramienta

  function clearMeasurements() {
    measureSource.clear()
    const map = mapRef.current
    if (map) measureOverlaysRef.current.forEach((o) => map.removeOverlay(o))
    measureOverlaysRef.current = []
    drawRef.current?.abortDrawing()
  }

  /** El nombre que tenía cada elemento antes de editarlo, por si queda vacío. */
  const nombresOriginales = useRef(new WeakMap<Feature<Geometry>, string>())

  // Al escribir: sin saltos de línea ni caracteres invisibles (llegan al
  // pegar), y con tope. Antes un nombre pegado de 200 000 caracteres quedaba
  // como rótulo del mapa.
  function handleNameChange(value: string) {
    if (!seleccionEditable || !selected) return
    const f = selected.feature
    if (!nombresOriginales.current.has(f)) nombresOriginales.current.set(f, String(f.get(NOMBRE_VISIBLE) ?? ""))
    const limpio = limpiarNombre(value)
    setNameDraft(limpio)
    f.set(NOMBRE_VISIBLE, limpio)
  }

  /** Al salir del nombre: sin espacios de más, y si quedó vacío, el que tenía. */
  function terminarNombre() {
    if (!seleccionEditable || !selected) return
    const f = selected.feature
    const final = nameDraft.trim() || nombresOriginales.current.get(f) || ""
    // La próxima edición parte del nombre con el que quedó.
    nombresOriginales.current.delete(f)
    if (final === nameDraft) return
    setNameDraft(final)
    f.set(NOMBRE_VISIBLE, final)
  }

  function closeSelection() {
    editSelectRef.current?.getFeatures().clear()
    setSelected(null)
    setCandidatos([])
    setSchemaOpen(false)
    setInfoOpen(false)
  }

  // Varios elementos bajo el click (módulo «Avanzado»): la ficha pasa de uno a otro.
  const indiceCandidato = selected ? candidatos.indexOf(selected.feature) : -1
  function mostrarCandidato(indice: number) {
    const feature = candidatos[(indice + candidatos.length) % candidatos.length]
    const tipo = feature ? tipoDeFeature(feature) : null
    if (!feature || !tipo) return
    const seleccion = editSelectRef.current?.getFeatures()
    seleccion?.clear()
    seleccion?.push(feature)
    setSelected({ feature, type: tipo })
    setNameDraft((feature.get(NOMBRE_VISIBLE) as string) ?? "")
    setSchemaOpen(false)
    setInfoOpen(false)
  }
  const variosEnElPunto: VariosEnElPunto | undefined =
    indiceCandidato >= 0 && candidatos.length > 1
      ? {
          actual: indiceCandidato,
          total: candidatos.length,
          onAnterior: () => mostrarCandidato(indiceCandidato - 1),
          onSiguiente: () => mostrarCandidato(indiceCandidato + 1),
        }
      : undefined

  function handleDeleteSelected() {
    if (!selected || !seleccionEditable) return
    const sources: Record<FeatureType, VectorSource> = {
      node: nodeSource,
      fiber: fiberSource,
      zone: zoneSource,
      cabecera: cabeceraSource,
    }
    sources[selected.type].removeFeature(selected.feature)
    closeSelection()
  }

  function centrarEnSeleccion() {
    const geom = selected?.feature.getGeometry()
    if (!geom) return
    // Un punto no tiene extensión útil: se acerca más para que quede claro
    // cuál es, mientras que un cable o una zona se encuadran completos.
    const esPunto = geom.getType() === "Point"
    encuadrarEn(geom.getExtent(), esPunto ? 18 : 17)
  }

  // Última conectividad consultada de la cubierta seleccionada, si la hay.
  const consultaSeleccionada = idMufaSeleccionada ? conectividades[idMufaSeleccionada] : undefined
  // «Gestionar esquema» sigue la misma regla que «Ver conexiones»: solo con
  // conectividad (ver el panel).
  const esquemaSeleccionado =
    consultaSeleccionada?.estado === "disponible" ? consultaSeleccionada.esquema : null

  function handleViewConnections() {
    if (consultaSeleccionada?.estado !== "disponible") return
    setConnectivitySchema(consultaSeleccionada.esquema)
    setConnectivityOpen(true)
  }

  /** La mufa colocada se queda. */
  function confirmarMufa() {
    setMufaPendiente(null)
  }

  /** La mufa colocada se quita del mapa. */
  function cancelarMufa() {
    if (mufaPendiente && nodeSource.hasFeature(mufaPendiente)) nodeSource.removeFeature(mufaPendiente)
    setMufaPendiente(null)
  }

  function handleGestionarEsquema() {
    if (esquemaSeleccionado) setSchemaOpen(true)
  }

  // Las capas que no pudieron cargar, para un único aviso con el porqué de cada una.
  const capasSinDatos: { capa: string; error: ErrorDeCapa }[] = []
  if (mufaLoadError) capasSinDatos.push({ capa: "Cubiertas", error: mufaLoadError })
  if (fiberLoadError) capasSinDatos.push({ capa: "Tendido de fibra", error: fiberLoadError })
  if (cabeceraLoadError) capasSinDatos.push({ capa: "Cabeceras", error: cabeceraLoadError })

  function descartarAvisosDeCarga() {
    setMufaLoadError(null)
    setFiberLoadError(null)
    setCabeceraLoadError(null)
  }

  // Lo seleccionado se mueve, se renombra o se quita solo si es de la capa
  // activa; si no, el panel queda en consulta.
  const seleccionEditable = selected !== null && CAPA_DE_TIPO[selected.type] === capaActiva

  return (
    <div className={`relative size-full ${className ?? ""}`}>
      <div
        ref={containerRef}
        /* Los controles propios de OpenLayers (zoom, créditos y escala) se
           reestilizan en globals.css, bajo `.gismart-mapa`, para que coincidan
           con los botones de la aplicación. */
        className="gismart-mapa size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        // OpenLayers trae desplazamiento y zoom por teclado, pero solo actúan
        // cuando el mapa tiene el foco. Sin `tabIndex` el contenedor no podía
        // recibirlo, así que las flechas y +/- nunca hacían nada.
        tabIndex={0}
        role="application"
        aria-label="Mapa interactivo de la red de fibra. Con el foco puesto, las flechas desplazan y + o − acercan y alejan."
      />

      {/* Cortina del primer arranque: evita mostrar un mapa vacío mientras
          llegan las capas, que se leía como si no hubiera datos. Al terminar
          se desvanece y deja ver la red debajo. */}
      {!cortinaFuera && (
        <div
          aria-hidden={firstLoadDone || undefined}
          className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm transition-opacity duration-500 ${
            firstLoadDone ? "pointer-events-none opacity-0" : ""
          }`}
        >
          <GismartMark className="size-14 rounded-2xl shadow-lg" />
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Cargando la red de fibra…
          </div>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/2 animate-[gismart-progress_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </div>
      )}

      <MapNoticeStack>
        {loadingData && firstLoadDone && (
          <MapNotice cargando>Cargando red desde Supabase…</MapNotice>
        )}

        {/* Un solo aviso para todas las capas: tres banderas apiladas tapaban
            el mapa, y que una capa no traiga datos no siempre es una falla. */}
        {capasSinDatos.length > 0 && (
          <MapNotice tono="aviso" onCerrar={descartarAvisosDeCarga}>
            <span>
              Sin datos disponibles:{" "}
              <span className="font-semibold">{capasSinDatos.map(({ capa }) => capa).join(", ")}</span>. El
              resto del mapa funciona normalmente.
            </span>
            {capasSinDatos.map(({ capa, error }) => (
              <span key={capa} className="mt-1 block break-words font-mono text-[11px] font-normal text-muted-foreground">
                {capa}: {error.detalle ?? error.mensaje}
              </span>
            ))}
          </MapNotice>
        )}

        {baseMapError && (
          <MapNotice tono="aviso">
            No se pudo cargar la cartografía de fondo. Los datos de la red sí se muestran.
          </MapNotice>
        )}

        {avisoEleccion && (
          <MapNotice tono="info" onCerrar={() => cancelarEleccionRef.current?.("cancelada")}>
            {avisoEleccion}
          </MapNotice>
        )}

        {avisoBloqueo && motivoHerramientaBloqueada(avisoBloqueo.herramienta, capaActiva) && (
          <MapNotice tono="aviso" onCerrar={() => setAvisoBloqueo(null)}>
            {avisoBloqueo.texto}
          </MapNotice>
        )}

        {/* Las indicaciones de cada herramienta son ayuda; lo demás que pasa
            por aquí (un trazo de fibra rechazado) es una advertencia. */}
        {fiberNotice && (
          <MapNotice tono={Object.values(TOOL_HINTS).includes(fiberNotice) ? "info" : "aviso"}>{fiberNotice}</MapNotice>
        )}

        {avisoConsulta && (
          <MapNotice
            tono={avisoConsulta.cargando ? "neutral" : (avisoConsulta.tono ?? "info")}
            cargando={avisoConsulta.cargando}
            onCerrar={avisoConsulta.cargando ? undefined : () => setAvisoConsulta(null)}
          >
            <span>{avisoConsulta.texto}</span>
            {avisoConsulta.detalle && (
              <span className="mt-1 block break-words font-mono text-[11px] font-normal text-muted-foreground">
                {avisoConsulta.detalle}
              </span>
            )}
          </MapNotice>
        )}

        {(tool === "measure-length" || tool === "measure-area") && (
          <MapNotice interactivo>
            <span>
              {tool === "measure-length"
                ? "Click para trazar, doble click para terminar. Esc cancela."
                : "Click para dibujar el área, doble click para terminar. Esc cancela."}
            </span>
            <button
              type="button"
              onClick={clearMeasurements}
              className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Limpiar
            </button>
          </MapNotice>
        )}
      </MapNoticeStack>

      {/* Herramientas de dibujo (izquierda) */}
      {/* Con el mapa bajo (la tabla de atributos abierta debajo) no pasa de la
          escala: se desplaza en vez de taparla. */}
      <div data-tapa-mapa className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-5.5rem)] flex-col gap-0.5 overflow-y-auto rounded-xl bg-card/95 p-1 shadow-lg ring-1 ring-border backdrop-blur [scrollbar-width:none]">
        {tools.map((t) => {
          const Icon = t.icon
          const active = tool === t.id
          const motivo = motivoHerramientaBloqueada(t.id, capaActiva)
          return (
            <span key={t.id} className="flex flex-col gap-0.5">
              {t.separator && <span className="mx-1 my-1 h-px bg-border" />}
              <Tooltip
                label={motivo ? `${t.label}: activa su capa primero` : `${t.label} (${TOOL_ORDER.indexOf(t.id) + 1})`}
              >
                <button
                  type="button"
                  onClick={() => (motivo ? avisarBloqueo(t.id, motivo) : setTool(t.id))}
                  aria-disabled={motivo ? true : undefined}
                  aria-label={t.label}
                  aria-keyshortcuts={String(TOOL_ORDER.indexOf(t.id) + 1)}
                  aria-pressed={active}
                  className={`flex size-9 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-90 motion-reduce:active:scale-100 ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : motivo
                        ? "cursor-not-allowed text-muted-foreground/45 hover:bg-accent/60"
                        : "text-foreground hover:bg-accent"
                  }`}
                >
                  {/* Con la clave, el ícono de la herramienta elegida gira al encenderse. */}
                  <Icon
                    key={active ? "elegida" : "libre"}
                    className={`size-[18px] ${active ? "gismart-icono" : ""}`}
                    style={!active && !motivo && t.color ? { color: t.color } : undefined}
                  />
                </button>
              </Tooltip>
            </span>
          )
        })}
        <span className="mx-1 my-1 h-px bg-border" />
        <Tooltip label="Atajos de teclado (?)">
          <button
            type="button"
            onClick={() => setAyudaAbierta(true)}
            aria-label="Atajos de teclado"
            aria-keyshortcuts="?"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Keyboard className="size-[18px]" />
          </button>
        </Tooltip>
      </div>

      <AyudaAtajos open={ayudaAbierta} onOpenChange={setAyudaAbierta} />

      <MapStatusBar
        lonRef={lonRef}
        latRef={latRef}
        zoomRef={zoomRef}
        zoom={zoom}
        herramienta={etiquetaHerramienta}
      />

      {/* Nombre del elemento bajo el cursor. Las etiquetas del mapa solo salen
          de cerca, así que esto permite reconocer elementos a cualquier zoom.
          Su contenido y posición los escribe el mapa directamente (ver el
          manejador de `pointermove`), sin pasar por el estado de React. */}
      <div
        ref={hoverRef}
        hidden
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-30 mt-[-2rem] rounded-md bg-foreground/90 px-2 py-1 text-[11px] font-medium text-background shadow-lg"
      />

      <MapLegend
        sentido={tool === "sentido"}
        extremos={tool === "cable"}
        trace={hayRecorrido}
        resalte={hayResalte}
        tiposOcultos={tiposOcultos}
        onAlternarTipo={alternarTipoDeRed}
        nivelesOcultos={nivelesOcultos}
        onAlternarNivel={alternarNivel}
      />

      {/* Panel del elemento seleccionado (components/mapa/panel-seleccion.tsx). */}
      {selected && (
        <PanelSeleccion
          seleccionado={selected}
          varios={variosEnElPunto}
          nombre={nameDraft}
          onCambiarNombre={handleNameChange}
          onTerminarNombre={terminarNombre}
          editable={seleccionEditable}
          conectividad={consultaSeleccionada}
          enBase={idMufaSeleccionada !== null}
          onCerrar={closeSelection}
          onGestionarEsquema={handleGestionarEsquema}
          onVerConexiones={handleViewConnections}
          onCentrar={centrarEnSeleccion}
          onInformacion={() => setInfoOpen(true)}
          onQuitar={handleDeleteSelected}
          cables={
            selected.type === "node" && typeof selected.feature.get("id") === "string"
              ? fiberSource
                  .getFeatures()
                  .filter((f) => f.get("id_elem_from") === selected.feature.get("id") || f.get("id_elem_to") === selected.feature.get("id")).length
              : undefined
          }
          tramo={
            selected.type === "fiber"
              ? {
                  origen: typeof selected.feature.get("id_elem_from") === "string" ? nombreDeElemento(selected.feature.get("id_elem_from")) : null,
                  destino: typeof selected.feature.get("id_elem_to") === "string" ? nombreDeElemento(selected.feature.get("id_elem_to")) : null,
                  idOrigen: typeof selected.feature.get("id_elem_from") === "string" ? selected.feature.get("id_elem_from") : null,
                  idDestino: typeof selected.feature.get("id_elem_to") === "string" ? selected.feature.get("id_elem_to") : null,
                }
              : undefined
          }
          onIrA={(id) => {
            // La cubierta (o la cabecera) de una punta del cable: se centra y se abre su ficha.
            const punta = [...nodeSource.getFeatures(), ...cabeceraSource.getFeatures()].find((f) => f.get("id") === id)
            if (punta) enfocarElemento(getUid(punta))
          }}
        />
      )}

      {selected?.type === "node" && (
        <MufaSchemaDialog
          open={schemaOpen}
          onOpenChange={setSchemaOpen}
          mufaName={nameDraft || "Cubierta"}
          // Solo se abre después de traer la conectividad de la base, así que
          // aquí ya está; ya no hay esquema de ejemplo como respaldo.
          schema={esquemaSeleccionado}
        />
      )}

      {selected?.type === "node" && (
        <InfoTableDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title={`Información de la cubierta — ${nameDraft || "Cubierta"}`}
          description="Datos de geo_fiber.cubierta_empalme."
          fieldLabels={MUFA_FIELD_LABELS}
          data={selected.feature.getProperties()}
        />
      )}

      {selected?.type === "fiber" && (
        <InfoTableDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title={`Información del cable — ${nameDraft || "Fibra"}`}
          description="Datos de geo_fiber.cable_fibra."
          fieldLabels={FIBER_FIELD_LABELS}
          nombreDeElemento={nombreDeElemento}
          data={selected.feature.getProperties()}
        />
      )}

      {selected?.type === "cabecera" && (
        <InfoTableDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title={`Información de la cabecera — ${nameDraft || "Cabecera"}`}
          description="Datos de geo_infra.cabecera_central."
          fieldLabels={CABECERA_FIELD_LABELS}
          data={selected.feature.getProperties()}
        />
      )}

      <ConfirmDialog
        open={mufaPendiente !== null}
        icono={Box}
        titulo="¿Agregar esta cubierta?"
        descripcion={`Se colocará «${nombreEnPregunta}» en el punto que marcaste. Queda solo en el mapa: todavía no se guarda en la base de datos.`}
        textoConfirmar="Agregar cubierta"
        onConfirmar={confirmarMufa}
        onCancelar={cancelarMufa}
      />

      {/* El JSON lo arma la base en el momento y lo dibuja el esquemático de
          Dario, dos piezas que se escriben por separado. Si no encajan, el
          fallo se queda en el diagrama en vez de tumbar el mapa entero. */}
      <LimiteDeError
        key={intentoDibujo}
        alFallar={() => {
          setConnectivityOpen(false)
          setIntentoDibujo((n) => n + 1)
          setAvisoConsulta({
            texto: "No se pudo dibujar la conectividad de esta cubierta: el JSON no tiene la forma que espera el esquemático.",
            tono: "error",
          })
        }}
      >
        {/* Ver conexiones es solo lectura: se le indica a Dario con `modo`,
            nunca dentro del JSON (ver lib/map/conectividad.ts). */}
        <MufaConnectivityModal
          open={connectivityOpen}
          onOpenChange={setConnectivityOpen}
          schema={connectivitySchema}
          modo="consulta"
        />
      </LimiteDeError>
    </div>
  )
}

/**
 * El mapa se memoriza. El dashboard se vuelve a pintar al terminar cada paneo o
 * zoom (cambia el centro y, poco después, el nombre del lugar en la cabecera), y
 * el mapa no usa ninguno de los dos: sin esto, cada movimiento repintaba este
 * componente entero dos veces justo al soltar el mapa.
 */
export const NetworkMap = memo(MapaDeRed)
