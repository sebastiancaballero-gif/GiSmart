import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import {
  armarTablaHaciaArriba,
  direccionDeUrl,
  elementosDelRecorrido,
  geometria,
  hilosDelRecorrido,
  normalizarPasos,
  numero,
  pasoPorDentroDelDivisor,
  rutasDelRecorrido,
  type DatosDeElementos,
  type PasoDeTrace,
  type TablaHaciaArriba,
} from "@/lib/map/trace"
import { UUID, clienteSupabase, detalleSoloEnDesarrollo, faltaConfiguracion } from "@/lib/supabase-servidor"

/** Lo que se le dice a quien usa el mapa cuando la tabla de caché no se puede leer. */
function mensajeDeCache(codigo: string | undefined): string {
  switch (codigo) {
    case "42501":
      return "La base no permite leer la caché del trace: falta un permiso sobre tab_fiber.element_connection."
    case "42P01":
    case "PGRST205":
      return "La tabla de caché del trace (tab_fiber.element_connection) no existe en la base."
    case "42703":
      return "La tabla de caché del trace cambió de columnas. Hay que actualizar la consulta."
    default:
      return "No se pudo leer el recorrido en la caché del trace."
  }
}

type FilaDeCache = {
  id_origen?: string
  total_pasos: number | null
  atenuacion_total_db: number | null
  path_secuencia: unknown
  geom_path: unknown
  fecha_calculo: string | null
}

const COLUMNAS_CACHE = "id_origen, id_destino, total_pasos, atenuacion_total_db, path_secuencia, geom_path, fecha_calculo"

type FilaDeHilo = {
  id: string
  id_cable: string | null
  numero_hilo: number | null
  numero_buffer: number | null
  color_hilo: string | null
  color_buffer: string | null
}
const COLUMNAS_HILO = "id, id_cable, numero_hilo, numero_buffer, color_hilo, color_buffer"

type FilaDePuerto = {
  id: string
  numero_puerto: number | null
  nombre: string | null
  tipo_equipo_pert: string | null
  id_equipo_pert: string | null
  dir_principal_senhal: string | null
}
const COLUMNAS_PUERTO = "id, numero_puerto, nombre, tipo_equipo_pert, id_equipo_pert, dir_principal_senhal"

type FilaDeDivisor = {
  id: string
  num_divisor: number | null
  cod_divisor: string | null
  modelo_divisor: string | null
  id_cubierta_ubica: string | null
}
type FilaDeCubierta = { id: string; etiqueta: string | null; funcion_cub: string | null }
type FilaDeTarjeta = { id: string; num_slot: number | null; tipo_equipo: string | null; id_equipo: string | null }
type FilaDeEquipo = { id: string; codigo: string | null; id_cabecera: string | null }
type FilaDeCabecera = { id: string; nombre: string | null }

const COLUMNAS = {
  divisor: "id, num_divisor, cod_divisor, modelo_divisor, id_cubierta_ubica",
  cubierta: "id, etiqueta, funcion_cub",
  tarjeta: "id, num_slot, tipo_equipo, id_equipo",
  equipo: "id, codigo, id_cabecera",
  cabecera: "id, nombre",
}

/**
 * Cuántos UUID van en una consulta. Van en la URL (37 caracteres cada uno) y
 * un recorrido grande hacia abajo, con cientos de hilos, pasaba el largo que
 * aceptan los servidores; además PostgREST no devuelve más de 1000 filas.
 */
const IDS_POR_CONSULTA = 100

/** Las filas de una tabla con esos UUID, por lotes; si una consulta falla, lanza el error con el nombre de la tabla. */
async function filasPorId<T>(esquema: string, tabla: string, columnas: string, ids: string[], columna = "id"): Promise<T[]> {
  if (ids.length === 0) return []
  const cliente = clienteSupabase(esquema)
  if (!cliente) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.")
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) lotes.push(ids.slice(i, i + IDS_POR_CONSULTA))
  const respuestas = await Promise.all(lotes.map((lote) => cliente.from(tabla).select(columnas).in(columna, lote)))
  const filas: T[] = []
  for (const { data, error } of respuestas) {
    if (error) throw new Error(`${esquema}.${tabla} → ${error.code}: ${error.message}`)
    filas.push(...((data ?? []) as T[]))
  }
  return filas
}

/** Todas las filas de una tabla (de a 1000, el tope de la API), con filtros de igualdad. */
async function todas<T>(esquema: string, tabla: string, columnas: string, iguales: [string, string][] = []): Promise<T[]> {
  const cliente = clienteSupabase(esquema)
  if (!cliente) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.")
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    let consulta = cliente.from(tabla).select(columnas).order("id").range(desde, desde + 999)
    for (const [columna, valor] of iguales) consulta = consulta.eq(columna, valor)
    const { data, error } = await consulta
    if (error) throw new Error(`${esquema}.${tabla} → ${error.code}: ${error.message}`)
    filas.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return filas
  }
}

const sinRepetir = (lista: (string | null | undefined)[]) => [...new Set(lista.filter((v): v is string => !!v))]

/** El número si es mayor que cero; si no, `null`. */
const positivo = (v: unknown) => {
  const n = numero(v)
  return n !== null && n > 0 ? n : null
}

/**
 * Lo que casi no cambia y se repite en cada recorrido hacia arriba: los
 * divisores con su puerto de entrada, las cubiertas (etiqueta y nivel), las
 * tarjetas y bandejas, los equipos (OLT, ODF) y las cabeceras. Se lee entero
 * una vez y vale dos minutos; así cada trace hace 3 o 4 viajes a la base en
 * vez de 10 a 13 (cada viaje cuesta unos 150 ms).
 *
 * Lo que no esté (un divisor o una cubierta recién creados) se lee de la base
 * en el momento y se agrega: nada nuevo se pierde. Lo que sí puede tardar
 * hasta dos minutos en verse es un cambio en lo ya leído (renombrar una
 * cubierta).
 */
type Catalogo = {
  /** Divisor → su puerto de entrada (E). */
  entradaDeDivisor: Map<string, string>
  divisores: Map<string, FilaDeDivisor>
  cubiertas: Map<string, FilaDeCubierta>
  tarjetas: Map<string, FilaDeTarjeta>
  equipos: Map<string, FilaDeEquipo>
  cabeceras: Map<string, FilaDeCabecera>
}

const VIGENCIA_CATALOGO_MS = 2 * 60_000
let catalogo: { valor: Promise<Catalogo>; hasta: number } | null = null

const porId = <T extends { id: string }>(filas: T[]) => new Map(filas.map((f) => [f.id, f]))

async function cargarCatalogo(): Promise<Catalogo> {
  const [entradas, divisores, cubiertas, tarjetas, equipos, cabeceras] = await Promise.all([
    todas<{ id: string; id_equipo_pert: string | null }>("tab_fiber", "puerto_equipo", "id, id_equipo_pert", [
      ["tipo_equipo_pert", "DIV"],
      ["dir_principal_senhal", "E"],
    ]),
    todas<FilaDeDivisor>("tab_fiber", "divisor_optico", COLUMNAS.divisor),
    todas<FilaDeCubierta>("geo_fiber", "cubierta_empalme", COLUMNAS.cubierta),
    todas<FilaDeTarjeta>("tab_fiber", "tarjeta_bandeja_eqp", COLUMNAS.tarjeta),
    todas<FilaDeEquipo>("tab_fiber", "equipo_red", COLUMNAS.equipo),
    todas<FilaDeCabecera>("geo_infra", "cabecera_central", COLUMNAS.cabecera),
  ])
  return {
    entradaDeDivisor: new Map(entradas.flatMap((e) => (e.id_equipo_pert ? [[e.id_equipo_pert, e.id] as const] : []))),
    divisores: porId(divisores),
    cubiertas: porId(cubiertas),
    tarjetas: porId(tarjetas),
    equipos: porId(equipos),
    cabeceras: porId(cabeceras),
  }
}

const catalogoVacio = (): Catalogo => ({
  entradaDeDivisor: new Map(),
  divisores: new Map(),
  cubiertas: new Map(),
  tarjetas: new Map(),
  equipos: new Map(),
  cabeceras: new Map(),
})

/** El catálogo vigente; si no se puede leer, uno vacío (todo se lee en el momento, como antes). */
function leerCatalogo(): Promise<Catalogo> {
  const ahora = Date.now()
  if (!catalogo || catalogo.hasta <= ahora) {
    const valor = cargarCatalogo()
    catalogo = { valor, hasta: ahora + VIGENCIA_CATALOGO_MS }
    valor.catch((e) => {
      console.error(`[trace] catálogo: ${e instanceof Error ? e.message : String(e)}`)
      if (catalogo?.valor === valor) catalogo = null
    })
  }
  return catalogo.valor.catch(catalogoVacio)
}

/** Agrega al mapa las filas de los `ids` que todavía no tiene, leídas de la base. */
async function completar<T extends { id: string }>(mapa: Map<string, T>, esquema: string, tabla: string, columnas: string, ids: string[]) {
  for (const fila of await filasPorId<T>(esquema, tabla, columnas, sinRepetir(ids).filter((id) => !mapa.has(id)))) {
    mapa.set(fila.id, fila)
  }
}

/** Un recorrido de la caché, como lo devuelve la ruta. */
function tramoDe(idOrigen: string, fila: FilaDeCache, pasos: PasoDeTrace[]) {
  return {
    idOrigen,
    geomPath: geometria(fila.geom_path),
    pasos,
    totalPasos: numero(fila.total_pasos) ?? new Set(pasos.map((p) => p.paso)).size,
    atenuacionTotal: numero(fila.atenuacion_total_db),
    calculadoEn: typeof fila.fecha_calculo === "string" ? fila.fecha_calculo : null,
  }
}

/**
 * Hacia arriba, la caché se detiene en la salida de un divisor (de una
 * cubierta de segundo nivel sube hasta el divisor de la de primer nivel, no
 * más). Para llegar a la OLT, como en la tabla que pidió el ingeniero, se
 * continúa con el recorrido que la misma caché tiene desde la entrada de ese
 * divisor, y así hasta no cruzar más divisores. Subiendo no hay ambigüedad: un
 * divisor tiene una sola entrada.
 *
 * El paso que llega a un divisor trae el divisor como contenedor
 * (`tipo_contenedor` DIVISOR): no hace falta leer el puerto. La entrada sale
 * del catálogo; cada divisor cruzado cuesta un viaje a la base (su recorrido).
 *
 * Devuelve los pasos unidos (con un paso por dentro de cada divisor) y los
 * recorridos que se agregaron.
 */
async function continuarPorLosDivisores(id: string, pasos: PasoDeTrace[], catalogo: Catalogo) {
  const unidos = [...pasos]
  const tramos: ReturnType<typeof tramoDe>[] = []
  const cruzados = new Set<string>()
  // Más de cuatro divisores en serie no tiene sentido en una red FTTH: sería un ciclo.
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const llegaA = new Map<string, PasoDeTrace>()
    for (const p of unidos) if (p.destino.id) llegaA.set(p.destino.id, p)
    const salidas = sinRepetir(rutasDelRecorrido(unidos, id).map((r) => r[r.length - 1].id)).flatMap((final) => {
      const paso = llegaA.get(final)
      const divisor = paso?.contenedor.tipo === "DIVISOR" && paso.destino.tipo !== "HILO" ? paso.contenedor.id : null
      return divisor && !cruzados.has(divisor) ? [{ salida: final, divisor }] : []
    })
    if (salidas.length === 0) break
    for (const s of salidas) cruzados.add(s.divisor)

    // Un divisor que no está en el catálogo (recién creado): su entrada, de la base.
    const sinEntrada = salidas.filter((s) => !catalogo.entradaDeDivisor.has(s.divisor)).map((s) => s.divisor)
    for (const p of await filasPorId<FilaDePuerto>("tab_fiber", "puerto_equipo", COLUMNAS_PUERTO, sinEntrada, "id_equipo_pert")) {
      if (p.tipo_equipo_pert === "DIV" && p.dir_principal_senhal === "E" && p.id_equipo_pert) catalogo.entradaDeDivisor.set(p.id_equipo_pert, p.id)
    }
    const conEntrada = salidas.flatMap((s) => {
      const entrada = catalogo.entradaDeDivisor.get(s.divisor)
      return entrada ? [{ ...s, entrada }] : []
    })
    const cliente = clienteSupabase("tab_fiber")
    if (!cliente || conEntrada.length === 0) break
    const { data, error } = await cliente
      .from("element_connection")
      .select(COLUMNAS_CACHE)
      .eq("direccion", "UPSTREAM")
      .in("id_origen", sinRepetir(conEntrada.map((s) => s.entrada)))
      .order("fecha_calculo", { ascending: false })
    if (error) throw new Error(`element_connection (entrada del divisor) → ${error.code}: ${error.message}`)
    const filas = (data ?? []) as FilaDeCache[]

    for (const { salida, divisor, entrada } of conEntrada) {
      // La más reciente, como con el origen.
      const fila = filas.find((f) => f.id_origen === entrada)
      if (!fila) continue
      unidos.push(pasoPorDentroDelDivisor(salida, entrada, divisor))
      if (tramos.some((t) => t.idOrigen === entrada)) continue
      const pasosDeEntrada = normalizarPasos(fila.path_secuencia)
      unidos.push(...pasosDeEntrada)
      tramos.push(tramoDe(entrada, fila, pasosDeEntrada))
    }
  }
  return { unidos, tramos }
}

/**
 * Lo que hace falta para la tabla del trace hacia arriba, con los hilos y los
 * puertos ya leídos: los cables de los hilos (siempre de la base: su largo es
 * la Suma) y, del catálogo, los divisores, cubiertas, tarjetas, equipos y
 * cabeceras (lo que falte, de la base).
 */
async function datosDeElementos(hilos: FilaDeHilo[], puertos: FilaDePuerto[], catalogo: Catalogo): Promise<DatosDeElementos> {
  const deDivisor = (q: FilaDePuerto) => q.tipo_equipo_pert === "DIV"
  const [cables] = await Promise.all([
    filasPorId<{ id: string; codigo: string | null; longitud_medida: number | null; longitud_calc: number | null }>(
      "geo_fiber", "cable_fibra", "id, codigo, longitud_medida, longitud_calc", sinRepetir(hilos.map((h) => h.id_cable)),
    ),
    completar(catalogo.divisores, "tab_fiber", "divisor_optico", COLUMNAS.divisor, puertos.filter(deDivisor).flatMap((q) => q.id_equipo_pert ?? [])),
    completar(catalogo.tarjetas, "tab_fiber", "tarjeta_bandeja_eqp", COLUMNAS.tarjeta, puertos.filter((q) => !deDivisor(q)).flatMap((q) => q.id_equipo_pert ?? [])),
  ])
  const divisores = sinRepetir(puertos.filter(deDivisor).map((q) => q.id_equipo_pert)).flatMap((d) => catalogo.divisores.get(d) ?? [])
  const tarjetas = sinRepetir(puertos.filter((q) => !deDivisor(q)).map((q) => q.id_equipo_pert)).flatMap((t) => catalogo.tarjetas.get(t) ?? [])
  await Promise.all([
    completar(catalogo.cubiertas, "geo_fiber", "cubierta_empalme", COLUMNAS.cubierta, divisores.flatMap((d) => d.id_cubierta_ubica ?? [])),
    completar(catalogo.equipos, "tab_fiber", "equipo_red", COLUMNAS.equipo, tarjetas.flatMap((t) => t.id_equipo ?? [])),
  ])
  const equipos = sinRepetir(tarjetas.map((t) => t.id_equipo)).flatMap((e) => catalogo.equipos.get(e) ?? [])
  await completar(catalogo.cabeceras, "geo_infra", "cabecera_central", COLUMNAS.cabecera, equipos.flatMap((e) => e.id_cabecera ?? []))

  const de = <T, R>(filas: T[], id: (f: T) => string, convertir: (f: T) => R) =>
    Object.fromEntries(filas.map((f) => [id(f), convertir(f)])) as Record<string, R>
  const cubiertas = sinRepetir(divisores.map((d) => d.id_cubierta_ubica)).flatMap((c) => catalogo.cubiertas.get(c) ?? [])
  const cabeceras = sinRepetir(equipos.map((e) => e.id_cabecera)).flatMap((c) => catalogo.cabeceras.get(c) ?? [])
  return {
    hilos: de(hilos, (h) => h.id, (h) => ({
      numero: numero(h.numero_hilo),
      buffer: numero(h.numero_buffer),
      idCable: h.id_cable,
      colorHilo: h.color_hilo,
      colorBuffer: h.color_buffer,
    })),
    // Un largo en 0 es «sin medir», como en el mapa: se usa el calculado.
    cables: de(cables, (c) => c.id, (c) => ({ codigo: c.codigo, largoM: positivo(c.longitud_medida) ?? positivo(c.longitud_calc) })),
    puertos: de(puertos, (q) => q.id, (q) => ({
      numero: numero(q.numero_puerto),
      nombre: q.nombre,
      tipoPert: q.tipo_equipo_pert,
      idPert: q.id_equipo_pert,
      sentido: q.dir_principal_senhal,
    })),
    tarjetas: de(tarjetas, (x) => x.id, (x) => ({ slot: numero(x.num_slot), tipoEquipo: x.tipo_equipo, idEquipo: x.id_equipo })),
    equipos: de(equipos, (e) => e.id, (e) => ({ codigo: e.codigo, idCabecera: e.id_cabecera })),
    divisores: de(divisores, (d) => d.id, (d) => ({
      numero: numero(d.num_divisor),
      codigo: d.cod_divisor,
      idCubierta: d.id_cubierta_ubica,
      modelo: d.modelo_divisor,
    })),
    cubiertas: de(cubiertas, (c) => c.id, (c) => ({ etiqueta: c.etiqueta, funcion: c.funcion_cub })),
    cabeceras: de(cabeceras, (c) => c.id, (c) => ({ nombre: c.nombre })),
  }
}

/**
 * Las respuestas del último minuto, por sentido y origen: pedir otra vez el
 * mismo recorrido (cambiar de sentido y volver, reabrir desde Gestión de
 * hilos) responde al instante. Un minuto es poco frente a cada cuánto se
 * recalcula la caché del ingeniero.
 */
const VIGENCIA_RESPUESTA_MS = 60_000
const respuestas = new Map<string, { hasta: number; cuerpo: unknown }>()

/** Una respuesta más grande que esto no se guarda (un recorrido enorme hacia abajo). */
const MAX_BYTES_RESPUESTA = 512 * 1024

function guardarRespuesta(llave: string, cuerpo: unknown) {
  if (JSON.stringify(cuerpo).length > MAX_BYTES_RESPUESTA) return
  const ahora = Date.now()
  for (const [k, r] of respuestas) if (r.hasta <= ahora) respuestas.delete(k)
  // Sin crecer sin fin: se va la más vieja.
  if (respuestas.size >= 200) respuestas.delete(respuestas.keys().next().value as string)
  respuestas.set(llave, { hasta: ahora + VIGENCIA_RESPUESTA_MS, cuerpo })
}

/** La respuesta, con cuánto tardó (se ve en las herramientas del navegador, pestaña Red). */
function responder(cuerpo: unknown, inicio: number, origen: "base" | "memoria") {
  return NextResponse.json(cuerpo, {
    headers: { "Server-Timing": `trace;dur=${Math.round(performance.now() - inicio)};desc="${origen}"` },
  })
}

/**
 * Recorrido del trace desde un puerto o un hilo, como lo planteó el ingeniero:
 * `GET /api/traces/downstream/{id}` (hacia el usuario) o
 * `GET /api/traces/upstream/{id}` (hacia la OLT).
 *
 * No calcula nada: lee el recorrido ya calculado en la tabla de caché
 * `tab_fiber.element_connection` (ver lib/map/trace.ts), así no se llama la
 * función del trace cada vez. Devuelve la geometría del recorrido en `geomPath`
 * (la columna `geom_path`, GeoJSON en EPSG:4326), los pasos, el total de pasos,
 * la atenuación total y cuándo se calculó.
 *
 * Mientras `geom_path` llegue vacía devuelve además los cables del recorrido:
 * el cable de cada hilo según `tab_fiber.hilo_cable`, que el mapa resalta.
 *
 * Hacia arriba:
 * - si el recorrido termina en la salida de un divisor, sigue con el de su
 *   entrada (`tramos`; ver `continuarPorLosDivisores`), y los cables a pintar
 *   son los de todo el camino;
 * - devuelve `tabla`: la tabla que pidió el ingeniero (cada puerto e hilo con
 *   dónde está y en qué contenedor, y la central), una por ruta, con avisos de
 *   lo que no cuadra en los datos. Si sus datos no se pueden leer, el
 *   recorrido sale igual y `errorTabla` dice por qué.
 *
 * Para que sea rápido: lo que casi no cambia sale de un catálogo en memoria
 * (ver `Catalogo`), lo demás se lee en paralelo por tandas, y la misma
 * respuesta vale un minuto. Hacia abajo son 2 viajes a la base; hacia arriba,
 * 3, más 1 por cada divisor que cruza.
 */
export async function GET(request: Request, { params }: { params: Promise<{ direccion: string; id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion
  const inicio = performance.now()

  const { direccion: enUrl, id: crudo } = await params
  const direccion = direccionDeUrl(enUrl)
  if (!direccion) {
    return NextResponse.json({ message: "La dirección del trace tiene que ser downstream o upstream." }, { status: 400 })
  }
  let id = ""
  try {
    id = decodeURIComponent(crudo).trim()
  } catch {
    // Un % suelto en la URL: no es un UUID.
  }
  if (!UUID.test(id)) {
    return NextResponse.json({ message: "El origen tiene que ser el UUID de un puerto o de un hilo." }, { status: 400 })
  }

  const cliente = clienteSupabase("tab_fiber")
  if (!cliente) return faltaConfiguracion()

  const llave = `${direccion}:${id.toLowerCase()}`
  const guardada = respuestas.get(llave)
  if (guardada && guardada.hasta > Date.now()) return responder(guardada.cuerpo, inicio, "memoria")

  const haciaArriba = direccion === "UPSTREAM"
  // Hacia arriba el catálogo se pide ya, en paralelo con el recorrido.
  const catalogoListo = haciaArriba ? leerCatalogo() : null

  try {
    // Una fila por origen y sentido; si algún día hubiera dos, vale la más reciente.
    const { data: filas, error } = await cliente
      .from("element_connection")
      .select(COLUMNAS_CACHE)
      .eq("id_origen", id)
      .eq("direccion", direccion)
      .order("fecha_calculo", { ascending: false })
      .limit(1)
    if (error) {
      console.error(`[element_connection ${id} ${direccion}] ${error.code} ${error.message}`)
      return NextResponse.json(
        {
          message: mensajeDeCache(error.code),
          ...detalleSoloEnDesarrollo(`element_connection → ${error.code}: ${error.message}`),
        },
        { status: 502 },
      )
    }

    const fila = (filas?.[0] ?? null) as FilaDeCache | null
    if (!fila) {
      const vacia = {
        encontrado: false,
        geomPath: null,
        pasos: [],
        totalPasos: 0,
        cables: [],
        atenuacionTotal: null,
        calculadoEn: null,
        tramos: [],
        tabla: null,
        errorTabla: null,
      }
      guardarRespuesta(llave, vacia)
      return responder(vacia, inicio, "base")
    }

    const pasos = normalizarPasos(fila.path_secuencia)
    const pedido = tramoDe(id, fila, pasos)
    const catalogoDelTrace = catalogoListo ? await catalogoListo : catalogoVacio()

    // Hacia arriba, el camino entero hasta la OLT. Si continuar falla, el
    // recorrido de la caché sale igual y la tabla lo avisa.
    let unidos = pasos
    let tramos: ReturnType<typeof tramoDe>[] = []
    let errorContinuar: string | null = null
    if (haciaArriba) {
      try {
        ;({ unidos, tramos } = await continuarPorLosDivisores(id, pasos, catalogoDelTrace))
      } catch (e) {
        errorContinuar = e instanceof Error ? e.message : String(e)
        console.error(`[trace ${id}] continuar por el divisor: ${errorContinuar}`)
      }
    }

    // Los hilos (para pintar sus cables y para la tabla) y, hacia arriba, los
    // puertos (para la tabla), en el mismo viaje.
    const conGeometria = pedido.geomPath !== null && tramos.every((t) => t.geomPath !== null)
    const hilos = conGeometria && !haciaArriba ? [] : hilosDelRecorrido(unidos)
    const puertosIds = haciaArriba ? elementosDelRecorrido(unidos).flatMap((e) => (e.tipo !== "HILO" && e.id ? [e.id] : [])) : []
    const [lecturaHilos, lecturaPuertos] = await Promise.allSettled([
      filasPorId<FilaDeHilo>("tab_fiber", "hilo_cable", COLUMNAS_HILO, hilos),
      filasPorId<FilaDePuerto>("tab_fiber", "puerto_equipo", COLUMNAS_PUERTO, puertosIds),
    ])
    if (lecturaHilos.status === "rejected") {
      const detalle = lecturaHilos.reason instanceof Error ? lecturaHilos.reason.message : String(lecturaHilos.reason)
      console.error(`[trace ${id}] ${detalle}`)
      return NextResponse.json(
        {
          message: "Se encontró el recorrido, pero no se pudieron leer los cables de sus hilos para pintarlo.",
          ...detalleSoloEnDesarrollo(detalle),
        },
        { status: 502 },
      )
    }
    const filasDeHilo = lecturaHilos.value
    const cables: string[] = []
    const cablePorHilo = new Map(filasDeHilo.map((f) => [f.id, f.id_cable]))
    for (const hilo of conGeometria ? [] : hilos) {
      const cable = cablePorHilo.get(hilo)
      if (typeof cable === "string" && !cables.includes(cable)) cables.push(cable)
    }

    let tabla: TablaHaciaArriba | null = null
    let errorTabla = null
    if (haciaArriba) {
      try {
        if (lecturaPuertos.status === "rejected") throw lecturaPuertos.reason
        tabla = armarTablaHaciaArriba(unidos, await datosDeElementos(filasDeHilo, lecturaPuertos.value, catalogoDelTrace), id)
        if (errorContinuar) {
          const { detalle } = detalleSoloEnDesarrollo(errorContinuar)
          tabla.avisos.unshift(
            `No se pudo seguir el recorrido más allá del divisor donde termina en la caché; la tabla llega hasta ahí.${detalle ? ` (${detalle})` : ""}`,
          )
        }
      } catch (e) {
        const detalle = e instanceof Error ? e.message : String(e)
        console.error(`[trace ${id}] tabla de elementos: ${detalle}`)
        errorTabla = {
          message: "Se encontró el recorrido, pero no se pudieron leer los datos de sus elementos para la tabla.",
          ...detalleSoloEnDesarrollo(detalle),
        }
      }
    }

    const cuerpo = {
      encontrado: true,
      geomPath: pedido.geomPath,
      pasos,
      totalPasos: pedido.totalPasos,
      cables,
      atenuacionTotal: pedido.atenuacionTotal,
      calculadoEn: pedido.calculadoEn,
      tramos,
      tabla,
      errorTabla,
    }
    // Lo que salió con un error no se guarda: el siguiente intento vuelve a la base.
    if (!errorTabla && !errorContinuar) guardarRespuesta(llave, cuerpo)
    return responder(cuerpo, inicio, "base")
  } catch (e) {
    return NextResponse.json(
      {
        message: "No se pudo conectar con Supabase para leer el recorrido.",
        ...detalleSoloEnDesarrollo(e instanceof Error ? e.message : String(e)),
      },
      { status: 502 },
    )
  }
}
