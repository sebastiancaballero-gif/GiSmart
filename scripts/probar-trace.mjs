/**
 * Pruebas del «Recorrido del trace» (lib/map/trace.ts y la ruta POST
 * /api/trace) que no necesitan la base. Se corre con `pnpm run trace`.
 */
process.env.AUTH_JWT_SECRET = "secreto-solo-para-las-pruebas-del-trace-0123456789"
// Sin Supabase: lo que pase las validaciones se detiene antes de la base.
delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SECRET_KEY

const { normalizarPasos, hilosDelRecorrido, atenuacionTotal, clasificarRespuestaTrace } = await import("../lib/map/trace.ts")
const { emitirToken } = await import("../lib/auth-server.ts")
const { POST } = await import("../app/api/trace/route.ts")

let fallos = 0
let pruebas = 0
function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

// Tres pasos con la forma real de fn_trace_conectividad_fina (puerto de OLT →
// ODF → primera cubierta), desordenados a propósito.
const FILAS = [
  {
    paso: 2, id_conexion: "c2", id_contenedor: "odf", tipo_contenedor: "ODF",
    tip_elemento_origen: "PUERTO", id_puerto_origen: "p2", id_hilo_origen: null,
    tip_elemento_destino: "HILO", id_puerto_destino: null, id_hilo_destino: "h1",
    tipo_conexion: "PIGTAIL", atenuacion_db: 0.05, atenuacion_acumulada: 0.1, geojson_path: null,
  },
  {
    paso: 1, id_conexion: "c1", id_contenedor: "olt", tipo_contenedor: "OLT",
    tip_elemento_origen: "PUERTO", id_puerto_origen: "p1", id_hilo_origen: null,
    tip_elemento_destino: "PUERTO", id_puerto_destino: "p2", id_hilo_destino: null,
    tipo_conexion: "PATCHCORD", atenuacion_db: 0.05, atenuacion_acumulada: 0.05, geojson_path: null,
  },
  {
    paso: 3, id_conexion: "c3", id_contenedor: "cub", tipo_contenedor: "CUB",
    tip_elemento_origen: "HILO", id_puerto_origen: null, id_hilo_origen: "h1",
    tip_elemento_destino: "HILO", id_puerto_destino: null, id_hilo_destino: "h2",
    tipo_conexion: "FUSION", atenuacion_db: "0.05", atenuacion_acumulada: "0.15",
    geojson_path: '{"type":"LineString","coordinates":[[-76.1,4.5],[-76.2,4.6]]}',
  },
]

console.log("\n1) LECTURA DE LOS PASOS\n")
{
  const pasos = normalizarPasos(FILAS)
  comprobar("ordenados por número de paso", pasos.map((p) => p.paso).join(",") === "1,2,3")
  comprobar("equipo de cada paso", pasos.map((p) => p.contenedor.tipo).join(",") === "OLT,ODF,CUB")
  comprobar(
    "lo que entra y sale: puerto o hilo con su UUID",
    pasos[1].origen.tipo === "PUERTO" && pasos[1].origen.id === "p2" && pasos[1].destino.tipo === "HILO" && pasos[1].destino.id === "h1",
    JSON.stringify(pasos[1]),
  )
  comprobar("atenuaciones que llegan como texto se leen como número", pasos[2].atenuacionDb === 0.05 && pasos[2].atenuacionAcumulada === 0.15)
  comprobar("geojson_path vacío queda sin geometría", pasos[0].geometria === null)
  comprobar("geojson_path en texto se lee como geometría", pasos[2].geometria?.type === "LineString")
  comprobar("filas sin número de paso se descartan", normalizarPasos([{ tipo_contenedor: "CUB" }, null, 4]).length === 0)
  comprobar("dentro de un objeto también se encuentra la lista", normalizarPasos({ pasos: FILAS }).length === 3)
  // Lo que pasa de verdad: la ruta lee los pasos y el navegador vuelve a leer
  // su respuesta. La segunda lectura no puede perder nada.
  const segunda = normalizarPasos(JSON.parse(JSON.stringify({ pasos })))
  comprobar("servidor → navegador: los pasos llegan enteros", JSON.stringify(segunda) === JSON.stringify(pasos))
  comprobar("hilos del recorrido, en orden y sin repetir", hilosDelRecorrido(pasos).join(",") === "h1,h2")
  comprobar("atenuación total: la acumulada del último paso", atenuacionTotal(pasos) === 0.15)
  comprobar("sin pasos no hay atenuación", atenuacionTotal([]) === null)
}

console.log("\n2) RESPUESTA DE LA RUTA\n")
{
  const ok = clasificarRespuestaTrace(200, { pasos: normalizarPasos(FILAS), cables: ["cab1", 7, "cab2"] })
  comprobar("200: pasos y cables (solo los UUID en texto)", ok.estado === "ok" && ok.pasos.length === 3 && ok.cables.join(",") === "cab1,cab2")
  const error = clasificarRespuestaTrace(502, { message: "La base no pudo calcular el recorrido.", detalle: "XX: algo" })
  comprobar("502: el mensaje y el detalle de la base", error.estado === "error" && error.mensaje.includes("no pudo") && error.detalle === "XX: algo")
  const sinCuerpo = clasificarRespuestaTrace(500, null)
  comprobar("error sin cuerpo: un mensaje con el código HTTP", sinCuerpo.estado === "error" && sinCuerpo.mensaje.includes("HTTP 500"))
}

console.log("\n3) LA RUTA POST /api/trace\n")
{
  const token = emitirToken("Prueba", "usuario")
  const pedir = (cuerpo, conSesion = true) =>
    POST(
      new Request("http://local/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(conSesion ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(cuerpo),
      }),
    )
  const UUID_BUENO = "01a0f9bf-be88-7b80-9c77-2219b25fb611"
  comprobar("sin sesión: 401", (await pedir({ id: UUID_BUENO, direccion: "DOWNSTREAM" }, false)).status === 401)
  comprobar("origen que no es UUID: 400", (await pedir({ id: "no-es-un-uuid", direccion: "DOWNSTREAM" })).status === 400)
  comprobar("inyección SQL en el origen: 400", (await pedir({ id: `${UUID_BUENO}' OR 1=1 --`, direccion: "UPSTREAM" })).status === 400)
  comprobar("dirección que no es UPSTREAM ni DOWNSTREAM: 400", (await pedir({ id: UUID_BUENO, direccion: "DOWN; DROP TABLE x" })).status === 400)
  comprobar("dirección en minúsculas: 400 (la función espera mayúsculas)", (await pedir({ id: UUID_BUENO, direccion: "downstream" })).status === 400)
  comprobar("cuerpo que no es JSON: 400", (await POST(new Request("http://local/api/trace", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "x" }))).status === 400)
  const valida = await pedir({ id: ` ${UUID_BUENO} `, direccion: "UPSTREAM" })
  comprobar("petición válida pasa las validaciones (sin Supabase: 500)", valida.status === 500, `HTTP ${valida.status}`)
}

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
