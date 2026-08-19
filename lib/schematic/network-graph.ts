import { dia, routers, shapes } from "@joint/core"

import {
  GEOMETRIA_TERMINACION,
  Terminacion,
  altoTerminacion,
  crearTerminacion,
  datosTerminacion,
  puntoDesdePuerto,
} from "./terminal-shape"
import {
  conexionPorDefecto,
  reglaConexion,
  type ElementoRedJSON,
  type ElementoRedParseado,
  type PuntoParseado,
  type ReferenciaPuntoJSON,
  type RolTerminacion,
  type TerminacionParseada,
  type TipoConexion,
  type TipoElemento,
} from "./network-data"

/**
 * Orquestación del grafo de JointJS: construye el lienzo a partir del modelo
 * parseado, aplica las reglas de conexión punto a punto y exporta el resultado.
 *
 * Todo lo que se usa aquí pertenece a `@joint/core` (MPL-2.0): `dia.Link.define`,
 * los routers y conectores del núcleo y las validaciones `validateConnection` /
 * `validateMagnet` del Paper.
 */

export const TIPO_CONEXION = "gismart.Conexion"

/**
 * Las conexiones van por encima de las terminaciones. No tapan los números de
 * los puntos porque el `connectionPoint` del Paper recorta los extremos en el
 * borde del elemento (ver `defaultConnectionPoint` en el componente).
 */
const Z_CONEXION = 10

/** Grosores y colores de la conexión en reposo y resaltada. */
const ESTILO_CONEXION = {
  grosorLinea: 2.4,
  grosorHalo: 4.4,
  grosorLineaResaltada: 4,
  grosorHaloResaltado: 7.5,
  halo: "#64748b",
  haloResaltado: "#0f172a",
  radioCodo: 6,
} as const

/**
 * Cada tipo de conexión tiene su propio trazo, para distinguir de un vistazo una
 * fusión de un patcheo o de una fibra de paso.
 */
const TRAZO_POR_TIPO: Record<TipoConexion, string> = {
  empalme: "none",
  conector: "9,4",
  splitter: "6,3",
  paso: "2,4",
}

/**
 * `rightAngle` es el router ortogonal pensado para enlaces entre puertos: se le
 * indica por qué lado sale y entra la línea. Se descartaron `orthogonal` (gira
 * dentro del elemento, porque los puertos están hacia el interior) y `manhattan`
 * (esquiva obstáculos y rodearía las terminaciones).
 */
const ROUTER_ORTOGONAL = {
  name: "rightAngle",
  args: {
    sourceDirection: routers.rightAngle.Directions.RIGHT,
    targetDirection: routers.rightAngle.Directions.LEFT,
  },
} as const satisfies dia.Link.Attributes["router"]

/** Punta de flecha en el extremo de destino, para leer el sentido de la señal. */
const MARCADOR_DESTINO = {
  type: "path",
  d: "M 9 -4 0 0 9 4 Z",
  stroke: "#334155",
  strokeWidth: 0.6,
} as const

const COLOR_BASE = "#94a3b8"

/** Tiñe la línea y su flecha con el color del punto de origen y marca su tipo. */
function atributosDeConexion(tipo: TipoConexion, hex: string): dia.Cell.Selectors {
  const guion = TRAZO_POR_TIPO[tipo]
  return {
    // El halo sigue el mismo patrón que la línea para que los trazos
    // discontinuos se lean como tales.
    outline: { strokeDasharray: guion },
    line: {
      stroke: hex,
      strokeDasharray: guion,
      targetMarker: { ...MARCADOR_DESTINO, fill: hex },
    },
  }
}

export const Conexion = dia.Link.define(
  TIPO_CONEXION,
  {
    z: Z_CONEXION,
    tipoConexion: "empalme",
    // Enrutamiento ortogonal: sólo tramos horizontales y verticales.
    router: ROUTER_ORTOGONAL,
    // Redondea los codos de 90 grados.
    connector: { name: "rounded", args: { radius: ESTILO_CONEXION.radioCodo } },
    attrs: {
      // Trazo transparente y ancho: amplía el área sensible al puntero.
      wrapper: {
        connection: true,
        strokeWidth: 12,
        strokeLinejoin: "round",
      },
      // Halo gris que despega la línea del fondo y hace visibles los colores
      // blancos o muy claros.
      outline: {
        connection: true,
        stroke: ESTILO_CONEXION.halo,
        strokeWidth: ESTILO_CONEXION.grosorHalo,
        strokeLinejoin: "round",
        fill: "none",
        pointerEvents: "none",
      },
      line: {
        connection: true,
        stroke: COLOR_BASE,
        strokeWidth: ESTILO_CONEXION.grosorLinea,
        strokeLinejoin: "round",
        fill: "none",
        pointerEvents: "none",
        targetMarker: { ...MARCADOR_DESTINO, fill: COLOR_BASE },
      },
    },
  },
  {
    markup: [
      {
        tagName: "path",
        selector: "wrapper",
        attributes: { fill: "none", stroke: "transparent", cursor: "pointer" },
      },
      { tagName: "path", selector: "outline" },
      { tagName: "path", selector: "line" },
    ] satisfies dia.MarkupJSON,
  },
)

export function tipoDeConexion(link: dia.Link): TipoConexion {
  return (link.get("tipoConexion") as TipoConexion | undefined) ?? "empalme"
}

function etiquetaDeConexion(link: dia.Link): string | undefined {
  return link.get("etiquetaConexion") as string | undefined
}

/**
 * Engrosa y oscurece la conexión al pasar el puntero para poder seguir su
 * recorrido entre las líneas que se cruzan.
 *
 * Sólo se tocan los grosores y el color del halo: cambiar la `z` del enlace
 * (por ejemplo con `toFront()`) reordena el lienzo, invalida la vista y dejaría
 * huérfano el botón de borrar que se añade en el mismo evento.
 */
export function resaltarConexion(linkView: dia.LinkView, activo: boolean): void {
  linkView.model.attr({
    outline: {
      stroke: activo ? ESTILO_CONEXION.haloResaltado : ESTILO_CONEXION.halo,
      strokeWidth: activo ? ESTILO_CONEXION.grosorHaloResaltado : ESTILO_CONEXION.grosorHalo,
    },
    line: {
      strokeWidth: activo
        ? ESTILO_CONEXION.grosorLineaResaltada
        : ESTILO_CONEXION.grosorLinea,
    },
  })
}

/** Namespace para que JointJS resuelva las vistas a partir del `type`. */
export const cellNamespace = {
  ...shapes,
  gismart: { Terminacion, Conexion },
}

const DISPOSICION = {
  origenX: 48,
  origenY: 32,
  /** Separación horizontal entre las dos columnas. */
  separacionColumnas: 260,
  /** Separación vertical entre terminaciones de la misma columna. */
  separacionFilas: 40,
} as const

function altoColumna(terminaciones: TerminacionParseada[]): number {
  const alto = terminaciones.reduce((total, item) => total + altoTerminacion(item), 0)
  return alto + Math.max(0, terminaciones.length - 1) * DISPOSICION.separacionFilas
}

/**
 * Entradas a la izquierda; salidas, derivaciones y reservas a la derecha. Cada
 * columna queda centrada verticalmente respecto a la más alta.
 */
export function calcularPosiciones(
  elemento: ElementoRedParseado,
): Map<string, { x: number; y: number }> {
  const posiciones = new Map<string, { x: number; y: number }>()
  const altoContenido = Math.max(altoColumna(elemento.izquierda), altoColumna(elemento.derecha))

  const columnas: { terminaciones: TerminacionParseada[]; x: number }[] = [
    { terminaciones: elemento.izquierda, x: DISPOSICION.origenX },
    {
      terminaciones: elemento.derecha,
      x: DISPOSICION.origenX + GEOMETRIA_TERMINACION.ancho + DISPOSICION.separacionColumnas,
    },
  ]

  for (const columna of columnas) {
    let y = DISPOSICION.origenY + (altoContenido - altoColumna(columna.terminaciones)) / 2
    for (const terminacion of columna.terminaciones) {
      posiciones.set(terminacion.id, { x: columna.x, y })
      y += altoTerminacion(terminacion) + DISPOSICION.separacionFilas
    }
  }

  return posiciones
}

/**
 * Dibuja el escenario completo a partir del modelo parseado: reemplaza el
 * contenido del lienzo por las terminaciones y las conexiones que declara el
 * JSON. La estructura no se modifica desde la interfaz, así que ésta es la única
 * vía por la que se crean las terminaciones.
 */
export function cargarEscenario(graph: dia.Graph, elemento: ElementoRedParseado): void {
  graph.clear()

  const posiciones = calcularPosiciones(elemento)
  for (const terminacion of elemento.terminaciones) {
    const en = posiciones.get(terminacion.id) ?? {
      x: DISPOSICION.origenX,
      y: DISPOSICION.origenY,
    }
    crearTerminacion(terminacion, elemento.vocabulario, en).addTo(graph)
  }

  // El parseo ya descartó las conexiones inválidas o que exceden la capacidad.
  for (const conexion of elemento.conexiones) {
    crearConexion(graph, conexion.tipo, conexion.desde, conexion.hasta, conexion.etiqueta)
  }
}

// ---------------------------------------------------------------------------
// Reglas de conectividad
// ---------------------------------------------------------------------------

function conexionesEnPunto(
  graph: dia.Graph,
  cellId: dia.Cell.ID,
  portId: string,
  ignorar?: dia.Link,
): dia.Link[] {
  return graph.getLinks().filter((link) => {
    if (ignorar && link.id === ignorar.id) return false
    const source = link.source()
    const target = link.target()
    return (
      (source.id === cellId && source.port === portId) ||
      (target.id === cellId && target.port === portId)
    )
  })
}

export function puntoOcupado(graph: dia.Graph, cellId: dia.Cell.ID, portId: string): boolean {
  return conexionesEnPunto(graph, cellId, portId).length > 0
}

/**
 * Un punto exclusivo sólo acepta una conexión. Uno compartido (el origen de un
 * splitter) acumula varias, siempre que todas admitan compartir el origen.
 */
function admiteConexion(
  graph: dia.Graph,
  cellId: dia.Cell.ID,
  portId: string,
  compartido: boolean,
  ignorar?: dia.Link,
): boolean {
  const existentes = conexionesEnPunto(graph, cellId, portId, ignorar)
  if (existentes.length === 0) return true
  if (!compartido) return false
  return existentes.every((link) => reglaConexion(tipoDeConexion(link)).origenCompartido)
}

function portIdDesdeMagnet(cellView: dia.CellView, magnet: SVGElement): string | null {
  return cellView.findAttribute("port", magnet)
}

type Extremo = { cellId: dia.Cell.ID; portId: string }

/**
 * Una conexión sólo es válida de punto a punto, entre lados opuestos del
 * esquema y respetando la capacidad que permite su tipo.
 */
export function crearValidadorDeConexion(
  graph: dia.Graph,
): NonNullable<dia.Paper.Options["validateConnection"]> {
  return (cellViewS, magnetS, cellViewT, magnetT, _end, linkView) => {
    // Sin magnet en alguno de los extremos no hay punto: se descarta.
    if (!magnetS || !magnetT) return false
    if (cellViewS === cellViewT) return false

    const origen = cellViewS.model
    const destino = cellViewT.model
    if (!origen.isElement() || !destino.isElement()) return false

    const terminacionOrigen = datosTerminacion(origen as dia.Element)
    const terminacionDestino = datosTerminacion(destino as dia.Element)
    if (!terminacionOrigen || !terminacionDestino) return false
    if (terminacionOrigen.lado === terminacionDestino.lado) return false

    const puertoOrigen = portIdDesdeMagnet(cellViewS, magnetS)
    const puertoDestino = portIdDesdeMagnet(cellViewT, magnetT)
    if (!puertoOrigen || !puertoDestino) return false

    // El origen es siempre el extremo izquierdo, sin importar en qué sentido
    // haya arrastrado el usuario.
    const extremos: [Extremo, Extremo] =
      terminacionOrigen.lado === "izquierda"
        ? [
            { cellId: origen.id, portId: puertoOrigen },
            { cellId: destino.id, portId: puertoDestino },
          ]
        : [
            { cellId: destino.id, portId: puertoDestino },
            { cellId: origen.id, portId: puertoOrigen },
          ]

    const link = linkView.model
    const regla = reglaConexion(tipoDeConexion(link))
    return (
      admiteConexion(graph, extremos[0].cellId, extremos[0].portId, regla.origenCompartido, link) &&
      admiteConexion(graph, extremos[1].cellId, extremos[1].portId, regla.destinoCompartido, link)
    )
  }
}

/**
 * El elemento se recibe como función porque el Paper se construye una sola vez:
 * así las reglas siguen al JSON que esté cargado en cada momento.
 */
export type ObtenerElemento = () => ElementoRedParseado

/** Impide iniciar el arrastre desde un punto que ya agotó su capacidad. */
export function crearValidadorDeMagnet(
  graph: dia.Graph,
  obtenerElemento: ObtenerElemento,
): NonNullable<dia.Paper.Options["validateMagnet"]> {
  return (cellView, magnet) => {
    const portId = portIdDesdeMagnet(cellView, magnet)
    if (!portId) return false

    const terminacion = datosTerminacion(cellView.model as dia.Element)
    if (!terminacion) return false

    const regla = reglaConexion(conexionPorDefecto(obtenerElemento().tipo))
    const compartido =
      terminacion.lado === "izquierda" ? regla.origenCompartido : regla.destinoCompartido
    return admiteConexion(graph, cellView.model.id, portId, compartido)
  }
}

/**
 * Enlace que se crea al arrastrar desde un punto. Hereda el enrutamiento y el
 * estilo de `Conexion`, y ajusta el tipo al propio del elemento y el color al
 * del punto de origen para poder rastrearlo a simple vista.
 */
export function crearEnlacePorDefecto(
  obtenerElemento: ObtenerElemento,
): NonNullable<dia.Paper.Options["defaultLink"]> {
  return (cellView, magnet) => {
    const tipo = conexionPorDefecto(obtenerElemento().tipo)
    const portId = portIdDesdeMagnet(cellView, magnet)
    const punto = portId ? puntoDesdePuerto(cellView.model as dia.Element, portId) : undefined
    return new Conexion({
      tipoConexion: tipo,
      attrs: atributosDeConexion(tipo, punto?.color.hex ?? COLOR_BASE),
    })
  }
}

export function crearConexion(
  graph: dia.Graph,
  tipo: TipoConexion,
  desde: PuntoParseado,
  hasta: PuntoParseado,
  etiqueta?: string,
): dia.Link {
  const link = new Conexion({
    // La flecha apunta al punto de destino: el origen es siempre el lado izquierdo.
    source: { id: desde.terminacionId, port: desde.portId },
    target: { id: hasta.terminacionId, port: hasta.portId },
    tipoConexion: tipo,
    etiquetaConexion: etiqueta,
    attrs: atributosDeConexion(tipo, desde.color.hex),
  })
  link.addTo(graph)
  return link
}

/**
 * Orienta la conexión siempre de izquierda a derecha. Hace falta porque el
 * usuario puede arrastrar en cualquier sentido y la flecha debe apuntar al punto
 * de destino; también reajusta el color al del punto de origen.
 */
export function normalizarConexion(graph: dia.Graph, link: dia.Link): void {
  const extremoOrigen = link.source()
  const extremoDestino = link.target()
  const origen = puntoDesdeExtremo(graph, extremoOrigen)
  const destino = puntoDesdeExtremo(graph, extremoDestino)
  if (!origen || !destino) return

  const tipo = tipoDeConexion(link)

  if (origen.lado === "izquierda") {
    link.attr(atributosDeConexion(tipo, origen.color.hex))
    return
  }

  link.set({ source: extremoDestino, target: extremoOrigen })
  link.attr(atributosDeConexion(tipo, destino.color.hex))
}

export type RegistroConexion = {
  linkId: string
  tipo: TipoConexion
  /** Extremo del lado izquierdo del esquema. */
  desde: PuntoParseado
  /** Extremo del lado derecho del esquema. */
  hasta: PuntoParseado
  etiqueta?: string
}

function puntoDesdeExtremo(
  graph: dia.Graph,
  extremo: dia.Link.EndJSON,
): PuntoParseado | undefined {
  if (!extremo.id || !extremo.port) return undefined
  const elemento = graph.getCell(extremo.id)
  if (!elemento?.isElement()) return undefined
  return puntoDesdePuerto(elemento as dia.Element, extremo.port)
}

/** Lee el estado actual del grafo y lista las conexiones, de izquierda a derecha. */
export function listarConexiones(graph: dia.Graph): RegistroConexion[] {
  const registros: RegistroConexion[] = []

  for (const link of graph.getLinks()) {
    const a = puntoDesdeExtremo(graph, link.source())
    const b = puntoDesdeExtremo(graph, link.target())
    if (!a || !b || a.lado === b.lado) continue

    const desde = a.lado === "izquierda" ? a : b
    const hasta = a.lado === "izquierda" ? b : a

    registros.push({
      linkId: String(link.id),
      tipo: tipoDeConexion(link),
      desde,
      hasta,
      etiqueta: etiquetaDeConexion(link),
    })
  }

  return registros.sort((x, y) => {
    if (x.desde.grupo !== y.desde.grupo) return x.desde.grupo - y.desde.grupo
    return x.desde.punto - y.desde.punto
  })
}

/** Puntos de la terminación que todavía no tienen conexión, en el orden del JSON. */
export function puntosLibres(
  graph: dia.Graph,
  terminacion: TerminacionParseada,
): PuntoParseado[] {
  return terminacion.grupos
    .flatMap((grupo) => grupo.puntos)
    .filter((punto) => !puntoOcupado(graph, terminacion.id, punto.portId))
}

/**
 * Conecta en orden los puntos del lado izquierdo con los del derecho, que es el
 * patrón habitual al documentar un elemento de paso. Cuando el tipo de conexión
 * comparte el origen (splitter), los orígenes se reutilizan cíclicamente: un
 * único pigtail de entrada alimenta todas las salidas.
 */
export function conectarEnOrden(graph: dia.Graph, elemento: ElementoRedParseado): number {
  const tipo = conexionPorDefecto(elemento.tipo)
  const regla = reglaConexion(tipo)

  const origenes = regla.origenCompartido
    ? elemento.izquierda.flatMap((terminacion) =>
        terminacion.grupos.flatMap((grupo) => grupo.puntos),
      )
    : elemento.izquierda.flatMap((terminacion) => puntosLibres(graph, terminacion))

  if (origenes.length === 0) return 0

  let cursor = 0
  let creadas = 0

  for (const terminacion of elemento.derecha) {
    for (const destino of puntosLibres(graph, terminacion)) {
      const origen = regla.origenCompartido
        ? origenes[cursor % origenes.length]
        : origenes[cursor]
      if (!origen) return creadas
      cursor++
      crearConexion(graph, tipo, origen, destino)
      creadas++
    }
  }

  return creadas
}

// ---------------------------------------------------------------------------
// Exportación de datos
// ---------------------------------------------------------------------------

export type ExtremoExportado = ReferenciaPuntoJSON & {
  etiquetaTerminacion: string
  rol: RolTerminacion
  color: string
  etiquetaPunto?: string
}

export type ConexionExportada = {
  id: string
  tipo: TipoConexion
  desde: ExtremoExportado
  hasta: ExtremoExportado
  etiqueta?: string
}

export type ExportacionConexiones = {
  elemento: string
  nombre: string
  tipo: TipoElemento
  ubicacion?: string
  generadoEn: string
  totalConexiones: number
  conexiones: ConexionExportada[]
}

function referenciaDePunto(punto: PuntoParseado): ReferenciaPuntoJSON {
  return { terminacion: punto.terminacionId, grupo: punto.grupo, punto: punto.punto }
}

function extremoExportado(punto: PuntoParseado): ExtremoExportado {
  return {
    ...referenciaDePunto(punto),
    etiquetaTerminacion: punto.terminacionEtiqueta,
    rol: punto.rol,
    color: punto.color.name,
    etiquetaPunto: punto.etiqueta,
  }
}

/**
 * Extrae las conexiones trazadas en el lienzo. Las claves
 * `terminacion`/`grupo`/`punto` coinciden con `ReferenciaPuntoJSON`, así que el
 * resultado se puede volver a cargar como dato de entrada; el resto de campos
 * son de lectura, para no tener que cruzar datos en un reporte.
 */
export function exportarConexiones(
  graph: dia.Graph,
  elemento: ElementoRedParseado,
): ExportacionConexiones {
  const conexiones = listarConexiones(graph).map((registro) => ({
    id: registro.linkId,
    tipo: registro.tipo,
    desde: extremoExportado(registro.desde),
    hasta: extremoExportado(registro.hasta),
    etiqueta: registro.etiqueta,
  }))

  return {
    elemento: elemento.id,
    nombre: elemento.nombre,
    tipo: elemento.tipo,
    ubicacion: elemento.ubicacion,
    generadoEn: new Date().toISOString(),
    totalConexiones: conexiones.length,
    conexiones,
  }
}

/**
 * Vuelca el elemento completo (estructura y conexiones actuales) en el mismo
 * formato que se lee, de modo que la exportación se puede volver a cargar sin
 * transformarla.
 */
export function exportarElemento(
  graph: dia.Graph,
  elemento: ElementoRedParseado,
): ElementoRedJSON {
  return {
    id: elemento.id,
    nombre: elemento.nombre,
    tipo: elemento.tipo,
    ubicacion: elemento.ubicacion,
    terminaciones: elemento.terminaciones.map((terminacion) => ({
      id: terminacion.id,
      etiqueta: terminacion.etiqueta,
      rol: terminacion.rol,
      tipo: terminacion.tipo,
      grupos: terminacion.grupos.map((grupo) => ({
        numero: grupo.numero,
        color: grupo.color.name,
        etiqueta: grupo.etiqueta,
        puntos: grupo.puntos.map((punto) => ({
          numero: punto.punto,
          color: punto.color.name,
          etiqueta: punto.etiqueta,
        })),
      })),
    })),
    conexiones: listarConexiones(graph).map((registro) => ({
      id: registro.linkId,
      tipo: registro.tipo,
      desde: referenciaDePunto(registro.desde),
      hasta: referenciaDePunto(registro.hasta),
      etiqueta: registro.etiqueta,
    })),
  }
}
