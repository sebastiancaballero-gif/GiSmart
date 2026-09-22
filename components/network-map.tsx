"use client"

import { useEffect, useRef, useState, useCallback, memo, type ComponentProps, type ComponentType } from "react"
import "ol/ol.css"
import Map from "ol/Map"
import View from "ol/View"
import TileLayer from "ol/layer/Tile"
import OSM from "ol/source/OSM"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import Feature from "ol/Feature"
import LineString from "ol/geom/LineString"
import Polygon from "ol/geom/Polygon"
import Overlay from "ol/Overlay"
import { fromLonLat, toLonLat } from "ol/proj"
import { getLength, getArea } from "ol/sphere"
import { Style, Fill, Stroke, RegularShape } from "ol/style"
import Draw from "ol/interaction/Draw"
import Modify from "ol/interaction/Modify"
import Select from "ol/interaction/Select"
import Snap from "ol/interaction/Snap"
import DoubleClickZoom from "ol/interaction/DoubleClickZoom"
import { click, pointerMove } from "ol/events/condition"
import { defaults as defaultControls } from "ol/control"
import ScaleLine from "ol/control/ScaleLine"
import type { Geometry } from "ol/geom"
import { createEmpty, extend, isEmpty } from "ol/extent"
import { unByKey } from "ol/Observable"
import {
  Hand,
  Box,
  Spline,
  Hexagon,
  Trash2,
  X,
  Pencil,
  Waypoints,
  Network,
  Info,
  Ruler,
  Square,
  Loader2,
  Building2,
  Crosshair,
} from "lucide-react"
import { LAYER_COLORS } from "@/lib/network-colors"
import { MEASURE_COLOR, largoEnKm, marcadorStyle, sentidoStyle } from "@/lib/map/symbology"
import { obtenerCablesDeMufa } from "@/lib/map/cables-de-mufa"
import {
  CABECERA_COLOR,
  CABECERA_FIELD_LABELS,
  FIBER_FIELD_LABELS,
  FIBER_HINT,
  MUFA_FIELD_LABELS,
  TYPE_LABELS,
  cabeceraStyle,
  categoriaDeCable,
  categoriaDeMufa,
  colorForFuncionCub,
  fiberStyle,
  fiberWidth,
  formatArea,
  formatLength,
  isNearNode,
  measureStyle,
  nodeStyle,
  seleccionStyle,
  zoneStyle,
  NOMBRE_VISIBLE,
  type FeatureType,
} from "@/lib/map/symbology"
import { loadRealCabeceras, loadRealFiberCables, loadRealMufas } from "@/lib/map/loaders"
import { agrupar, categoriaVisible, type LayerBucket, type NetworkStats } from "@/lib/map/capas"
import { guardarVista, leerVistaGuardada } from "@/lib/map/vista-guardada"
import { TOOL_HINTS, TOOL_ORDER, type MapTool } from "@/lib/map/herramientas"
import { MufaSchemaDialog } from "@/components/mufa-schema-dialog"
import { MufaConnectivityModal } from "@/components/mufa-connectivity-modal"
import { InfoTableDialog } from "@/components/info-table-dialog"
import { GismartMark } from "@/components/gismart-mark"
import { MapLegend } from "@/components/map-legend"
import { MapNotice, MapNoticeStack } from "@/components/map-notices"
import { MapStatusBar } from "@/components/map-status-bar"
import { LimiteDeError } from "@/components/limite-de-error"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  crearConsultor,
  obtenerConectividad,
  resultadoAGuardar,
  type EstadoConectividad,
  type ModoConectividad,
} from "@/lib/map/conectividad"
import { Tooltip } from "@/components/ui/tooltip"
import type { MufaCampoJSON } from "@/lib/schematic/mufa-field-data"

type NetworkMapProps = {
  center?: [number, number]
  zoom?: number
  className?: string
  visible?: { nodes: boolean; fibers: boolean; zones: boolean; cabeceras: boolean }
  onStatsChange?: (stats: NetworkStats) => void
  /** Se dispara al terminar cada desplazamiento, con el centro actual del mapa. */
  onCenterChange?: (center: { lon: number; lat: number }) => void
  /** Centra el mapa en un punto. `nonce` permite repetir el mismo destino. */
  flyTo?: { lon: number; lat: number; zoom?: number; nonce: number } | null
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
}

type SelectedFeature = {
  feature: Feature<Geometry>
  type: FeatureType
}

/**
 * El modal de conectividad es de Dario y todavía no declara `modo` entre sus
 * props. Se le pasa igual, con el tipo ampliado, para que el dato ya viaje con
 * cada apertura; cuando Dario lo declare, esto sobra y se usa
 * `MufaConnectivityModal` directamente. Su archivo no se toca desde aquí.
 */
const ModalConectividad = MufaConnectivityModal as ComponentType<
  ComponentProps<typeof MufaConnectivityModal> & { modo: ModoConectividad }
>

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
  const [baseMapSource] = useState(() => new OSM())

  const nodeLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const fiberLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const zoneLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const cabeceraLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const measureLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const sentidoLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const marcadorLayer = useRef<VectorLayer<VectorSource> | null>(null)
  const drawRef = useRef<Draw | null>(null)
  const selectRef = useRef<Select | null>(null)
  const deleteHoverRef = useRef<Select | null>(null)
  const editSelectRef = useRef<Select | null>(null)
  const editModifyRef = useRef<Modify | null>(null)
  const fiberSnapRef = useRef<Snap | null>(null)
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
  const [fiberLoadError, setFiberLoadError] = useState<string | null>(null)
  const [mufaLoadError, setMufaLoadError] = useState<string | null>(null)
  const [cabeceraLoadError, setCabeceraLoadError] = useState<string | null>(null)
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
  const [avisoConsulta, setAvisoConsulta] = useState<{ texto: string; cargando?: boolean } | null>(null)
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
  const [loadingData, setLoadingData] = useState(true)
  // La cortina de bienvenida solo cubre el arranque; las recargas posteriores
  // usan el aviso discreto para no tapar el mapa que el usuario está mirando.
  const [firstLoadDone, setFirstLoadDone] = useState(false)

  // Los callbacks se guardan en refs para que los manejadores de OpenLayers,
  // registrados una sola vez, siempre llamen a la versión más reciente sin
  // tener que recrear el mapa. La asignación va en un efecto porque escribir
  // en una ref durante el render es un efecto secundario encubierto.
  const onStatsChangeRef = useRef(onStatsChange)
  const onCenterChangeRef = useRef(onCenterChange)
  const onToolChangeRef = useRef(onToolChange)
  const onLoadingChangeRef = useRef(onLoadingChange)

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
        })
      } else if (resultado.estado === "no-dibujable") {
        setAvisoConsulta({
          texto: `${nombre} tiene conectividad en la base, pero el esquema no se puede dibujar: ${resultado.motivo}.`,
        })
      } else {
        setAvisoConsulta({ texto: resultado.mensaje })
      }
    },
    [pedirConectividad],
  )

  // Elegir una mufa no consulta su conectividad: eso solo lo hace el botón
  // «Conectividad fina». El panel se limita a mostrar lo ya consultado.
  // Punto rojo sobre el elemento activo, para saber cuál es entre muchas mufas
  // juntas: con las herramientas de consulta del ribbon, la mufa que se está
  // consultando; con las demás, el elemento seleccionado. Solo en puntos (mufas
  // y cabeceras): un cable seleccionado ya se resalta entero. El marcador usa la
  // misma geometría que el elemento, así que lo sigue si se mueve al editarlo.
  const enConsulta = tool === "conectividad" || tool === "sentido"
  const marcado = enConsulta ? consultada : (selected?.feature ?? null)
  useEffect(() => {
    marcadorSource.clear()
    const geometria = marcado?.getGeometry()
    if (geometria?.getType() === "Point") marcadorSource.addFeature(new Feature(geometria))
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
  const encuadrarEn = useCallback((extent: number[] | null | undefined, maxZoom = 16) => {
    const view = mapRef.current?.getView()
    if (!view || !extent || !extent.every((v) => Number.isFinite(v))) return
    view.fit(extent, { padding: [80, 80, 80, 80], maxZoom, duration: 400 })
  }, [])

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
      // una mufa fantasma, y el punto rojo marcándola.
      setSelected(null)
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
      })
    },
    [nodeSource, fiberSource, cabeceraSource, encuadrarEnDatos],
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

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (drawRef.current) {
      map.removeInteraction(drawRef.current)
      drawRef.current = null
    }
    if (selectRef.current) {
      map.removeInteraction(selectRef.current)
      selectRef.current = null
    }
    if (deleteHoverRef.current) {
      map.removeInteraction(deleteHoverRef.current)
      deleteHoverRef.current = null
    }
    if (editSelectRef.current) {
      map.removeInteraction(editSelectRef.current)
      editSelectRef.current = null
    }
    if (editModifyRef.current) {
      map.removeInteraction(editModifyRef.current)
      editModifyRef.current = null
    }
    if (fiberSnapRef.current) {
      map.removeInteraction(fiberSnapRef.current)
      fiberSnapRef.current = null
    }
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
    zoomPorDobleClick?.setActive(tool !== "edit" && tool !== "delete" && tool !== "conectividad" && tool !== "sentido")

    // Las interacciones de selección solo deben ver las capas de datos: si no
    // se limitan, también alcanzan los elementos auxiliares que dibujan otras
    // interacciones encima del mapa.
    const capasDeDatos = [
      nodeLayer.current,
      fiberLayer.current,
      zoneLayer.current,
      cabeceraLayer.current,
    ].filter((capa): capa is VectorLayer<VectorSource> => capa !== null)

    // Mufa bajo el puntero, para las dos herramientas del ribbon que se usan
    // pulsando una cubierta.
    const cubiertaEn = (pixel: number[]) =>
      map.forEachFeatureAtPixel(pixel, (f) => f as Feature<Geometry>, {
        layerFilter: (capa) => capa === nodeLayer.current,
        hitTolerance: 6,
      }) ?? null

    if (tool === "sentido") {
      // «Entradas y salidas» (ribbon: Consultas → Red). Pinta los cables de la
      // mufa pulsada en una capa aparte que solo es visual, y quedan pintados
      // hasta pulsar otra mufa (que los reemplaza), pulsar fuera de las mufas
      // o cambiar de herramienta. Mismo reparto que la conectividad fina: se
      // manda el UUID de la cubierta, la función de Carlos dice qué cable
      // entra, cuál sale y de qué color, y aquí solo se dibuja (ver
      // lib/map/cables-de-mufa.ts).
      //
      // Si se pulsan dos mufas seguidas, solo se pinta la última; y nada de lo
      // que llegue después de cambiar de herramienta.
      let consultas = 0
      let activa = true
      const contar = (n: number, palabra: string) => `${n} ${palabra}${n === 1 ? "" : "s"}`

      const claveMover = map.on("pointermove", (evt) => {
        if (evt.dragging || !containerRef.current) return
        containerRef.current.style.cursor = cubiertaEn(evt.pixel) ? "pointer" : "crosshair"
      })

      const claveClick = map.on("singleclick", (evt) => {
        const cubierta = cubiertaEn(evt.pixel)
        // Pulsar otra mufa reemplaza lo pintado; pulsar fuera lo quita.
        sentidoSource.clear()
        setConsultada(cubierta)
        const turno = ++consultas
        if (!cubierta) {
          setAvisoConsulta(null)
          return
        }

        const nombre = (cubierta.get(NOMBRE_VISIBLE) as string | undefined) ?? "La mufa"
        const id = cubierta.get("id")
        if (typeof id !== "string") {
          setAvisoConsulta({ texto: `${nombre} se dibujó en el mapa y no existe en la base: no se sabe qué cables le llegan.` })
          return
        }

        setAvisoConsulta({ texto: `Consultando los cables de ${nombre}…`, cargando: true })
        void obtenerCablesDeMufa(id).then((resultado) => {
          // Mientras llegaba se pulsó otra mufa o se cambió de herramienta.
          if (!activa || turno !== consultas) return
          if (resultado.estado === "error") {
            setAvisoConsulta({ texto: resultado.mensaje })
            return
          }
          if (resultado.cables.length === 0) {
            setAvisoConsulta({ texto: `La base no devolvió cables para ${nombre}.` })
            return
          }

          // La geometría sale de la capa de cables que ya está en el mapa: de la
          // función solo interesan el UUID, el sentido y el color.
          const enElMapa = new globalThis.Map<string, Feature<Geometry>>()
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
            sentidoSource.addFeature(
              new Feature({ geometry: geometria.clone(), sentido: cable.sentido, color: cable.color }),
            )
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

    if (tool === "conectividad") {
      // Consulta de conectividad (ribbon: Consultas → Red → «Conectividad
      // fina»). El flujo lo fijó Aurelio: el usuario elige un elemento; si no
      // es una cubierta no pasa nada; si lo es, se pide su conectividad con el
      // UUID y se abre el esquemático de Dario en modo consulta. Antes se
      // preguntaba «¿Consultar la conectividad?»; se quitó porque el equipo lo
      // consideró un paso de más.

      // Sobre una cubierta el cursor pasa a mano, para ver qué se puede pulsar.
      const claveMover = map.on("pointermove", (evt) => {
        if (evt.dragging || !containerRef.current) return
        containerRef.current.style.cursor = cubiertaEn(evt.pixel) ? "pointer" : "crosshair"
      })

      const claveClick = map.on("singleclick", (evt) => {
        const cubierta = cubiertaEn(evt.pixel)
        // No es una cubierta: no se hace nada.
        if (!cubierta) return
        setConsultada(cubierta)

        const nombre = (cubierta.get(NOMBRE_VISIBLE) as string | undefined) ?? "la mufa"
        const id = cubierta.get("id")
        if (typeof id !== "string") {
          setAvisoConsulta({ texto: `${nombre} se dibujó en el mapa y no existe en la base: no tiene conectividad.` })
          return
        }
        void consultarConectividad(id, nombre)
      })

      return () => unByKey([claveMover, claveClick])
    }

    if (tool === "edit") {
      // En modo "Editar": click para seleccionar un elemento (abre el panel
      // de info) y arrastrar sus vértices para corregir el trazado. "Mover mapa"
      // queda libre solo para desplazarse, sin interceptar clicks.
      const editSelect = new Select({
        condition: click,
        layers: capasDeDatos,
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
        // manejador de vértice que la herramienta de edición dibuja encima de
        // lo seleccionado), se conserva la selección actual en vez de abrir el
        // panel con una ficha vacía.
        if (!type) return
        setSelected({ feature, type })
        setNameDraft((feature.get(NOMBRE_VISIBLE) as string) ?? "")
      })
      map.addInteraction(editSelect)
      editSelectRef.current = editSelect

      const editModify = new Modify({ features: editSelect.getFeatures() })
      map.addInteraction(editModify)
      editModifyRef.current = editModify
    }

    if (tool === "node" || tool === "fiber" || tool === "zone") {
      const cfg = {
        node: { source: nodeSource, type: "Point" as const, prefix: "Mufa" },
        fiber: { source: fiberSource, type: "LineString" as const, prefix: "Fibra" },
        zone: { source: zoneSource, type: "Polygon" as const, prefix: "Zona" },
      }[tool]

      // Sin `source`: el elemento se añade a mano al terminar (ver drawend).
      const draw = new Draw({ type: cfg.type })

      if (tool === "fiber") {
        // La fibra siempre debe unir dos mufas: si no arranca sobre una, se
        // aborta el trazo de inmediato en vez de dejar dibujar al aire.
        draw.on("drawstart", (e) => {
          const start = (e.feature.getGeometry() as LineString).getFirstCoordinate()
          if (!isNearNode(start, nodeSource)) {
            draw.abortDrawing()
            setFiberNotice("Debes iniciar el trazado sobre una mufa.")
            if (fiberNoticeTimeoutRef.current) clearTimeout(fiberNoticeTimeoutRef.current)
            fiberNoticeTimeoutRef.current = setTimeout(() => setFiberNotice(FIBER_HINT), 2800)
          }
        })
      }

      draw.on("drawend", (e) => {
        if (tool === "fiber") {
          const end = (e.feature.getGeometry() as LineString).getLastCoordinate()
          if (!isNearNode(end, nodeSource)) {
            setFiberNotice("Debes terminar el trazado sobre una mufa. Inténtalo de nuevo.")
            if (fiberNoticeTimeoutRef.current) clearTimeout(fiberNoticeTimeoutRef.current)
            fiberNoticeTimeoutRef.current = setTimeout(() => setFiberNotice(FIBER_HINT), 2800)
            return
          }
        }

        const count = cfg.source.getFeatures().length + 1
        e.feature.set(NOMBRE_VISIBLE, `${cfg.prefix} ${count}`)
        // Una mufa recién dibujada no existe en la base, así que no tiene
        // conectividad que consultar. Antes se le ponía el esquema de ejemplo.

        // Se añade aquí y no con la opción `source` del Draw. OpenLayers avisa del
        // fin del dibujo antes de añadir el elemento, así que borrarlo en este
        // punto no servía: el borrado llegaba antes que el alta y un cable que no
        // terminaba en una mufa se quedaba igual. Añadiéndolo a mano, lo inválido
        // simplemente no entra.
        cfg.source.addFeature(e.feature)

        // La mufa ya se ve en su sitio, pero queda pendiente de confirmar.
        if (tool === "node") {
          setNombreEnPregunta(e.feature.get(NOMBRE_VISIBLE) as string)
          setMufaPendiente(e.feature)
        }
      })
      map.addInteraction(draw)
      drawRef.current = draw

      if (tool === "fiber") {
        // Se agrega después del Draw para que el snap ajuste el punto justo
        // antes de que Draw lo use (según la documentación de OpenLayers).
        const snap = new Snap({ source: nodeSource })
        map.addInteraction(snap)
        fiberSnapRef.current = snap
      }
    }

    if (tool === "delete") {
      // Resalta en rojo la geometría bajo el cursor antes de borrarla,
      // para que el usuario vea qué va a eliminar antes de hacer click.
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
      const hover = new Select({
        condition: pointerMove,
        style: hoverStyle,
        layers: capasDeDatos,
      })
      map.addInteraction(hover)
      deleteHoverRef.current = hover

      const select = new Select({ condition: click, layers: capasDeDatos })
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

    if (tool === "measure-length" || tool === "measure-area") {
      // Medición "en el aire": no depende de mufas ni cables reales, solo
      // dibuja una geometría temporal y muestra distancia/área en vivo.
      const geomType = tool === "measure-length" ? "LineString" : "Polygon"
      const draw = new Draw({ source: measureSource, type: geomType })

      draw.on("drawstart", (e) => {
        const tooltipEl = document.createElement("div")
        tooltipEl.style.cssText =
          "background:#0f172a;color:#fff;padding:2px 8px;border-radius:6px;font:600 12px Inter, sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;"
        const tooltipOverlay = new Overlay({
          element: tooltipEl,
          offset: [0, -8],
          positioning: "bottom-center",
          stopEvent: false,
        })
        map.addOverlay(tooltipOverlay)
        measureOverlaysRef.current.push(tooltipOverlay)

        const geom = e.feature.getGeometry()
        geom?.on("change", () => {
          if (tool === "measure-length") {
            const line = geom as LineString
            tooltipEl.textContent = formatLength(getLength(line))
            tooltipOverlay.setPosition(line.getLastCoordinate())
          } else {
            const poly = geom as Polygon
            tooltipEl.textContent = formatArea(getArea(poly))
            tooltipOverlay.setPosition(poly.getInteriorPoint().getCoordinates())
          }
        })

        draw.once("drawend", () => {
          tooltipEl.style.background = "#334155"
        })
        draw.once("drawabort", () => {
          map.removeOverlay(tooltipOverlay)
          measureOverlaysRef.current = measureOverlaysRef.current.filter((o) => o !== tooltipOverlay)
        })
      })

      map.addInteraction(draw)
      drawRef.current = draw
    }
  }, [
    tool,
    nodeSource,
    fiberSource,
    zoneSource,
    cabeceraSource,
    measureSource,
    sentidoSource,
    tipoDeFeature,
    consultarConectividad,
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

  // Centrar el mapa en el resultado del buscador.
  useEffect(() => {
    if (!flyTo) return
    const view = mapRef.current?.getView()
    if (!view) return
    view.animate({
      center: fromLonLat([flyTo.lon, flyTo.lat]),
      zoom: flyTo.zoom ?? 15,
      duration: 600,
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

      const indice = Number(e.key) - 1
      const herramienta = TOOL_ORDER[indice]
      if (herramienta) setTool(herramienta)
    }
    window.addEventListener("keydown", alPulsarTecla)
    return () => window.removeEventListener("keydown", alPulsarTecla)
  }, [setTool])

  const tools: { id: MapTool; label: string; icon: typeof Hand; color?: string; separator?: boolean }[] = [
    { id: "pan", label: "Mover mapa", icon: Hand },
    { id: "edit", label: "Editar elementos", icon: Pencil },
    { id: "node", label: "Dibujar mufa", icon: Box, color: LAYER_COLORS.node },
    { id: "fiber", label: "Trazar fibra", icon: Spline, color: LAYER_COLORS.fiber },
    { id: "zone", label: "Zona de cobertura", icon: Hexagon, color: LAYER_COLORS.zone },
    { id: "delete", label: "Eliminar geometría", icon: Trash2 },
    { id: "measure-length", label: "Medir distancia", icon: Ruler, color: MEASURE_COLOR, separator: true },
    { id: "measure-area", label: "Medir área", icon: Square, color: MEASURE_COLOR },
  ]

  function clearMeasurements() {
    measureSource.clear()
    const map = mapRef.current
    if (map) measureOverlaysRef.current.forEach((o) => map.removeOverlay(o))
    measureOverlaysRef.current = []
    drawRef.current?.abortDrawing()
  }

  const TYPE_ICONS: Record<FeatureType, typeof Box> = {
    node: Box,
    fiber: Spline,
    zone: Hexagon,
    cabecera: Building2,
  }


  function handleNameChange(value: string) {
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
    if (!selected) return
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

  /**
   * Estado de «Ver conexiones» para la mufa elegida en el panel:
   *
   * - `sin-consultar`: todavía no se consultó con «Conectividad fina».
   * - `disponible`: consultada y con cables; el esquemático la puede dibujar.
   * - `sin-conectividad`: consultada, pero la base respondió sin cables.
   * - `no-dibujable`: consultada y con cables, pero el esquemático la rechaza.
   * - `no-en-base`: mufa dibujada a mano, sin UUID que consultar.
   * - `error`: la consulta falló (red, permisos).
   */
  const consultaSeleccionada = idMufaSeleccionada ? conectividades[idMufaSeleccionada] : undefined
  const estadoConexiones =
    selected?.type !== "node"
      ? null
      : !idMufaSeleccionada
        ? "no-en-base"
        : (consultaSeleccionada?.estado ?? "sin-consultar")
  // «Gestionar esquema» sigue la misma regla que «Ver conexiones»: solo con
  // conectividad. Sin cables, la función devuelve igual los divisores de la
  // cubierta (su equipo físico) con cables y conectividades vacíos, y eso se
  // leía como si la mufa ya tuviera un esquema cuando no lo tiene.
  const esquemaSeleccionado =
    consultaSeleccionada?.estado === "disponible" ? consultaSeleccionada.esquema : null

  /** Por qué «Ver conexiones» está en gris, para escribirlo debajo del botón. */
  const motivoSinConexiones = ((): string | null => {
    if (estadoConexiones === "sin-consultar") {
      return "Sin conectividad consultada. Usa el botón «Conectividad fina» (menú Consultas)."
    }
    if (estadoConexiones === "no-en-base") return "Esta mufa se dibujó en el mapa y no existe en la base."
    switch (consultaSeleccionada?.estado) {
      case "sin-conectividad":
        return "La base todavía no tiene cables registrados para esta cubierta."
      case "no-dibujable":
        return `Tiene conectividad, pero el esquema no se puede dibujar: ${consultaSeleccionada.motivo}.`
      case "error":
        return `${consultaSeleccionada.mensaje} Vuelve a consultarla con «Conectividad fina».`
      default:
        return null
    }
  })()

  function handleViewConnections() {
    if (consultaSeleccionada?.estado !== "disponible") return
    setConnectivitySchema(consultaSeleccionada.esquema)
    setConnectivityOpen(true)
  }

  /**
   * Para la ficha: nombre de una mufa o cabecera a partir de su UUID. Así el
   * origen y el destino de un cable se leen «CO02» y no como un UUID.
   */
  function nombreDeElemento(id: string): string | null {
    for (const fuente of [nodeSource, cabeceraSource]) {
      const encontrado = fuente.getFeatures().find((f) => f.get("id") === id)
      if (encontrado) return (encontrado.get(NOMBRE_VISIBLE) as string | undefined) ?? null
    }
    return null
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

  // Nombres de las capas que no pudieron cargar, para un único aviso.
  const capasSinDatos = [
    mufaLoadError ? "Mufas" : null,
    fiberLoadError ? "Tendido de fibra" : null,
    cabeceraLoadError ? "Cabeceras" : null,
  ].filter((capa): capa is string => capa !== null)

  function descartarAvisosDeCarga() {
    setMufaLoadError(null)
    setFiberLoadError(null)
    setCabeceraLoadError(null)
  }

  const selectedLength =
    selected?.type === "fiber"
      ? getLength(selected.feature.getGeometry() as LineString) / 1000
      : null

  return (
    <div className={`relative size-full ${className ?? ""}`}>
      <div
        ref={containerRef}
        /* Los controles propios de OpenLayers se reestilizan acá para que
           coincidan con los botones de la aplicación. */
        className="size-full
          [&_.ol-zoom]:!left-auto [&_.ol-zoom]:!right-3 [&_.ol-zoom]:!top-3
          [&_.ol-zoom]:flex [&_.ol-zoom]:flex-col [&_.ol-zoom]:gap-0.5
          [&_.ol-zoom]:rounded-xl [&_.ol-zoom]:bg-card/95 [&_.ol-zoom]:p-1
          [&_.ol-zoom]:shadow-lg [&_.ol-zoom]:ring-1 [&_.ol-zoom]:ring-border
          [&_.ol-zoom]:backdrop-blur
          [&_.ol-zoom_button]:!m-0 [&_.ol-zoom_button]:size-9
          [&_.ol-zoom_button]:!rounded-lg [&_.ol-zoom_button]:!bg-transparent
          [&_.ol-zoom_button]:!text-base [&_.ol-zoom_button]:!font-medium
          [&_.ol-zoom_button]:!text-foreground
          [&_.ol-zoom_button:hover]:!bg-accent
          [&_.ol-scale-bar]:!bottom-14 [&_.ol-scale-bar]:!left-3
          [&_.ol-scale-bar]:rounded-md [&_.ol-scale-bar]:bg-card/90
          [&_.ol-scale-bar]:px-1.5 [&_.ol-scale-bar]:py-1
          [&_.ol-scale-bar]:shadow-md [&_.ol-scale-bar]:ring-1
          [&_.ol-scale-bar]:ring-border [&_.ol-scale-bar]:backdrop-blur
          [&_.ol-scale-text]:!bottom-auto [&_.ol-scale-text]:!text-foreground
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset
          focus-visible:ring-ring/60"
        // OpenLayers trae desplazamiento y zoom por teclado, pero solo actúan
        // cuando el mapa tiene el foco. Sin `tabIndex` el contenedor no podía
        // recibirlo, así que las flechas y +/- nunca hacían nada.
        tabIndex={0}
        role="application"
        aria-label="Mapa interactivo de la red de fibra. Con el foco puesto, las flechas desplazan y + o − acercan y alejan."
      />

      {/* Cortina del primer arranque: evita mostrar un mapa vacío mientras
          llegan las capas, que se leía como si no hubiera datos. */}
      {!firstLoadDone && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm">
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
              <span className="font-semibold">{capasSinDatos.join(", ")}</span>. El resto del
              mapa funciona normalmente.
            </span>
          </MapNotice>
        )}

        {baseMapError && (
          <MapNotice tono="aviso">
            No se pudo cargar la cartografía de fondo. Los datos de la red sí se muestran.
          </MapNotice>
        )}

        {fiberNotice && <MapNotice tono="aviso">{fiberNotice}</MapNotice>}

        {avisoConsulta && (
          <MapNotice
            tono={avisoConsulta.cargando ? "neutral" : "aviso"}
            cargando={avisoConsulta.cargando}
            onCerrar={avisoConsulta.cargando ? undefined : () => setAvisoConsulta(null)}
          >
            <span>{avisoConsulta.texto}</span>
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
          return (
            <span key={t.id} className="flex flex-col gap-0.5">
              {t.separator && <span className="mx-1 my-1 h-px bg-border" />}
              <Tooltip label={`${t.label} (${TOOL_ORDER.indexOf(t.id) + 1})`}>
                <button
                  type="button"
                  onClick={() => setTool(t.id)}
                  aria-label={t.label}
                  aria-keyshortcuts={String(TOOL_ORDER.indexOf(t.id) + 1)}
                  aria-pressed={active}
                  className={`flex size-9 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon
                    className="size-[18px]"
                    style={!active && t.color ? { color: t.color } : undefined}
                  />
                </button>
              </Tooltip>
            </span>
          )
        })}
      </div>

      <MapStatusBar
        lonRef={lonRef}
        latRef={latRef}
        zoomRef={zoomRef}
        zoom={zoom}
        herramienta={tools.find((t) => t.id === tool)?.label ?? (tool === "conectividad" ? "Consulta de conectividad" : tool === "sentido" ? "Entradas y salidas" : "")}
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

      <MapLegend sentido={tool === "sentido"} />

      {/* Panel de información del elemento seleccionado */}
      {selected && (
        <div className="absolute right-3 top-20 z-20 w-64 animate-gismart-fade-in rounded-xl bg-card/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {(() => {
                const Icon = TYPE_ICONS[selected.type]
                return <Icon className="size-3.5" style={{ color: LAYER_COLORS[selected.type] }} />
              })()}
              {TYPE_LABELS[selected.type]}
            </div>
            <button
              type="button"
              onClick={closeSelection}
              className="rounded-md p-1 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Cerrar panel"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <label htmlFor="feature-nombre" className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
            <Pencil className="size-3" />
            Nombre
          </label>
          <input
            id="feature-nombre"
            type="text"
            value={nameDraft}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
          />

          {selectedLength !== null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Longitud: <span className="font-semibold tabular-nums text-primary">{selectedLength.toFixed(2)} km</span>
            </p>
          )}

          {/* Los dos botones solo se activan después de consultar la mufa con
              «Conectividad fina»: elegirla no pregunta a la base. */}
          {selected.type === "node" && (
            <button
              type="button"
              onClick={handleGestionarEsquema}
              disabled={!esquemaSeleccionado}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              <Waypoints className="size-3.5" />
              Gestionar esquema
            </button>
          )}

          {/* En gris hasta consultar, y también cuando la consulta no trajo
              cables: así no se abre un diagrama que va a fallar. */}
          {selected.type === "node" && (
            <button
              type="button"
              onClick={handleViewConnections}
              disabled={estadoConexiones !== "disponible"}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted"
            >
              <Network className="size-3.5" />
              {estadoConexiones === "sin-conectividad" ? "Sin conectividad" : "Ver conexiones"}
            </button>
          )}

          {/* Por qué está en gris. El botón deshabilitado no muestra
              etiqueta emergente, así que la razón va escrita debajo. */}
          {selected.type === "node" && motivoSinConexiones !== null && (
            <p
              role="status"
              className={`mt-1.5 flex items-start gap-1.5 px-0.5 text-[11px] leading-snug ${
                estadoConexiones === "error" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
              }`}
            >
              <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
              <span>{motivoSinConexiones}</span>
            </p>
          )}

          {/* Tras filtrar o buscar, lo seleccionado puede quedar fuera de la
              vista: esto lo trae al centro sin tener que buscarlo a mano. */}
          <button
            type="button"
            onClick={centrarEnSeleccion}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Crosshair className="size-3.5" />
            Centrar en el mapa
          </button>

          {(selected.type === "node" || selected.type === "fiber" || selected.type === "cabecera") && (
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Info className="size-3.5" />
              Ver información
            </button>
          )}

          <button
            type="button"
            onClick={handleDeleteSelected}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 py-1.5 text-xs font-semibold text-destructive outline-none transition hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Trash2 className="size-3.5" />
            Eliminar
          </button>
        </div>
      )}

      {selected?.type === "node" && (
        <MufaSchemaDialog
          open={schemaOpen}
          onOpenChange={setSchemaOpen}
          mufaName={nameDraft || "Mufa"}
          // Solo se abre después de traer la conectividad de la base, así que
          // aquí ya está; ya no hay esquema de ejemplo como respaldo.
          schema={esquemaSeleccionado}
        />
      )}

      {selected?.type === "node" && (
        <InfoTableDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title={`Información de la cubierta — ${nameDraft || "Mufa"}`}
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
        titulo="¿Agregar esta mufa?"
        descripcion={`Se colocará «${nombreEnPregunta}» en el punto que marcaste. Queda solo en el mapa: todavía no se guarda en la base de datos.`}
        textoConfirmar="Agregar mufa"
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
            texto: "No se pudo dibujar la conectividad de esta mufa: el JSON no tiene la forma que espera el esquemático.",
          })
        }}
      >
        {/* Ver conexiones es solo lectura: se le indica a Dario con `modo`,
            nunca dentro del JSON (ver lib/map/conectividad.ts). */}
        <ModalConectividad
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
