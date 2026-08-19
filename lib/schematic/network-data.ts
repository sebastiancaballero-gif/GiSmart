import { fiberColor, fiberColorByName, type FiberColor } from "./fiber-colors"

/**
 * Capa de datos del esquema de conectividad.
 *
 * Un mismo JSON describe cualquier elemento de una red de fibra con tres
 * niveles: elemento -> terminaciones -> grupos -> puntos. Lo que representa
 * cada nivel depende del tipo de elemento:
 *
 *   | elemento | terminación     | grupo  | punto   |
 *   | -------- | --------------- | ------ | ------- |
 *   | mufa     | cable           | buffer | hilo    |
 *   | odf      | bandeja         | casete | puerto  |
 *   | nap      | cable           | buffer | hilo    |
 *   | splitter | módulo          | grupo  | pigtail |
 *
 * El punto es el único nivel conectable. Este módulo no importa JointJS: sólo
 * valida el JSON y lo normaliza (colores resueltos, identificadores de puerto,
 * conexiones verificadas). El dibujo vive en `terminal-shape.ts` y
 * `network-graph.ts`.
 */

// ---------------------------------------------------------------------------
// Forma del JSON de entrada
// ---------------------------------------------------------------------------

/** Elementos de planta que puede describir el esquema. */
export type TipoElemento = "mufa" | "odf" | "nap" | "splitter"

/** Qué representa físicamente la terminación. */
export type TipoTerminacion = "cable" | "bandeja" | "casete" | "modulo" | "puerto"

/**
 * Papel de la terminación dentro del elemento. Determina el lado del lienzo en
 * el que se dibuja y, con ello, qué conexiones son válidas.
 */
export type RolTerminacion = "entrada" | "salida" | "derivacion" | "reserva"

/** Punto conectable: hilo de fibra, puerto conectorizado o pigtail. */
export type PuntoJSON = {
  /** Número del punto dentro del grupo, 1-based. */
  numero: number
  /** Color TIA-598-D; si se omite se deduce de `numero`. */
  color?: string
  /** Identificador del punto en el inventario. */
  etiqueta?: string
}

export type GrupoJSON = {
  /** Número del grupo dentro de la terminación, 1-based. */
  numero: number
  color?: string
  etiqueta?: string
  puntos: PuntoJSON[]
}

export type TerminacionJSON = {
  id: string
  /** Texto visible, ej. el código del cable "F-C-0167653". */
  etiqueta: string
  rol: RolTerminacion
  /** Si se omite se deduce del tipo de elemento. */
  tipo?: TipoTerminacion
  grupos: GrupoJSON[]
}

export type ReferenciaPuntoJSON = {
  terminacion: string
  grupo: number
  punto: number
}

/**
 * Naturaleza de la unión entre dos puntos:
 * - `empalme`: fusión de dos hilos.
 * - `conector`: unión conectorizada (patch cord, adaptador de ODF).
 * - `splitter`: división óptica, donde un punto de origen alimenta varios destinos.
 * - `paso`: fibra que atraviesa el elemento sin intervención.
 */
export type TipoConexion = "empalme" | "conector" | "splitter" | "paso"

export type ConexionJSON = {
  id?: string
  /** Si se omite se usa la conexión propia del tipo de elemento. */
  tipo?: TipoConexion
  desde: ReferenciaPuntoJSON
  hasta: ReferenciaPuntoJSON
  etiqueta?: string
}

export type ElementoRedJSON = {
  id: string
  nombre: string
  tipo: TipoElemento
  ubicacion?: string
  terminaciones: TerminacionJSON[]
  conexiones?: ConexionJSON[]
}

// ---------------------------------------------------------------------------
// Reglas por tipo
// ---------------------------------------------------------------------------

export type LadoTerminacion = "izquierda" | "derecha"

/** Una conexión siempre une lados opuestos del esquema. */
const LADO_POR_ROL: Record<RolTerminacion, LadoTerminacion> = {
  entrada: "izquierda",
  salida: "derecha",
  derivacion: "derecha",
  reserva: "derecha",
}

export function ladoDeRol(rol: RolTerminacion): LadoTerminacion {
  return LADO_POR_ROL[rol]
}

export type ReglaConexion = {
  /** El punto de origen admite varias conexiones. */
  origenCompartido: boolean
  /** El punto de destino admite varias conexiones. */
  destinoCompartido: boolean
}

/**
 * Cuántas conexiones acepta cada extremo. Sólo la división óptica comparte el
 * origen: un pigtail de entrada alimenta todas las salidas del splitter.
 */
const REGLAS_CONEXION: Record<TipoConexion, ReglaConexion> = {
  empalme: { origenCompartido: false, destinoCompartido: false },
  conector: { origenCompartido: false, destinoCompartido: false },
  splitter: { origenCompartido: true, destinoCompartido: false },
  paso: { origenCompartido: false, destinoCompartido: false },
}

export function reglaConexion(tipo: TipoConexion): ReglaConexion {
  return REGLAS_CONEXION[tipo]
}

/** Conexión que se crea al trazar en el lienzo, según el elemento. */
const CONEXION_POR_DEFECTO: Record<TipoElemento, TipoConexion> = {
  mufa: "empalme",
  odf: "conector",
  nap: "empalme",
  splitter: "splitter",
}

export function conexionPorDefecto(tipo: TipoElemento): TipoConexion {
  return CONEXION_POR_DEFECTO[tipo]
}

const TERMINACION_POR_DEFECTO: Record<TipoElemento, TipoTerminacion> = {
  mufa: "cable",
  odf: "bandeja",
  nap: "cable",
  splitter: "modulo",
}

/** Nombres visibles de cada nivel, para rotular el esquema en la jerga del elemento. */
export type VocabularioElemento = {
  elemento: string
  terminacion: string
  terminacionPlural: string
  grupo: string
  grupoPlural: string
  punto: string
  puntoPlural: string
  conexion: string
  conexionPlural: string
}

const VOCABULARIO: Record<TipoElemento, VocabularioElemento> = {
  mufa: {
    elemento: "Mufa",
    terminacion: "Cable",
    terminacionPlural: "cables",
    grupo: "Buffer",
    grupoPlural: "buffers",
    punto: "Hilo",
    puntoPlural: "hilos",
    conexion: "Empalme",
    conexionPlural: "empalmes",
  },
  odf: {
    elemento: "ODF",
    terminacion: "Bandeja",
    terminacionPlural: "bandejas",
    grupo: "Casete",
    grupoPlural: "casetes",
    punto: "Puerto",
    puntoPlural: "puertos",
    conexion: "Conexión",
    conexionPlural: "conexiones",
  },
  nap: {
    elemento: "NAP",
    terminacion: "Cable",
    terminacionPlural: "cables",
    grupo: "Buffer",
    grupoPlural: "buffers",
    punto: "Hilo",
    puntoPlural: "hilos",
    conexion: "Empalme",
    conexionPlural: "empalmes",
  },
  splitter: {
    elemento: "Splitter",
    terminacion: "Módulo",
    terminacionPlural: "módulos",
    grupo: "Grupo",
    grupoPlural: "grupos",
    punto: "Pigtail",
    puntoPlural: "pigtails",
    conexion: "Derivación",
    conexionPlural: "derivaciones",
  },
}

export function vocabulario(tipo: TipoElemento): VocabularioElemento {
  return VOCABULARIO[tipo]
}

// ---------------------------------------------------------------------------
// Modelo normalizado que consume el renderizador
// ---------------------------------------------------------------------------

export type PuntoParseado = {
  /** Identificador del puerto de JointJS. */
  portId: string
  terminacionId: string
  terminacionEtiqueta: string
  rol: RolTerminacion
  lado: LadoTerminacion
  grupo: number
  punto: number
  color: FiberColor
  etiqueta?: string
}

export type GrupoParseado = {
  numero: number
  color: FiberColor
  etiqueta?: string
  puntos: PuntoParseado[]
}

export type TerminacionParseada = {
  id: string
  etiqueta: string
  rol: RolTerminacion
  lado: LadoTerminacion
  tipo: TipoTerminacion
  grupos: GrupoParseado[]
  totalPuntos: number
}

export type ConexionParseada = {
  id: string
  tipo: TipoConexion
  /** Extremo del lado izquierdo del esquema. */
  desde: PuntoParseado
  /** Extremo del lado derecho del esquema. */
  hasta: PuntoParseado
  etiqueta?: string
}

export type ElementoRedParseado = {
  id: string
  nombre: string
  tipo: TipoElemento
  ubicacion?: string
  vocabulario: VocabularioElemento
  terminaciones: TerminacionParseada[]
  izquierda: TerminacionParseada[]
  derecha: TerminacionParseada[]
  conexiones: ConexionParseada[]
  /** Incidencias no fatales detectadas al parsear (colores o conexiones inválidas). */
  avisos: string[]
}

/** El identificador de puerto codifica terminación, grupo y punto. */
export function construirPortId(terminacionId: string, grupo: number, punto: number): string {
  return `${terminacionId}::g${grupo}::p${punto}`
}

const PORT_ID_REGEX = /^(.*)::g(\d+)::p(\d+)$/

export function descomponerPortId(
  portId: string,
): { terminacionId: string; grupo: number; punto: number } | undefined {
  const match = PORT_ID_REGEX.exec(portId)
  if (!match) return undefined
  return { terminacionId: match[1], grupo: Number(match[2]), punto: Number(match[3]) }
}

export class ErrorDatosEsquema extends Error {
  constructor(mensaje: string) {
    super(`Datos del esquema inválidos: ${mensaje}`)
    this.name = "ErrorDatosEsquema"
  }
}

function resolverColor(
  nombre: string | undefined,
  posicion: number,
  contexto: string,
  avisos: string[],
): FiberColor {
  if (!nombre) return fiberColor(posicion)

  const color = fiberColorByName(nombre)
  if (color) return color

  avisos.push(`Color desconocido "${nombre}" en ${contexto}; se usa el color por posición.`)
  return fiberColor(posicion)
}

function parsearTerminacion(
  terminacion: TerminacionJSON,
  tipoElemento: TipoElemento,
  vocab: VocabularioElemento,
  avisos: string[],
): TerminacionParseada {
  if (!terminacion.id) throw new ErrorDatosEsquema("hay una terminación sin `id`")
  if (!terminacion.grupos?.length) {
    throw new ErrorDatosEsquema(`la terminación "${terminacion.id}" no declara grupos`)
  }

  const lado = ladoDeRol(terminacion.rol)
  const numerosGrupo = new Set<number>()

  const grupos = terminacion.grupos.map((grupo) => {
    if (numerosGrupo.has(grupo.numero)) {
      throw new ErrorDatosEsquema(
        `la terminación "${terminacion.id}" repite el grupo ${grupo.numero}`,
      )
    }
    numerosGrupo.add(grupo.numero)

    if (!grupo.puntos?.length) {
      throw new ErrorDatosEsquema(
        `el grupo ${grupo.numero} de la terminación "${terminacion.id}" no declara puntos`,
      )
    }

    const numerosPunto = new Set<number>()
    const puntos = grupo.puntos.map((punto) => {
      if (numerosPunto.has(punto.numero)) {
        throw new ErrorDatosEsquema(
          `el grupo ${grupo.numero} de la terminación "${terminacion.id}" repite el punto ${punto.numero}`,
        )
      }
      numerosPunto.add(punto.numero)

      return {
        portId: construirPortId(terminacion.id, grupo.numero, punto.numero),
        terminacionId: terminacion.id,
        terminacionEtiqueta: terminacion.etiqueta,
        rol: terminacion.rol,
        lado,
        grupo: grupo.numero,
        punto: punto.numero,
        color: resolverColor(
          punto.color,
          punto.numero,
          `${terminacion.etiqueta} ${vocab.grupo} ${grupo.numero} ${vocab.punto} ${punto.numero}`,
          avisos,
        ),
        etiqueta: punto.etiqueta,
      } satisfies PuntoParseado
    })

    return {
      numero: grupo.numero,
      color: resolverColor(
        grupo.color,
        grupo.numero,
        `${terminacion.etiqueta} ${vocab.grupo} ${grupo.numero}`,
        avisos,
      ),
      etiqueta: grupo.etiqueta,
      puntos,
    } satisfies GrupoParseado
  })

  return {
    id: terminacion.id,
    etiqueta: terminacion.etiqueta,
    rol: terminacion.rol,
    lado,
    tipo: terminacion.tipo ?? TERMINACION_POR_DEFECTO[tipoElemento],
    grupos,
    totalPuntos: grupos.reduce((total, grupo) => total + grupo.puntos.length, 0),
  }
}

function indexarPuntos(terminaciones: TerminacionParseada[]): Map<string, PuntoParseado> {
  const indice = new Map<string, PuntoParseado>()
  for (const terminacion of terminaciones) {
    for (const grupo of terminacion.grupos) {
      for (const punto of grupo.puntos) indice.set(punto.portId, punto)
    }
  }
  return indice
}

/**
 * Lleva la cuenta de las conexiones por punto. Un punto exclusivo queda cerrado
 * en cuanto recibe una conexión; uno compartido (el origen de un splitter)
 * acumula varias, pero ya no admite conexiones exclusivas.
 */
function crearControlDeOcupacion() {
  const usos = new Map<string, number>()
  const exclusivos = new Set<string>()

  return {
    admite(portId: string, compartido: boolean): boolean {
      if (exclusivos.has(portId)) return false
      return compartido || (usos.get(portId) ?? 0) === 0
    },
    ocupar(portId: string, compartido: boolean): void {
      if (!compartido) exclusivos.add(portId)
      usos.set(portId, (usos.get(portId) ?? 0) + 1)
    },
  }
}

/**
 * Valida las conexiones declaradas en el JSON: deben apuntar a puntos
 * existentes, unir lados opuestos del esquema y respetar la capacidad que
 * permite su tipo.
 */
function parsearConexiones(
  conexiones: ConexionJSON[],
  indice: Map<string, PuntoParseado>,
  tipoElemento: TipoElemento,
  avisos: string[],
): ConexionParseada[] {
  const ocupacion = crearControlDeOcupacion()
  const resultado: ConexionParseada[] = []

  conexiones.forEach((conexion, posicion) => {
    const nombre = conexion.id ?? `conexión ${posicion + 1}`
    const describir = (ref: ReferenciaPuntoJSON) => `${ref.terminacion} G${ref.grupo}·P${ref.punto}`

    const a = indice.get(
      construirPortId(conexion.desde.terminacion, conexion.desde.grupo, conexion.desde.punto),
    )
    const b = indice.get(
      construirPortId(conexion.hasta.terminacion, conexion.hasta.grupo, conexion.hasta.punto),
    )

    if (!a || !b) {
      const faltante = !a ? conexion.desde : conexion.hasta
      avisos.push(`${nombre} ignorada: el punto ${describir(faltante)} no existe.`)
      return
    }

    if (a.lado === b.lado) {
      avisos.push(
        `${nombre} ignorada: ${describir(conexion.desde)} y ${describir(conexion.hasta)} están del mismo lado (${a.lado}).`,
      )
      return
    }

    // La orientación se normaliza de izquierda a derecha para que la flecha del
    // lienzo siempre siga el sentido de la señal.
    const desde = a.lado === "izquierda" ? a : b
    const hasta = a.lado === "izquierda" ? b : a

    const tipo = conexion.tipo ?? conexionPorDefecto(tipoElemento)
    const regla = reglaConexion(tipo)

    if (!ocupacion.admite(desde.portId, regla.origenCompartido)) {
      avisos.push(`${nombre} ignorada: el punto ${describir(conexion.desde)} ya está conectado.`)
      return
    }
    if (!ocupacion.admite(hasta.portId, regla.destinoCompartido)) {
      avisos.push(`${nombre} ignorada: el punto ${describir(conexion.hasta)} ya está conectado.`)
      return
    }

    ocupacion.ocupar(desde.portId, regla.origenCompartido)
    ocupacion.ocupar(hasta.portId, regla.destinoCompartido)

    resultado.push({
      id: conexion.id ?? `${desde.portId}->${hasta.portId}`,
      tipo,
      desde,
      hasta,
      etiqueta: conexion.etiqueta,
    })
  })

  return resultado
}

/**
 * Convierte el JSON del elemento en el modelo que consume el lienzo. Lanza
 * `ErrorDatosEsquema` ante errores de estructura y acumula en `avisos` las
 * incidencias recuperables.
 */
export function parsearElemento(json: ElementoRedJSON): ElementoRedParseado {
  if (!json.terminaciones?.length) {
    throw new ErrorDatosEsquema("no hay terminaciones declaradas")
  }

  const vocab = vocabulario(json.tipo)
  if (!vocab) throw new ErrorDatosEsquema(`tipo de elemento desconocido "${json.tipo}"`)

  const avisos: string[] = []
  const identificadores = new Set<string>()

  const terminaciones = json.terminaciones.map((terminacion) => {
    if (identificadores.has(terminacion.id)) {
      throw new ErrorDatosEsquema(
        `el identificador de terminación "${terminacion.id}" está repetido`,
      )
    }
    identificadores.add(terminacion.id)
    return parsearTerminacion(terminacion, json.tipo, vocab, avisos)
  })

  const izquierda = terminaciones.filter((terminacion) => terminacion.lado === "izquierda")
  const derecha = terminaciones.filter((terminacion) => terminacion.lado === "derecha")

  if (izquierda.length === 0) throw new ErrorDatosEsquema("no hay ninguna terminación de entrada")
  if (derecha.length === 0) {
    throw new ErrorDatosEsquema("no hay ninguna terminación de salida, derivación o reserva")
  }

  return {
    id: json.id,
    nombre: json.nombre,
    tipo: json.tipo,
    ubicacion: json.ubicacion,
    vocabulario: vocab,
    terminaciones,
    izquierda,
    derecha,
    conexiones: parsearConexiones(
      json.conexiones ?? [],
      indexarPuntos(terminaciones),
      json.tipo,
      avisos,
    ),
    avisos,
  }
}

export function buscarPunto(
  elemento: ElementoRedParseado,
  portId: string,
): PuntoParseado | undefined {
  const partes = descomponerPortId(portId)
  if (!partes) return undefined

  const terminacion = elemento.terminaciones.find((item) => item.id === partes.terminacionId)
  const grupo = terminacion?.grupos.find((item) => item.numero === partes.grupo)
  return grupo?.puntos.find((item) => item.punto === partes.punto)
}
