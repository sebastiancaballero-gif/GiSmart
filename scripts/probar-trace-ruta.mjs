/**
 * La ruta del trace (GET /api/traces/{downstream|upstream}/{id}) contra una
 * base de mentira: un servidor local que responde como PostgREST con una red
 * chica (OLT → ODF → hilos → divisores) y al que se le pueden hacer fallar
 * tablas, mandar datos rotos o recorridos enormes. Se mira qué falla y cómo
 * responde la ruta. No necesita Supabase. Se corre con `pnpm run trace-ruta`
 * (con `--lento` también prueba una base que no responde: tarda unos segundos más).
 */
import { createServer } from "node:http"

const LENTO = process.argv.includes("--lento")
const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

// --- La red de prueba -----------------------------------------------------------
const ID = {
  cab: u(1), eOlt: u(2), eOdf: u(3), tOlt: u(4), tOdf: u(5),
  pt: u(10), pb: u(11), pdE: u(12), pdS: u(13), p2E: u(14),
  d1: u(20), d2: u(21), cu1: u(30), cu2: u(31),
  c1: u(40), c2: u(41), c3: u(42), h1: u(50), h2: u(51), h3: u(52), hSinCable: u(53),
}
const paso = (n, o, d, extra = {}) => ({
  paso: n,
  id_contenedor: extra.id_contenedor ?? ID.cu1,
  tipo_contenedor: extra.tipo_contenedor ?? "CUB",
  tipo_conexion: extra.tipo_conexion ?? "FUSION",
  tip_origen: o[0],
  [o[0] === "HILO" ? "hilo_origen" : "puerto_origen"]: o[1],
  tip_destino: d[0],
  [d[0] === "HILO" ? "hilo_destino" : "puerto_destino"]: d[1],
  atenuacion_db: 0.05,
  atenuacion_acumulada: 0.05 * n,
})
const H = (id) => ["HILO", id]
const P = (id) => ["PUERTO", id]
const fila = (id_origen, direccion, pasos, extra = {}) => ({
  id: `${id_origen}-${direccion}`,
  id_origen,
  id_destino: null,
  direccion,
  total_pasos: Array.isArray(pasos) ? pasos.length : null,
  atenuacion_total_db: Array.isArray(pasos) ? 0.05 * pasos.length : null,
  path_secuencia: pasos,
  geom_path: null,
  fecha_calculo: "2026-10-08T08:48:45-05:00",
  ...extra,
})
function base() {
  return {
    "geo_infra.cabecera_central": [{ id: ID.cab, nombre: "HUB PRUEBA" }],
    "tab_fiber.equipo_red": [{ id: ID.eOlt, codigo: "1", id_cabecera: ID.cab }, { id: ID.eOdf, codigo: "1", id_cabecera: ID.cab }],
    "tab_fiber.tarjeta_bandeja_eqp": [
      { id: ID.tOlt, num_slot: 6, tipo_equipo: "OLT", id_equipo: ID.eOlt },
      { id: ID.tOdf, num_slot: 144, tipo_equipo: "ODF", id_equipo: ID.eOdf },
    ],
    "tab_fiber.puerto_equipo": [
      { id: ID.pt, numero_puerto: 5, nombre: null, tipo_equipo_pert: "TJT", id_equipo_pert: ID.tOlt, dir_principal_senhal: "S" },
      { id: ID.pb, numero_puerto: 43, nombre: "43", tipo_equipo_pert: "BDJ", id_equipo_pert: ID.tOdf, dir_principal_senhal: "B" },
      { id: ID.pdE, numero_puerto: 1, nombre: "E1", tipo_equipo_pert: "DIV", id_equipo_pert: ID.d1, dir_principal_senhal: "E" },
      { id: ID.pdS, numero_puerto: 3, nombre: "S3", tipo_equipo_pert: "DIV", id_equipo_pert: ID.d1, dir_principal_senhal: "S" },
      { id: ID.p2E, numero_puerto: 1, nombre: "E1", tipo_equipo_pert: "DIV", id_equipo_pert: ID.d2, dir_principal_senhal: "E" },
    ],
    "tab_fiber.divisor_optico": [
      { id: ID.d1, num_divisor: 2, cod_divisor: "D-2", modelo_divisor: "1x8PC", id_cubierta_ubica: ID.cu1 },
      { id: ID.d2, num_divisor: 1, cod_divisor: "D-1", modelo_divisor: "1x8PC", id_cubierta_ubica: ID.cu2 },
    ],
    "geo_fiber.cubierta_empalme": [
      { id: ID.cu1, etiqueta: "CO19", funcion_cub: "Primer nivel" },
      { id: ID.cu2, etiqueta: "7-ago", funcion_cub: "Segundo nivel" },
    ],
    // c2 tiene la longitud medida en 0: vale la calculada.
    "geo_fiber.cable_fibra": [
      { id: ID.c1, codigo: "2100555", longitud_medida: 2586.52, longitud_calc: 2580 },
      { id: ID.c2, codigo: "2103630", longitud_medida: 0, longitud_calc: 116.65 },
      { id: ID.c3, codigo: "2102701", longitud_medida: 44.58, longitud_calc: 44 },
    ],
    "tab_fiber.hilo_cable": [
      { id: ID.h1, id_cable: ID.c1, numero_hilo: 55, numero_buffer: 5, color_hilo: "Rojo", color_buffer: "Gris" },
      { id: ID.h2, id_cable: ID.c2, numero_hilo: 55, numero_buffer: 5, color_hilo: "Rojo", color_buffer: "Gris" },
      { id: ID.h3, id_cable: ID.c3, numero_hilo: 21, numero_buffer: 2, color_hilo: "Amarillo", color_buffer: "Naranja" },
      { id: ID.hSinCable, id_cable: u(4999), numero_hilo: 7, numero_buffer: 1, color_hilo: "Rojo", color_buffer: "Azul" },
    ],
    "tab_fiber.element_connection": [
      // Hacia arriba desde un hilo de la cubierta de segundo nivel: la caché para en la salida del divisor.
      fila(ID.h3, "UPSTREAM", [paso(1, H(ID.h3), P(ID.pdS), { tipo_contenedor: "DIVISOR", id_contenedor: ID.d1 })]),
      // Desde la entrada de ese divisor, hasta la OLT.
      fila(ID.pdE, "UPSTREAM", [
        paso(1, P(ID.pdE), H(ID.h2)),
        paso(2, H(ID.h2), H(ID.h1)),
        paso(3, H(ID.h1), P(ID.pb), { tipo_contenedor: "ODF", tipo_conexion: "PIGTAIL" }),
        paso(4, P(ID.pb), P(ID.pt), { tipo_contenedor: "OLT", tipo_conexion: "PATCHCORD" }),
      ]),
      // Hacia abajo desde la OLT, hasta la entrada del divisor.
      fila(ID.pt, "DOWNSTREAM", [
        paso(1, P(ID.pt), P(ID.pb), { tipo_contenedor: "OLT", tipo_conexion: "PATCHCORD" }),
        paso(2, P(ID.pb), H(ID.h1), { tipo_contenedor: "ODF", tipo_conexion: "PIGTAIL" }),
        paso(3, H(ID.h1), H(ID.h2)),
        paso(4, H(ID.h2), P(ID.pdE)),
      ]),
    ],
  }
}

// --- La base de mentira ---------------------------------------------------------
let datos = base()
/** Fallas por tabla: `(url) => respuesta | null`; la respuesta es { status, cuerpo } o "colgar". */
let fallas = {}
let consultas = []
const servidor = createServer((req, res) => {
  const url = new URL(req.url, "http://local")
  const tabla = url.pathname.replace(/^\/rest\/v1\//, "")
  const esquema = req.headers["accept-profile"] ?? "public"
  const llave = `${esquema}.${tabla}`
  consultas.push({ llave, url: url.search })
  const falla = fallas[llave]?.(url.search)
  if (falla === "colgar") return // no responde nunca
  if (falla) {
    res.writeHead(falla.status, { "content-type": "application/json" })
    res.end(JSON.stringify(falla.cuerpo))
    return
  }
  let filas = datos[llave]
  if (!filas) {
    res.writeHead(404, { "content-type": "application/json" })
    res.end(JSON.stringify({ code: "PGRST205", message: `no existe ${llave}` }))
    return
  }
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(k)) continue
    if (v.startsWith("eq.")) filas = filas.filter((f) => String(f[k]) === v.slice(3))
    else if (v.startsWith("in.(")) {
      const lista = new Set(v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")))
      filas = filas.filter((f) => lista.has(String(f[k])))
    }
  }
  const desde = Number(url.searchParams.get("offset") ?? 0)
  const limite = Number(url.searchParams.get("limit") ?? 1000)
  res.writeHead(200, { "content-type": "application/json" })
  res.end(JSON.stringify(filas.slice(desde, desde + Math.min(limite, 1000))))
})
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok))
process.env.SUPABASE_URL = `http://127.0.0.1:${servidor.address().port}`
process.env.SUPABASE_SECRET_KEY = "clave-de-la-base-de-mentira"
process.env.AUTH_JWT_SECRET = "secreto-solo-para-las-pruebas-de-la-ruta-del-trace-0123"

const { emitirToken, COOKIE_SESION } = await import("../lib/auth-server.ts")
const { clasificarRespuestaTrace } = await import("../lib/map/trace.ts")
const cookie = `${COOKIE_SESION}=${encodeURIComponent(emitirToken("prueba-trace", "usuario"))}`

// Cada caso con la ruta recién cargada: sin el catálogo ni las respuestas guardadas del anterior.
let version = 0
async function rutaNueva() {
  return (await import(`../app/api/traces/[direccion]/[id]/route.ts?caso=${++version}`)).GET
}
async function pedir(GET, direccion, id) {
  const t0 = performance.now()
  const res = await GET(new Request(`http://local/api/traces/${direccion}/${id}`, { headers: { cookie } }), {
    params: Promise.resolve({ direccion, id }),
  })
  const cuerpo = await res.json()
  return {
    status: res.status,
    cuerpo,
    r: clasificarRespuestaTrace(res.status, JSON.parse(JSON.stringify(cuerpo))),
    ms: Math.round(performance.now() - t0),
    origen: /desc="(\w+)"/.exec(res.headers.get("server-timing") ?? "")?.[1],
  }
}
function preparar(cambios = {}, nuevasFallas = {}) {
  datos = { ...base(), ...cambios }
  fallas = nuevasFallas
  consultas = []
}
const error = (status, code, message) => () => ({ status, cuerpo: { code, message } })

let fallos = 0
let pruebas = 0
function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}
const nombres = (ruta) => ruta?.filas.map((f) => (f.tipo === "Hilo" ? f.codigoUbica : f.nombre)).join(",")

console.log("\n1) LO NORMAL\n")
{
  preparar()
  let GET = await rutaNueva()
  const arriba = await pedir(GET, "upstream", ID.h3)
  const ruta = arriba.r.tabla?.rutas[0]
  comprobar(
    "hacia arriba desde un hilo: cruza el divisor y llega a la OLT y su central",
    arriba.status === 200 && nombres(ruta) === "21,S3,E1,55,55,43,5,HUB PRUEBA" && ruta.llega && ruta.final === "HUB PRUEBA",
    `${arriba.status} ${nombres(ruta)}`,
  )
  comprobar("la suma usa la longitud calculada cuando la medida es 0", ruta?.sumaM === 2747.75, String(ruta?.sumaM))
  comprobar("el divisor que cruza se nombra", ruta?.divisores.join() === "divisor 2 (1x8PC) de CO19, de S3 a E1", ruta?.divisores.join())
  comprobar("sin avisos ni error de tabla", arriba.r.tabla?.avisos.length === 0 && arriba.r.errorTabla === null, arriba.r.tabla?.avisos.join(" / "))
  const otraVez = await pedir(GET, "upstream", ID.h3)
  comprobar("la segunda vez sale de la memoria, igual", otraVez.origen === "memoria" && nombres(otraVez.r.tabla?.rutas[0]) === nombres(ruta))

  GET = await rutaNueva()
  const abajo = await pedir(GET, "downstream", ID.pt)
  const rAbajo = abajo.r.tabla?.rutas[0]
  comprobar(
    "hacia abajo desde la OLT: la central primero y llega a la entrada del divisor",
    abajo.status === 200 && nombres(rAbajo) === "HUB PRUEBA,5,43,55,55,E1" && rAbajo.llega && rAbajo.final === "divisor 2 (1x8PC) de CO19",
    `${nombres(rAbajo)} · ${rAbajo?.final}`,
  )
  const noEsta = await pedir(GET, "downstream", u(999))
  comprobar("un UUID que no está en la caché: 200 y «no encontrado»", noEsta.status === 200 && noEsta.r.estado === "ok" && !noEsta.r.encontrado)
}

console.log("\n1c) LOS TIPOS DE PUERTO DE HOY (DIV_N1, DIV_N2, TJT_OLT, BDJ_ODF)\n")
{
  // La base pasó de DIV, TJT y BDJ a nombrarlos con su nivel o su equipo; el trace tiene que seguir igual.
  const deHoy = { DIV: "DIV_N1", TJT: "TJT_OLT", BDJ: "BDJ_ODF" }
  preparar({
    "tab_fiber.puerto_equipo": base()["tab_fiber.puerto_equipo"].map((p) => ({
      ...p,
      tipo_equipo_pert: p.id_equipo_pert === ID.d2 ? "DIV_N2" : deHoy[p.tipo_equipo_pert],
    })),
  })
  const GET = await rutaNueva()
  const arriba = await pedir(GET, "upstream", ID.h3)
  const ruta = arriba.r.tabla?.rutas[0]
  comprobar(
    "hacia arriba desde un hilo: cruza el divisor y llega a la OLT, como con DIV y TJT",
    arriba.status === 200 && nombres(ruta) === "21,S3,E1,55,55,43,5,HUB PRUEBA" && ruta.llega,
    `${arriba.status} ${nombres(ruta)}`,
  )
  const filaDivisor = ruta?.filas.find((f) => f.nombre === "S3")
  comprobar(
    "la fila del divisor dice «Divisor» y su cubierta, no «DIV_N1»",
    filaDivisor?.ubica === "Divisor" && filaDivisor?.nombreContenedor === "CO19",
    `${filaDivisor?.ubica} · ${filaDivisor?.nombreContenedor}`,
  )
  const abajo = await pedir(GET, "downstream", ID.pt)
  const rAbajo = abajo.r.tabla?.rutas[0]
  comprobar(
    "hacia abajo desde la OLT: llega a la entrada del divisor",
    rAbajo?.llega === true && rAbajo?.final === "divisor 2 (1x8PC) de CO19",
    `${nombres(rAbajo)} · ${rAbajo?.final}`,
  )
  const olt = await pedir(GET, "upstream", ID.pt)
  comprobar(
    "un puerto TJT_OLT hacia arriba se reconoce como de la OLT",
    olt.r.motivo?.startsWith("Es el puerto 5 de una tarjeta de la OLT") === true,
    olt.r.motivo ?? "sin motivo",
  )
}

console.log("\n1b) SIN RECORRIDO EN ESE SENTIDO: LA VENTANA DICE POR QUÉ\n")
{
  preparar()
  const GET = await rutaNueva()
  const casos = [
    ["un puerto de la OLT hacia arriba", "upstream", ID.pt, "Es el puerto 5 de una tarjeta de la OLT: ahí empieza la red y hacia arriba no hay más. Recórrelo hacia abajo."],
    [
      "una salida de divisor hacia arriba (con el UUID de su entrada)",
      "upstream",
      ID.pdS,
      `Es la salida S3 del divisor 2 (1x8PC) de CO19: la caché no sube desde una salida. Recorre hacia arriba desde su entrada (UUID ${ID.pdE}).`,
    ],
    ["una entrada de divisor hacia abajo, sin salidas que bajen", "downstream", ID.pdE, "Es la entrada E1 del divisor 2 (1x8PC) de CO19: hacia abajo se abre en sus salidas, y ninguna tiene recorrido hacia abajo en la caché."],
    ["un puerto del ODF sin recorrido", "upstream", ID.pb, "El puerto 43 no tiene conexiones hacia arriba en la caché del trace."],
    ["un hilo sin recorrido, con su cable", "downstream", ID.h1, "El hilo 55 del cable 2100555 no tiene conexiones hacia abajo: el recorrido termina en él."],
    ["un UUID que no es de nada", "downstream", u(999), "Ese UUID no es de ningún puerto ni hilo de la base."],
  ]
  for (const [nombre, direccion, id, esperado] of casos) {
    const r = await pedir(GET, direccion, id)
    comprobar(nombre, r.status === 200 && !r.r.encontrado && r.r.motivo === esperado, r.r.motivo ?? "sin motivo")
  }
  preparar({}, { "tab_fiber.puerto_equipo": (q) => (q.includes("id=in.") ? { status: 500, cuerpo: { code: "XX000", message: "se cayó" } } : null) })
  const rutaSinMotivo = await rutaNueva()
  const GET2 = () => rutaSinMotivo
  const sinMotivo = await pedir(rutaSinMotivo, "upstream", ID.pt)
  comprobar("si no se puede averiguar el porqué: sin motivo (queda el mensaje general), sin error", sinMotivo.status === 200 && sinMotivo.r.motivo === null)
  fallas = {}
  const despues = await pedir(GET2(), "upstream", ID.pt)
  comprobar("  y esa respuesta sin porqué no se guardó: al reintentar lo dice", despues.origen === "base" && despues.r.motivo?.startsWith("Es el puerto 5"), despues.r.motivo ?? "sin motivo")

  // Una salida del divisor que sí baja: la entrada la nombra.
  preparar({
    "tab_fiber.element_connection": [
      ...base()["tab_fiber.element_connection"],
      fila(ID.pdS, "DOWNSTREAM", [paso(1, P(ID.pdS), H(ID.h3), { tipo_contenedor: "DIVISOR", id_contenedor: ID.d1 })]),
    ],
  })
  const conSalida = await pedir(await rutaNueva(), "downstream", ID.pdE)
  comprobar(
    "una entrada de divisor hacia abajo: nombra las salidas que sí bajan",
    conSalida.r.motivo === "Es la entrada E1 del divisor 2 (1x8PC) de CO19: hacia abajo se abre en sus salidas. Recorre hacia abajo desde una de ellas: S3.",
    conSalida.r.motivo ?? "sin motivo",
  )

  // El catálogo que falla siempre (una tabla sin permiso) no se relee en cada trace.
  preparar({}, { "geo_infra.cabecera_central": (q) => (q.includes("offset=") ? { status: 403, cuerpo: { code: "42501", message: "sin permiso" } } : null) })
  const GET3 = await rutaNueva()
  for (const dir of ["upstream", "downstream", "upstream"]) await pedir(GET3, dir, dir === "upstream" ? ID.h3 : ID.pt)
  const lecturasEnteras = consultas.filter((c) => c.llave === "tab_fiber.divisor_optico" && c.url.includes("offset=")).length
  comprobar("un catálogo que falla no se vuelve a leer entero en cada trace (espera 30 s)", lecturasEnteras === 1, `${lecturasEnteras} lecturas de divisor_optico`)
}

console.log("\n2) LA BASE RESPONDE CON ERROR\n")
{
  const casos = [
    ["sin permiso sobre la caché", error(403, "42501", "permiso denegado"), "falta un permiso"],
    ["la tabla de caché no existe", error(404, "PGRST205", "no existe"), "no existe en la base"],
    ["la caché cambió de columnas", error(400, "42703", "columna no existe"), "cambió de columnas"],
    ["error desconocido de la base", error(400, "XX000", "algo raro"), "No se pudo leer el recorrido"],
  ]
  for (const [nombre, falla, texto] of casos) {
    preparar({}, { "tab_fiber.element_connection": falla })
    const r = await pedir(await rutaNueva(), "upstream", ID.h3)
    comprobar(`${nombre}: 502 con su mensaje`, r.status === 502 && r.cuerpo.message?.includes(texto), `${r.status} ${r.cuerpo.message}`)
  }
  preparar({}, { "tab_fiber.hilo_cable": error(403, "42501", "permiso denegado") })
  const sinHilos = await pedir(await rutaNueva(), "upstream", ID.h3)
  comprobar(
    "no se pueden leer los hilos: 502 y lo dice",
    sinHilos.status === 502 && sinHilos.cuerpo.message?.includes("no se pudieron leer los cables de sus hilos"),
    sinHilos.cuerpo.message,
  )
  for (const [tabla, nombre] of [
    ["tab_fiber.puerto_equipo", "los puertos"],
    ["geo_fiber.cable_fibra", "los cables"],
    ["tab_fiber.divisor_optico", "los divisores"],
  ]) {
    preparar({}, { [tabla]: error(403, "42501", "permiso denegado") })
    const GET = await rutaNueva()
    const r = await pedir(GET, "upstream", ID.h3)
    comprobar(
      `no se pueden leer ${nombre}: el recorrido sale igual (se pinta) y la tabla dice por qué`,
      r.status === 200 && r.r.pasos.length > 0 && r.r.tabla === null && r.r.errorTabla?.mensaje.includes("no se pudieron leer los datos de sus elementos"),
      `${r.status} ${r.r.errorTabla?.mensaje}`,
    )
    fallas = {}
    const despues = await pedir(GET, "upstream", ID.h3)
    comprobar(`  y lo que salió con error no se guardó: al reintentar sale bien`, despues.origen === "base" && despues.r.tabla !== null)
  }
  // Solo falla la lectura entera de los divisores (el catálogo): lo que falte se lee en el momento.
  preparar({}, { "tab_fiber.divisor_optico": (q) => (q.includes("offset=") ? { status: 500, cuerpo: { code: "XX000", message: "catálogo" } } : null) })
  const sinCatalogo = await pedir(await rutaNueva(), "upstream", ID.h3)
  comprobar(
    "sin el catálogo en memoria: la tabla sale igual, leyendo lo que falta",
    sinCatalogo.status === 200 && nombres(sinCatalogo.r.tabla?.rutas[0]) === "21,S3,E1,55,55,43,5,HUB PRUEBA",
    nombres(sinCatalogo.r.tabla?.rutas[0]),
  )
  // Falla solo la segunda consulta a la caché (la de la entrada del divisor).
  preparar({}, { "tab_fiber.element_connection": (q) => (q.includes("id_origen=in.") ? { status: 500, cuerpo: { code: "XX000", message: "se cayó" } } : null) })
  const GET = await rutaNueva()
  const cortado = await pedir(GET, "upstream", ID.h3)
  comprobar(
    "no se puede seguir más allá del divisor: la tabla llega hasta ahí y lo avisa",
    cortado.status === 200 && nombres(cortado.r.tabla?.rutas[0]) === "21,S3" && cortado.r.tabla.avisos[0]?.startsWith("No se pudo seguir el recorrido más allá del divisor"),
    `${nombres(cortado.r.tabla?.rutas[0])} · ${cortado.r.tabla?.avisos[0]}`,
  )
  fallas = {}
  const completo = await pedir(GET, "upstream", ID.h3)
  comprobar("  y al reintentar sale completo (no se guardó el cortado)", completo.origen === "base" && completo.r.tabla?.rutas[0].llega)
}

console.log("\n3) DATOS RAROS EN LA CACHÉ O EN LA BASE\n")
{
  const conCache = (filas) => ({ "tab_fiber.element_connection": filas })
  for (const [nombre, secuencia] of [
    ["path_secuencia que no es JSON", "{no es json"],
    ["path_secuencia vacía", []],
    ["path_secuencia nula", null],
    ["pasos con basura", [null, 5, "x", { paso: "uno" }, { paso: 1, tip_origen: "HILO" }, { paso: 2, tip_origen: "PUERTO", puerto_origen: ID.pt, tip_destino: "HILO" }]],
  ]) {
    preparar(conCache([fila(ID.h3, "UPSTREAM", secuencia)]))
    const r = await pedir(await rutaNueva(), "upstream", ID.h3)
    comprobar(`${nombre}: responde 200 sin caerse`, r.status === 200 && r.r.estado === "ok", `${r.status} ${r.cuerpo.message ?? ""}`)
  }
  preparar(conCache([fila(ID.h3, "UPSTREAM", [paso(1, H(ID.h3), P(ID.pdS), { tipo_contenedor: "DIVISOR", id_contenedor: ID.d1 })], { geom_path: "basura", total_pasos: "x", fecha_calculo: "ayer" })]))
  const raros = await pedir(await rutaNueva(), "upstream", ID.h3)
  comprobar("geometría, total de pasos y fecha que no sirven: se ignoran", raros.status === 200 && raros.r.geometria === null && raros.r.totalPasos === 1, `${raros.r.totalPasos}`)

  // Un ciclo: h1 → h2 → h1.
  preparar(conCache([fila(ID.h1, "DOWNSTREAM", [paso(1, H(ID.h1), H(ID.h2)), paso(2, H(ID.h2), H(ID.h1))])]))
  const ciclo = await pedir(await rutaNueva(), "downstream", ID.h1)
  comprobar("un ciclo en los pasos: termina y muestra el camino una vez", ciclo.status === 200 && nombres(ciclo.r.tabla?.rutas[0]) === "55,55", nombres(ciclo.r.tabla?.rutas[0]))

  // Un hilo que no está en la base, un cable que no está, un divisor sin cubierta, un equipo sin central.
  preparar({
    ...conCache([
      fila(ID.hSinCable, "DOWNSTREAM", [paso(1, H(ID.hSinCable), H(u(777))), paso(2, H(u(777)), P(ID.pdE))]),
      fila(ID.pt, "DOWNSTREAM", [paso(1, P(ID.pt), P(ID.pb), { tipo_contenedor: "OLT" })]),
    ]),
    "tab_fiber.divisor_optico": [{ id: ID.d1, num_divisor: 2, cod_divisor: "D-2", modelo_divisor: null, id_cubierta_ubica: null }],
    "tab_fiber.equipo_red": [{ id: ID.eOlt, codigo: "1", id_cabecera: null }, { id: ID.eOdf, codigo: "1", id_cabecera: null }],
  })
  const GET = await rutaNueva()
  const incompleto = await pedir(GET, "downstream", ID.hSinCable)
  const filas = incompleto.r.tabla?.rutas[0]?.filas ?? []
  comprobar(
    "hilo cuyo cable no está, hilo que no está, divisor sin cubierta: filas con lo que se sabe",
    incompleto.status === 200 && filas.length === 3 && filas[0].contenedor === "Cable" && filas[0].longitudM === null &&
      filas[1].codigoUbica === null && filas[2].contenedor === "Cubierta" && filas[2].idCubierta === null,
    JSON.stringify(filas.map((f) => [f.contenedor, f.codigoUbica, f.longitudM])),
  )
  comprobar(
    "y lo avisa",
    incompleto.r.tabla?.avisos.some((a) => a.startsWith("Un elemento del recorrido no está en la base")),
    incompleto.r.tabla?.avisos.join(" / "),
  )
  const sinCentral = await pedir(GET, "downstream", ID.pt)
  comprobar(
    "un equipo sin central: no hay fila de central y no se cae",
    sinCentral.status === 200 && sinCentral.r.tabla?.rutas[0].filas.every((f) => f.tipo !== "Central"),
    nombres(sinCentral.r.tabla?.rutas[0]),
  )
}

console.log("\n4) RECORRIDOS ENORMES\n")
{
  // Una cadena de 1500 hilos (los reales tienen hasta 19 pasos).
  const largo = 1500
  const hilosLargos = Array.from({ length: largo }, (_, i) => ({ id: u(100000 + i), id_cable: ID.c1, numero_hilo: (i % 144) + 1, numero_buffer: 1, color_hilo: "Azul", color_buffer: "Azul" }))
  const pasos = hilosLargos.slice(1).map((h, i) => paso(i + 1, H(hilosLargos[i].id), H(h.id)))
  preparar({ "tab_fiber.hilo_cable": hilosLargos, "tab_fiber.element_connection": [fila(hilosLargos[0].id, "DOWNSTREAM", pasos)] })
  const GET = await rutaNueva()
  const enorme = await pedir(GET, "downstream", hilosLargos[0].id)
  const lotes = consultas.filter((c) => c.llave === "tab_fiber.hilo_cable").length
  comprobar(
    `cadena de ${largo} hilos: responde, con los hilos leídos por lotes de 100`,
    enorme.status === 200 && enorme.r.tabla?.rutas[0].filas.length === largo && lotes === 15,
    `${enorme.status} · ${enorme.ms} ms · ${enorme.r.tabla?.rutas[0].filas.length} filas · ${lotes} lotes`,
  )
  comprobar("  en menos de 3 s", enorme.ms < 3000, `${enorme.ms} ms`)
  const otraVez = await pedir(GET, "downstream", hilosLargos[0].id)
  comprobar("  y una respuesta tan grande no se guarda en memoria", otraVez.origen === "base")

  // Una escalera: cada hilo se abre en dos, 16 veces seguidas (65 536 caminos).
  const nivel = (n, j) => u(300000 + n * 1000 + j)
  const escalera = []
  for (let n = 0; n < 16; n++) for (const j of [0, 1]) for (const k of [0, 1]) escalera.push(paso(n + 1, H(nivel(n, j)), H(nivel(n + 1, k))))
  preparar({ "tab_fiber.element_connection": [fila(nivel(0, 0), "DOWNSTREAM", escalera)] })
  const abanico = await pedir(await rutaNueva(), "downstream", nivel(0, 0))
  comprobar(
    "un recorrido que se abre en 65 536 caminos: muestra 8 y lo avisa, sin colgarse",
    abanico.status === 200 && abanico.r.tabla?.rutas.length === 8 && abanico.r.tabla.avisos.some((a) => a.includes("más de 8 caminos")) && abanico.ms < 3000,
    `${abanico.ms} ms · ${abanico.r.tabla?.rutas.length} rutas`,
  )
}

console.log("\n5) MUCHOS A LA VEZ\n")
{
  preparar()
  const GET = await rutaNueva()
  const r = await Promise.all(Array.from({ length: 20 }, (_, i) => pedir(GET, i % 2 ? "downstream" : "upstream", i % 2 ? ID.pt : ID.h3)))
  comprobar(
    "20 pedidos a la vez: todos bien y con la misma tabla",
    r.every((x) => x.status === 200) && new Set(r.filter((_, i) => i % 2 === 0).map((x) => nombres(x.r.tabla?.rutas[0]))).size === 1,
    r.map((x) => x.status).join(","),
  )
  const catalogos = consultas.filter((c) => c.llave === "geo_infra.cabecera_central" && c.url.includes("offset=")).length
  comprobar("  y el catálogo se leyó una sola vez", catalogos === 1, `${catalogos} lecturas`)
}

if (LENTO) {
  console.log("\n6) UNA BASE QUE NO RESPONDE (--lento)\n")
  preparar({}, { "tab_fiber.element_connection": () => "colgar" })
  const colgada = await pedir(await rutaNueva(), "upstream", ID.h3)
  comprobar(
    "la caché no responde: la ruta se corta sola a los 15 s (sin reintentar) y lo dice",
    colgada.status === 502 && colgada.ms < 20_000 && colgada.cuerpo.message?.includes("no respondió a tiempo"),
    `${colgada.status} · ${(colgada.ms / 1000).toFixed(1)} s · ${colgada.cuerpo.message}`,
  )
  // Una base a la que no se llega (puerto cerrado): falla rápido, con sus reintentos cortos.
  const urlBuena = process.env.SUPABASE_URL
  process.env.SUPABASE_URL = "http://127.0.0.1:9"
  const sinBase = await pedir(await rutaNueva(), "upstream", ID.h3)
  process.env.SUPABASE_URL = urlBuena
  comprobar(
    "no se llega a la base: 502 y dice que no se pudo conectar",
    sinBase.status === 502 && sinBase.cuerpo.message?.includes("No se pudo conectar con la base") && sinBase.ms < 15_000,
    `${sinBase.status} · ${(sinBase.ms / 1000).toFixed(1)} s · ${sinBase.cuerpo.message}`,
  )
  preparar({}, { "tab_fiber.element_connection": () => ({ status: 503, cuerpo: { message: "en mantenimiento" } }) })
  const mantenimiento = await pedir(await rutaNueva(), "upstream", ID.h3)
  const intentos = consultas.filter((c) => c.llave === "tab_fiber.element_connection").length
  comprobar(
    "la base en mantenimiento (503): responde 502",
    mantenimiento.status === 502,
    `${mantenimiento.status} · ${(mantenimiento.ms / 1000).toFixed(1)} s · ${intentos} intentos · ${mantenimiento.cuerpo.message}`,
  )
}

servidor.close()
console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
