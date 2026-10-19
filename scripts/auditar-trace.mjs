/**
 * Auditoría del trace contra la base real: que la tabla de la ventana diga lo
 * mismo que la base, en todos los recorridos de la caché.
 *
 *   pnpm run auditar-trace
 *
 * Pide cada recorrido de `tab_fiber.element_connection` (los dos sentidos) a
 * la ruta de verdad, como lo hace el tablero, y compara cada fila con su tabla
 * de origen: el hilo (número, buffer, colores), su cable (código y longitud),
 * el puerto, el divisor y su cubierta, la tarjeta o bandeja y su equipo, la
 * central. Además:
 *
 *   - la Suma es la suma de las longitudes y ningún cable se cuenta dos veces;
 *   - dos filas seguidas son un paso de la caché o el cruce de un divisor;
 *   - cada paso de la caché sigue en `tab_fiber.conectividad_fina` con el mismo
 *     tipo de conexión y atenuación (si no, la caché quedó vieja);
 *   - los hilos dicen lo mismo que Gestión de hilos (`fn_obtener_hilos_cable_json`);
 *   - el Excel de cada ruta se arma sin errores;
 *   - y cuenta los elementos con conectividad que no tienen recorrido en la
 *     caché en algún sentido (la ventana explica por qué).
 *
 * Tarda unos 3 minutos. Solo lee: no llama la función del trace (cada llamada
 * deja una fila en su log). Sale con código 1 si algo no cuadra. Conviene
 * correrla cada vez que el ingeniero recalcule la caché.
 */
import { readFileSync } from "node:fs"

const env = readFileSync(".env.local", "utf8")
for (const linea of env.split(/\r?\n/)) {
  const i = linea.indexOf("=")
  if (i > 0 && !linea.startsWith("#")) process.env[linea.slice(0, i).trim()] = linea.slice(i + 1).trim()
}

const { emitirToken, COOKIE_SESION } = await import("../lib/auth-server.ts")
const { GET } = await import("../app/api/traces/[direccion]/[id]/route.ts")
const { clasificarRespuestaTrace, familiaDePuerto, normalizarPasos } = await import("../lib/map/trace.ts")
const { clienteSupabase } = await import("../lib/supabase-servidor.ts")
const { hojaDelTrace } = await import("../lib/map/trace-excel.ts")
const { crearXlsx } = await import("../lib/excel.ts")
const { normalizarHilos, colorParaMostrar } = await import("../lib/map/hilos-cable.ts")
const cookie = `${COOKIE_SESION}=${encodeURIComponent(emitirToken("auditoria-trace", "usuario"))}`

async function todas(esquema, tabla, columnas) {
  const c = clienteSupabase(esquema)
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await c.from(tabla).select(columnas).order("id").range(desde, desde + 999)
    if (error) throw new Error(`${esquema}.${tabla}: ${error.message}`)
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}
const porId = (filas) => new Map(filas.map((f) => [f.id, f]))
const [cache, hilos, puertos, divisores, cubiertas, tarjetas, equipos, cabeceras, cables, conectividad] = await Promise.all([
  todas("tab_fiber", "element_connection", "id, id_origen, direccion"),
  todas("tab_fiber", "hilo_cable", "id, id_cable, numero_hilo, numero_buffer, color_hilo, color_buffer").then(porId),
  // Por familia, como la ruta: la base los nombra DIV_N1, DIV_N2, TJT_OLT, BDJ_ODF.
  todas("tab_fiber", "puerto_equipo", "id, nombre, numero_puerto, tipo_equipo_pert, id_equipo_pert, dir_principal_senhal")
    .then((filas) => filas.map((p) => ({ ...p, tipo_equipo_pert: familiaDePuerto(p.tipo_equipo_pert) })))
    .then(porId),
  todas("tab_fiber", "divisor_optico", "id, num_divisor, cod_divisor, id_cubierta_ubica").then(porId),
  todas("geo_fiber", "cubierta_empalme", "id, etiqueta, funcion_cub").then(porId),
  todas("tab_fiber", "tarjeta_bandeja_eqp", "id, num_slot, tipo_equipo, id_equipo").then(porId),
  todas("tab_fiber", "equipo_red", "id, codigo, id_cabecera").then(porId),
  todas("geo_infra", "cabecera_central", "id, nombre").then(porId),
  todas("geo_fiber", "cable_fibra", "id, codigo, longitud_medida, longitud_calc").then(porId),
  todas("tab_fiber", "conectividad_fina", "id, id_hilo_padre, id_puerto_padre, id_hilo_hijo, id_puerto_hijo, tipo_conexion, atenuacion_db"),
])
console.log(`\nLa base: ${cache.length} recorridos en la caché, ${conectividad.length} conexiones, ${hilos.size} hilos, ${puertos.size} puertos, ${cables.size} cables.\n`)

// Lo que debería decir cada fila, leído directo de la base.
const texto = (v) => (v === null || v === undefined || v === "" ? null : String(v))
const positivo = (v) => (Number(v) > 0 ? Number(v) : null)
const nivel = (f) => (!f ? "Cubierta" : /primer/i.test(f) ? "Cub nivel 1" : /segundo/i.test(f) ? "Cub nivel 2" : /tercer/i.test(f) ? "Cub nivel 3" : `Cubierta (${f})`)
const UBICA = { DIV: "Divisor", TJT: "Tarjeta", BDJ: "Bandeja" }
function esperado(f) {
  if (f.tipo === "Hilo") {
    const h = hilos.get(f.codigo)
    if (!h) return null
    const c = cables.get(h.id_cable)
    return {
      codigoUbica: texto(h.numero_hilo),
      ubica: h.numero_buffer === null ? null : `Buffer ${h.numero_buffer}`,
      codigoContenedor: h.id_cable,
      nombreContenedor: c?.codigo ?? null,
      longitudM: c ? (positivo(c.longitud_medida) ?? positivo(c.longitud_calc)) : null,
      colorHilo: h.color_hilo,
      colorBuffer: h.color_buffer,
    }
  }
  if (f.tipo === "Puerto") {
    const p = puertos.get(f.codigo)
    if (!p) return null
    const e = { nombre: p.nombre ?? texto(p.numero_puerto), ubica: p.tipo_equipo_pert ? (UBICA[p.tipo_equipo_pert] ?? p.tipo_equipo_pert) : null }
    if (p.tipo_equipo_pert === "DIV") {
      const d = divisores.get(p.id_equipo_pert)
      const cu = d?.id_cubierta_ubica ? cubiertas.get(d.id_cubierta_ubica) : null
      return { ...e, codigoUbica: texto(d?.num_divisor) ?? d?.cod_divisor ?? null, contenedor: nivel(cu?.funcion_cub), codigoContenedor: d?.id_cubierta_ubica ?? null, nombreContenedor: cu?.etiqueta ?? null }
    }
    const t = p.id_equipo_pert ? tarjetas.get(p.id_equipo_pert) : null
    if (!t) return e
    return { ...e, codigoUbica: texto(t.num_slot), contenedor: t.tipo_equipo ?? null, codigoContenedor: t.id_equipo ?? null, nombreContenedor: t.id_equipo ? (equipos.get(t.id_equipo)?.codigo ?? null) : null }
  }
  const cab = cabeceras.get(f.codigo)
  return cab ? { nombre: cab.nombre ?? null } : null
}

const extremo = (f, lado) => f[`id_hilo_${lado}`] ?? f[`id_puerto_${lado}`]
const conexiones = new Map(conectividad.map((f) => [`${extremo(f, "padre")}>${extremo(f, "hijo")}`, f]))

const problemas = new Map()
function anotar(tipo, detalle) {
  const p = problemas.get(tipo) ?? { veces: 0, ejemplos: [] }
  p.veces++
  if (p.ejemplos.length < 3) p.ejemplos.push(detalle)
  problemas.set(tipo, p)
}
const cuenta = { UPSTREAM: { rutas: 0, llegan: 0 }, DOWNSTREAM: { rutas: 0, llegan: 0 } }
const hilosVistos = new Map()
let pasosRevisados = 0
let filasRevisadas = 0

async function revisar({ id_origen: id, direccion }) {
  const dir = direccion === "UPSTREAM" ? "upstream" : "downstream"
  const res = await GET(new Request(`http://local/api/traces/${dir}/${id}`, { headers: { cookie } }), { params: Promise.resolve({ direccion: dir, id }) })
  const r = clasificarRespuestaTrace(res.status, JSON.parse(JSON.stringify(await res.json())))
  if (res.status !== 200 || r.estado !== "ok") return anotar("la ruta no respondió bien", `${dir} ${id}: HTTP ${res.status}`)
  if (!r.encontrado) return anotar("un recorrido de la caché que la ruta no encuentra", `${dir} ${id}`)
  if (r.errorTabla || !r.tabla) return anotar("la tabla no se pudo armar", `${dir} ${id}: ${r.errorTabla?.mensaje}`)
  const pasos = [...r.pasos, ...r.tramos.flatMap((t) => t.pasos)]
  for (const p of pasos) {
    if (p.contenedor.tipo === "DIVISOR_INTERNO") continue
    pasosRevisados++
    const c = conexiones.get(`${p.origen.id}>${p.destino.id}`) ?? conexiones.get(`${p.destino.id}>${p.origen.id}`)
    if (!c) anotar("un paso de la caché que ya no está en conectividad_fina (caché vieja)", `${dir} ${id} paso ${p.paso}`)
    else if (p.conexion && c.tipo_conexion && p.conexion !== c.tipo_conexion) anotar("un paso con otro tipo de conexión que en conectividad_fina", `${dir} ${id} paso ${p.paso}`)
    else if (p.atenuacionDb !== null && c.atenuacion_db !== null && Math.abs(p.atenuacionDb - Number(c.atenuacion_db)) > 1e-6) anotar("un paso con otra atenuación que en conectividad_fina", `${dir} ${id} paso ${p.paso}`)
  }
  r.tabla.rutas.forEach((ruta, i) => {
    cuenta[direccion].rutas++
    if (ruta.llega) cuenta[direccion].llegan++
    let suma = 0
    for (const f of ruta.filas) {
      filasRevisadas++
      const e = esperado(f)
      if (!e) {
        anotar(`${f.tipo.toLowerCase()} de la tabla que no está en la base`, `${dir} ${id}: ${f.codigo}`)
        continue
      }
      for (const [k, v] of Object.entries(e)) {
        if (String(f[k] ?? null) !== String(v ?? null)) anotar(`${f.tipo.toLowerCase()}: «${k}» distinto a la base`, `${dir} ${id}: tabla ${f[k]} · base ${v}`)
      }
      if (f.tipo === "Hilo") {
        suma += f.longitudM ?? 0
        hilosVistos.set(f.codigo, f)
        if (f.colorHilo && !colorParaMostrar(f.colorHilo, null)) anotar("un color de hilo que la app no conoce", f.colorHilo)
      }
    }
    if (Math.abs(ruta.sumaM - Math.round(suma * 100) / 100) > 0.005) anotar("la Suma no es la suma de las longitudes", `${dir} ${id}: ${ruta.sumaM}`)
    const delRecorrido = ruta.filas.filter((f) => f.tipo === "Hilo").map((f) => f.codigoContenedor)
    if (new Set(delRecorrido).size !== delRecorrido.length) anotar("un cable contado dos veces en una ruta", `${dir} ${id}`)
    const elementos = ruta.filas.filter((f) => f.tipo !== "Central").map((f) => f.codigo)
    for (let k = 0; k + 1 < elementos.length; k++) {
      const a = puertos.get(elementos[k])
      const b = puertos.get(elementos[k + 1])
      const cruce = a?.tipo_equipo_pert === "DIV" && b?.tipo_equipo_pert === "DIV" && a.id_equipo_pert === b.id_equipo_pert
      if (!cruce && !pasos.some((p) => p.origen.id === elementos[k] && p.destino.id === elementos[k + 1])) {
        anotar("dos filas seguidas que no son un paso", `${dir} ${id}`)
      }
    }
    try {
      crearXlsx(hojaDelTrace({ direccion, ruta, origen: null, idOrigen: id, numeroDeRuta: i + 1, totalDeRutas: r.tabla.rutas.length, pasos: r.totalPasos, atenuacionDb: r.atenuacionTotal, calculadoEn: null, exportadoEn: "hoy", avisos: r.tabla.avisos }))
    } catch (e) {
      anotar("el Excel de una ruta falla", `${dir} ${id}: ${e.message}`)
    }
  })
}

const t0 = Date.now()
const cola = [...cache]
let hechos = 0
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cola.length) {
      await revisar(cola.shift())
      if (++hechos % 200 === 0) process.stdout.write(`   ${hechos} de ${cache.length}…\n`)
    }
  }),
)

// Los hilos, contra Gestión de hilos.
const porCable = new Map()
for (const f of hilosVistos.values()) porCable.set(f.codigoContenedor, [...(porCable.get(f.codigoContenedor) ?? []), f])
for (const [idCable, filas] of porCable) {
  const { data, error } = await clienteSupabase("tab_fiber").rpc("fn_obtener_hilos_cable_json", { p_id_cable: idCable })
  if (error) {
    anotar("Gestión de hilos no responde para un cable", `${idCable}: ${error.message}`)
    continue
  }
  const deHilos = new Map(normalizarHilos(data).map((h) => [h.uuid, h]))
  for (const f of filas) {
    const h = deHilos.get(f.codigo)
    if (!h) anotar("un hilo del trace que Gestión de hilos no lista", f.codigo)
    else if (String(h.numero) !== f.codigoUbica || `Buffer ${h.buffer}` !== f.ubica || (h.colorHilo ?? null) !== (f.colorHilo ?? null) || (h.colorBuffer ?? null) !== (f.colorBuffer ?? null)) {
      anotar("un hilo que Gestión de hilos muestra distinto", `${f.codigo}: trace ${f.codigoUbica}/${f.ubica} · hilos ${h.numero}/Buffer ${h.buffer}`)
    }
  }
}

// Lo que tiene conectividad y no tiene recorrido en la caché (la ventana dice por qué).
const conectados = new Set(conectividad.flatMap((f) => [extremo(f, "padre"), extremo(f, "hijo")]))
const conRecorrido = { UPSTREAM: new Set(), DOWNSTREAM: new Set() }
for (const f of cache) conRecorrido[f.direccion].add(f.id_origen)
const usadas = new Set()
for (const f of await todas("tab_fiber", "element_connection", "id, path_secuencia")) {
  for (const p of normalizarPasos(f.path_secuencia)) usadas.add(`${p.origen.id}>${p.destino.id}`)
}
const sinUsar = conectividad.filter((f) => !usadas.has(`${extremo(f, "padre")}>${extremo(f, "hijo")}`) && !usadas.has(`${extremo(f, "hijo")}>${extremo(f, "padre")}`))
if (sinUsar.length > 0) anotar("conexiones de conectividad_fina que ningún recorrido de la caché usa (caché vieja)", `${sinUsar.length} conexiones`)

const segundos = Math.round((Date.now() - t0) / 1000)
console.log(`\nRevisados en ${segundos} s: ${cache.length} recorridos, ${filasRevisadas} filas, ${pasosRevisados} pasos, ${hilosVistos.size} hilos contra Gestión de hilos.`)
console.log(`Hacia arriba: ${cuenta.UPSTREAM.llegan} de ${cuenta.UPSTREAM.rutas} rutas llegan a la OLT. Hacia abajo: ${cuenta.DOWNSTREAM.llegan} de ${cuenta.DOWNSTREAM.rutas} llegan a un divisor.`)
for (const d of ["UPSTREAM", "DOWNSTREAM"]) {
  const sin = [...conectados].filter((id) => !conRecorrido[d].has(id)).length
  console.log(`${sin} elementos con conectividad no tienen recorrido ${d === "UPSTREAM" ? "hacia arriba" : "hacia abajo"} en la caché (puertos de la OLT, salidas o entradas de divisor, hilos sueltos).`)
}
if (problemas.size === 0) {
  console.log("\nTodo cuadra: la tabla dice lo mismo que la base.\n")
  process.exit(0)
}
console.log("\nNo cuadra:\n")
for (const [tipo, { veces, ejemplos }] of problemas) {
  console.log(`   FALLA  ${tipo} (${veces})`)
  for (const e of ejemplos) console.log(`          ${e}`)
}
console.log("")
process.exit(1)
