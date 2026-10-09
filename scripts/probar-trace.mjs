/**
 * Pruebas del «Recorrido del trace» (lib/map/trace.ts y la ruta GET
 * /api/traces/{downstream|upstream}/{id}, que lee la caché
 * tab_fiber.element_connection) que no necesitan la base. Se corre con
 * `pnpm run trace`.
 */
process.env.AUTH_JWT_SECRET = "secreto-solo-para-las-pruebas-del-trace-0123456789"
// Sin Supabase: lo que pase las validaciones se detiene antes de la base.
delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SECRET_KEY

const {
  normalizarPasos,
  hilosDelRecorrido,
  atenuacionTotal,
  clasificarRespuestaTrace,
  geometria,
  direccionDeUrl,
  armarTablaHaciaArriba,
  elementosDelRecorrido,
  sumaDeLongitudes,
} = await import("../lib/map/trace.ts")
const { crearXlsx } = await import("../lib/excel.ts")
const { emitirToken } = await import("../lib/auth-server.ts")
const { GET } = await import("../app/api/traces/[direccion]/[id]/route.ts")

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
    encontrado: true, pasos: normalizarPasos(CACHE), totalPasos: 3, cables: ["cab1", 7, "cab2"],
    geomPath: null, atenuacionTotal: "0.9", calculadoEn: "2026-10-08T08:48:45-05:00",
  })
  comprobar(
    "200: pasos, total, cables (solo texto), atenuación de la tabla y fecha",
    ok.estado === "ok" && ok.encontrado && ok.pasos.length === 3 && ok.totalPasos === 3 && ok.cables.join(",") === "cab1,cab2" &&
      ok.atenuacionTotal === 0.9 && ok.calculadoEn?.startsWith("2026-10-08"),
  )
  const conGeom = clasificarRespuestaTrace(200, {
    encontrado: true,
    pasos: normalizarPasos(CACHE),
    geomPath: { type: "MultiLineString", coordinates: [[[-76.1, 4.5], [-76.2, 4.6]]] },
  })
  comprobar("la geometría llega en geomPath, como en el ejemplo del ingeniero", conGeom.estado === "ok" && conGeom.geometria?.type === "MultiLineString")
  // 52 filas de la caché repiten el último número de paso: total_pasos manda.
  const repetido = [...CACHE, { ...CACHE[2], hilo_destino: "h3" }]
  const conRepetido = clasificarRespuestaTrace(200, { encontrado: true, pasos: normalizarPasos(repetido), totalPasos: 3 })
  comprobar(
    "último paso repetido: se cuentan los pasos de total_pasos",
    conRepetido.estado === "ok" && conRepetido.pasos.length === 4 && conRepetido.totalPasos === 3,
  )
  const sinTotal = clasificarRespuestaTrace(200, { encontrado: true, pasos: normalizarPasos(repetido) })
  comprobar("sin total_pasos: los números de paso distintos", sinTotal.estado === "ok" && sinTotal.totalPasos === 3)
  const noEsta = clasificarRespuestaTrace(200, { encontrado: false, pasos: [], totalPasos: 0, cables: [], geomPath: null })
  comprobar("200 sin recorrido en la caché: encontrado en falso", noEsta.estado === "ok" && !noEsta.encontrado && noEsta.pasos.length === 0)
  const sinAtenuacion = clasificarRespuestaTrace(200, { encontrado: true, pasos: normalizarPasos(CACHE) })
  comprobar("sin atenuación de la tabla: la del último paso", sinAtenuacion.estado === "ok" && sinAtenuacion.atenuacionTotal === 0.15)
  const error = clasificarRespuestaTrace(502, { message: "No se pudo leer el recorrido en la caché del trace.", detalle: "XX: algo" })
  comprobar("502: el mensaje y el detalle de la base", error.estado === "error" && error.mensaje.includes("caché") && error.detalle === "XX: algo")
  const sinCuerpo = clasificarRespuestaTrace(500, null)
  comprobar("error sin cuerpo: un mensaje con el código HTTP", sinCuerpo.estado === "error" && sinCuerpo.mensaje.includes("HTTP 500"))
}

console.log("\n4) LA RUTA GET /api/traces/{downstream|upstream}/{id}\n")
{
  comprobar(
    "dirección en la URL: downstream/upstream, en minúsculas o mayúsculas",
    direccionDeUrl("downstream") === "DOWNSTREAM" && direccionDeUrl("UPSTREAM") === "UPSTREAM",
  )
  comprobar("dirección inválida en la URL: nula", direccionDeUrl("abajo") === null && direccionDeUrl(undefined) === null)
  const token = emitirToken("Prueba", "usuario")
  const pedir = (id, direccion, conSesion = true) =>
    GET(
      new Request(`http://local/api/traces/${direccion}/${encodeURIComponent(id)}`, {
        headers: conSesion ? { authorization: `Bearer ${token}` } : {},
      }),
      { params: Promise.resolve({ direccion, id: encodeURIComponent(id) }) },
    )
  const UUID_BUENO = "01a0f9bf-be88-7b80-9c77-2219b25fb611"
  comprobar("sin sesión: 401", (await pedir(UUID_BUENO, "downstream", false)).status === 401)
  comprobar("origen que no es UUID: 400", (await pedir("no-es-un-uuid", "downstream")).status === 400)
  comprobar("inyección SQL en el origen: 400", (await pedir(`${UUID_BUENO}' OR 1=1 --`, "upstream")).status === 400)
  comprobar("dirección que no es downstream ni upstream: 400", (await pedir(UUID_BUENO, "down; DROP TABLE x")).status === 400)
  const malCodificado = await GET(new Request("http://local/api/traces/downstream/x", { headers: { authorization: `Bearer ${token}` } }), {
    params: Promise.resolve({ direccion: "downstream", id: "%E0%A4%A" }),
  })
  comprobar("UUID mal codificado en la URL: 400", malCodificado.status === 400)
  const valida = await pedir(` ${UUID_BUENO} `, "upstream")
  comprobar("petición válida pasa las validaciones (sin Supabase: 500)", valida.status === 500, `HTTP ${valida.status}`)
}

console.log("\n5) TABLA DEL TRACE HACIA ARRIBA\n")
{
  // Desde el puerto de un divisor en una cubierta de primer nivel hasta la OLT,
  // con el último paso repetido (pasa en la caché).
  const pasos = normalizarPasos([
    { paso: 1, id_contenedor: "cub", tipo_contenedor: "CUB", tip_origen: "PUERTO", puerto_origen: "pd", tip_destino: "HILO", hilo_destino: "h2", tipo_conexion: "FUSION" },
    { paso: 2, id_contenedor: "cub0", tipo_contenedor: "CUB", tip_origen: "HILO", hilo_origen: "h2", tip_destino: "HILO", hilo_destino: "h1", tipo_conexion: "FUSION" },
    { paso: 3, id_contenedor: "odf", tipo_contenedor: "ODF", tip_origen: "HILO", hilo_origen: "h1", tip_destino: "PUERTO", puerto_destino: "pb", tipo_conexion: "PIGTAIL" },
    { paso: 4, id_contenedor: "olt", tipo_contenedor: "OLT", tip_origen: "PUERTO", puerto_origen: "pb", tip_destino: "PUERTO", puerto_destino: "pt", tipo_conexion: "PATCHCORD" },
    { paso: 4, id_contenedor: "olt", tipo_contenedor: "OLT", tip_origen: "PUERTO", puerto_origen: "pb", tip_destino: "PUERTO", puerto_destino: "pt", tipo_conexion: "PATCHCORD" },
  ])
  comprobar("elementos en orden y sin repetir", elementosDelRecorrido(pasos).map((e) => e.id).join(",") === "pd,h2,h1,pb,pt")
  const datos = {
    hilos: { h2: { numero: 56, buffer: 5, idCable: "c2" }, h1: { numero: 56, buffer: 5, idCable: "c1" } },
    cables: { c2: { codigo: "2103630", largoM: 116.65 }, c1: { codigo: "2100555", largoM: 2586.52 } },
    puertos: {
      pd: { numero: 1, nombre: "E1", tipoPert: "DIV", idPert: "d1" },
      pb: { numero: 44, nombre: "44", tipoPert: "BDJ", idPert: "b1" },
      pt: { numero: 6, nombre: null, tipoPert: "TJT", idPert: "t1" },
    },
    tarjetas: { b1: { slot: 144, tipoEquipo: "ODF", idEquipo: "e1" }, t1: { slot: 6, tipoEquipo: "OLT", idEquipo: "e2" } },
    equipos: { e1: { codigo: "1", idCabecera: "cab" }, e2: { codigo: "1", idCabecera: "cab" } },
    divisores: { d1: { numero: 1, codigo: "D-1", idCubierta: "cu" } },
    cubiertas: { cu: { etiqueta: "CO19", funcion: "Primer nivel" } },
    cabeceras: { cab: { nombre: "HUB LA UNION" } },
  }
  const filas = armarTablaHaciaArriba(pasos, datos)
  const linea = (f) => [f.tipo, f.codigo, f.ubica, f.codigoUbica, f.longitudM, f.contenedor, f.codigoContenedor].map((v) => v ?? "").join("|")
  comprobar("puerto de divisor: divisor 1, Cub nivel 1 CO19", linea(filas[0]) === "Puerto|E1|Divisor|1||Cub nivel 1|CO19", linea(filas[0]))
  comprobar("hilo: buffer, longitud del cable y cable", linea(filas[1]) === "Hilo|56|Buffer|5|116.65|Cable|2103630", linea(filas[1]))
  comprobar("puerto de bandeja: bandeja 144, ODF 1", linea(filas[3]) === "Puerto|44|Bandeja|144||ODF|1", linea(filas[3]))
  comprobar("puerto de tarjeta sin nombre: su número, tarjeta 6, OLT 1", linea(filas[4]) === "Puerto|6|Tarjeta|6||OLT|1", linea(filas[4]))
  comprobar("al final, la central", linea(filas[5]) === "Central|HUB LA UNION|||||" && filas.length === 6, linea(filas.at(-1)))
  comprobar("suma de longitudes", Math.abs(sumaDeLongitudes(filas) - 2703.17) < 1e-9, String(sumaDeLongitudes(filas)))
  const segundo = armarTablaHaciaArriba(pasos.slice(0, 1), { ...datos, cubiertas: { cu: { etiqueta: "CO7", funcion: "Segundo nivel" } } })
  comprobar("cubierta de segundo nivel: Cub nivel 2", segundo[0].contenedor === "Cub nivel 2")
  const sinDatos = armarTablaHaciaArriba(pasos, { hilos: {}, cables: {}, puertos: {}, tarjetas: {}, equipos: {}, divisores: {}, cubiertas: {}, cabeceras: {} })
  comprobar("sin datos de la base: filas con lo que se sepa, sin romperse", sinDatos.length === 5 && sinDatos[1].contenedor === "Cable" && sinDatos[1].codigoContenedor === null)
  const r = clasificarRespuestaTrace(200, JSON.parse(JSON.stringify({ encontrado: true, pasos, totalPasos: 4, elementos: [...filas, { tipo: "Otro" }], errorElementos: null })))
  comprobar("la respuesta trae la tabla (y descarta filas raras)", r.estado === "ok" && r.elementos?.length === 6 && r.errorElementos === null)
  const conError = clasificarRespuestaTrace(200, { encontrado: true, pasos, elementos: null, errorElementos: { message: "No se pudieron leer…", detalle: "x" } })
  comprobar("si la tabla falla, el error llega aparte", conError.estado === "ok" && conError.elementos === null && conError.errorElementos?.detalle === "x")
}

console.log("\n6) EXCEL (.xlsx)\n")
{
  const datos = crearXlsx({
    nombre: "Trace hacia arriba",
    filas: [
      { celdas: ["Trace hacia arriba — ñ <&>"], estilo: "titulo" },
      { celdas: ["Tipo", "Longitud"], estilo: "encabezado" },
      { celdas: ["Hilo", 116.65] },
      { celdas: ["Suma", 116.65], estilo: "total" },
    ],
  })
  const texto = new TextDecoder().decode(datos)
  comprobar("empieza como un zip (PK)", datos[0] === 0x50 && datos[1] === 0x4b)
  comprobar("trae las seis partes de un .xlsx", ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"].every((n) => texto.includes(n)))
  comprobar("los números van como números", texto.includes("<v>116.65</v>"))
  comprobar("el texto va escapado", texto.includes("ñ &lt;&amp;&gt;"))
}

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
