import { clienteSupabase } from "@/lib/supabase-servidor"
import type { AccionDelAsistente } from "../acciones"
import type { Herramienta } from "./gemini"

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

export function herramientasDelAsistente({ acciones, leerTrace }: { acciones: AccionDelAsistente[]; leerTrace: LeerTrace }): Herramienta[] {
  return [
    {
      name: "buscar_elementos",
      description:
        "Busca cubiertas (cajas de empalme o mufas), cables y cabeceras por parte de su nombre o código. Úsala para encontrar algo antes de pedir su ficha.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Parte de la etiqueta de la cubierta (CO19, 13/14), del código del cable (2102262) o del nombre de la cabecera" },
          tipo: { type: "string", enum: ["cubierta", "cable", "cabecera"], description: "Para buscar solo en un tipo" },
        },
        required: ["texto"],
      },
      async ejecutar(args) {
        const q = texto(args.texto)
        if (!q) return { error: "Falta el texto a buscar." }
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
        const porHilos: Record<string, { cables: number; km: number }> = {}
        for (const c of cables) {
          const k = c.cant_hilo ? `${c.cant_hilo} hilos` : "sin dato"
          porHilos[k] ??= { cables: 0, km: 0 }
          porHilos[k].cables++
          porHilos[k].km = Math.round((porHilos[k].km + largoDe(c) / 1000) * 100) / 100
        }
        return {
          cubiertas: cubiertas.length,
          cubiertas_por_nivel: porNivel,
          cables: cables.length,
          km_de_fibra: Math.round((cables.reduce((s, c) => s + largoDe(c), 0) / 1000) * 100) / 100,
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
      description: "Selecciona varias cubiertas o varios cables en el mapa del usuario (resaltados) y los muestra en la tabla de atributos.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["cubierta", "cable"] },
          nombres: { type: "array", items: { type: "string" }, description: "Etiquetas de las cubiertas o códigos de los cables" },
        },
        required: ["tipo", "nombres"],
      },
      async ejecutar(args) {
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
  ]
}

/** Las instrucciones del asistente: quién es, qué sabe de la red y cómo responder. */
export const INSTRUCCIONES = `Eres el asistente de GISmart, el SIG de la red de fibra óptica FTTH de G&G Technology en La Unión (Valle del Cauca, Colombia). Respondes en español, claro y breve, a técnicos e ingenieros de la red.

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
- Da las longitudes en metros o kilómetros y la atenuación en dB. No muestres UUID salvo que te los pidan.`
