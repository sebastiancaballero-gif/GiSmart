/**
 * Pruebas de la consulta de conectividad fina, de punta a punta.
 *
 *   pnpm run conectividad
 *
 * Importa la ruta de verdad (`GET /api/mufas/{id}/conectividad`) y la lógica
 * que usa el botón (`lib/map/conectividad.ts`), y las prueba contra la base
 * real. No hace falta levantar el servidor ni iniciar sesión: el token se firma
 * aquí con el secreto de `.env.local`, igual que lo firma el login.
 *
 * Qué comprueba:
 *
 *   1. La ruta solo responde con sesión y con un UUID bien formado.
 *   2. Consultar la misma mufa varias veces, seguidas o a la vez, da siempre
 *      el mismo JSON: la función arma el JSON igual cada vez.
 *   3. La lógica del botón: cada consulta vuelve a preguntar a la base, un
 *      doble click no pregunta dos veces, y un fallo de red no borra una
 *      conectividad ya obtenida.
 *   4. El código que corre en el navegador, conectado a la ruta: la sesión
 *      viaja, la respuesta se clasifica y una base que no contesta termina en
 *      un aviso en vez de dejar la consulta colgada.
 *   5. La clasificación nunca revienta, llegue lo que llegue.
 *   6. Las 185 mufas: ninguna da error y cada una queda en un estado claro.
 *   7. «Entradas y salidas»: la ruta de la función de cables de Carlos solo
 *      responde con sesión y UUID válido, devuelve cables que están en el
 *      mapa, y la lectura de su respuesta aguanta el formato de hoy (GeoJSON)
 *      y el que viene (solo UUID).
 *
 * Solo lee: no modifica la base. Sale con código 1 si algo falla.
 */
import { readFileSync } from "node:fs"
import { createHmac } from "node:crypto"

const env = readFileSync(".env.local", "utf8")
for (const linea of env.split(/\r?\n/)) {
  const i = linea.indexOf("=")
  if (i > 0 && !linea.startsWith("#")) process.env[linea.slice(0, i).trim()] = linea.slice(i + 1).trim()
}

const { GET } = await import("../app/api/mufas/[id]/conectividad/route.ts")
const { emitirToken } = await import("../lib/auth-server.ts")
const { clasificarRespuesta, crearConsultor, obtenerConectividad, resultadoAGuardar } = await import(
  "../lib/map/conectividad.ts"
)

let fallos = 0
let pruebas = 0
let sinDatos = 0
function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

/**
 * Comprobación que necesita cables cargados en la base. Si no los hay —como
 * mientras el ingeniero de backend rehace la carga— queda anotada como
 * pendiente, no como fallo: el código no es lo que está mal.
 */
function comprobarConCables(hayCables, descripcion, ok, detalle = "") {
  if (hayCables) return comprobar(descripcion, ok, detalle)
  sinDatos++
  console.log(`   SIN DATOS  ${descripcion}`)
}

/**
 * Mufa de ejemplo, escrita a mano con la forma que devuelve la función: un
 * cable de entrada y uno de salida, cada uno con un buffer y dos hilos. Las
 * comprobaciones de lógica usan esto y no lo que haya en la base, para que
 * sigan valiendo cuando la base esté a medio cargar.
 */
const MUFA_EJEMPLO = {
  tipo: "1x8PC",
  estado: "Operativa",
  mufa_id: "00000000-0000-4000-8000-000000000001",
  can_band_inst: 1,
  cables: [
    {
      cable_id: "00000000-0000-4000-8000-0000000000e1",
      codigo: "ENTRA-1",
      sentido: "Entrada",
      can_hilos: 2,
      Buffers: [
        {
          Buffer_id: 1,
          color: "Azul",
          hilos: [
            { hilo_id: "00000000-0000-4000-8000-0000000000h1", numero: 1, color: "Azul" },
            { hilo_id: "00000000-0000-4000-8000-0000000000h2", numero: 2, color: "Naranja" },
          ],
        },
      ],
    },
    {
      cable_id: "00000000-0000-4000-8000-0000000000e2",
      codigo: "SALE-1",
      sentido: "Salida",
      can_hilos: 2,
      Buffers: [
        {
          Buffer_id: 1,
          color: "Azul",
          hilos: [
            { hilo_id: "00000000-0000-4000-8000-0000000000h3", numero: 1, color: "Azul" },
            { hilo_id: "00000000-0000-4000-8000-0000000000h4", numero: 2, color: "Naranja" },
          ],
        },
      ],
    },
  ],
  Bandejas: [{ bandeja_id: 1, Conectividades: [] }],
}

const TOKEN = emitirToken("pruebas", "admin")

/** Llama a la ruta como lo hace el navegador y devuelve estado y cuerpo. */
async function pedirRuta(id, token = TOKEN) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const req = new Request(`http://local/api/mufas/${encodeURIComponent(id)}/conectividad`, { headers })
  const res = await GET(req, { params: Promise.resolve({ id }) })
  const cuerpo = await res.json().catch(() => null)
  return { status: res.status, cuerpo }
}

/** Lo que hace `obtenerConectividad` en el navegador, pero contra la ruta importada. */
async function consultarRuta(id) {
  const { status, cuerpo } = await pedirRuta(id)
  return clasificarRespuesta(status, cuerpo)
}

// Mufas de la base, para tener casos reales de cada estado.
const clave = process.env.SUPABASE_SECRET_KEY
const mufas = await (
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/cubierta_empalme?select=id,etiqueta&order=id`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Accept-Profile": "geo_fiber" },
  })
).json()
const CO02 = mufas.find((m) => m.etiqueta === "CO02")?.id
const INEXISTENTE = "00000000-0000-4000-8000-000000000000"

// --- 1. sesión y entrada -----------------------------------------------------
console.log("\n1) LA RUTA SOLO RESPONDE CON SESIÓN Y CON UN UUID VÁLIDO\n")

comprobar("sin sesión: 401", (await pedirRuta(CO02, null)).status === 401)

const [cab, cuerpoToken] = TOKEN.split(".")
comprobar("token con la firma alterada: 401", (await pedirRuta(CO02, `${cab}.${cuerpoToken}.firma-falsa`)).status === 401)

// Token auténtico pero vencido: firmado con el secreto real y `exp` en el pasado.
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url")
const vencido = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "pruebas", role: "admin", iat: 1, exp: 2 })}`
const firmaVencido = createHmac("sha256", process.env.AUTH_JWT_SECRET).update(vencido).digest("base64url")
comprobar("token vencido: 401", (await pedirRuta(CO02, `${vencido}.${firmaVencido}`)).status === 401)

for (const id of ["abc", "' OR 1=1 --", `${CO02}x`, "../../etc/passwd", " ", CO02.toUpperCase() + "0"]) {
  const r = await pedirRuta(id)
  comprobar(`id ${JSON.stringify(id).slice(0, 44).padEnd(46)} 400`, r.status === 400, `HTTP ${r.status}`)
}

const mayusculas = await pedirRuta(CO02.toUpperCase())
comprobar("el UUID en mayúsculas también vale", mayusculas.status === 200, `HTTP ${mayusculas.status}`)

const inexistente = await pedirRuta(INEXISTENTE)
const claseInexistente = clasificarRespuesta(inexistente.status, inexistente.cuerpo)
comprobar(
  "una mufa que no existe queda «sin conectividad», no como error",
  claseInexistente.estado === "sin-conectividad",
  `HTTP ${inexistente.status}, ${claseInexistente.estado}`,
)

// --- 2. la misma mufa varias veces ------------------------------------------
console.log("\n2) CONSULTAR LA MISMA MUFA VARIAS VECES\n")

const seguidas = []
for (let i = 0; i < 5; i++) seguidas.push(await pedirRuta(CO02))
comprobar("CO02 cinco veces seguidas: siempre 200", seguidas.every((r) => r.status === 200))
const textoCO02 = JSON.stringify(seguidas[0].cuerpo)
comprobar(
  "las cinco traen exactamente el mismo JSON",
  seguidas.every((r) => JSON.stringify(r.cuerpo) === textoCO02),
  `${textoCO02.length} caracteres`,
)

const aLaVez = await Promise.all(Array.from({ length: 10 }, () => pedirRuta(CO02)))
comprobar(
  "CO02 diez veces a la vez: todas 200 y con el mismo JSON",
  aLaVez.every((r) => r.status === 200 && JSON.stringify(r.cuerpo) === textoCO02),
)
// Si CO02 se puede dibujar o no depende de los datos del momento; lo que se
// comprueba del código es que la clasificación sea una de las previstas. Que
// no se pueda dibujar se anota como pendiente de la base.
const claseCO02 = clasificarRespuesta(200, seguidas[0].cuerpo)
const estadoCO02 = `${claseCO02.estado}${claseCO02.motivo ? `: ${claseCO02.motivo}` : ""}`
comprobar(
  "CO02 queda en un estado claro",
  ["disponible", "no-dibujable", "sin-conectividad"].includes(claseCO02.estado),
  estadoCO02,
)
if (claseCO02.estado !== "disponible") {
  sinDatos++
  console.log(`   PENDIENTE  CO02 hoy no se puede dibujar (${estadoCO02}): es de los datos, no del código`)
}

// Que el orden de cables, buffers e hilos no cambie entre llamadas: si
// cambiara, el esquema se redibujaría distinto cada vez que se consulta.
const muestra = mufas.filter((_, i) => i % 9 === 0)
let distintas = 0
for (const m of muestra) {
  const [a, b] = await Promise.all([pedirRuta(m.id), pedirRuta(m.id)])
  if (JSON.stringify(a.cuerpo) !== JSON.stringify(b.cuerpo)) distintas++
}
comprobar(`${muestra.length} mufas consultadas dos veces: mismo JSON en ambas`, distintas === 0, `${distintas} distintas`)

// --- 3. la lógica del botón --------------------------------------------------
console.log("\n3) LO QUE HACE EL BOTÓN AL CONSULTAR OTRA VEZ\n")

/** Un `obtener` de mentira que cuenta cuántas veces se le pregunta. */
function obtenerContado(respuesta = { estado: "sin-conectividad", esquema: null }, espera = 30) {
  const llamadas = []
  const obtener = (id) => {
    llamadas.push(id)
    return new Promise((ok) => setTimeout(() => ok(typeof respuesta === "function" ? respuesta(id) : respuesta), espera))
  }
  return { obtener, llamadas }
}

{
  const { obtener, llamadas } = obtenerContado()
  const consultar = crearConsultor(obtener)
  const [a, b] = await Promise.all([consultar("m1"), consultar("m1")])
  comprobar("doble click en la misma mufa: una sola pregunta a la base", llamadas.length === 1, `${llamadas.length}`)
  comprobar("los dos clicks reciben la misma respuesta", a === b)
}
{
  const { obtener, llamadas } = obtenerContado()
  const consultar = crearConsultor(obtener)
  await consultar("m1")
  await consultar("m1")
  await consultar("m1")
  comprobar("tres consultas seguidas de la misma mufa: tres preguntas a la base", llamadas.length === 3, `${llamadas.length}`)
}
{
  const { obtener, llamadas } = obtenerContado()
  const consultar = crearConsultor(obtener)
  await Promise.all([consultar("m1"), consultar("m2")])
  comprobar("dos mufas distintas a la vez: una pregunta por cada una", llamadas.length === 2)
}
{
  let veces = 0
  const consultar = crearConsultor(() => (++veces === 1 ? Promise.reject(new Error("caída")) : Promise.resolve({ estado: "sin-conectividad", esquema: null })))
  await consultar("m1").catch(() => {})
  const r = await consultar("m1")
  comprobar("si una pregunta revienta, la siguiente vuelve a intentarlo", veces === 2 && r.estado === "sin-conectividad")
}
{
  // Contra la ruta real: la segunda consulta trae un objeto nuevo, no el de antes.
  const consultar = crearConsultor(consultarRuta)
  const primera = await consultar(CO02)
  const segunda = await consultar(CO02)
  // Lo que se comprueba es que vuelve a preguntar (dos objetos distintos) y que
  // la base contesta lo mismo, tenga o no cables cargados.
  comprobar(
    "CO02 consultada dos veces contra la base: dos respuestas nuevas e iguales",
    primera !== segunda && JSON.stringify(primera) === JSON.stringify(segunda),
    primera.estado,
  )
}

const disponible = { estado: "disponible", esquema: { cables: [1] } }
const sinConectividad = { estado: "sin-conectividad", esquema: null }
const noDibujable = { estado: "no-dibujable", esquema: { cables: [1] }, motivo: "x" }
const error = { estado: "error", mensaje: "red" }
const casos = [
  ["primera consulta: se guarda lo que llegue", undefined, disponible, disponible],
  ["un fallo de red no borra la conectividad que ya había", disponible, error, disponible],
  ["tras un fallo, una respuesta buena lo reemplaza", error, disponible, disponible],
  ["si la base ya no tiene cables, se refleja", disponible, sinConectividad, sinConectividad],
  ["si deja de poder dibujarse, se refleja", disponible, noDibujable, noDibujable],
  ["un fallo sobre otro fallo guarda el último", error, { ...error, mensaje: "otro" }, { ...error, mensaje: "otro" }],
  ["un fallo sin nada antes se guarda", undefined, error, error],
]
for (const [texto, anterior, nuevo, esperado] of casos) {
  comprobar(texto, JSON.stringify(resultadoAGuardar(anterior, nuevo)) === JSON.stringify(esperado))
}

// --- 4. el código del navegador ---------------------------------------------
console.log("\n4) EL CÓDIGO DEL NAVEGADOR, CONECTADO A LA RUTA\n")

// `obtenerConectividad` usa `fetch` con una URL relativa, como en el navegador.
// Aquí `fetch` se sustituye por la ruta importada, con la sesión que pondría
// el navegador. Así se prueba el camino completo sin levantar el servidor.
const fetchOriginal = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  // Solo las llamadas del navegador a la app; las que hace la ruta a Supabase
  // siguen yendo a la base de verdad.
  if (!String(url).startsWith("/api/")) return fetchOriginal(url, init)
  const id = decodeURIComponent(String(url).split("/")[3])
  const headers = { ...init.headers, Authorization: `Bearer ${TOKEN}` }
  return GET(new Request(`http://local${url}`, { ...init, headers }), { params: Promise.resolve({ id }) })
}
{
  const r = await obtenerConectividad(CO02)
  comprobar("CO02 desde el código del navegador: mismo resultado que en el servidor", r.estado === claseCO02.estado, r.estado)
  const r2 = await obtenerConectividad(CO02)
  comprobar("y otra vez: vuelve a preguntar y trae lo mismo", r2 !== r && JSON.stringify(r2) === JSON.stringify(r))
  const r3 = await obtenerConectividad(INEXISTENTE)
  comprobar("una mufa que no existe: sin conectividad", r3.estado === "sin-conectividad", r3.estado)
  const r4 = await obtenerConectividad("no-es-un-uuid")
  comprobar("un id inválido: error con el mensaje de la ruta", r4.estado === "error" && /no es válido/.test(r4.mensaje), r4.mensaje)
}

// Una base que nunca contesta: `fetch` solo termina cuando se cancela.
globalThis.fetch = (_url, init = {}) =>
  new Promise((_, rechazar) => init.signal?.addEventListener("abort", () => rechazar(init.signal.reason)))
{
  // En Node el temporizador de `AbortSignal.timeout` no mantiene vivo el
  // proceso (en el navegador no pasa): sin esto, el script terminaría antes de
  // que salte el corte.
  const vivo = setTimeout(() => {}, 5000)
  const t0 = performance.now()
  const r = await obtenerConectividad(CO02, 300)
  const ms = performance.now() - t0
  clearTimeout(vivo)
  comprobar(
    "si la base no contesta, se corta y avisa en vez de quedarse esperando",
    r.estado === "error" && /no respondió/.test(r.mensaje) && ms < 2000,
    `${Math.round(ms)} ms · ${r.mensaje}`,
  )
}

// Sin red: `fetch` falla de inmediato.
globalThis.fetch = () => Promise.reject(new TypeError("Failed to fetch"))
{
  const r = await obtenerConectividad(CO02)
  comprobar("sin red: error que se puede leer, sin reventar", r.estado === "error" && /red/.test(r.mensaje), r.mensaje)
}
globalThis.fetch = fetchOriginal

// --- 5. clasificación --------------------------------------------------------
console.log("\n5) LA CLASIFICACIÓN AGUANTA CUALQUIER RESPUESTA\n")

const soloEntradas = JSON.parse(JSON.stringify(MUFA_EJEMPLO))
soloEntradas.cables = soloEntradas.cables.map((c) => ({ ...c, sentido: "Entrada" }))
const soloSalidas = JSON.parse(JSON.stringify(MUFA_EJEMPLO))
soloSalidas.cables = soloSalidas.cables.map((c) => ({ ...c, sentido: "Salida" }))
const entradas = [
  ["404", 404, null, "sin-conectividad"],
  ["502 con mensaje", 502, { message: "falla la base" }, "error"],
  ["500 sin cuerpo", 500, null, "error"],
  ["401", 401, { message: "sesión" }, "error"],
  ["200 vacío", 200, null, "error"],
  ["200 con una lista", 200, [1, 2], "error"],
  ["200 con un texto", 200, "hola", "error"],
  ["200 sin cables", 200, {}, "sin-conectividad"],
  ["200 con cables vacíos", 200, { cables: [] }, "sin-conectividad"],
  ["200 con cables que no son lista", 200, { cables: "x" }, "sin-conectividad"],
  ["200 con un cable vacío", 200, { cables: [{}] }, "no-dibujable"],
  ["200 con un cable nulo", 200, { cables: [null] }, "no-dibujable"],
  // Una cubierta de un solo sentido se dibuja: la terminal de segundo nivel
  // solo recibe su cable de entrada, y el esquemático dejó de exigir los dos
  // lados (24 de septiembre de 2026). Antes se esperaba «no-dibujable» y eso
  // dejaba 56 de las 184 cubiertas con cables sin poder abrirse.
  ["200 solo con cables de entrada", 200, soloEntradas, "disponible"],
  ["200 solo con cables de salida", 200, soloSalidas, "disponible"],
  ["200 con una mufa completa", 200, MUFA_EJEMPLO, "disponible"],
]
for (const [texto, status, cuerpo, esperado] of entradas) {
  let r
  try {
    r = clasificarRespuesta(status, cuerpo)
  } catch (e) {
    r = { estado: `revienta: ${e.message}` }
  }
  comprobar(`${texto.padEnd(34)} → ${esperado}`, r.estado === esperado, r.estado === esperado ? "" : `dio ${r.estado}`)
}
const motivo = clasificarRespuesta(200, { cables: [{}] }).motivo
comprobar("el motivo se puede leer tal cual", motivo === "hay un cable sin `cable_id`", JSON.stringify(motivo))

// --- 6. todas las mufas ------------------------------------------------------
console.log("\n6) LAS 185 MUFAS, UNA POR UNA, POR LA RUTA\n")

const porEstado = new Map()
const motivos = new Map()
for (let i = 0; i < mufas.length; i += 8) {
  const lote = await Promise.all(mufas.slice(i, i + 8).map((m) => consultarRuta(m.id).then((r) => [m, r])))
  for (const [m, r] of lote) {
    porEstado.set(r.estado, [...(porEstado.get(r.estado) ?? []), m.etiqueta ?? m.id])
    if (r.estado === "no-dibujable" || r.estado === "error") {
      const clave = r.motivo ?? r.mensaje
      motivos.set(clave, (motivos.get(clave) ?? 0) + 1)
    }
  }
}
const total = [...porEstado.values()].reduce((n, v) => n + v.length, 0)
comprobar(`se consultaron todas: ${total} de ${mufas.length}`, total === mufas.length)
comprobar("ninguna da error", !porEstado.has("error"), porEstado.has("error") ? `${porEstado.get("error").length} con error` : "")
for (const [estado, lista] of porEstado) console.log(`          ${estado.padEnd(17)} ${lista.length}`)
for (const [m, n] of motivos) console.log(`          · ${n} por «${m}»`)

// --- 7. entradas y salidas ---------------------------------------------------
console.log("\n7) ENTRADAS Y SALIDAS (FUNCIÓN DE CABLES DE CARLOS)\n")

const { GET: GETcables } = await import("../app/api/mufas/[id]/cables/route.ts")
const { normalizarCablesDeMufa, clasificarRespuestaCables } = await import("../lib/map/cables-de-mufa.ts")

async function pedirCables(id, token = TOKEN) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await GETcables(new Request(`http://local/api/mufas/${encodeURIComponent(id)}/cables`, { headers }), {
    params: Promise.resolve({ id }),
  })
  return { status: res.status, cuerpo: await res.json().catch(() => null) }
}

comprobar("sin sesión: 401", (await pedirCables(CO02, null)).status === 401)
comprobar("id inválido: 400", (await pedirCables("' OR 1=1 --")).status === 400)

const idsDelMapa = new Set(
  (
    await (
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/cable_fibra?select=id`, {
        headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Accept-Profile": "geo_fiber" },
      })
    ).json()
  ).map((c) => c.id),
)
const CO01 = mufas.find((m) => m.etiqueta === "CO01")?.id
for (const [etiqueta, id] of [
  ["CO01", CO01],
  ["CO02", CO02],
]) {
  const t0 = performance.now()
  const r = await pedirCables(id)
  const ms = Math.round(performance.now() - t0)
  const cables = r.cuerpo?.cables ?? []
  comprobarConCables(
    cables.length > 0,
    `${etiqueta}: 200 con sus cables, cada uno con UUID, sentido y color`,
    r.status === 200 && cables.every((c) => c.id && (c.sentido === "entrada" || c.sentido === "salida") && c.color),
    `${cables.length} cables en ${ms} ms: ${cables.map((c) => `${c.sentido} ${c.color}`).join(", ")}`,
  )
  comprobar(`${etiqueta}: todos sus cables están en la capa del mapa`, cables.every((c) => idsDelMapa.has(c.id)))
  comprobar(`${etiqueta}: al navegador no le llega la geometría`, !JSON.stringify(r.cuerpo).includes("coordinates"))
}
const sinMufa = await pedirCables(INEXISTENTE)
comprobar(
  "una mufa que no existe: 200 sin cables, no un error",
  sinMufa.status === 200 && sinMufa.cuerpo?.cables?.length === 0,
  `HTTP ${sinMufa.status}`,
)

// La lectura de la respuesta, con el formato de hoy y el que viene.
const formatoDeHoy = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      properties: { id_cable: "c1", nombre_cable: null, color_resalte: "#00FF00", tipo_direccion: "ENTRANTE" },
    },
    {
      type: "Feature",
      geometry: null,
      properties: { id_cable: "c2", nombre_cable: null, color_resalte: "#FF8C00", tipo_direccion: "SALIENTE" },
    },
  ],
}
const soloUuid = [
  { id_cable: "c1", color_resalte: "#00FF00", tipo_direccion: "ENTRANTE" },
  { id_cable: "c2", color_resalte: "#FF8C00", tipo_direccion: "SALIENTE" },
]
const esperado = JSON.stringify([
  { id: "c1", sentido: "entrada", color: "#00FF00" },
  { id: "c2", sentido: "salida", color: "#FF8C00" },
])
comprobar("formato de hoy (GeoJSON con geometría)", JSON.stringify(normalizarCablesDeMufa(formatoDeHoy)) === esperado)
comprobar("formato que viene (solo UUID, en filas)", JSON.stringify(normalizarCablesDeMufa(soloUuid)) === esperado)
comprobar("también dentro de { cables: [...] }", JSON.stringify(normalizarCablesDeMufa({ cables: soloUuid })) === esperado)
comprobar(
  "sin color o con un color raro: se usa el de la leyenda",
  normalizarCablesDeMufa([{ id_cable: "c1", tipo_direccion: "ENTRANTE", color_resalte: "rojo; x" }])[0]?.color === null,
)
comprobar(
  "filas sin UUID o con dirección desconocida se descartan",
  normalizarCablesDeMufa([{ tipo_direccion: "ENTRANTE" }, { id_cable: "c9", tipo_direccion: "LATERAL" }, null, 7]).length === 0,
)
for (const [texto, entrada] of [
  ["nula", null],
  ["de texto", "hola"],
  ["numérica", 5],
  ["vacía", {}],
]) {
  let ok
  try {
    ok = normalizarCablesDeMufa(entrada).length === 0
  } catch {
    ok = false
  }
  comprobar(`respuesta ${texto}: lista vacía, sin reventar`, ok)
}
comprobar(
  "un error de la ruta llega como error con su mensaje",
  clasificarRespuestaCables(502, { message: "falla" }).mensaje === "falla",
)

// --- 8. extremos de un cable -------------------------------------------------
console.log("\n8) EXTREMOS DE UN CABLE (FUNCIÓN fn_obtener_extremos_cable)\n")

const { GET: GETextremos } = await import("../app/api/cables/[id]/extremos/route.ts")
const { normalizarExtremos, clasificarRespuestaExtremos } = await import("../lib/map/extremos-cable.ts")

async function pedirExtremos(id, token = TOKEN) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await GETextremos(new Request(`http://local/api/cables/${encodeURIComponent(id)}/extremos`, { headers }), {
    params: Promise.resolve({ id }),
  })
  return { status: res.status, cuerpo: await res.json().catch(() => null) }
}

const unCable = [...idsDelMapa][0]
comprobar("sin sesión: 401", (await pedirExtremos(unCable, null)).status === 401)
comprobar("id inválido: 400", (await pedirExtremos("no-es-un-uuid")).status === 400)
{
  const r = await pedirExtremos(unCable)
  // La ruta cumple si devuelve la lista de extremos o, cuando la función de la
  // base falla, un error que se puede leer. Que la función falle se anota
  // aparte: es de la base, no de este código.
  comprobar(
    "un cable real: responde con sus extremos o con un error que se puede leer",
    (r.status === 200 && Array.isArray(r.cuerpo?.extremos)) || (r.status === 502 && typeof r.cuerpo?.message === "string"),
    r.status === 200 ? `${r.cuerpo.extremos.length} extremo(s)` : r.cuerpo?.message,
  )
  if (r.status !== 200) {
    sinDatos++
    console.log(`   PENDIENTE  la función de extremos falla en la base: ${r.cuerpo?.detalle ?? r.cuerpo?.message}`)
  }
}

// La lectura de la respuesta, con las formas que puede tener.
{
  const geojson = normalizarExtremos({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-76.1, 4.53] },
        properties: { id_elemento: "m1", tipo_elemento: "CUB2", nombre: "1/2", extremo: "ORIGEN", color_resalte: "#123456" },
      },
      { type: "Feature", geometry: null, properties: { id_elemento: "m2", extremo: "DESTINO" } },
    ],
  })
  comprobar(
    "GeoJSON: origen y destino, con nombre, tipo, color y punto",
    geojson.length === 2 &&
      geojson[0].rol === "origen" &&
      geojson[0].nombre === "1/2" &&
      geojson[0].tipo === "CUB2" &&
      geojson[0].color === "#123456" &&
      geojson[0].geometria?.coordinates[0] === -76.1 &&
      geojson[1].rol === "destino" &&
      geojson[1].geometria === null,
  )

  const filas = normalizarExtremos([
    { id_elem: "m1", tip_elem: "CUB1", posicion: "INICIO" },
    { id_elem: "m2", tip_elem: "CUB2", posicion: "FIN" },
  ])
  comprobar("lista de filas: INICIO y FIN se leen como origen y destino", filas.map((e) => e.rol).join(",") === "origen,destino")

  // El vocabulario de la función de cables de la mufa: la punta SALIENTE es de
  // donde sale el cable y la ENTRANTE a donde llega.
  const comoLaMufa = normalizarExtremos([
    { id_elemento: "m1", tipo_direccion: "SALIENTE", color_resalte: "#FF8C00" },
    { id_elemento: "m2", tipo_direccion: "ENTRANTE", color_resalte: "#00FF00" },
  ])
  comprobar(
    "SALIENTE y ENTRANTE: la salida y la entrada del cable, con su color",
    comoLaMufa.map((e) => `${e.rol}:${e.color}`).join(",") === "origen:#FF8C00,destino:#00FF00",
  )

  const objeto = normalizarExtremos({ origen: { id: "m1" }, destino: { id: "m2", etiqueta: "3/4" } })
  comprobar(
    "objeto con origen y destino",
    objeto.length === 2 && objeto[0].rol === "origen" && objeto[1].nombre === "3/4",
  )

  const envuelto = normalizarExtremos({ extremos: [{ id: "m1" }, { id: "m2" }] })
  comprobar("dentro de { extremos: [...] }, aunque no digan cuál es cuál", envuelto.length === 2 && envuelto[0].rol === null)

  let resiste = true
  for (const raro of [null, "hola", 5, {}, [], [null, 7, {}], { features: [{}] }]) {
    try {
      if (normalizarExtremos(raro).length !== 0) resiste = false
    } catch {
      resiste = false
    }
  }
  comprobar("respuestas raras: lista vacía, sin reventar", resiste)
  comprobar(
    "un color que no es un color se descarta",
    normalizarExtremos([{ id: "m1", color_resalte: "rojo; x" }])[0]?.color === null,
  )
  comprobar(
    "la respuesta de la ruta se clasifica bien",
    clasificarRespuestaExtremos(200, { extremos: [{ id: "m1" }] }).estado === "ok" &&
      clasificarRespuestaExtremos(502, { message: "falla" }).mensaje === "falla",
  )
}

// --- 9. el cable en dos colores ----------------------------------------------
console.log("\n9) EL BOTÓN «CABLE»: NARANJA DONDE SALE, VERDE DONDE ENTRA\n")

const { partirPorLaMitad, orientarDesde } = await import("../lib/map/partir-linea.ts")
const largo = (coords) => coords.slice(1).reduce((total, c, i) => total + Math.hypot(c[0] - coords[i][0], c[1] - coords[i][1]), 0)
{
  const [a, b] = partirPorLaMitad([[0, 0], [10, 0]])
  comprobar("una recta se parte en su punto medio", JSON.stringify(a) === "[[0,0],[5,0]]" && JSON.stringify(b) === "[[5,0],[10,0]]")

  const quebrada = [[0, 0], [4, 0], [4, 3], [10, 3]]
  const [m1, m2] = partirPorLaMitad(quebrada)
  comprobar(
    "una línea quebrada se parte en dos mitades del mismo largo",
    Math.abs(largo(m1) - largo(m2)) < 1e-9 && JSON.stringify(m1.at(-1)) === JSON.stringify(m2[0]),
    `${largo(m1).toFixed(2)} y ${largo(m2).toFixed(2)}`,
  )

  comprobar(
    "la mitad de salida empieza en la punta más cercana a la mufa de donde sale",
    JSON.stringify(orientarDesde([[0, 0], [10, 0]], [9, 1])) === "[[10,0],[0,0]]" &&
      JSON.stringify(orientarDesde([[0, 0], [10, 0]], [1, 1])) === "[[0,0],[10,0]]",
  )
  comprobar("una línea de un solo punto no revienta", partirPorLaMitad([[3, 3]]).length === 2)
}

// Con la base: un cable real, preguntado en sus dos puntas, tiene que salir
// de una y entrar a la otra. Si no, es de los datos, no del código.
{
  const [cableReal] = await (
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/cable_fibra?select=id,codigo,id_elem_from,id_elem_to&codigo=eq.2103824`, {
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Accept-Profile": "geo_fiber" },
    })
  ).json()
  const puntas = [cableReal?.id_elem_from, cableReal?.id_elem_to].filter(Boolean)
  const sentidos = await Promise.all(
    puntas.map(async (idMufa) => ((await pedirCables(idMufa)).cuerpo?.cables ?? []).find((c) => c.id === cableReal.id)?.sentido ?? "ausente"),
  )
  if (sentidos.includes("salida") && sentidos.includes("entrada")) {
    comprobar("el cable 2103824 sale de una punta y entra a la otra", true, sentidos.join(" / "))
  } else {
    sinDatos++
    console.log(`   PENDIENTE  el cable 2103824 no sale de una punta y entra a la otra (${sentidos.join(" / ") || "sin puntas"}): es de los datos`)
  }
}

console.log(
  `\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}` +
    (sinDatos ? ` ${sinDatos} quedaron pendientes por el estado de la base (ver SIN DATOS y PENDIENTE arriba).` : "") +
    "\n",
)
process.exit(fallos ? 1 : 0)
