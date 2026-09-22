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
const hayCables = (seguidas[0].cuerpo?.cables?.length ?? 0) > 0
comprobarConCables(
  hayCables,
  "CO02 se puede dibujar",
  clasificarRespuesta(200, seguidas[0].cuerpo).estado === "disponible",
)

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
  comprobarConCables(hayCables, "CO02 desde el código del navegador: disponible", r.estado === "disponible", r.estado)
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
  ["200 solo con cables de entrada", 200, soloEntradas, "no-dibujable"],
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
const motivo = clasificarRespuesta(200, soloEntradas).motivo
comprobar("el motivo se puede leer tal cual", motivo === "no hay ningún cable de salida", JSON.stringify(motivo))

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

console.log(
  `\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}` +
    (sinDatos ? ` ${sinDatos} quedaron sin verificar porque la base no tiene cables cargados ahora mismo.` : "") +
    "\n",
)
process.exit(fallos ? 1 : 0)
