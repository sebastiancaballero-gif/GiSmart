import { clienteSupabase } from "@/lib/supabase-servidor"
import type { AccionDelAsistente } from "../acciones"
import type { Herramienta } from "./gemini"
import { buscarComandos, comandosDeLaCinta } from "@/modulos/avanzado/comandos"
import { distanciaM } from "@/modulos/avanzado/resumen/medidas"
import { leerCoordenada, textoDeCoordenada } from "@/lib/map/busqueda"

export type { AccionDelAsistente }

/**
 * Lo que el asistente puede consultar. Todo es de solo lectura sobre la base
 * (la clave de servicio no sale del servidor) y devuelve datos cortos: Gemini
 * cobra por lo que lee. Las acciones sobre el mapa no se hacen aquí: se anotan
 * en `acciones` y las hace el navegador al recibir la respuesta.
 */

const LIMITE = 12
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Los comodines de LIKE escapados: «%» o «_» se buscan tal cual. */
const sinComodines = (texto: string) => texto.replace(/[\\%_*]/g, (c) => `\\${c}`)
const texto = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "")

function cliente(esquema: string) {
  const c = clienteSupabase(esquema)
  if (!c) throw new Error("La base no está configurada en el servidor (SUPABASE_URL / SUPABASE_SECRET_KEY).")
  return c
}

async function filas<T>(consulta: PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const { data, error } = await consulta
  if (error) throw new Error(`La base respondió con un error${error.code ? ` (${error.code})` : ""}: ${error.message}`)
  return data ?? []
}

type Cubierta = {
  id: string
  etiqueta: string | null
  funcion_cub: string | null
  tipo_carcasa?: string | null
  tipo_empalme?: string | null
  tipo_est_const?: string | null
  cant_div?: number | null
  direccion?: string | null
}
type Cable = {
  id: string
  codigo: string | null
  cant_hilo: number | null
  cant_buff?: number | null
  longitud_medida: number | null
  longitud_calc: number | null
  estado_const?: string | null
  tipo_red_prin?: string | null
  id_elem_from: string | null
  id_elem_to: string | null
}
type Hilo = { id: string; numero_hilo: number | null; numero_buffer: number | null; color_hilo: string | null; color_buffer: string | null }

const largoDe = (c: Cable) => Math.round((c.longitud_medida && c.longitud_medida > 0 ? c.longitud_medida : (c.longitud_calc ?? 0)) * 10) / 10

/** El nombre de una cubierta o una cabecera por su UUID (para los extremos de un cable). */
async function nombresDe(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  const nombres = new Map<string, string>()
  if (unicos.length === 0) return nombres
  const [cubiertas, cabeceras] = await Promise.all([
    filas<Cubierta>(cliente("geo_fiber").from("cubierta_empalme").select("id, etiqueta, funcion_cub").in("id", unicos)),
    filas<{ id: string; nombre: string | null }>(cliente("geo_infra").from("cabecera_central").select("id, nombre").in("id", unicos)),
  ])
  for (const c of cubiertas) nombres.set(c.id, c.etiqueta ?? `cubierta sin etiqueta (${c.funcion_cub ?? "?"})`)
  for (const c of cabeceras) nombres.set(c.id, c.nombre ?? "cabecera")
  return nombres
}

/** Una cubierta por su etiqueta o su UUID; si la etiqueta se repite, devuelve las candidatas. */
async function resolverCubierta(args: Record<string, unknown>): Promise<Cubierta | { candidatas: Cubierta[] } | null> {
  const columnas = "id, etiqueta, funcion_cub, tipo_carcasa, tipo_empalme, tipo_est_const, cant_div, direccion"
  const id = texto(args.id)
  if (UUID.test(id)) return (await filas<Cubierta>(cliente("geo_fiber").from("cubierta_empalme").select(columnas).eq("id", id)))[0] ?? null
  const nombre = texto(args.nombre)
  if (!nombre) return null
  const lista = await filas<Cubierta>(cliente("geo_fiber").from("cubierta_empalme").select(columnas).ilike("etiqueta", sinComodines(nombre)).limit(LIMITE))
  if (lista.length > 1) return { candidatas: lista }
  return lista[0] ?? null
}

async function resolverCable(args: Record<string, unknown>): Promise<Cable | null> {
  const columnas = "id, codigo, cant_hilo, cant_buff, longitud_medida, longitud_calc, estado_const, tipo_red_prin, id_elem_from, id_elem_to"
  const id = texto(args.id)
  if (UUID.test(id)) return (await filas<Cable>(cliente("geo_fiber").from("cable_fibra").select(columnas).eq("id", id)))[0] ?? null
  const codigo = texto(args.codigo)
  if (!codigo) return null
  return (await filas<Cable>(cliente("geo_fiber").from("cable_fibra").select(columnas).eq("codigo", codigo).limit(1)))[0] ?? null
}

/** Los ids de hilos (de esa lista) que tienen alguna conexión registrada, por tandas para no alargar la URL. */
async function hilosConectados(ids: string[]): Promise<Set<string>> {
  const conectados = new Set<string>()
  for (let i = 0; i < ids.length; i += 50) {
    const tanda = ids.slice(i, i + 50)
    const [padres, hijos] = await Promise.all([
      filas<{ id_hilo_padre: string }>(cliente("tab_fiber").from("conectividad_fina").select("id_hilo_padre").in("id_hilo_padre", tanda)),
      filas<{ id_hilo_hijo: string }>(cliente("tab_fiber").from("conectividad_fina").select("id_hilo_hijo").in("id_hilo_hijo", tanda)),
    ])
    padres.forEach((f) => conectados.add(f.id_hilo_padre))
    hijos.forEach((f) => conectados.add(f.id_hilo_hijo))
  }
  return conectados
}

/** El trace leído con la misma ruta que usa la ventana «Recorrido del trace». */
export type LeerTrace = (idOrigen: string, direccion: "UPSTREAM" | "DOWNSTREAM") => Promise<Record<string, unknown>>

/** Direcciones en OpenStreetMap (la ruta /api/geocode), prefiriendo lo que queda cerca de `cerca`. */
export type Geocodificar = (
  texto: string,
  cerca: { lon: number; lat: number } | null,
) => Promise<{ etiqueta: string; lon: number; lat: number }[]>

/** Los cables con el largo de su trazado (la capa del mapa, /api/fiber-cables). */
export type LeerCables = () => Promise<{ hilos: number | null; largoM: number }[]>

/**
 * El largo de una línea en metros, sobre la Tierra, sumando sus tramos: lo
 * mismo que mide el mapa (`getLength` de OpenLayers) para «Fibra total» y el
 * Resumen. Acepta LineString o MultiLineString en longitud, latitud.
 */
export function largoDeLineaM(geometria: { type?: string; coordinates?: unknown } | null | undefined): number {
  if (!geometria || !Array.isArray(geometria.coordinates)) return 0
  const lineas = (geometria.type === "MultiLineString" ? geometria.coordinates : [geometria.coordinates]) as unknown[]
  let total = 0
  for (const linea of lineas) {
    if (!Array.isArray(linea)) continue
    for (let i = 1; i < linea.length; i++) {
      const a = linea[i - 1]
      const b = linea[i]
      if (Array.isArray(a) && Array.isArray(b)) total += distanciaM([Number(a[0]), Number(a[1])], [Number(b[0]), Number(b[1])])
    }
  }
  return Number.isFinite(total) ? total : 0
}

/** Las cubiertas con su punto (la capa del mapa, /api/mufas). */
export type LeerCubiertas = () => Promise<{ etiqueta: string | null; nivel: string | null; lon: number; lat: number }[]>

/**
 * Lo básico de GISmart, para la ayuda: lo que no sale de la cinta. Revisado
 * contra el programa el 15 de octubre de 2026; si cambia un atajo o un botón,
 * hay que cambiarlo aquí también.
 */
const GUIA = [
  "Ctrl+K busca cubiertas, cables, direcciones, coordenadas y funciones de la cinta.",
  "Ctrl+I abre o cierra este asistente.",
  "La tecla ? muestra todos los atajos; los números eligen las herramientas del mapa (la barra de la izquierda).",
  "Para mover, renombrar, crear o quitar elementos hay que activar su capa: Inicio › Capas › Activar capa, o tocando la capa en el panel de la izquierda.",
  "La conectividad de una cubierta se consulta con «Conectividad fina» (pestaña Consultas); después se ve con «Ver conexiones» en su ficha.",
  "Trace de un hilo: Red de fibra › Consultas › Hilos, elegir el cable en el mapa, seleccionar el hilo en la tabla y pulsar «Hacia la fuente» o «Hacia abajo». O en Red de fibra › Reportes › Trace, pegar el UUID del hilo o del puerto y pulsar «Hacia arriba» o «Hacia abajo» (esos botones hacen el recorrido; no hay otro). También se le puede pedir a este asistente.",
  "La tabla de atributos (Avanzado › Consulta › Tabla) se exporta a Excel con el botón de la hoja de cálculo de su barra («Exportar a Excel»): sale lo que se ve en la tabla.",
  "La pestaña Avanzado tiene Resumen, Tabla de atributos, Consultar por atributos, Cercanía, Marcadores, Imprimir y este asistente.",
]

const entre = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Minúsculas y sin tildes, para comparar el nivel como lo escriba Gemini. */
const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()

/**
 * Las etiquetas de las cubiertas de un nivel («primer», «segundo», «empalme»:
 * basta parte del nombre). Sin esto, «las de primer nivel» obligaba a Gemini a
 * buscar de a 12 por nombre y se quedaba sin vueltas. `funcion_cub` es un enum
 * en la base (Primer nivel, Segundo nivel, Empalme) y PostgREST no acepta
 * `ilike` sobre un enum (42883), así que se filtra aquí: son pocas filas.
 */
async function etiquetasPorNivel(nivel: string): Promise<{ etiquetas: string[]; sinEtiqueta: number }> {
  const buscado = plano(nivel)
  const cubiertas = await filas<Cubierta>(cliente("geo_fiber").from("cubierta_empalme").select("id, etiqueta, funcion_cub").limit(1000))
  const delNivel = cubiertas.filter((c) => c.funcion_cub && plano(c.funcion_cub).includes(buscado))
  const etiquetas = delNivel.map((c) => c.etiqueta?.trim() ?? "").filter(Boolean)
  return {
    etiquetas: [...new Set(etiquetas)].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    // Las de empalme no tenían etiqueta en la base (15 de octubre de 2026):
    // sin decirlo, Gemini las seguía buscando por nombre.
    sinEtiqueta: delNivel.length - etiquetas.length,
  }
}

export function herramientasDelAsistente({
  acciones,
  leerTrace,
  geocodificar,
  leerCubiertas,
  leerCables,
}: {
  acciones: AccionDelAsistente[]
  leerTrace: LeerTrace
  geocodificar?: Geocodificar
  leerCubiertas?: LeerCubiertas
  leerCables?: LeerCables
}): Herramienta[] {
  return [
    {
      name: "buscar_elementos",
      description:
        "Busca cubiertas (cajas de empalme), cables y cabeceras por parte de su nombre o código, o lista todas las cubiertas de un nivel. Úsala para encontrar algo antes de pedir su ficha.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Parte de la etiqueta de la cubierta (CO19, 13/14), del código del cable (2102262) o del nombre de la cabecera" },
          tipo: { type: "string", enum: ["cubierta", "cable", "cabecera"], description: "Para buscar solo en un tipo" },
          nivel: {
            type: "string",
            description: "Para listar todas las cubiertas de un nivel: «primer», «segundo» o «empalme» (sin texto devuelve solo sus etiquetas)",
          },
        },
      },
      async ejecutar(args) {
        const q = texto(args.texto)
        const nivel = texto(args.nivel, 40)
        if (nivel && !q) {
          const { etiquetas, sinEtiqueta } = await etiquetasPorNivel(nivel)
          return {
            nivel,
            cubiertas: etiquetas.length + sinEtiqueta,
            etiquetas,
            ...(sinEtiqueta ? { aviso: `${sinEtiqueta} de estas cubiertas no tienen etiqueta en la base: no se pueden nombrar ni seleccionar por nombre.` } : {}),
          }
        }
        if (!q) return { error: "Falta el texto a buscar (o el nivel, para listar las cubiertas de un nivel)." }
        const patron = `%${sinComodines(q)}%`
        const tipo = texto(args.tipo)
        const [cubiertas, cables, cabeceras] = await Promise.all([
          !tipo || tipo === "cubierta"
            ? filas<Cubierta>(cliente("geo_fiber").from("cubierta_empalme").select("id, etiqueta, funcion_cub").ilike("etiqueta", patron).limit(LIMITE))
            : [],
          !tipo || tipo === "cable"
            ? filas<Cable>(cliente("geo_fiber").from("cable_fibra").select("id, codigo, cant_hilo, longitud_medida, longitud_calc, id_elem_from, id_elem_to").ilike("codigo", patron).limit(LIMITE))
            : [],
          !tipo || tipo === "cabecera"
            ? filas<{ id: string; nombre: string | null }>(cliente("geo_infra").from("cabecera_central").select("id, nombre").ilike("nombre", patron).limit(LIMITE))
            : [],
        ])
        return {
          cubiertas: cubiertas.map((c) => ({ id: c.id, etiqueta: c.etiqueta, nivel: c.funcion_cub })),
          cables: cables.map((c) => ({ id: c.id, codigo: c.codigo, hilos: c.cant_hilo, largo_m: largoDe(c) })),
          cabeceras: cabeceras.map((c) => ({ id: c.id, nombre: c.nombre })),
        }
      },
    },
    {
      name: "resumen_red",
      description: "Totales de la red: cubiertas por nivel, cables y kilómetros por cantidad de hilos, y cabeceras.",
      parameters: { type: "object", properties: {} },
      async ejecutar() {
        const [cubiertas, cables, cabeceras] = await Promise.all([
          filas<Cubierta>(cliente("geo_fiber").from("cubierta_empalme").select("id, etiqueta, funcion_cub").limit(1000)),
          filas<Cable>(cliente("geo_fiber").from("cable_fibra").select("id, codigo, cant_hilo, longitud_medida, longitud_calc, id_elem_from, id_elem_to").limit(1000)),
          filas<{ id: string; nombre: string | null }>(cliente("geo_infra").from("cabecera_central").select("id, nombre").limit(100)),
        ])
        const porNivel: Record<string, number> = {}
        for (const c of cubiertas) porNivel[c.funcion_cub ?? "sin dato"] = (porNivel[c.funcion_cub ?? "sin dato"] ?? 0) + 1
        // Los kilómetros, como los mide el mapa («Fibra total», Resumen): el
        // largo del trazado de cada cable. Con las columnas de la base daba
        // 18,75 km y la pantalla 18,73; ahora dicen lo mismo.
        const tramos = leerCables
          ? await leerCables()
          : cables.map((c) => ({ hilos: c.cant_hilo ?? null, largoM: largoDe(c) }))
        const porHilos: Record<string, { cables: number; km: number }> = {}
        for (const t of tramos) {
          const k = t.hilos ? `${t.hilos} hilos` : "sin dato"
          porHilos[k] ??= { cables: 0, km: 0 }
          porHilos[k].cables++
          porHilos[k].km += t.largoM / 1000
        }
        for (const v of Object.values(porHilos)) v.km = Math.round(v.km * 100) / 100
        return {
          cubiertas: cubiertas.length,
          cubiertas_por_nivel: porNivel,
          cables: tramos.length,
          km_de_fibra: Math.round((tramos.reduce((s, t) => s + t.largoM, 0) / 1000) * 100) / 100,
          cables_por_hilos: porHilos,
          cabeceras: cabeceras.map((c) => c.nombre),
        }
      },
    },
    {
      name: "ficha_cubierta",
      description:
        "Los datos de una cubierta: nivel, carcasa, empalme, estado, divisores, los cables que llegan y salen, y cuántas conexiones (fusiones) tiene registradas.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "La etiqueta exacta de la cubierta (CO19, 13/14)" },
          id: { type: "string", description: "El UUID de la cubierta, si se conoce (por ejemplo, si la etiqueta se repite)" },
        },
      },
      async ejecutar(args) {
        const r = await resolverCubierta(args)
        if (!r) return { error: "No hay ninguna cubierta con esa etiqueta o ese UUID." }
        if ("candidatas" in r) {
          return {
            aviso: "Hay varias cubiertas con esa etiqueta; pregunta cuál o usa su id.",
            candidatas: r.candidatas.map((c) => ({ id: c.id, etiqueta: c.etiqueta, nivel: c.funcion_cub })),
          }
        }
        const [cables, divisores] = await Promise.all([
          filas<Cable>(
            cliente("geo_fiber")
              .from("cable_fibra")
              .select("id, codigo, cant_hilo, longitud_medida, longitud_calc, id_elem_from, id_elem_to")
              .or(`id_elem_from.eq.${r.id},id_elem_to.eq.${r.id}`),
          ),
          filas<{ id: string; num_divisor: number | null; modelo_divisor: string | null }>(
            cliente("tab_fiber").from("divisor_optico").select("id, num_divisor, modelo_divisor").eq("id_cubierta_ubica", r.id),
          ),
        ])
        const contenedores = [r.id, ...divisores.map((d) => d.id)]
        const conexiones = await filas<{ tip_elemento_padre: string | null; tip_elemento_hijo: string | null }>(
          cliente("tab_fiber").from("conectividad_fina").select("tip_elemento_padre, tip_elemento_hijo").in("id_contenedor", contenedores),
        )
        const otros = await nombresDe(cables.flatMap((c) => [c.id_elem_from, c.id_elem_to]).filter((x): x is string => !!x && x !== r.id))
        return {
          id: r.id,
          etiqueta: r.etiqueta,
          nivel: r.funcion_cub,
          carcasa: r.tipo_carcasa,
          empalme: r.tipo_empalme,
          estado: r.tipo_est_const,
          direccion: r.direccion,
          divisores: divisores.map((d) => `divisor ${d.num_divisor ?? "?"} (${d.modelo_divisor ?? "modelo sin dato"})`),
          cables: cables.map((c) => ({
            codigo: c.codigo,
            hilos: c.cant_hilo,
            largo_m: largoDe(c),
            // Según cómo se dibujó el cable: si termina en la cubierta, llega a ella.
            sentido: c.id_elem_to === r.id ? "llega" : "sale",
            otro_extremo: (c.id_elem_to === r.id ? otros.get(c.id_elem_from ?? "") : otros.get(c.id_elem_to ?? "")) ?? null,
          })),
          conexiones: {
            total: conexiones.length,
            fusiones_hilo_a_hilo: conexiones.filter((c) => c.tip_elemento_padre === "HILO" && c.tip_elemento_hijo === "HILO").length,
            con_puerto_de_divisor: conexiones.filter((c) => c.tip_elemento_padre === "PUERTO" || c.tip_elemento_hijo === "PUERTO").length,
          },
        }
      },
    },
    {
      name: "ficha_cable",
      description:
        "Los datos de un cable: hilos, buffers, largo, estado, de dónde sale y a dónde llega, y cuántos hilos tienen conexiones registradas. Con con_hilos, la lista de hilos con su UUID (para hacer el trace de un hilo).",
      parameters: {
        type: "object",
        properties: {
          codigo: { type: "string", description: "El código del cable (2102262)" },
          id: { type: "string", description: "El UUID del cable, si se conoce" },
          con_hilos: { type: "boolean", description: "Incluir la lista de hilos (número, buffer, color, UUID y si está conectado)" },
        },
      },
      async ejecutar(args) {
        const cable = await resolverCable(args)
        if (!cable) return { error: "No hay ningún cable con ese código o ese UUID." }
        const hilos = await filas<Hilo>(
          cliente("tab_fiber")
            .from("hilo_cable")
            .select("id, numero_hilo, numero_buffer, color_hilo, color_buffer")
            .eq("id_cable", cable.id)
            .order("numero_hilo")
            .limit(1000),
        )
        const conectados = await hilosConectados(hilos.map((h) => h.id))
        const extremos = await nombresDe([cable.id_elem_from, cable.id_elem_to].filter((x): x is string => !!x))
        return {
          id: cable.id,
          codigo: cable.codigo,
          hilos: cable.cant_hilo,
          buffers: cable.cant_buff,
          largo_m: largoDe(cable),
          estado: cable.estado_const,
          tipo_de_red: cable.tipo_red_prin,
          desde: extremos.get(cable.id_elem_from ?? "") ?? (cable.id_elem_from ? "elemento sin nombre" : "sin dato"),
          hasta: extremos.get(cable.id_elem_to ?? "") ?? (cable.id_elem_to ? "elemento sin nombre" : "sin dato"),
          hilos_registrados: hilos.length,
          hilos_conectados: conectados.size,
          ...(args.con_hilos
            ? {
                lista_de_hilos: hilos.map((h) => ({
                  numero: h.numero_hilo,
                  buffer: h.numero_buffer,
                  color: h.color_hilo,
                  id: h.id,
                  conectado: conectados.has(h.id),
                })),
              }
            : {}),
        }
      },
    },
    {
      name: "trace",
      description:
        "El recorrido ya calculado (trace) desde un hilo o un puerto: hacia arriba (hacia la OLT) o hacia abajo (hacia el usuario). Necesita el UUID del hilo o del puerto (ficha_cable con con_hilos da los de un cable).",
      parameters: {
        type: "object",
        properties: {
          id_origen: { type: "string", description: "UUID del hilo o del puerto" },
          direccion: { type: "string", enum: ["arriba", "abajo"] },
        },
        required: ["id_origen", "direccion"],
      },
      async ejecutar(args) {
        const id = texto(args.id_origen).toLowerCase()
        if (!UUID.test(id)) return { error: "id_origen no es un UUID." }
        const direccion = args.direccion === "abajo" ? "DOWNSTREAM" : "UPSTREAM"
        const r = await leerTrace(id, direccion)
        if (r.message) return { error: String(r.message) }
        if (!r.encontrado) return { encontrado: false, motivo: r.motivo ?? "No hay un recorrido calculado para ese origen en ese sentido." }
        const ruta = (r.tabla as { rutas?: Record<string, unknown>[] } | null)?.rutas?.[0]
        const filasRuta = (ruta?.filas as Record<string, unknown>[] | undefined) ?? []
        return {
          encontrado: true,
          pasos: r.totalPasos,
          atenuacion_db: r.atenuacionTotal,
          largo_m: ruta?.sumaM ?? null,
          llega_a: ruta?.final ?? null,
          llega_completo: ruta?.llega ?? null,
          divisores: ruta?.divisores ?? [],
          rutas: (r.tabla as { rutas?: unknown[] } | null)?.rutas?.length ?? 0,
          recorrido: filasRuta.slice(0, 40).map((f) =>
            [f.tipo, f.nombre ?? f.codigoUbica, f.ubica, f.nombreContenedor ?? f.contenedor].filter(Boolean).join(" · "),
          ),
          calculado: r.calculadoEn,
        }
      },
    },
    {
      name: "mostrar_en_mapa",
      description: "Lleva el mapa del usuario a una cubierta, un cable o una cabecera y abre su ficha.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["cubierta", "cable", "cabecera"] },
          nombre: { type: "string", description: "La etiqueta de la cubierta, el código del cable o el nombre de la cabecera" },
        },
        required: ["tipo", "nombre"],
      },
      async ejecutar(args) {
        const nombre = texto(args.nombre)
        const capa = args.tipo === "cable" ? "cable" : args.tipo === "cabecera" ? "cabecera" : "cubierta"
        if (!nombre) return { error: "Falta el nombre." }
        acciones.push({ tipo: "mostrar", capa, nombre })
        return { hecho: `El mapa irá a ${capa} ${nombre}.` }
      },
    },
    {
      name: "seleccionar_en_mapa",
      description:
        "Selecciona varias cubiertas o varios cables en el mapa del usuario (resaltados) y los muestra en la tabla de atributos. Para todas las cubiertas de un nivel, usa «nivel» en vez de los nombres.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["cubierta", "cable"] },
          nombres: { type: "array", items: { type: "string" }, description: "Etiquetas de las cubiertas o códigos de los cables" },
          nivel: { type: "string", description: "Solo cubiertas: «primer», «segundo» o «empalme» para seleccionar todas las de ese nivel" },
        },
        required: ["tipo"],
      },
      async ejecutar(args) {
        const nivel = args.tipo === "cable" ? "" : texto(args.nivel, 40)
        if (nivel) {
          // El navegador elige por el nivel de cada cubierta en el mapa: así
          // entran también las que no tienen etiqueta (las de empalme).
          const { etiquetas, sinEtiqueta } = await etiquetasPorNivel(nivel)
          const total = etiquetas.length + sinEtiqueta
          if (total === 0) return { error: `No hay cubiertas con el nivel «${nivel}».` }
          acciones.push({ tipo: "seleccionar", capa: "cubierta", nombres: etiquetas, nivel })
          return {
            hecho: `Quedarán seleccionadas las ${total} cubiertas de ese nivel en el mapa y en la tabla.`,
            ...(sinEtiqueta ? { aviso: `${sinEtiqueta} no tienen etiqueta en la base; se ven en la tabla sin nombre.` } : {}),
          }
        }
        const nombres = (Array.isArray(args.nombres) ? args.nombres : []).map((n) => texto(n)).filter(Boolean).slice(0, 300)
        if (nombres.length === 0) return { error: "Faltan los nombres." }
        acciones.push({ tipo: "seleccionar", capa: args.tipo === "cable" ? "cable" : "cubierta", nombres })
        return { hecho: `Quedarán seleccionados ${nombres.length} en el mapa y en la tabla.` }
      },
    },
    {
      name: "abrir_trace",
      description: "Abre en la pantalla del usuario la ventana del trace con el recorrido pintado en el mapa.",
      parameters: {
        type: "object",
        properties: {
          id_origen: { type: "string", description: "UUID del hilo o del puerto" },
          direccion: { type: "string", enum: ["arriba", "abajo"] },
          etiqueta: { type: "string", description: "Cómo se llama el origen, por ejemplo «Hilo 5 del cable 2102262»" },
        },
        required: ["id_origen", "direccion"],
      },
      async ejecutar(args) {
        const id = texto(args.id_origen).toLowerCase()
        if (!UUID.test(id)) return { error: "id_origen no es un UUID." }
        acciones.push({ tipo: "trace", idOrigen: id, direccion: args.direccion === "abajo" ? "DOWNSTREAM" : "UPSTREAM", etiqueta: texto(args.etiqueta) || null })
        return { hecho: "Se abrirá la ventana del trace con el recorrido en el mapa." }
      },
    },
    {
      name: "ayuda_gismart",
      description:
        "Dónde está cada función de GISmart (la cinta de arriba) y para qué sirve, y lo básico del programa (atajos, cómo editar). Úsala cuando pregunten cómo hacer algo en GISmart o dónde está una función.",
      parameters: {
        type: "object",
        properties: {
          tema: { type: "string", description: "Palabras clave de lo que se quiere hacer: «trace», «hilos», «medir distancia», «exportar excel»" },
        },
        required: ["tema"],
      },
      async ejecutar(args) {
        const tema = texto(args.tema)
        const comandos = comandosDeLaCinta()
        let hallados = buscarComandos(comandos, tema, 6)
        // Con una frase entera («cómo exporto la tabla a excel») no coincide
        // nada: se prueba palabra por palabra.
        if (hallados.length === 0) {
          const vistos = new Set<string>()
          hallados = tema
            .split(/\s+/)
            .filter((p) => p.length >= 4)
            .flatMap((p) => buscarComandos(comandos, p, 3))
            .filter((c) => !vistos.has(c.id) && Boolean(vistos.add(c.id)))
            .slice(0, 6)
        }
        return {
          funciones: hallados.map((c) => ({ funcion: c.etiqueta, donde: c.ruta, que_hace: c.descripcion })),
          basico: GUIA,
        }
      },
    },
    {
      name: "cerca_de",
      description:
        "Las cubiertas más cercanas a una dirección, una coordenada o una cubierta, con su distancia en metros, y marca el punto con un círculo en el mapa del usuario. Para «¿qué cubierta queda más cerca de…?». La red está en La Unión (Valle del Cauca).",
      parameters: {
        type: "object",
        properties: {
          direccion: { type: "string", description: "Dirección o lugar («Calle 12 # 5-30», «parque principal») o una coordenada «4.533, -76.103»" },
          cubierta: { type: "string", description: "Etiqueta de una cubierta, para buscar alrededor de ella" },
          nivel: { type: "string", description: "Solo cubiertas de ese nivel: «primer», «segundo» o «empalme»" },
          radio_m: { type: "number", description: "Radio del círculo en metros (por defecto 300)" },
          cantidad: { type: "number", description: "Cuántas devolver (por defecto 5, como mucho 10)" },
        },
      },
      async ejecutar(args) {
        if (!leerCubiertas) return { error: "La búsqueda por cercanía no está disponible en el servidor." }
        const cubiertas = (await leerCubiertas()).filter((c) => Number.isFinite(c.lon) && Number.isFinite(c.lat))
        const nombre = texto(args.cubierta, 40)
        const direccion = texto(args.direccion, 120)
        let centro: { lon: number; lat: number; lugar: string; aproximado: boolean }
        if (nombre) {
          const c = cubiertas.find((x) => x.etiqueta && plano(x.etiqueta) === plano(nombre))
          if (!c) return { error: `No encontré la cubierta «${nombre}» en el mapa.` }
          centro = { lon: c.lon, lat: c.lat, lugar: `la cubierta ${c.etiqueta}`, aproximado: false }
        } else if (direccion) {
          const coordenada = leerCoordenada(direccion)
          if (coordenada) {
            centro = { ...coordenada, lugar: textoDeCoordenada(coordenada), aproximado: false }
          } else {
            if (!geocodificar) return { error: "La búsqueda de direcciones no está disponible en el servidor." }
            // Las direcciones se buscan en el municipio de la red, salvo que nombren otro.
            const enLaRed = cubiertas.length
              ? {
                  lon: cubiertas.reduce((suma, c) => suma + c.lon, 0) / cubiertas.length,
                  lat: cubiertas.reduce((suma, c) => suma + c.lat, 0) / cubiertas.length,
                }
              : null
            const consulta = /uni[oó]n|valle|cauca|,/i.test(direccion) ? direccion : `${direccion}, La Unión, Valle del Cauca`
            const encontradas = await geocodificar(consulta, enLaRed)
            if (encontradas.length === 0) {
              return {
                error: `No encontré «${direccion}» en las direcciones de OpenStreetMap. Prueba escribiéndola de otra forma, con un lugar conocido o con una coordenada.`,
              }
            }
            centro = { lon: encontradas[0].lon, lat: encontradas[0].lat, lugar: encontradas[0].etiqueta, aproximado: true }
          }
        } else {
          return { error: "Falta la dirección, la coordenada o la cubierta." }
        }

        const radio = Math.round(entre(Number(args.radio_m) || 300, 20, 5000))
        const cantidad = Math.round(entre(Number(args.cantidad) || 5, 1, 10))
        const nivel = texto(args.nivel, 40)
        const candidatas = cubiertas
          .filter((c) => !nivel || (c.nivel !== null && plano(c.nivel).includes(plano(nivel))))
          .filter((c) => !(nombre && c.etiqueta && plano(c.etiqueta) === plano(nombre)))
          .map((c) => ({
            etiqueta: c.etiqueta ?? "(sin etiqueta)",
            nivel: c.nivel,
            distancia_m: Math.round(distanciaM([centro.lon, centro.lat], [c.lon, c.lat])),
          }))
          .sort((a, b) => a.distancia_m - b.distancia_m)
        const dentro = candidatas.filter((c) => c.distancia_m <= radio)
        acciones.push({ tipo: "cercania", lon: centro.lon, lat: centro.lat, radioM: radio, etiqueta: centro.lugar.slice(0, 60) })
        return {
          punto: {
            lugar: centro.lugar,
            ...(centro.aproximado ? { aviso: "Ubicación aproximada según OpenStreetMap: que el usuario confirme en el mapa el punto marcado." } : {}),
          },
          radio_m: radio,
          dentro_del_radio: dentro.length,
          mas_cercanas: (dentro.length ? dentro : candidatas).slice(0, cantidad),
          ...(dentro.length === 0 && candidatas.length ? { nota: `Ninguna dentro de ${radio} m: estas son las más cercanas.` } : {}),
        }
      },
    },
  ]
}

/** Las instrucciones del asistente: quién es, qué sabe de la red y cómo responder. */
export const INSTRUCCIONES = `Eres el asistente de GISmart, el SIG de la red de fibra óptica FTTH de G&G Technology en La Unión (Valle del Cauca, Colombia). Respondes en español a técnicos e ingenieros de la red, que quieren el dato y seguir trabajando.

Cómo responder (lo más importante):
- La primera línea ES la respuesta: la cifra, el nombre o el sí/no. En negrita solo ese dato clave, nunca la frase entera. Sin introducciones («Claro», «Aquí tienes», «En la red de La Unión hay…») y sin repetir la pregunta.
- Responde solo lo que se preguntó. Un dato que no pidieron no va en la respuesta; si es útil, ponlo como sugerencia.
- Corto: una o dos líneas casi siempre. Lista o tabla solo con tres elementos o más; una tabla de cinco filas como mucho, salvo que pidan todo.
- No cuentes lo que hiciste en el mapa (el panel ya lo muestra con fichas) ni ofrezcas más ayuda al final (para eso están las sugerencias).
- Preguntas de concepto: dos frases como mucho, solo con lo que se sabe de esta red, sin suponer.
- «¿Cómo hago…?» o «¿dónde está…?»: los pasos en una lista numerada corta, tal como los devuelve ayuda_gismart (pestaña › grupo › botón y qué pulsar). Nunca inventes clics, botones ni ventanas.
- Si falta un dato para responder (qué cubierta, qué cable), pregunta solo eso, en una línea.
- Cifras con su unidad y coma decimal: 18,73 km, 116,7 m, 0,5 dB.

Ejemplos de forma (las cifras y los nombres de estos ejemplos son inventados: los datos salen siempre de las herramientas):
- «¿Cuántas cubiertas hay?» → «**120 cubiertas**: 15 de primer nivel, 103 de segundo y 2 de empalme.»
- «¿Qué cables llegan a CO50?» → «Llega el **2100001** (144 hilos, 80,2 m) desde CO49; sale el **2100002** (48 hilos, 60,5 m) hacia N7.»
- «¿A dónde llega el hilo 3 del cable 2100001?» → «Al **puerto 2 de la OLT** en el **HUB LA UNION**: 8 pasos, 4,1 km y 0,4 dB.»
- «¿Qué cubierta queda más cerca de…?» → «**7-may** (segundo nivel), a **20 m**. Le siguen 9-sep (41 m) y CO40 (75 m).»

Cómo es la red:
- Una cabecera central (HUB LA UNION) con la OLT. De ahí salen cables de fibra hacia cubiertas de empalme (también llamadas mufas o cajas de empalme).
- Las cubiertas son de primer nivel (con divisores que reparten la señal), de segundo nivel (cerca de los usuarios) o de empalme (solo fusiones).
- Cada cable tiene hilos agrupados en buffers (12 hilos por buffer, con colores). Las fusiones unen hilos de cables distintos dentro de una cubierta; los divisores tienen una entrada (E1) y salidas (S1…S8).
- El trace es el recorrido de un hilo o un puerto: «hacia arriba» va hacia la OLT y «hacia abajo» hacia el usuario. Está ya calculado en la base.

Reglas:
- Usa las herramientas para cualquier dato de la red; nunca inventes cifras, nombres ni UUID. Si una herramienta devuelve un error, dilo tal cual y sugiere qué hacer.
- Solo consultas: no puedes crear, borrar ni cambiar nada de la red. Si te lo piden, explica que eso se hace en el SIG con la capa activa.
- Para ubicar algo en el mapa usa mostrar_en_mapa; para varias cosas, seleccionar_en_mapa; para pintar un recorrido, abrir_trace.
- Para el trace de «el hilo N del cable X»: pide ficha_cable con con_hilos para conseguir el UUID del hilo y luego usa trace (o abrir_trace si quieren verlo).
- Para «todas las de primer nivel» (o segundo, o empalme) usa el parámetro nivel: en buscar_elementos para listarlas, en seleccionar_en_mapa para seleccionarlas.
- Da las longitudes en metros o kilómetros y la atenuación en dB. No muestres UUID salvo que te los pidan.
- En tus respuestas di siempre «cubierta», nunca «mufa», aunque el usuario diga mufa.
- Si preguntan cómo hacer algo en GISmart o dónde está una función, usa ayuda_gismart y di dónde está (pestaña › grupo › botón).
- Para «¿qué cubierta queda más cerca de…?» usa cerca_de. Si la ubicación es aproximada, dilo y pide confirmar el punto marcado en el mapa.
- Para comparar varias cosas usa una tabla en Markdown (| columna | columna |); para pasos, una lista numerada corta.
- Termina siempre con una última línea «Sugerencias: » y hasta tres preguntas cortas de seguimiento que el usuario podría hacerte a continuación, separadas por « | ». Solo preguntas que puedas responder con tus herramientas y sobre lo que se está hablando.`
