/**
 * Pruebas del «Recorrido del trace» (lib/map/trace.ts y la ruta GET
 * /api/trace, que lee la caché tab_fiber.element_connection) que no necesitan
 * la base. Se corre con `pnpm run trace`.
 */
process.env.AUTH_JWT_SECRET = "secreto-solo-para-las-pruebas-del-trace-0123456789"
// Sin Supabase: lo que pase las validaciones se detiene antes de la base.
delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SECRET_KEY

const { normalizarPasos, hilosDelRecorrido, atenuacionTotal, clasificarRespuestaTrace, geometria } = await import("../lib/map/trace.ts")
const { emitirToken } = await import("../lib/auth-server.ts")
const { GET } = await import("../app/api/trace/route.ts")

let fallos = 0
let pruebas = 0
function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

// Tres pasos con la forma real de path_secuencia en element_connection (puerto
// de OLT → ODF → primera cubierta), desordenados a propósito.
const CACHE = [
  {
    paso: 2, id_conexion: "c2", id_contenedor: "odf", tipo_contenedor: "ODF",
    tip_origen: "PUERTO", puerto_origen: "p2", hilo_origen: null,
    tip_destino: "HILO", puerto_destino: null, hilo_destino: "h1",
    tipo_conexion: "PIGTAIL", atenuacion_db: 0.05, atenuacion_acumulada: 0.1,
  },
  {
    paso: 1, id_conexion: "c1", id_contenedor: "olt", tipo_contenedor: "OLT",
    tip_origen: "PUERTO", puerto_origen: "p1", hilo_origen: null,
    tip_destino: "PUERTO", puerto_destino: "p2", hilo_destino: null,
    tipo_conexion: "PATCHCORD", atenuacion_db: 0.05, atenuacion_acumulada: 0.05,
  },
  {
    paso: 3, id_conexion: "c3", id_contenedor: "cub", tipo_contenedor: "CUB",
    tip_origen: "HILO", puerto_origen: null, hilo_origen: "h1",
    tip_destino: "HILO", puerto_destino: null, hilo_destino: "h2",
    tipo_conexion: "FUSION", atenuacion_db: "0.05", atenuacion_acumulada: "0.15",
  },
]
// El mismo paso como lo devolvía la función del trace (nombres de antes).
const FUNCION = [
  {
    paso: 1, id_contenedor: "odf", tipo_contenedor: "ODF",
    tip_elemento_origen: "PUERTO", id_puerto_origen: "p2", id_hilo_origen: null,
    tip_elemento_destino: "HILO", id_puerto_destino: null, id_hilo_destino: "h1",
    tipo_conexion: "PIGTAIL", atenuacion_db: 0.05, atenuacion_acumulada: 0.1,
    geojson_path: '{"type":"LineString","coordinates":[[-76.1,4.5],[-76.2,4.6]]}',
  },
]

console.log("\n1) LECTURA DE LOS PASOS DE LA CACHÉ\n")
{
  const pasos = normalizarPasos(CACHE)
  comprobar("ordenados por número de paso", pasos.map((p) => p.paso).join(",") === "1,2,3")
  comprobar("equipo de cada paso", pasos.map((p) => p.contenedor.tipo).join(",") === "OLT,ODF,CUB")
  comprobar(
    "lo que entra y sale: puerto o hilo con su UUID",
    pasos[1].origen.tipo === "PUERTO" && pasos[1].origen.id === "p2" && pasos[1].destino.tipo === "HILO" && pasos[1].destino.id === "h1",
    JSON.stringify(pasos[1]),
  )
  comprobar("atenuaciones que llegan como texto se leen como número", pasos[2].atenuacionDb === 0.05 && pasos[2].atenuacionAcumulada === 0.15)
  comprobar("path_secuencia en texto JSON también se lee", normalizarPasos(JSON.stringify(CACHE)).length === 3)
  comprobar("filas sin número de paso se descartan", normalizarPasos([{ tipo_contenedor: "CUB" }, null, 4]).length === 0)
  comprobar("dentro de un objeto también se encuentra la lista", normalizarPasos({ pasos: CACHE }).length === 3)
  const segunda = normalizarPasos(JSON.parse(JSON.stringify({ pasos })))
  comprobar("servidor → navegador: los pasos llegan enteros", JSON.stringify(segunda) === JSON.stringify(pasos))
  comprobar("hilos del recorrido, en orden y sin repetir", hilosDelRecorrido(pasos).join(",") === "h1,h2")
  comprobar("atenuación total: la acumulada del último paso", atenuacionTotal(pasos) === 0.15)
  comprobar("sin pasos no hay atenuación", atenuacionTotal([]) === null)
  const deFuncion = normalizarPasos(FUNCION)
  comprobar(
    "también lee los nombres de la función del trace",
    deFuncion[0].origen.id === "p2" && deFuncion[0].destino.id === "h1" && deFuncion[0].geometria?.type === "LineString",
  )
}

console.log("\n2) GEOMETRÍA (geom_path)\n")
{
  const multi = { type: "MultiLineString", coordinates: [[[-76.1, 4.5], [-76.2, 4.6]]] }
  comprobar("MultiLineString como objeto", geometria(multi)?.type === "MultiLineString")
  comprobar("MultiLineString como texto", geometria(JSON.stringify(multi))?.type === "MultiLineString")
  comprobar("vacía (null) queda sin geometría", geometria(null) === null)
  comprobar("WKB u otro texto que no es GeoJSON se ignora", geometria("0105000020E6100000") === null)
}

console.log("\n3) RESPUESTA DE LA RUTA\n")
{
  const ok = clasificarRespuestaTrace(200, {
    encontrado: true, pasos: normalizarPasos(CACHE), cables: ["cab1", 7, "cab2"],
    geometria: null, atenuacionTotal: "0.9", calculadoEn: "2026-10-08T08:48:45-05:00",
  })
  comprobar(
    "200: pasos, cables (solo texto), atenuación de la tabla y fecha",
    ok.estado === "ok" && ok.encontrado && ok.pasos.length === 3 && ok.cables.join(",") === "cab1,cab2" && ok.atenuacionTotal === 0.9 && ok.calculadoEn?.startsWith("2026-10-08"),
  )
  const noEsta = clasificarRespuestaTrace(200, { encontrado: false, pasos: [], cables: [], geometria: null })
  comprobar("200 sin recorrido en la caché: encontrado en falso", noEsta.estado === "ok" && !noEsta.encontrado && noEsta.pasos.length === 0)
  const sinAtenuacion = clasificarRespuestaTrace(200, { encontrado: true, pasos: normalizarPasos(CACHE) })
  comprobar("sin atenuación de la tabla: la del último paso", sinAtenuacion.estado === "ok" && sinAtenuacion.atenuacionTotal === 0.15)
  const error = clasificarRespuestaTrace(502, { message: "No se pudo leer el recorrido en la caché del trace.", detalle: "XX: algo" })
  comprobar("502: el mensaje y el detalle de la base", error.estado === "error" && error.mensaje.includes("caché") && error.detalle === "XX: algo")
  const sinCuerpo = clasificarRespuestaTrace(500, null)
  comprobar("error sin cuerpo: un mensaje con el código HTTP", sinCuerpo.estado === "error" && sinCuerpo.mensaje.includes("HTTP 500"))
}

console.log("\n4) LA RUTA GET /api/trace\n")
{
  const token = emitirToken("Prueba", "usuario")
  const pedir = (id, direccion, conSesion = true) =>
    GET(
      new Request(`http://local/api/trace?${new URLSearchParams({ id, direccion })}`, {
        headers: conSesion ? { authorization: `Bearer ${token}` } : {},
      }),
    )
  const UUID_BUENO = "01a0f9bf-be88-7b80-9c77-2219b25fb611"
  comprobar("sin sesión: 401", (await pedir(UUID_BUENO, "DOWNSTREAM", false)).status === 401)
  comprobar("origen que no es UUID: 400", (await pedir("no-es-un-uuid", "DOWNSTREAM")).status === 400)
  comprobar("inyección SQL en el origen: 400", (await pedir(`${UUID_BUENO}' OR 1=1 --`, "UPSTREAM")).status === 400)
  comprobar("dirección que no es UPSTREAM ni DOWNSTREAM: 400", (await pedir(UUID_BUENO, "DOWN; DROP TABLE x")).status === 400)
  comprobar("dirección en minúsculas: 400 (la tabla guarda mayúsculas)", (await pedir(UUID_BUENO, "downstream")).status === 400)
  comprobar("sin parámetros: 400", (await GET(new Request("http://local/api/trace", { headers: { authorization: `Bearer ${token}` } }))).status === 400)
  const valida = await pedir(` ${UUID_BUENO} `, "UPSTREAM")
  comprobar("petición válida pasa las validaciones (sin Supabase: 500)", valida.status === 500, `HTTP ${valida.status}`)
}

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
