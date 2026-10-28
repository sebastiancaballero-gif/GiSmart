import { fetchConSesion } from "@/lib/auth"

/**
 * La traza de cada hilo de un cable, para las dos pestañas de «Gestión de
 * hilos» (ribbon: Red de fibra → Hilos).
 *
 * Los campos son los que devuelve `tab_fiber.fn_get_json_hilos(p_id_hilo,
 * p_tipo_traza)` de Carlos, desde `num_puerto_ini`. Esa función falla en la
 * base desde que se creó (27-oct-2026: «tf.num_puerto_ini does not exist» en
 * FEEDER, «missing FROM-clause entry for table "t"» en DISTRIBUCION), así que
 * la ruta lee directo las tablas que ella lee: las trazas
 * (`tab_fiber.traza_feeder` y `traza_distribucion`, con los hilos de cada una
 * en `path_hilos`) y sus atributos (`attr_traza_feeder` y
 * `attr_traza_distribucion`, por el puerto de inicio). Son 4–7 consultas por
 * cable en vez de una por hilo.
 *
 * Los atributos vienen ya escritos («Puerto 16», «TJT 3», «Div D-1»), pero
 * algunos llegan sin dato y aquí se completan con las tablas de la red (ver
 * `armarTrazas`): la cubierta («Cub ---»: su nombre se movió de columna), la
 * salida de inicio (vacía en todas) y el rack («Rack Rack 1»).
 *
 * El orden de las columnas va fijo aquí, el de las tablas de atributos. Un
 * campo que los atributos agreguen y no esté en la lista se muestra al final.
 */

export type TipoTraza = "FEEDER" | "DISTRIBUCION"

/** Las tablas de cada tipo y las columnas de la traza que se usan. */
export const TABLAS_TRAZA: Record<TipoTraza, { trazas: string; atributos: string; columnas: string }> = {
  FEEDER: { trazas: "traza_feeder", atributos: "attr_traza_feeder", columnas: "id, id_puerto_inicio, id_divisor_fin, path_hilos" },
  DISTRIBUCION: {
    trazas: "traza_distribucion",
    atributos: "attr_traza_distribucion",
    columnas: "id, id_puerto_inicio, id_divisor_inicio, path_hilos",
  },
}

export const esTipoTraza = (valor: unknown): valor is TipoTraza => valor === "FEEDER" || valor === "DISTRIBUCION"

export type GrupoDeTraza = "Inicio" | "Fin" | "Otros"

export type CampoDeTraza = { campo: string; titulo: string; ancho: string; grupo: GrupoDeTraza }

/** Las columnas de cada tipo, en el orden de `attr_traza_feeder` y `attr_traza_distribucion` desde `num_puerto_ini`. */
export const CAMPOS_TRAZA: Record<TipoTraza, CampoDeTraza[]> = {
  FEEDER: [
    { campo: "num_puerto_ini", titulo: "Puerto inicio", ancho: "min-w-24", grupo: "Inicio" },
    { campo: "tipo_equipo", titulo: "Tipo equipo", ancho: "min-w-24", grupo: "Inicio" },
    { campo: "equipo_ubica", titulo: "Equipo", ancho: "min-w-20", grupo: "Inicio" },
    { campo: "rack_ubica", titulo: "Rack", ancho: "min-w-24", grupo: "Inicio" },
    { campo: "posicion_u", titulo: "Posición U", ancho: "min-w-20", grupo: "Inicio" },
    { campo: "cubierta_fin", titulo: "Cubierta fin", ancho: "min-w-28", grupo: "Fin" },
    { campo: "divisor_fin", titulo: "Divisor fin", ancho: "min-w-24", grupo: "Fin" },
    { campo: "id_puerto_fin", titulo: "ID puerto fin", ancho: "min-w-72", grupo: "Fin" },
  ],
  DISTRIBUCION: [
    { campo: "num_puerto_ini", titulo: "Puerto inicio", ancho: "min-w-24", grupo: "Inicio" },
    { campo: "num_salida_ini", titulo: "Salida inicio", ancho: "min-w-24", grupo: "Inicio" },
    { campo: "divisor_ini", titulo: "Divisor inicio", ancho: "min-w-24", grupo: "Inicio" },
    { campo: "cubierta_ini", titulo: "Cubierta inicio", ancho: "min-w-28", grupo: "Inicio" },
    { campo: "divisor_fin", titulo: "Divisor fin", ancho: "min-w-24", grupo: "Fin" },
    { campo: "nap_destino", titulo: "NAP destino", ancho: "min-w-28", grupo: "Fin" },
    { campo: "salidas_dest", titulo: "Salidas destino", ancho: "min-w-28", grupo: "Fin" },
  ],
}

/** Lo que va antes de `num_puerto_ini` en las tablas de atributos: no se muestra. */
const OMITIDOS = new Set(["id_puerto_ini"])

/** Una fila de la traza: campo → texto. Un hilo puede estar en más de una traza (pasa en 12 hilos feeder). */
export type FilaDeTraza = Record<string, string | null>

export type TrazaDeHilo = { id: string; filas: FilaDeTraza[] }

export type ResultadoTrazas =
  | { estado: "ok"; tipo: TipoTraza; hilos: TrazaDeHilo[] }
  /** `detalle`: la tabla que falló y el error tal como lo dio la base (solo fuera de producción). */
  | { estado: "error"; mensaje: string; detalle?: string }

function textoDe(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === "string") return valor.trim() || null
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : null
  if (typeof valor === "boolean") return valor ? "Sí" : "No"
  return JSON.stringify(valor)
}

/**
 * Una fila de atributos (o lo que devolvería la función para un hilo) como
 * filas de texto: un objeto, una lista de objetos (si el hilo está en varias
 * trazas) o la lista dentro de un objeto (`{ data: [...] }`…). Sin traza,
 * ninguna fila.
 */
export function filasDeTraza(datos: unknown): FilaDeTraza[] {
  let lista: unknown[] = []
  if (Array.isArray(datos)) lista = datos
  else if (datos && typeof datos === "object") {
    const objeto = datos as Record<string, unknown>
    const dentro = ["data", "trazas", "filas", "resultado", "items"].find((k) => Array.isArray(objeto[k]))
    lista = dentro ? (objeto[dentro] as unknown[]) : [objeto]
  }
  return lista.flatMap((fila) => {
    if (!fila || typeof fila !== "object" || Array.isArray(fila)) return []
    const limpia: FilaDeTraza = {}
    for (const [clave, valor] of Object.entries(fila as Record<string, unknown>)) limpia[clave.trim().toLowerCase()] = textoDe(valor)
    return Object.values(limpia).some((v) => v !== null) ? [limpia] : []
  })
}

/** `nodo_origen` → «Nodo origen». */
const tituloDe = (campo: string) => {
  const t = campo.replace(/_+/g, " ").trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Las columnas de la grilla: las de la lista, en su orden, y al final las que
 * los atributos traigan de más (por nombre).
 */
export function columnasDeTraza(tipo: TipoTraza, hilos: TrazaDeHilo[]): CampoDeTraza[] {
  const fijas = CAMPOS_TRAZA[tipo]
  const conocidos = new Set(fijas.map((c) => c.campo))
  const extra = new Set<string>()
  for (const h of hilos) {
    for (const fila of h.filas) {
      for (const campo of Object.keys(fila)) if (!conocidos.has(campo) && !OMITIDOS.has(campo)) extra.add(campo)
    }
  }
  return [
    ...fijas,
    ...[...extra].sort().map((campo): CampoDeTraza => ({ campo, titulo: tituloDe(campo), ancho: "min-w-28", grupo: "Otros" })),
  ]
}

/** Una fila de `traza_feeder` o `traza_distribucion`, con lo que se usa. */
export type FilaDeTrazaBase = {
  id: string
  id_puerto_inicio: string | null
  /** Los hilos por los que pasa la traza. */
  path_hilos: string[] | null
  /** Feeder: el divisor de primer nivel donde termina. */
  id_divisor_fin?: string | null
  /** Distribución: el divisor de primer nivel donde empieza. */
  id_divisor_inicio?: string | null
}

export type DivisorDeTraza = { id: string; num_divisor: number | null; modelo_divisor: string | null; id_cubierta_ubica: string | null }

export const COLUMNAS_DIVISOR_TRAZA = "id, num_divisor, modelo_divisor, id_cubierta_ubica"

/** Un valor que la base dejó sin dato: vacío o con «---» («Cub ---»). */
const sinDato = (valor: string | null | undefined) => !valor || /---/.test(valor)

/** Cuántas salidas tiene un divisor según su modelo («1x8PC» → 8); `null` si no se lee. */
export function salidasDelModelo(modelo: string | null): number | null {
  const m = modelo ? /1\s*[x×]\s*(\d+)/i.exec(modelo) : null
  return m ? Number(m[1]) : null
}

/**
 * La salida de la cubierta: las de los divisores anteriores (por número) más el
 * puerto (en una cubierta con dos 1x8, D2 P1 es la salida 9). Si los números
 * de divisor se repiten en la cubierta, o un modelo no dice cuántas salidas
 * tiene, no se puede saber: `null`.
 */
export function salidaDeLaCubierta(divisor: DivisorDeTraza, puerto: number, hermanos: DivisorDeTraza[]): number | null {
  if (divisor.num_divisor === null) return null
  const numeros = hermanos.map((d) => d.num_divisor)
  if (new Set(numeros).size !== numeros.length) return null
  let antes = 0
  for (const d of hermanos) {
    if (d.num_divisor === null) return null
    if (d.num_divisor >= divisor.num_divisor) continue
    const salidas = salidasDelModelo(d.modelo_divisor)
    if (salidas === null) return null
    antes += salidas
  }
  return antes + puerto
}

/**
 * La traza de cada hilo del cable: los atributos de cada traza por la que pasa
 * (casi siempre una; algunos hilos feeder están en dos), completando lo que la
 * base deja sin dato:
 *
 * - la cubierta (`cubierta_fin` en feeder, `cubierta_ini` en distribución): la
 *   del divisor de la traza, con su nombre (ver `nombreDeCubierta`);
 * - la salida de inicio (`num_salida_ini`, distribución): la salida de la
 *   cubierta que le toca al puerto del divisor;
 * - el rack: «Rack Rack 1» → «Rack 1».
 *
 * Lo que sí trae dato no se toca.
 */
export function armarTrazas({
  tipo,
  hilos,
  trazas,
  atributos,
  divisores,
  hermanos,
  puertos,
  nombres,
}: {
  tipo: TipoTraza
  /** Los UUID de los hilos del cable, en el orden de la grilla. */
  hilos: string[]
  trazas: FilaDeTrazaBase[]
  /** Las filas de `attr_traza_*` por su `id_puerto_ini`. */
  atributos: Map<string, Record<string, unknown>>
  divisores: Map<string, DivisorDeTraza>
  /** Todos los divisores de cada cubierta (para numerar las salidas). */
  hermanos: Map<string, DivisorDeTraza[]>
  /** El número de cada puerto de inicio. */
  puertos: Map<string, number | null>
  /** El nombre de cada cubierta, ya leído con `nombreDeCubierta`. */
  nombres: Map<string, string | null>
}): TrazaDeHilo[] {
  const minus = (v: string | null | undefined) => (v ?? "").toLowerCase()
  const porHilo = new Map<string, FilaDeTrazaBase[]>()
  for (const t of trazas) {
    for (const h of t.path_hilos ?? []) porHilo.set(minus(h), [...(porHilo.get(minus(h)) ?? []), t])
  }

  const completar = (t: FilaDeTrazaBase): FilaDeTraza => {
    const fila: FilaDeTraza = filasDeTraza(atributos.get(minus(t.id_puerto_inicio)) ?? null)[0] ?? {}
    if (fila.rack_ubica) fila.rack_ubica = fila.rack_ubica.replace(/^rack\s+(?=rack\b)/i, "")
    const divisor = divisores.get(minus(tipo === "FEEDER" ? t.id_divisor_fin : t.id_divisor_inicio))
    const nombre = divisor?.id_cubierta_ubica ? (nombres.get(minus(divisor.id_cubierta_ubica)) ?? null) : null
    const campoCubierta = tipo === "FEEDER" ? "cubierta_fin" : "cubierta_ini"
    if (sinDato(fila[campoCubierta])) fila[campoCubierta] = nombre ? `Cub ${nombre}` : null
    if (tipo === "DISTRIBUCION" && sinDato(fila.num_salida_ini)) {
      const puerto = puertos.get(minus(t.id_puerto_inicio))
      const salida =
        divisor && typeof puerto === "number"
          ? salidaDeLaCubierta(divisor, puerto, hermanos.get(minus(divisor.id_cubierta_ubica)) ?? [divisor])
          : null
      fila.num_salida_ini = salida !== null ? `Salida ${salida}` : null
    }
    return fila
  }

  return hilos.map((id) => ({ id, filas: (porHilo.get(minus(id)) ?? []).map(completar) }))
}

/** Lee lo que responde `GET /api/cables/{id}/trazas?tipo=…`. */
export function clasificarRespuestaTrazas(status: number, cuerpo: unknown, tipo: TipoTraza): ResultadoTrazas {
  const objeto = (cuerpo ?? {}) as { hilos?: unknown; message?: unknown; detalle?: unknown }
  if (status < 200 || status >= 300) {
    return {
      estado: "error",
      mensaje: typeof objeto.message === "string" ? objeto.message : `No se pudo leer la traza de los hilos de este cable (HTTP ${status}).`,
      ...(typeof objeto.detalle === "string" ? { detalle: objeto.detalle } : {}),
    }
  }
  const hilos = (Array.isArray(objeto.hilos) ? objeto.hilos : []).flatMap((h): TrazaDeHilo[] => {
    const f = (h ?? {}) as { id?: unknown; filas?: unknown }
    return typeof f.id === "string" && f.id ? [{ id: f.id, filas: filasDeTraza(f.filas) }] : []
  })
  return { estado: "ok", tipo, hilos }
}

export const ESPERA_MAXIMA_TRAZAS_MS = 20_000

/** Pide al servidor la traza de los hilos de un cable. Nunca lanza: los fallos vuelven como `estado: "error"`. */
export async function obtenerTrazasDeCable(
  idCable: string,
  tipo: TipoTraza,
  esperaMaxima = ESPERA_MAXIMA_TRAZAS_MS,
): Promise<ResultadoTrazas> {
  try {
    const res = await fetchConSesion(`/api/cables/${encodeURIComponent(idCable)}/trazas?tipo=${tipo}`, {
      signal: AbortSignal.timeout(esperaMaxima),
    })
    const cuerpo: unknown = await res.json().catch(() => null)
    return clasificarRespuestaTrazas(res.status, cuerpo, tipo)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { estado: "error", mensaje: `La base no respondió en ${esperaMaxima / 1000} segundos. Vuelve a intentarlo.` }
    }
    return { estado: "error", mensaje: "Error de red al pedir la traza de los hilos del cable. Revisa la conexión." }
  }
}
