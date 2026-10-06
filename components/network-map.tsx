"use client"

import { useEffect, useRef, useState, useCallback, memo } from "react"
import "ol/ol.css"
import Map from "ol/Map"
import View from "ol/View"
import TileLayer from "ol/layer/Tile"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import Feature from "ol/Feature"
import Collection from "ol/Collection"
import Point from "ol/geom/Point"
import type Overlay from "ol/Overlay"
import { fromLonLat, toLonLat } from "ol/proj"
import type Draw from "ol/interaction/Draw"
import type Modify from "ol/interaction/Modify"
import type Select from "ol/interaction/Select"
import type Snap from "ol/interaction/Snap"
import DoubleClickZoom from "ol/interaction/DoubleClickZoom"
import { defaults as defaultControls } from "ol/control"
import ScaleLine from "ol/control/ScaleLine"
import type { Geometry } from "ol/geom"
import { createEmpty, extend, isEmpty } from "ol/extent"
import { unByKey } from "ol/Observable"
import { getUid } from "ol/util"
import { Hand, Box, Spline, Hexagon, Trash2, Pencil, Ruler, Square, Loader2, Keyboard } from "lucide-react"
import { LAYER_COLORS } from "@/lib/network-colors"
import { MEASURE_COLOR, destinoStyle, extremoStyle, largoEnKm, marcadorStyle, sentidoStyle } from "@/lib/map/symbology"
import {
  CABECERA_FIELD_LABELS,
  FIBER_FIELD_LABELS,
  MUFA_FIELD_LABELS,
  TYPE_LABELS,
  cabeceraStyle,
  categoriaDeCable,
  categoriaDeMufa,
  colorForFuncionCub,
  fiberStyle,
  fiberWidth,
  measureStyle,
  nodeStyle,
  zoneStyle,
  NOMBRE_VISIBLE,
  type FeatureType,
} from "@/lib/map/symbology"
import { loadRealCabeceras, loadRealFiberCables, loadRealMufas, type ErrorDeCapa } from "@/lib/map/loaders"
import { agrupar, categoriaVisible, type LayerBucket, type NetworkStats } from "@/lib/map/capas"
import { guardarVista, leerVistaGuardada } from "@/lib/map/vista-guardada"
import { DESTELLO_DESTINO, DESTELLO_ELEMENTO, destellar, type ColorRGB } from "@/lib/map/destello"
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
  /** Centra el mapa en un punto. `nonce` permite repetir el mismo destino. */
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
  const [zoneSource] = useState(() => new VectorSource())
  const [cabeceraSource] = useState(() => new VectorSource())
  const [measureSource] = useState(() => new VectorSource())
  // Copias de los cables que pinta «Entradas y salidas». Van en una capa
  // aparte, solo visual: los cables reales no se tocan.
  const [sentidoSource] = useState(() => new VectorSource())
  // Punto rojo sobre el elemento activo (ver el efecto del marcador).
  const [marcadorSource] = useState(() => new VectorSource())
  // Puntas del cable consultado con el botón «Cable».
  const [extremosSource] = useState(() => new VectorSource())
  // Pin del punto buscado (dirección o coordenada).
  const [destinoSource] = useState(() => new VectorSource())
  // OpenStreetMap, o el proveedor configurado en NEXT_PUBLIC_TESELAS_URL.
  const [baseMapSource] = useState(fuenteDelMapaBase)

  const nodeLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const fiberLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const zoneLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const cabeceraLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const measureLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const sentidoLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const marcadorLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const extremosLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const destinoLayer = useRef<VectorLayer<VectorSource> | null>(null)
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
          detalle: `get_json_conectividad_cubierta${resultado.detalle ? ` → ${resultado.detalle}` : ""}`,
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
    if (geometria) marcadorSource.addFeature(new Feature(geometria))
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
    const mufasVisibles = nodeFeatures.filter((f) =>
      categoriaVisible(filtersRef.current?.nodes, categoriaDeMufa(f)),
    )
    const cablesVisibles = fiberFeatures.filter((f) =>
      categoriaVisible(filtersRef.current?.fibers, categoriaDeCable(f)),
    )

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
          color: LAYER_COLORS.fiber,
          // Mismo grosor que en el mapa: un cable de 144 hilos se ve más
          // grueso que uno de 48 también en el panel.
          width: fiberWidth(f.get("cant_hilo") as number | undefined),
        })),
      },
    })

    // Índice para el buscador: nombre, una línea de contexto y los otros
    // textos por los que alguien podría buscarlo (código, UUID…).
    if (onIndiceChangeRef.current) {
      const textos = (f: Feature<Geometry>, campos: string[]) =>
        campos.map((c) => f.get(c)).filter((v): v is string => typeof v === "string" && v.trim() !== "")
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
            textos(f, ["codigo", "nombre", "id"]),
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
  }, [nodeSource, fiberSource, zoneSource, cabeceraSource])

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
        // La longitud medida en campo si la base la tiene; si no, la de la línea del mapa.
        largoM:
          typeof f.get("longitud_medida") === "number" && f.get("longitud_medida") > 0
            ? Math.round(f.get("longitud_medida") * 100) / 100
            : Math.round(largoEnKm(f.getGeometry()) * 1000),
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

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = { enfocarElemento, cableSeleccionado, elegirCable, elegirElemento, abandonarEleccion }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, enfocarElemento, cableSeleccionado, elegirCable, elegirElemento, abandonarEleccion])

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

      const mufasDone = loadRealMufas(nodeSource, isCancelled).then((error) => {
        if (isCancelled()) return
        if (error) {
          setMufaLoadError(error)
          return
        }
        // Encuadra en la zona real donde están las mufas cargadas, en vez de
        // depender de un centro fijo que puede no coincidir con la data.
        if (encuadrar) encuadrarEnDatos()
      })
      const cablesDone = loadRealFiberCables(fiberSource, isCancelled).then((error) => {
        if (error && !isCancelled()) setFiberLoadError(error)
      })
      const cabecerasDone = loadRealCabeceras(cabeceraSource, isCancelled).then((error) => {
        if (error && !isCancelled()) setCabeceraLoadError(error)
      })
      // El indicador se apaga cuando todos los endpoints terminaron, con éxito o no.
      Promise.allSettled([mufasDone, cablesDone, cabecerasDone]).then(() => {
        if (isCancelled()) return
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
      style: ((f: Feature<Geometry>, r: number) =>
        categoriaVisible(filtersRef.current?.fibers, categoriaDeCable(f))
          ? fiberStyle(f, r)
          : undefined) as never,
      declutter: true,
    })
    nodeLayer.current = new VectorLayer({
      source: nodeSource,
      style: ((f: Feature<Geometry>, r: number) =>
        categoriaVisible(filtersRef.current?.nodes, categoriaDeMufa(f))
          ? nodeStyle(f, r)
          : undefined) as never,
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
    extremosLayer.current = new VectorLayer({ source: extremosSource, style: extremoStyle as never })
    destinoLayer.current = new VectorLayer({ source: destinoSource, style: destinoStyle as never })

    const map = new Map({
      target: containerRef.current,
      layers: [
        // El `className` hace que OpenLayers dibuje la capa base en su propio
        // lienzo, y eso permite oscurecerla por CSS en modo oscuro sin tocar
        // los datos de la red (ver globals.css).
        new TileLayer({ source: baseMapSource, className: "gismart-basemap" }),
        zoneLayer.current,
        fiberLayer.current,
        // Encima del tendido, para taparlo mientras dura, y debajo de las
        // mufas, para que la mufa pulsada se siga viendo.
        sentidoLayer.current,
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
        return
      }

      globo.hidden = false
      globo.style.transform = `translate(${pixel[0]}px, ${pixel[1]}px)`

      // El texto solo se rearma cuando cambia el elemento, no en cada píxel.
      if (encontrado !== ultimoResaltado) {
        ultimoResaltado = encontrado
        const tipo = tipoDeFeature(encontrado)
        globo.textContent = tipo
          ? `${TYPE_LABELS[tipo]} · ${(encontrado.get(NOMBRE_VISIBLE) as string) || TYPE_LABELS[tipo]}`
          : ""
      }
    }

    map.on("pointermove", (evt) => {
      // Mientras se arrastra el mapa no interesa lo que hay bajo el cursor.
      if (evt.dragging) {
        if (hoverRef.current) hoverRef.current.hidden = true
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

    // Esc cancela el trazo en curso (mufa, fibra o zona), sin dejar nada a medias.
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") drawRef.current?.abortDrawing()
    }
    window.addEventListener("keydown", handleEscape)

    return () => {
      cancelled = true
      window.removeEventListener("keydown", handleEscape)
      map.setTarget(undefined)
      mapRef.current = null
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
      nodes: [nodeSource, (f: Feature<Geometry>) => categoriaVisible(filtersRef.current?.nodes, categoriaDeMufa(f))],
      fibers: [fiberSource, (f: Feature<Geometry>) => categoriaVisible(filtersRef.current?.fibers, categoriaDeCable(f))],
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

  function handleNameChange(value: string) {
    if (!seleccionEditable) return
    setNameDraft(value)
    selected?.feature.set(NOMBRE_VISIBLE, value)
  }

  function closeSelection() {
    editSelectRef.current?.getFeatures().clear()
    setSelected(null)
    setSchemaOpen(false)
    setInfoOpen(false)
  }

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
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-0.5 rounded-xl bg-card/95 p-1 shadow-lg ring-1 ring-border backdrop-blur">
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
                  className={`flex size-9 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : motivo
                        ? "cursor-not-allowed text-muted-foreground/45 hover:bg-accent/60"
                        : "text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon
                    className="size-[18px]"
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

      <MapLegend sentido={tool === "sentido"} extremos={tool === "cable"} />

      {/* Panel del elemento seleccionado (components/mapa/panel-seleccion.tsx). */}
      {selected && (
        <PanelSeleccion
          seleccionado={selected}
          nombre={nameDraft}
          onCambiarNombre={handleNameChange}
          editable={seleccionEditable}
          conectividad={consultaSeleccionada}
          enBase={idMufaSeleccionada !== null}
          onCerrar={closeSelection}
          onGestionarEsquema={handleGestionarEsquema}
          onVerConexiones={handleViewConnections}
          onCentrar={centrarEnSeleccion}
          onInformacion={() => setInfoOpen(true)}
          onQuitar={handleDeleteSelected}
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
