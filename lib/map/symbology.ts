import type Feature from "ol/Feature"
import type { Geometry } from "ol/geom"
import LineString from "ol/geom/LineString"
import MultiLineString from "ol/geom/MultiLineString"
import MultiPoint from "ol/geom/MultiPoint"
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

/**
 * Propiedad donde se guarda el nombre que se ve en el mapa (etiqueta, código o
 * uno generado). Va aparte de la columna `nombre` de la base a propósito:
 * antes se escribía encima de ella, y la ficha «Ver información» enseñaba
 * como «Nombre» el código de un cable o la etiqueta de una cabecera, algo que
 * la base no dice.
 */
export const NOMBRE_VISIBLE = "nombre_visible"

export const TYPE_LABELS: Record<FeatureType, string> = {
  node: "Cubierta",
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
// con la etiqueta legible de cada columna de la base. El orden es el de
// consulta en campo: primero qué es, luego cómo es, y los identificadores y la
// auditoría al final. Una columna que no esté aquí sale igual, con un nombre
// derivado del suyo (ver info-table-dialog).
//
// Revisado contra el esquema recreado en septiembre de 2026: la auditoría pasó
// a `creado_en`/`modificado_en` en las tres tablas y algunas columnas cambiaron
// de nombre (`capacidad_bandejas` → `cantidad_bandejas`, `estado_const` →
// `tipo_est_const` en las mufas).
const CAMPOS_DE_AUDITORIA: Record<string, string> = {
  id: "ID",
  id_legacy: "ID en el sistema anterior",
  creado_en: "Creado",
  creado_por: "Creado por",
  modificado_en: "Última modificación",
  modificado_por: "Modificado por",
}

export const MUFA_FIELD_LABELS: Record<string, string> = {
  // El nombre: en `etiqueta` hasta el 20-oct-2026, desde entonces en
  // `salidas_div1` (ver nombreDeCubierta). Se nombran los dos.
  etiqueta: "Etiqueta",
  salidas_div1: "Salidas del divisor 1",
  etiqueta_puerto_n1: "Etiqueta del puerto de nivel 1",
  funcion_cub: "Función",
  nivel: "Nivel",
  cod_inventario: "Código de inventario",
  tipo_carcasa: "Tipo de carcasa",
  tipo_empalme: "Tipo de empalme",
  tipo_est_const: "Estado de construcción",
  cantidad_bandejas: "Bandejas",
  modelo_divisor: "Modelo de divisor",
  cant_div: "Cantidad de divisores",
  tipo_conect_roseta: "Conector de roseta",
  sfp_ont: "SFP / ONT",
  long_acometida: "Longitud de acometida (m)",
  tipo_instala: "Tipo de instalación",
  cod_fabricante: "Fabricante",
  id_proyecto: "Proyecto",
  direccion: "Dirección",
  ubicacion: "Ubicación",
  ...CAMPOS_DE_AUDITORIA,
}

export const FIBER_FIELD_LABELS: Record<string, string> = {
  etq_naps: "Etiqueta NAP",
  nombre: "Nombre",
  codigo: "Código",
  tipo_red_prin: "Tipo de red",
  estado_const: "Estado de construcción",
  cant_hilo: "Cantidad de hilos",
  cant_buff: "Cantidad de buffers",
  tipo_cable: "Tipo de fibra",
  tipo_instala: "Tipo de instalación",
  cod_fabricante: "Fabricante",
  atenuacion_1490: "Atenuación 1490 nm (dB/km)",
  atenuacion_1550: "Atenuación 1550 nm (dB/km)",
  longitud_medida: "Longitud medida (m)",
  longitud_calc: "Longitud calculada (m)",
  tip_elem_from: "Tipo de elemento origen",
  id_elem_from: "Elemento origen",
  tip_elem_to: "Tipo de elemento destino",
  id_elem_to: "Elemento destino",
  tipo_origen_red: "Tipo de origen de red",
  id_origen_red: "Origen de red",
  id_proyecto: "Proyecto",
  ...CAMPOS_DE_AUDITORIA,
}

export const CABECERA_FIELD_LABELS: Record<string, string> = {
  etiqueta: "Etiqueta",
  nombre: "Nombre",
  codigo: "Código",
  tipo_est_const: "Estado de construcción",
  id_proyecto: "Proyecto",
  direccion_catastral: "Dirección catastral",
  desc_capacidad: "Capacidad",
  ...CAMPOS_DE_AUDITORIA,
}

/**
 * Columnas que guardan el UUID de otro elemento de la red. La ficha las
 * muestra con el nombre de ese elemento, porque un UUID suelto no le dice
 * nada a quien consulta un cable.
 */
export const CAMPOS_REFERENCIA = new Set(["id_elem_from", "id_elem_to", "id_origen_red"])

// Color de la mufa según `funcion_cub` (pedido del ingeniero de red), dentro
// de la paleta que ya usa SIGETP para la red de fibra.
//
// Las claves son los valores exactos del enum de la base
// (`geo_fiber.enum_tipo_fun_cubierta`). Hasta septiembre de 2026 el tercero
// era «Empalme pasivo»; al recrear la tabla pasó a «Empalme», y con la clave
// vieja esas mufas perdían el naranja y el tamaño y salían en gris.
export const FUNCION_CUB_COLORS: Record<string, string> = {
  "Segundo nivel": "#c2185b",
  "Primer nivel": "#1d4ed8",
  Empalme: "#ea580c",
}
export const FUNCION_CUB_DEFAULT_COLOR = "#64748b"

/**
 * Colores del botón «Entradas y salidas» (Consultas → Red). Los decide la
 * función de Carlos (`color_resalte`): entrante verde, saliente naranja. El
 * mapa pinta con el color que ella mande; estos son los mismos, para la
 * leyenda y para cuando la función no mande color.
 */
export const SENTIDO_COLORS = {
  entrada: "#00FF00",
  salida: "#FF8C00",
} as const

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

/**
 * El renglón de la leyenda de una cubierta: su nivel si tiene color propio; si
 * no, «Otro / sin dato», el gris con que se dibuja. Así ocultar ese renglón
 * oculta también una función que la base escriba distinto («Segundo Nivel»).
 */
export function nivelDeLeyenda(feature: Feature<Geometry>): string {
  const funcion = feature.get("funcion_cub")
  return typeof funcion === "string" && Object.hasOwn(FUNCION_CUB_COLORS, funcion) ? funcion : "Otro / sin dato"
}

export function categoriaDeCable(feature: Feature<Geometry>): string {
  const hilos = feature.get("cant_hilo") as number | null
  return hilos ? `${hilos} hilos` : "Sin dato de hilos"
}

// SIGETP separa la fibra troncal (azul) de la de distribución (magenta).
//
// Las claves son los valores del enum de la base (`geo_fiber.enum_tipo_red`,
// columna `tipo_red_prin`): hoy 20 cables FEEDER y 162 DISTRIBUTION. El feeder
// queda en el azul de siempre y la distribución va en magenta, las dos con
// línea continua: se probó la distribución discontinua y el usuario prefirió
// dejarla continua. El magenta era el de las cubiertas de segundo nivel
// (#c2185b), pero sobre el mapa se leía rojo: el usuario pidió un magenta de
// verdad. Antes las claves eran FO-TRNC y FO-DIST, que la base ya no usa, y
// todos los cables salían azules.
export const TIPO_RED_COLORS: Record<string, string> = {
  FEEDER: COLORS.fiber,
  DISTRIBUTION: "#d600d6",
}

/** Nombre legible de cada tipo de red, para la leyenda y las fichas. */
export const TIPO_RED_NOMBRES: Record<string, string> = {
  FEEDER: "Feeder",
  DISTRIBUTION: "Distribución",
}

/**
 * Ceros que en la base quieren decir «no se cargó»: un cable con hilos no tiene
 * 0 buffers, y la atenuación de una fibra nunca es 0 dB/km. Los 182 cables
 * traen así esos tres campos; la ficha y la tabla no los muestran como dato.
 */
export function esCeroSinDato(campo: string, valor: unknown, datos: Record<string, unknown>): boolean {
  if (valor !== 0) return false
  if (campo === "cant_buff") return typeof datos.cant_hilo === "number" && datos.cant_hilo > 0
  return campo === "atenuacion_1490" || campo === "atenuacion_1550"
}

/** El tipo de red de un cable tal como lo usan las claves de arriba («DISTRIBUTION»); vacío si no tiene. */
export function tipoDeRed(feature: Feature<Geometry>): string {
  const valor = feature.get("tipo_red_prin")
  return typeof valor === "string" ? valor.trim().toUpperCase() : ""
}

/** El color de un cable según su tipo de red. Sin tipo (o uno desconocido), el azul de la capa. */
export function colorForTipoRed(tipoRed: string | undefined | null): string {
  const tipo = typeof tipoRed === "string" ? tipoRed.trim().toUpperCase() : ""
  return TIPO_RED_COLORS[tipo] ?? COLORS.fiber
}

// Resoluciones (m/px) a partir de las cuales se ocultan las etiquetas: con 185
// mufas y 182 cables en pantalla, rotularlos siempre satura el mapa al alejar.
// Las de los cables salían ya desde 5 m/px (zoom 15) y se amontonaban sobre el
// casco urbano; ahora salen junto con las de las cubiertas.
export const MUFA_LABEL_MAX_RESOLUTION = 2.5
export const FIBER_LABEL_MAX_RESOLUTION = 2.5

/**
 * Por encima de esta resolución (zoom 15,7 o más lejos), las cubiertas de
 * segundo nivel (162 de 185) se dibujan como un punto: con su cruz tapaban los
 * cables de distribución y el casco urbano se veía como una mancha.
 */
export const SEGUNDO_NIVEL_PUNTO_RESOLUTION = 3

/**
 * Desde esta resolución (zoom 17 o más cerca) los cables llevan flechas con el
 * sentido de la señal, de la cabecera hacia los usuarios (ver
 * lib/map/sentido-senal.ts y la propiedad `sentido_senal` del cable).
 */
export const FLECHAS_MAX_RESOLUTION = 1.5

/**
 * Propiedad del cable con el sentido de la señal (`1` como se dibujó, `-1` al
 * revés, `0` sin saber). La calcula el mapa; no es un dato de la base, así que
 * la ficha «Información» no la muestra.
 */
export const SENTIDO_SENAL = "sentido_senal"

/** Cada cuántos píxeles de cable va una flecha (al menos una por cable). */
const PIXELES_ENTRE_FLECHAS = 140

/** Flechas blancas dentro del trazo; se guardan por grosor y ángulo (de 5 en 5 grados). */
const cacheFlechas = new Map<string, RegularShape>()

function flecha(ancho: number, angulo: number): RegularShape {
  // RegularShape de 3 puntas con ángulo 0 apunta al norte, y la rotación va en
  // sentido horario; el ángulo del tramo va en sentido antihorario desde el este.
  const pasos = Math.round(((Math.PI / 2 - angulo) * 180) / Math.PI / 5)
  const clave = `${ancho}|${pasos}`
  let forma = cacheFlechas.get(clave)
  if (!forma) {
    forma = new RegularShape({
      points: 3,
      radius: ancho * 0.55 + 1,
      rotation: (pasos * 5 * Math.PI) / 180,
      rotateWithView: true,
      fill: new Fill({ color: "#ffffff" }),
      declutterMode: "none",
    })
    cacheFlechas.set(clave, forma)
  }
  return forma
}

/** Las flechas de un cable con sentido conocido, repartidas a lo largo de cada tramo. */
function flechasDelCable(feature: Feature<Geometry>, resolution: number, ancho: number): Style[] {
  const sentido = feature.get(SENTIDO_SENAL)
  if (sentido !== 1 && sentido !== -1) return []
  const geometria = feature.getGeometry()
  const lineas = geometria instanceof LineString ? [geometria] : geometria instanceof MultiLineString ? geometria.getLineStrings() : []
  const estilos: Style[] = []
  for (const linea of lineas) {
    const largoPx = linea.getLength() / resolution
    // Un tramo de pocos píxeles no tiene lugar para la flecha.
    if (largoPx < 28) continue
    const cantidad = Math.max(1, Math.floor(largoPx / PIXELES_ENTRE_FLECHAS))
    for (let i = 0; i < cantidad; i++) {
      const fraccion = (i + 0.5) / cantidad
      const antes = linea.getCoordinateAt(Math.max(0, fraccion - 0.002))
      const despues = linea.getCoordinateAt(Math.min(1, fraccion + 0.002))
      const angulo = Math.atan2(despues[1] - antes[1], despues[0] - antes[0]) + (sentido === -1 ? Math.PI : 0)
      estilos.push(new Style({ geometry: new Point(linea.getCoordinateAt(fraccion)), image: flecha(ancho, angulo) }))
    }
  }
  return estilos
}

/** «85 m» los tramos cortos (lo que se usa en campo), «1.23 km» los largos. */
export function textoDeLongitud(metros: number): string {
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(2)} km`
}

/**
 * Si el mapa base se ve oscuro: tema oscuro con «Según el tema» (o sin fondo),
 * o «Oscuro» en Avanzado › Mapa base. Lo pone el mapa (`ponerFondoOscuro`) y lo
 * leen los estilos: con fondo oscuro, la camisa de los cables y el halo de los
 * rótulos van oscuros. Blancos, sobre el mapa oscuro se veían como contornos
 * brillantes.
 */
let fondoOscuro = false

/** Cambia el modo y dice si cambió, para redibujar las capas solo entonces. */
export function ponerFondoOscuro(oscuro: boolean): boolean {
  if (fondoOscuro === oscuro) return false
  fondoOscuro = oscuro
  return true
}

/** Los colores que dependen del fondo: camisa de los cables, halo y texto de los rótulos. */
function tinta() {
  return fondoOscuro
    ? { camisa: "rgba(15, 23, 42, 0.85)", halo: "#0f172a", texto: "#e2e8f0", textoSuave: "#cbd5e1", cabecera: "#6ee7b7" }
    : { camisa: "rgba(255, 255, 255, 0.85)", halo: "#ffffff", texto: "#0f172a", textoSuave: "#475569", cabecera: "#064e3b" }
}

/** Un color `#rrggbb` con transparencia, para halos y brillos. */
export function conAlfa(hex: string, alfa: number): string {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16)
  if (!Number.isFinite(n)) return hex
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`
}

export const FIBER_HINT =
  "Click sobre una cubierta para iniciar el trazado y sobre otra para terminarlo. Esc cancela. No se guarda en la base todavía."

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
  if (funcionCub === "Empalme") return { escala: 1.15, zIndex: 2 }
  return { escala: 1, zIndex: 1 }
}

/** El de los rótulos de las cubiertas: más que el de cualquier símbolo de `jerarquiaDeMufa`. */
const ZINDEX_ROTULO_CUBIERTA = 4

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
  const label = (feature.get(NOMBRE_VISIBLE) as string) ?? "Cubierta"
  const funcionCub = feature.get("funcion_cub") as string | undefined
  const color = colorForFuncionCub(funcionCub)
  const { escala, zIndex } = jerarquiaDeMufa(funcionCub)

  // Alejado, las de segundo nivel quedan como un punto de su color, sin halo ni
  // cruz: así se ve el tendido (feeder y distribución) en vez de una mancha de
  // cruces. Las de primer nivel y las de empalme conservan su símbolo.
  if (funcionCub === "Segundo nivel" && resolution > SEGUNDO_NIVEL_PUNTO_RESOLUTION) {
    return simbolosCacheados(`mufa-punto|${color}`, () => [
      new Style({
        zIndex,
        image: new CircleStyle({
          radius: 3,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: "#ffffff", width: 1 }),
          declutterMode: "none",
        }),
      }),
    ])
  }

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
      // Por encima de todos los símbolos de cubierta (zIndex 1 a 3): en CO01 la
      // cubierta de segundo nivel de al lado tapaba el rótulo y se leía «C⊕01».
      zIndex: ZINDEX_ROTULO_CUBIERTA,
      text: new TextStyle({
        text: label,
        offsetY: -(radius + 9),
        font: "600 11px Inter, sans-serif",
        fill: new Fill({ color: tinta().texto }),
        stroke: new Stroke({ color: tinta().halo, width: 3 }),
      }),
    }),
  ]
}

// Cabecera central: círculo con un triángulo inscrito, más grande que la mufa
// para que se lea como el origen de la red. Su etiqueta se muestra siempre,
// porque son muy pocas y conviene ubicarlas de un vistazo.
export function cabeceraStyle(feature: Feature<Geometry>, resolution: number) {
  const label = (feature.get(NOMBRE_VISIBLE) as string) ?? "Cabecera"
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
        fill: new Fill({ color: tinta().cabecera }),
        stroke: new Stroke({ color: tinta().halo, width: 3.5 }),
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

  const { camisa, halo, textoSuave } = tinta()
  const trazos = simbolosCacheados(`cable|${color}|${width}|${camisa}`, () => [
    // Contorno por debajo del trazo (la "camisa" de la cartografía clásica),
    // blanco u oscuro según el fondo: separa el cable de las calles del mapa
    // base, que suelen ser del mismo grosor y tono, y hace legibles los cruces.
    new Style({
      stroke: new Stroke({
        color: camisa,
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

  // De cerca, flechas con el sentido de la señal (debajo de los rótulos).
  const styles = resolution <= FLECHAS_MAX_RESOLUTION ? [...trazos, ...flechasDelCable(feature, resolution, width)] : [...trazos]
  const km = largoEnKm(feature.getGeometry())

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
            stroke: new Stroke({ color: halo, width: 3.5 }),
          }),
        }),
      )
    }

    // Los tramos cortos se miden en metros: "85 m" ocupa la mitad que
    // "0.09 km" y además es lo que se usa en campo para esas distancias.
    const longitud = textoDeLongitud(km * 1000)

    styles.push(
      new Style({
        text: new TextStyle({
          text: longitud,
          placement: "line",
          textBaseline: "top",
          overflow: true,
          font: "600 10px Inter, sans-serif",
          fill: new Fill({ color: textoSuave }),
          stroke: new Stroke({ color: halo, width: 3 }),
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

/**
 * Cables pintados por «Entradas y salidas», con el color que mandó la función
 * (`color`) o, si no mandó uno, el de su sentido. Llevan un borde oscuro debajo
 * para que el verde y el naranja se lean igual sobre el mapa base que sobre el
 * azul del tendido. Los colores son pocos, así que cada estilo se crea una vez.
 */
const estilosSentido = new Map<string, Style[]>()

export function sentidoStyle(feature: Feature<Geometry>) {
  const sentido = feature.get("sentido") as keyof typeof SENTIDO_COLORS
  const color = (feature.get("color") as string | null | undefined) ?? SENTIDO_COLORS[sentido] ?? SENTIDO_COLORS.entrada
  let estilo = estilosSentido.get(color)
  if (!estilo) {
    estilo = [
      new Style({ stroke: new Stroke({ color: "rgba(15, 23, 42, 0.55)", width: 10, lineCap: "round" }) }),
      new Style({ stroke: new Stroke({ color, width: 6, lineCap: "round" }) }),
    ]
    estilosSentido.set(color, estilo)
  }
  return estilo
}

/**
 * Recorrido del trace (Red de fibra → Trace), con el estilo que definió el
 * ingeniero: línea cian neón de 5 px con puntas y uniones redondeadas, y los
 * puntos (si la geometría trae alguno) en un círculo rojo con borde blanco. Es
 * fijo: se crea una vez.
 */
export const TRACE_COLOR = "#00e5ff"
/** Los puntos del recorrido (las cubiertas por donde pasa). */
export const TRACE_PUNTO_COLOR = "#ff1744"

const estiloTrace = new Style({
  stroke: new Stroke({ color: TRACE_COLOR, width: 5, lineCap: "round", lineJoin: "round" }),
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: TRACE_PUNTO_COLOR }),
    stroke: new Stroke({ color: "#ffffff", width: 2 }),
  }),
})

export function traceStyle() {
  return estiloTrace
}

/**
 * Propiedad de cada cable del recorrido pintado: hacia dónde corre la raya
 * animada respecto del dibujo del cable (`1` hacia su final, `-1` hacia su
 * comienzo, `0` sin animar porque no se sabe el sentido de su señal).
 */
export const FLUJO_TRACE = "flujo_trace"

/**
 * La raya que corre sobre el recorrido del trace, en el sentido en que se
 * recorrió: hacia la OLT o hacia el usuario. Oscura, para leerse sobre el cian.
 */
export const ESTILO_FLUJO_TRACE = new Style({
  stroke: new Stroke({ color: "rgba(15, 23, 42, 0.7)", width: 2, lineDash: [5, 13], lineCap: "round", lineJoin: "round" }),
})

/** Largo de raya más espacio de `ESTILO_FLUJO_TRACE`, en píxeles: lo que avanza en un ciclo. */
export const PERIODO_FLUJO_TRACE = 18

/**
 * El elemento ubicado desde la tabla del trace (el pin de una fila): queda
 * resaltado hasta que se ubica otro o se quita el recorrido.
 *
 * Paleta Ámbar, elegida entre cuatro propuestas (ámbar, fucsia, lima y tinta):
 * es el color de selección más común en un SIG y complementa el azul de la
 * aplicación. El borde oscuro es el que lo separa del cian del recorrido, de
 * los puntos rojos y de las vías claras del mapa base; sobre el mapa oscuro el
 * ámbar se lee solo. La fila de la tabla y su pin usan la misma paleta.
 */
export const RESALTE = {
  /** El trazo del cable y el anillo de la cubierta. */
  color: "#fbbf24",
  /** El borde oscuro alrededor. */
  borde: "#1e293b",
  /** La barra y el pin de la fila marcada: un tono más fuerte, que se lee sobre el fondo claro. */
  fuerte: "#f59e0b",
  /** El ícono sobre el pin ámbar. */
  sobreFuerte: "#422006",
} as const

const resalteDeLinea = [
  new Style({ stroke: new Stroke({ color: RESALTE.borde, width: 12, lineCap: "round", lineJoin: "round" }) }),
  new Style({ stroke: new Stroke({ color: RESALTE.color, width: 6, lineCap: "round", lineJoin: "round" }) }),
]

// Un anillo alrededor del símbolo de la cubierta, sin taparlo.
const anilloDeResalte = (color: string, width: number) =>
  new Style({ image: new CircleStyle({ radius: MUFA_SYMBOL_RADIUS + 8, stroke: new Stroke({ color, width }), declutterMode: "none" }) })
const resalteDePunto = [anilloDeResalte(RESALTE.borde, 6.5), anilloDeResalte(RESALTE.color, 3.5)]

export function resalteStyle(feature: Feature<Geometry>) {
  return feature.getGeometry()?.getType() === "Point" ? resalteDePunto : resalteDeLinea
}

/**
 * Marca roja sobre el elemento activo: el seleccionado o el que se está
 * consultando. Entre 185 mufas juntas, y con cables que se cruzan, el resalte
 * de selección no bastaba para saber de un vistazo cuál era.
 *
 * Una mufa o una cabecera llevan un punto con su anillo. Un cable se resalta
 * entero y además lleva el punto en la mitad, que es lo que permite encontrarlo
 * con el mapa alejado, cuando la línea se confunde con las demás. Una zona
 * lleva el borde resaltado y el punto en su interior.
 *
 * Son estilos fijos: se crean una vez y se reutilizan en cada redibujado.
 */
const MARCA_ROJA = "#dc2626"

const anilloMarcador = new Style({
  image: new CircleStyle({
    radius: 17,
    fill: new Fill({ color: "rgba(220, 38, 38, 0.15)" }),
    stroke: new Stroke({ color: "rgba(220, 38, 38, 0.65)", width: 2 }),
    declutterMode: "none",
  }),
})

const puntoMarcador = new Style({
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: MARCA_ROJA }),
    stroke: new Stroke({ color: "#ffffff", width: 2.5 }),
    declutterMode: "none",
  }),
})

/** Centro de una línea o de un área, para colgar ahí el punto. */
function centroDelElemento(geometria: Geometry | undefined): Point | undefined {
  if (!geometria) return undefined
  if (geometria instanceof LineString) return new Point(geometria.getCoordinateAt(0.5))
  const extension = geometria.getExtent()
  if (!extension.every((v) => Number.isFinite(v))) return undefined
  return new Point([(extension[0] + extension[2]) / 2, (extension[1] + extension[3]) / 2])
}

const conCentro = (estilo: Style) => {
  const copia = estilo.clone()
  copia.setGeometry((f) => centroDelElemento((f as Feature<Geometry>).getGeometry()))
  return copia
}

const ESTILO_MARCADOR_PUNTO = [anilloMarcador, puntoMarcador]

/** Las dos puntas de un cable: dónde empieza y dónde termina. */
function puntasDelElemento(geometria: Geometry | undefined): MultiPoint | undefined {
  if (geometria instanceof LineString) return new MultiPoint([geometria.getFirstCoordinate(), geometria.getLastCoordinate()])
  if (geometria instanceof MultiLineString) {
    const lineas = geometria.getLineStrings()
    if (lineas.length === 0) return undefined
    return new MultiPoint([lineas[0].getFirstCoordinate(), lineas[lineas.length - 1].getLastCoordinate()])
  }
  return undefined
}

const puntaMarcador = new Style({
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: "#ffffff" }),
    stroke: new Stroke({ color: MARCA_ROJA, width: 2.5 }),
    declutterMode: "none",
  }),
  geometry: (f) => puntasDelElemento((f as Feature<Geometry>).getGeometry()),
})

/**
 * Un cable marcado: contorno rojo alrededor y, adentro, su propio trazo (color
 * de su tipo de red y grosor de sus hilos), más sus dos puntas y el punto en la
 * mitad. Antes llevaba encima una raya roja discontinua y quedaba a rayas rojas
 * y azules, sin que se viera de qué tipo era. La marca usa los datos del cable
 * (`cant_hilo`, `tipo_red_prin`) que se le copian al crearla.
 */
const estilosMarcadorLinea = new Map<string, Style[]>()

function marcadorDeLinea(feature: Feature<Geometry>): Style[] {
  const ancho = fiberWidth(feature.get("cant_hilo") as number | undefined)
  const color = colorForTipoRed(feature.get("tipo_red_prin") as string | undefined)
  const clave = `${color}|${ancho}`
  let estilo = estilosMarcadorLinea.get(clave)
  if (!estilo) {
    estilo = [
      new Style({
        stroke: new Stroke({ color: "rgba(220, 38, 38, 0.22)", width: ancho + 14, lineCap: "round", lineJoin: "round" }),
      }),
      new Style({ stroke: new Stroke({ color: MARCA_ROJA, width: ancho + 5, lineCap: "round", lineJoin: "round" }) }),
      new Style({ stroke: new Stroke({ color, width: ancho, lineCap: "round", lineJoin: "round" }) }),
      puntaMarcador,
      conCentro(anilloMarcador),
      conCentro(puntoMarcador),
    ]
    estilosMarcadorLinea.set(clave, estilo)
  }
  return estilo
}

/**
 * Brillo del cable bajo el puntero, en su propio color. Va en una capa debajo
 * del tendido, así asoma alrededor del trazo sin taparlo: se sabe cuál se va a
 * elegir cuando hay varios juntos.
 */
const estilosBrillo = new Map<string, Style>()

export function brilloDeCableStyle(feature: Feature<Geometry>): Style {
  // Una cubierta o la cabecera (punto): un halo de su color alrededor del símbolo.
  if (feature.getGeometry()?.getType() === "Point") {
    const esCabecera = feature.get("es_cabecera") === true
    const color = esCabecera ? CABECERA_COLOR : colorForFuncionCub(feature.get("funcion_cub") as string | undefined)
    const radio = (esCabecera ? CABECERA_SYMBOL_RADIUS : MUFA_SYMBOL_RADIUS) + 7
    const clave = `punto|${color}|${radio}`
    let estilo = estilosBrillo.get(clave)
    if (!estilo) {
      estilo = new Style({
        image: new CircleStyle({ radius: radio, fill: new Fill({ color: conAlfa(color, 0.3) }), declutterMode: "none" }),
      })
      estilosBrillo.set(clave, estilo)
    }
    return estilo
  }
  const ancho = fiberWidth(feature.get("cant_hilo") as number | undefined)
  const color = colorForTipoRed(feature.get("tipo_red_prin") as string | undefined)
  const clave = `${color}|${ancho}`
  let estilo = estilosBrillo.get(clave)
  if (!estilo) {
    estilo = new Style({
      stroke: new Stroke({ color: conAlfa(color, 0.4), width: ancho + 12, lineCap: "round", lineJoin: "round" }),
    })
    estilosBrillo.set(clave, estilo)
  }
  return estilo
}

const ESTILO_MARCADOR_AREA = [
  new Style({
    stroke: new Stroke({ color: MARCA_ROJA, width: 2.5, lineDash: [10, 8] }),
    fill: new Fill({ color: "rgba(220, 38, 38, 0.08)" }),
  }),
  conCentro(puntoMarcador),
]

export function marcadorStyle(feature: Feature<Geometry>) {
  const tipo = feature.getGeometry()?.getType()
  if (tipo === "LineString" || tipo === "MultiLineString") return marcadorDeLinea(feature)
  if (tipo === "Polygon" || tipo === "MultiPolygon") return ESTILO_MARCADOR_AREA
  return ESTILO_MARCADOR_PUNTO
}

/**
 * El punto que se buscó (una dirección o una coordenada). Violeta para no
 * confundirlo con la marca roja de lo seleccionado ni con ninguna capa, y con
 * el texto buscado debajo. Se quita al hacer click en el mapa.
 */
const DESTINO_COLOR = "#7c3aed"
const estilosDestino = new Map<string, Style[]>()

export function destinoStyle(feature: Feature<Geometry>) {
  const etiqueta = (feature.get("etiqueta") as string | undefined) ?? ""
  let estilo = estilosDestino.get(etiqueta)
  if (!estilo) {
    estilo = [
      new Style({
        image: new CircleStyle({
          radius: 16,
          fill: new Fill({ color: "rgba(124, 58, 237, 0.18)" }),
          stroke: new Stroke({ color: "rgba(124, 58, 237, 0.6)", width: 2 }),
          declutterMode: "none",
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: DESTINO_COLOR }),
          stroke: new Stroke({ color: "#ffffff", width: 2.5 }),
          declutterMode: "none",
        }),
        text: etiqueta
          ? new TextStyle({
              text: etiqueta,
              offsetY: 28,
              font: "600 12px Inter, system-ui, sans-serif",
              fill: new Fill({ color: "#ffffff" }),
              backgroundFill: new Fill({ color: DESTINO_COLOR }),
              padding: [2, 6, 2, 6],
              overflow: true,
            })
          : undefined,
      }),
    ]
    estilosDestino.set(etiqueta, estilo)
  }
  return estilo
}

/**
 * Puntas de un cable, para el botón «Cable» (Consultas → Red): «Entrada» en la
 * mufa padre y «Salida» en la hija, con los colores de la leyenda (entrada
 * verde, salida naranja). Llevan un anillo y la palabra escrita, para no
 * depender solo del color. Si la función de la base manda un color, se usa ese.
 */
export const EXTREMO_COLORS = {
  entrada: SENTIDO_COLORS.entrada,
  salida: SENTIDO_COLORS.salida,
  otro: "#475569",
} as const

/** El cable consultado con el botón «Cable» se pinta de este color. */
export const CABLE_CONSULTADO_COLOR = "#dc2626"

const estilosExtremo = new Map<string, Style[]>()

export function extremoStyle(feature: Feature<Geometry>) {
  const rol = feature.get("rol") as "entrada" | "salida" | null
  const color = (feature.get("color") as string | null | undefined) ?? EXTREMO_COLORS[rol ?? "otro"]
  const etiqueta = rol === "entrada" ? "Entrada" : rol === "salida" ? "Salida" : "Extremo"
  const clave = `${color}|${etiqueta}`
  let estilo = estilosExtremo.get(clave)
  if (!estilo) {
    estilo = [
      new Style({
        image: new CircleStyle({
          radius: 14,
          fill: new Fill({ color: "rgba(255, 255, 255, 0.35)" }),
          stroke: new Stroke({ color, width: 3.5 }),
          declutterMode: "none",
        }),
        text: new TextStyle({
          text: etiqueta,
          offsetY: 26,
          font: "700 11px Inter, sans-serif",
          fill: new Fill({ color }),
          stroke: new Stroke({ color: "#ffffff", width: 3.5 }),
        }),
      }),
    ]
    estilosExtremo.set(clave, estilo)
  }
  return estilo
}

/**
 * Largo de un cable en kilómetros, medido sobre la esfera.
 *
 * Las etiquetas de los cables lo muestran y la función de estilo corre en cada
 * redibujado: medir la línea cada vez era trabajo repetido. Se guarda por
 * geometría y solo se vuelve a medir si la geometría cambió (al editarla).
 */
const largosMedidos = new WeakMap<Geometry, { revision: number; km: number }>()

export function largoEnKm(geometria: Geometry | undefined): number {
  if (!geometria) return 0
  const revision = geometria.getRevision()
  const guardado = largosMedidos.get(geometria)
  if (guardado && guardado.revision === revision) return guardado.km
  const km = getLength(geometria) / 1000
  largosMedidos.set(geometria, { revision, km })
  return km
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
  const label = feature.get(NOMBRE_VISIBLE) as string | undefined
  return new Style({
    fill: new Fill({ color: "rgba(56, 189, 248, 0.18)" }),
    stroke: new Stroke({ color: COLORS.zone, width: 2, lineDash: [6, 4] }),
    text: label
      ? new TextStyle({
          text: label,
          font: "600 12px Inter, sans-serif",
          fill: new Fill({ color: tinta().texto }),
          stroke: new Stroke({ color: tinta().halo, width: 3 }),
        })
      : undefined,
  })
}

