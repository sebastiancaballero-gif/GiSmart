import type Feature from "ol/Feature"
import type { Geometry } from "ol/geom"
import LineString from "ol/geom/LineString"
import Point from "ol/geom/Point"
import type VectorSource from "ol/source/Vector"
import { getLength } from "ol/sphere"
import { Style, Fill, Stroke, RegularShape, Circle as CircleStyle, Text as TextStyle } from "ol/style"

import { LAYER_COLORS } from "@/lib/network-colors"

/**
 * Simbología del mapa de red: colores, símbolos y etiquetas de cada capa.
 *
 * Vive aparte del componente porque son reglas de negocio visuales (heredadas
 * de SIGETP y acordadas con el ingeniero de red), no lógica de interfaz, y así
 * se pueden cambiar sin abrir el mapa entero.
 */

export type FeatureType = "node" | "fiber" | "zone" | "cabecera"

export const TYPE_LABELS: Record<FeatureType, string> = {
  node: "Mufa",
  fiber: "Fibra",
  zone: "Zona",
  cabecera: "Cabecera central",
}

const COLORS = LAYER_COLORS

// La cabecera central es el punto de origen de la red: se dibuja más grande que
// las mufas y con su propio símbolo (círculo con triángulo inscrito).
export const CABECERA_COLOR = LAYER_COLORS.cabecera
const CABECERA_SYMBOL_RADIUS = 11

// Campos que muestra el modal "Ver información" (identify) de cada elemento,
// con la etiqueta legible de cada columna de la base.
export const MUFA_FIELD_LABELS: Record<string, string> = {
  id: "ID",
  etiqueta: "Etiqueta",
  tipo_carcasa: "Tipo de carcasa",
  funcion_cub: "Función",
  tipo_empalme: "Tipo de empalme",
  cod_fabricante: "Fabricante",
  tipo_instala: "Tipo de instalación",
  estado_const: "Estado",
  id_proyecto: "Proyecto",
  direccion: "Dirección",
  ubicacion: "Ubicación",
  capacidad_bandejas: "Capacidad de bandejas",
  fecha_creacion: "Creado",
  fecha_ult_act: "Última actualización",
}

// El orden no sigue el de las columnas de la base, sino el de consulta en
// campo: primero identificar el cable, luego sus características, y la
// longitud al final.
export const FIBER_FIELD_LABELS: Record<string, string> = {
  etq_naps: "Etiqueta NAP",
  nombre: "Nombre",
  codigo: "Código",
  id: "ID",
  estado_const: "Estado",
  id_proyecto: "Proyecto",
  tip_elem_from: "Tipo de elemento origen",
  id_elem_from: "Elemento origen",
  tip_elem_to: "Tipo de elemento destino",
  id_elem_to: "Elemento destino",
  tipo_red_prin: "Tipo de red",
  tipo_fibra: "Tipo de fibra",
  cant_hilo: "Cantidad de hilos",
  cant_buff: "Cantidad de buffers",
  atenuacion_1490: "Atenuación 1490nm (dB/km)",
  atenuacion_1550: "Atenuación 1550nm (dB/km)",
  tipo_cable: "Tipo de cable",
  tipo_instala: "Tipo de instalación",
  marca: "Marca",
  modelo: "Modelo",
  cod_fabricante: "Fabricante",
  longitud_medida: "Longitud medida (m)",
  longitud_calc: "Longitud calculada (m)",
}

export const CABECERA_FIELD_LABELS: Record<string, string> = {
  etiqueta: "Etiqueta",
  nombre: "Nombre",
  codigo: "Código",
  tipo_est_const: "Estado de construcción",
  id_proyecto: "Proyecto",
  direccion_catastral: "Dirección catastral",
  desc_capacidad: "Capacidad",
  id: "ID",
  id_legacy: "ID en el sistema anterior",
  creado_en: "Creado",
  actualizado_en: "Última actualización",
}

// Color de la mufa según `funcion_cub` (pedido del ingeniero de red), dentro
// de la paleta que ya usa SIGETP para la red de fibra.
export const FUNCION_CUB_COLORS: Record<string, string> = {
  "Segundo nivel": "#c2185b",
  "Primer nivel": "#1d4ed8",
  "Empalme pasivo": "#ea580c",
}
export const FUNCION_CUB_DEFAULT_COLOR = "#64748b"

export function colorForFuncionCub(funcionCub: string | undefined | null): string {
  if (!funcionCub) return FUNCION_CUB_DEFAULT_COLOR
  return FUNCION_CUB_COLORS[funcionCub] ?? FUNCION_CUB_DEFAULT_COLOR
}

/**
 * Categoría de cada elemento dentro de su capa. La usan tanto el desglose del
 * panel como el filtro del mapa: al ser la misma función, las etiquetas del
 * panel siempre coinciden con lo que el filtro deja ver.
 */
export function categoriaDeMufa(feature: Feature<Geometry>): string {
  return (feature.get("funcion_cub") as string | null) || "Otro / sin dato"
}

export function categoriaDeCable(feature: Feature<Geometry>): string {
  const hilos = feature.get("cant_hilo") as number | null
  return hilos ? `${hilos} hilos` : "Sin dato de hilos"
}

// SIGETP separa la fibra troncal (azul) de la de distribución (magenta). Hoy
// `tipo_red_prin` llega vacío en los 182 cables de la BD, así que el mapeo
// queda listo y mientras tanto se usa el color por defecto de la capa.
export const TIPO_RED_COLORS: Record<string, string> = {
  TRONCAL: "#1e3a8a",
  DISTRIBUCION: "#c2185b",
  DISTRIBUCIÓN: "#c2185b",
}

export function colorForTipoRed(tipoRed: string | undefined | null): string {
  if (!tipoRed) return COLORS.fiber
  return TIPO_RED_COLORS[tipoRed.toUpperCase()] ?? COLORS.fiber
}

// Resoluciones (m/px) a partir de las cuales se ocultan las etiquetas: con 185
// mufas y 182 cables en pantalla, rotularlos siempre satura el mapa al alejar.
export const MUFA_LABEL_MAX_RESOLUTION = 2.5
export const FIBER_LABEL_MAX_RESOLUTION = 5

export const FIBER_HINT =
  "Click sobre una mufa para iniciar el trazado y sobre otra para terminarlo. Esc cancela. No se guarda en la base todavía."

// La fibra siempre debe unir dos mufas: exige que el punto quede exactamente
// sobre una (el Snap hacia nodeSource hace que esto sea fácil de lograr).
export function isNearNode(coord: number[], nodeSource: VectorSource, epsilon = 1): boolean {
  return nodeSource.getFeatures().some((f) => {
    const geom = f.getGeometry()
    if (!(geom instanceof Point)) return false
    const [x, y] = geom.getCoordinates()
    return Math.abs(x - coord[0]) < epsilon && Math.abs(y - coord[1]) < epsilon
  })
}

export const MUFA_SYMBOL_RADIUS = 7

// Simbología heredada de SIGETP: la cubierta de empalme es un círculo blanco
// con una cruz inscrita, en el color que corresponde a su `funcion_cub`.
/**
 * Radio del símbolo según el zoom. Las 185 mufas están concentradas en el casco
 * urbano: a tamaño fijo se encinan en una mancha ilegible al alejar, así que el
 * símbolo se encoge y a partir de cierta distancia queda un punto simple.
 */
function radioSegunResolucion(base: number, resolution: number): number {
  if (resolution <= 4) return base
  if (resolution <= 12) return base * 0.7
  return base * 0.45
}

/**
 * Jerarquía de la mufa dentro de la red.
 *
 * 162 de las 185 son de segundo nivel, así que las 21 de primer nivel —las
 * importantes— quedaban sepultadas entre la masa. Se dibujan algo más grandes
 * y por encima, de modo que la jerarquía de la red se lea de un vistazo sin
 * cambiar los colores acordados con el ingeniero.
 */
function jerarquiaDeMufa(funcionCub: string | undefined | null): { escala: number; zIndex: number } {
  if (funcionCub === "Primer nivel") return { escala: 1.3, zIndex: 3 }
  if (funcionCub === "Empalme pasivo") return { escala: 1.15, zIndex: 2 }
  return { escala: 1, zIndex: 1 }
}

/**
 * Caché de los símbolos.
 *
 * OpenLayers llama a la función de estilo por cada elemento en cada redibujado:
 * con 368 elementos eso significaba crear cerca de mil objetos `Style`, `Fill`
 * y `Stroke` en cada paneo o zoom, y el navegador se iba en recolectar basura.
 *
 * Los símbolos dependen solo de color, radio y grosor —una veintena de
 * combinaciones en total— así que se construyen una vez y se reutilizan. Las
 * etiquetas no se cachean: su texto cambia por elemento y compartir el objeto
 * haría que todas mostraran lo mismo.
 */
const cacheSimbolos = new Map<string, Style[]>()

function simbolosCacheados(clave: string, crear: () => Style[]): Style[] {
  const guardados = cacheSimbolos.get(clave)
  if (guardados) return guardados
  const nuevos = crear()
  cacheSimbolos.set(clave, nuevos)
  return nuevos
}

export function nodeStyle(feature: Feature<Geometry>, resolution: number) {
  const label = (feature.get("nombre") as string) ?? "Mufa"
  const funcionCub = feature.get("funcion_cub") as string | undefined
  const color = colorForFuncionCub(funcionCub)
  const { escala, zIndex } = jerarquiaDeMufa(funcionCub)
  const radius = radioSegunResolucion(MUFA_SYMBOL_RADIUS, resolution) * escala
  // La cruz interior solo se dibuja cuando hay espacio para que se distinga.
  const conCruz = resolution <= 12

  // `declutterMode: "none"` mantiene visible el símbolo aunque se solape: en un
  // SIG esconder elementos sería esconder datos. El descarte por solapamiento
  // se deja solo para las etiquetas.
  const simbolos = simbolosCacheados(`mufa|${color}|${radius}|${conCruz}`, () => {
    const base = [
      // Halo blanco exterior: despega el símbolo del fondo cartográfico. Sin
      // él, con 185 mufas juntas el conjunto se leía como una mancha continua.
      new Style({
        zIndex,
        image: new CircleStyle({
          radius: radius + 1.5,
          fill: new Fill({ color: "rgba(255, 255, 255, 0.95)" }),
          declutterMode: "none",
        }),
      }),
      new Style({
        zIndex,
        image: new CircleStyle({
          radius,
          fill: new Fill({ color: "#ffffff" }),
          stroke: new Stroke({ color, width: radius >= MUFA_SYMBOL_RADIUS ? 2 : 1.5 }),
          declutterMode: "none",
        }),
      }),
    ]

    if (conCruz) {
      // RegularShape con radius2 = 0 colapsa las puntas en aspas: la cruz.
      base.push(
        new Style({
          zIndex,
          image: new RegularShape({
            points: 4,
            radius,
            radius2: 0,
            angle: 0,
            stroke: new Stroke({ color, width: 1.5 }),
            declutterMode: "none",
          }),
        }),
      )
    }
    return base
  })

  // Sin etiqueta se devuelve el arreglo cacheado tal cual: ni siquiera se
  // copia, que es el caso más frecuente al trabajar con el mapa alejado.
  if (resolution > MUFA_LABEL_MAX_RESOLUTION) return simbolos

  return [
    ...simbolos,
    new Style({
      text: new TextStyle({
        text: label,
        offsetY: -(radius + 9),
        font: "600 11px Inter, sans-serif",
        fill: new Fill({ color: "#0f172a" }),
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
      }),
    }),
  ]
}

// Cabecera central: círculo con un triángulo inscrito, más grande que la mufa
// para que se lea como el origen de la red. Su etiqueta se muestra siempre,
// porque son muy pocas y conviene ubicarlas de un vistazo.
export function cabeceraStyle(feature: Feature<Geometry>, resolution: number) {
  const label = (feature.get("nombre") as string) ?? "Cabecera"
  const radius = radioSegunResolucion(CABECERA_SYMBOL_RADIUS, resolution)
  return [
    // Mismo halo que la mufa, algo mayor por ser el elemento más importante.
    new Style({
      image: new CircleStyle({
        radius: radius + 2.5,
        fill: new Fill({ color: "rgba(255, 255, 255, 0.95)" }),
        declutterMode: "none",
      }),
    }),
    new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: "#ffffff" }),
        stroke: new Stroke({ color: CABECERA_COLOR, width: 2.5 }),
        declutterMode: "none",
      }),
    }),
    new Style({
      image: new RegularShape({
        points: 3,
        radius: radius - 4,
        angle: 0,
        fill: new Fill({ color: CABECERA_COLOR }),
        declutterMode: "none",
      }),
    }),
    new Style({
      text: new TextStyle({
        text: label,
        offsetY: -(radius + 10),
        font: "700 12px Inter, sans-serif",
        fill: new Fill({ color: "#064e3b" }),
        stroke: new Stroke({ color: "#ffffff", width: 3.5 }),
        // La cabecera manda sobre cualquier etiqueta de mufa que la estorbe.
        declutterMode: "obstacle",
      }),
    }),
  ]
}

// Un cable con más hilos es físicamente más grueso: se refleja en el ancho
// del trazo (pedido: "que se vea físico"), acotado para que siga siendo legible.
export function fiberWidth(cantHilo: number | null | undefined): number {
  if (!cantHilo || cantHilo <= 0) return 2.5
  return Math.min(7, Math.max(2, 2 + cantHilo / 12))
}

export function fiberStyle(feature: Feature<Geometry>, resolution: number) {
  const width = fiberWidth(feature.get("cant_hilo") as number | undefined)
  const color = colorForTipoRed(feature.get("tipo_red_prin") as string | undefined)

  const trazos = simbolosCacheados(`cable|${color}|${width}`, () => [
    // Contorno blanco por debajo del trazo (la "camisa" de la cartografía
    // clásica): separa el cable de las calles del mapa base, que suelen ser
    // del mismo grosor y tono, y hace legibles los cruces entre cables.
    new Style({
      stroke: new Stroke({
        color: "rgba(255, 255, 255, 0.85)",
        width: width + 3,
        lineCap: "round",
        lineJoin: "round",
      }),
    }),
    new Style({
      stroke: new Stroke({ color, width, lineCap: "round", lineJoin: "round" }),
    }),
  ])

  // Sin etiquetas (mapa alejado) no hace falta ni medir la geometría ni copiar
  // el arreglo: se devuelve el trazo cacheado directamente.
  if (resolution > FIBER_LABEL_MAX_RESOLUTION) return trazos

  const styles = [...trazos]
  const geom = feature.getGeometry() as LineString
  const km = geom ? getLength(geom) / 1000 : 0

  {
    const etiquetaNap = feature.get("etq_naps") as string | null

    // En placement "line" el desplazamiento vertical se controla con
    // `textBaseline`: "bottom" deja el texto sobre la línea y "top" debajo.
    //
    // `overflow: true` es imprescindible acá: por defecto OpenLayers descarta
    // el rótulo completo si no cabe en el largo del trazo, y la mayoría de
    // estos cables mide menos de 100 m. Con la resolución a la que aparecen
    // las etiquetas eso son ~18 px en pantalla: cabía "2" pero no "0.09 km",
    // así que las longitudes no se dibujaban nunca en los tramos cortos.
    if (etiquetaNap) {
      styles.push(
        new Style({
          text: new TextStyle({
            text: String(etiquetaNap),
            placement: "line",
            textBaseline: "bottom",
            overflow: true,
            font: "700 11px Inter, sans-serif",
            fill: new Fill({ color }),
            stroke: new Stroke({ color: "#ffffff", width: 3.5 }),
          }),
        }),
      )
    }

    // Los tramos cortos se miden en metros: "85 m" ocupa la mitad que
    // "0.09 km" y además es lo que se usa en campo para esas distancias.
    const longitud = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`

    styles.push(
      new Style({
        text: new TextStyle({
          text: longitud,
          placement: "line",
          textBaseline: "top",
          overflow: true,
          font: "600 10px Inter, sans-serif",
          fill: new Fill({ color: "#475569" }),
          stroke: new Stroke({ color: "#ffffff", width: 3 }),
        }),
      }),
    )
  }

  return styles
}

/**
 * Resalte del elemento seleccionado.
 *
 * Antes la selección solo abría el panel lateral: sobre un mapa con 185 mufas
 * juntas no había forma de saber cuál de todas era. Se dibuja un halo bajo el
 * símbolo normal, así que el elemento no cambia de aspecto, solo se destaca.
 */
const SELECCION_COLOR = "rgba(37, 99, 235, 0.30)"

export function seleccionStyle(feature: Feature<Geometry>, resolution: number, tipo: string) {
  const halo =
    tipo === "fiber"
      ? new Style({
          stroke: new Stroke({
            color: SELECCION_COLOR,
            width: fiberWidth(feature.get("cant_hilo") as number | undefined) + 12,
            lineCap: "round",
            lineJoin: "round",
          }),
        })
      : new Style({
          image: new CircleStyle({
            radius: (tipo === "cabecera" ? CABECERA_SYMBOL_RADIUS : MUFA_SYMBOL_RADIUS) + 9,
            fill: new Fill({ color: SELECCION_COLOR }),
            declutterMode: "none",
          }),
          fill: new Fill({ color: SELECCION_COLOR }),
        })

  const base =
    tipo === "node"
      ? nodeStyle(feature, resolution)
      : tipo === "fiber"
        ? fiberStyle(feature, resolution)
        : tipo === "cabecera"
          ? cabeceraStyle(feature, resolution)
          : [zoneStyle(feature)]

  return [halo, ...base]
}

// Color de acento para la herramienta de medición (distancia/área "en el
// aire", sin necesidad de mufas ni fibra real de por medio).
export const MEASURE_COLOR = "#0ea5e9"

export function measureStyle(feature: Feature<Geometry>) {
  const isPolygon = feature.getGeometry()?.getType() === "Polygon"
  return new Style({
    fill: new Fill({ color: "rgba(14, 165, 233, 0.15)" }),
    stroke: new Stroke({ color: MEASURE_COLOR, width: 2, lineDash: isPolygon ? undefined : [8, 6] }),
  })
}

export function formatLength(lengthM: number): string {
  return lengthM >= 1000 ? `${(lengthM / 1000).toFixed(2)} km` : `${lengthM.toFixed(1)} m`
}

export function formatArea(areaM2: number): string {
  if (areaM2 >= 1_000_000) return `${(areaM2 / 1_000_000).toFixed(2)} km²`
  if (areaM2 >= 10_000) return `${(areaM2 / 10_000).toFixed(2)} ha`
  return `${areaM2.toFixed(1)} m²`
}

export function zoneStyle(feature: Feature<Geometry>) {
  const label = feature.get("nombre") as string | undefined
  return new Style({
    fill: new Fill({ color: "rgba(56, 189, 248, 0.18)" }),
    stroke: new Stroke({ color: COLORS.zone, width: 2, lineDash: [6, 4] }),
    text: label
      ? new TextStyle({
          text: label,
          font: "600 12px Inter, sans-serif",
          fill: new Fill({ color: "#0f172a" }),
          stroke: new Stroke({ color: "#ffffff", width: 3 }),
        })
      : undefined,
  })
}

