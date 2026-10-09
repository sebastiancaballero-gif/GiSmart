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
  rutasDelRecorrido,
  pasoPorDentroDelDivisor,
} = await import("../lib/map/trace.ts")
const { crearXlsx } = await import("../lib/excel.ts")
const { hojaDelTraceHaciaArriba, origenDeLaRuta } = await import("../lib/map/trace-excel.ts")
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
  // En un recorrido que se abre en dos hay dos filas con el mismo número de
  // paso (17 hacia arriba en la caché): total_pasos manda.
  const repetido = [...CACHE, { ...CACHE[2], hilo_destino: "h3" }]
  const conRepetido = clasificarRespuestaTrace(200, { encontrado: true, pasos: normalizarPasos(repetido), totalPasos: 3 })
  comprobar(
    "número de paso repetido: se cuentan los pasos de total_pasos",
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
  // Datos de la base para todos los casos: cubiertas de primer y segundo nivel,
  // un divisor 1x8 en cada una, el ODF y la OLT de la central.
  const datos = {
    hilos: {
      h2: { numero: 56, buffer: 5, idCable: "c2", colorHilo: "Negro", colorBuffer: "Gris" },
      h1: { numero: 56, buffer: 5, idCable: "c1", colorHilo: "Negro", colorBuffer: "Gris" },
      hb: { numero: 57, buffer: 5, idCable: "c1", colorHilo: "Amarillo", colorBuffer: "Gris" },
      hn: { numero: 21, buffer: 2, idCable: "c3", colorHilo: "Amarillo", colorBuffer: "Naranja" },
    },
    cables: { c2: { codigo: "2103630", largoM: 116.65 }, c1: { codigo: "2100555", largoM: 2586.52 }, c3: { codigo: "2102701", largoM: 44.58 } },
    puertos: {
      pd: { numero: 1, nombre: "E1", tipoPert: "DIV", idPert: "d1", sentido: "E" },
      ps: { numero: 3, nombre: "S3", tipoPert: "DIV", idPert: "d1", sentido: "S" },
      pn: { numero: 1, nombre: "E1", tipoPert: "DIV", idPert: "d2", sentido: "E" },
      pb: { numero: 44, nombre: "44", tipoPert: "BDJ", idPert: "b1", sentido: "B" },
      pb2: { numero: 45, nombre: "45", tipoPert: "BDJ", idPert: "b1", sentido: "B" },
      pt: { numero: 6, nombre: null, tipoPert: "TJT", idPert: "t1", sentido: "S" },
      pt2: { numero: 7, nombre: "7", tipoPert: "TJT", idPert: "t1", sentido: "S" },
    },
    tarjetas: { b1: { slot: 144, tipoEquipo: "ODF", idEquipo: "e1" }, t1: { slot: 6, tipoEquipo: "OLT", idEquipo: "e2" } },
    equipos: { e1: { codigo: "1", idCabecera: "cab" }, e2: { codigo: "1", idCabecera: "cab" } },
    divisores: {
      d1: { numero: 1, codigo: "D-1", idCubierta: "cu", modelo: "1x8PC" },
      d2: { numero: 1, codigo: "D-1", idCubierta: "cu2", modelo: "1x8PC" },
    },
    cubiertas: { cu: { etiqueta: "CO19", funcion: "Primer nivel" }, cu2: { etiqueta: "7-ago", funcion: "Segundo nivel" } },
    cabeceras: { cab: { nombre: "HUB LA UNION" } },
  }
  const paso = (n, o, d, extra = {}) => ({
    paso: n,
    id_contenedor: "x",
    tipo_contenedor: "CUB",
    tipo_conexion: "FUSION",
    tip_origen: o[0],
    [o[0] === "HILO" ? "hilo_origen" : "puerto_origen"]: o[1],
    tip_destino: d[0],
    [d[0] === "HILO" ? "hilo_destino" : "puerto_destino"]: d[1],
    ...extra,
  })
  const H = (id) => ["HILO", id]
  const P = (id) => ["PUERTO", id]
  // Lo que se lee de cada fila (los códigos son UUID; se prueban aparte).
  const linea = (f) => [f.tipo, f.nombre, f.ubica, f.codigoUbica, f.longitudM, f.contenedor, f.nombreContenedor].map((v) => v ?? "").join("|")

  // Del puerto del divisor de CO19 a la OLT, con el último paso repetido tal cual.
  const pasos = normalizarPasos([
    paso(1, P("pd"), H("h2")),
    paso(2, H("h2"), H("h1")),
    paso(3, H("h1"), P("pb"), { tipo_contenedor: "ODF", tipo_conexion: "PIGTAIL" }),
    paso(4, P("pb"), P("pt"), { tipo_contenedor: "OLT", tipo_conexion: "PATCHCORD" }),
    paso(4, P("pb"), P("pt"), { tipo_contenedor: "OLT", tipo_conexion: "PATCHCORD" }),
  ])
  comprobar("elementos en orden y sin repetir", elementosDelRecorrido(pasos).map((e) => e.id).join(",") === "pd,h2,h1,pb,pt")
  comprobar("una sola ruta aunque se repita el último paso", rutasDelRecorrido(pasos, "pd").length === 1)
  const tabla = armarTablaHaciaArriba(pasos, datos, "pd")
  const [ruta] = tabla.rutas
  const filas = ruta.filas
  comprobar("puerto de divisor: divisor 1, Cub nivel 1 CO19", linea(filas[0]) === "Puerto|E1|Divisor|1||Cub nivel 1|CO19", linea(filas[0]))
  comprobar("hilo: buffer, longitud del cable y cable", linea(filas[1]) === "Hilo|56|Buffer|5|116.65|Cable|2103630", linea(filas[1]))
  comprobar("puerto de bandeja: bandeja 144, ODF 1", linea(filas[3]) === "Puerto|44|Bandeja|144||ODF|1", linea(filas[3]))
  comprobar("puerto de tarjeta sin nombre: su número, tarjeta 6, OLT 1", linea(filas[4]) === "Puerto|6|Tarjeta|6||OLT|1", linea(filas[4]))
  comprobar("al final, la central", linea(filas[5]) === "Central|HUB LA UNION|||||" && filas.length === 6, linea(filas.at(-1)))
  comprobar(
    "Código elemento y Código contenedor son los UUID: puerto y cubierta, hilo y cable, puerto y equipo, la cabecera",
    [filas[0].codigo, filas[0].codigoContenedor, filas[1].codigo, filas[1].codigoContenedor, filas[3].codigo, filas[3].codigoContenedor, filas[5].codigo].join() ===
      "pd,cu,h2,c2,pb,e1,cab",
    [filas[0].codigo, filas[0].codigoContenedor, filas[1].codigo, filas[1].codigoContenedor, filas[3].codigo, filas[3].codigoContenedor, filas[5].codigo].join(),
  )
  comprobar("suma de longitudes al centímetro", ruta.sumaM === 2703.17 && sumaDeLongitudes(filas) === 2703.17, String(ruta.sumaM))
  comprobar("llega a la OLT y no hay avisos", ruta.llegaALaOlt && tabla.avisos.length === 0, tabla.avisos.join(" / "))
  comprobar(
    "para la ventana: la cubierta del divisor, el cable y los colores del hilo",
    filas[0].idCubierta === "cu" && filas[0].funcionCubierta === "Primer nivel" && filas[1].idCable === "c2" &&
      filas[1].colorHilo === "Negro" && filas[1].colorBuffer === "Gris",
  )
  const segundo = armarTablaHaciaArriba(pasos.slice(0, 1), { ...datos, cubiertas: { cu: { etiqueta: "CO7", funcion: "Segundo nivel" } } }, "pd")
  comprobar("cubierta de segundo nivel: Cub nivel 2", segundo.rutas[0].filas[0].contenedor === "Cub nivel 2")

  // Un hilo fusionado con dos (pasa en la caché): una ruta por camino, sin
  // sumar dos veces el mismo cable, y el aviso.
  const abierto = normalizarPasos([
    paso(1, P("pd"), H("h2")),
    paso(2, H("h2"), H("h1")),
    paso(2, H("h2"), H("hb")),
    paso(3, H("h1"), P("pb"), { tipo_contenedor: "ODF" }),
    paso(3, H("hb"), P("pb2"), { tipo_contenedor: "ODF" }),
    paso(4, P("pb"), P("pt"), { tipo_contenedor: "OLT" }),
    paso(4, P("pb2"), P("pt2"), { tipo_contenedor: "OLT" }),
  ])
  const bifurcada = armarTablaHaciaArriba(abierto, datos, "pd")
  comprobar(
    "bifurcación: dos rutas, cada una con su camino",
    bifurcada.rutas.length === 2 &&
      bifurcada.rutas[0].filas.map((f) => f.nombre).join(",") === "E1,56,56,44,6,HUB LA UNION" &&
      bifurcada.rutas[1].filas.map((f) => f.nombre).join(",") === "E1,56,57,45,7,HUB LA UNION",
    bifurcada.rutas.map((r) => r.filas.map((f) => f.nombre).join(",")).join(" / "),
  )
  comprobar("bifurcación: cada ruta suma su cable una sola vez", bifurcada.rutas.every((r) => r.sumaM === 2703.17))
  comprobar(
    "bifurcación: el aviso dice dónde se abre y por dónde sigue",
    bifurcada.avisos.length === 1 &&
      bifurcada.avisos[0].startsWith("El recorrido se abre en 2 después del hilo 56 del cable 2103630: sigue por el hilo 56 del cable 2100555 y el hilo 57 del cable 2100555."),
    bifurcada.avisos[0],
  )

  // Hacia arriba la caché se detiene en la salida del divisor: la ruta une el
  // recorrido de su entrada con un paso por dentro.
  const cruzado = [
    ...normalizarPasos([paso(1, H("hn"), P("ps"), { tipo_contenedor: "DIVISOR" })]),
    pasoPorDentroDelDivisor("ps", "pd", "d1"),
    ...pasos,
  ]
  const conDivisor = armarTablaHaciaArriba(cruzado, datos, "hn")
  comprobar(
    "cruce del divisor: de la salida a la entrada y sigue hasta la central",
    conDivisor.rutas.length === 1 &&
      conDivisor.rutas[0].filas.map((f) => f.nombre).join(",") === "21,S3,E1,56,56,44,6,HUB LA UNION" &&
      conDivisor.rutas[0].llegaALaOlt,
    conDivisor.rutas[0]?.filas.map((f) => f.nombre).join(","),
  )
  comprobar(
    "cruce del divisor: se nombra por dónde pasa",
    conDivisor.rutas[0].divisores.join() === "divisor 1 (1x8PC) de CO19, de S3 a E1" && conDivisor.avisos.length === 0,
    conDivisor.rutas[0].divisores.join(),
  )
  comprobar("el paso por dentro del divisor no suma longitud", conDivisor.rutas[0].sumaM === 2747.75, String(conDivisor.rutas[0].sumaM))

  const cortado = armarTablaHaciaArriba(normalizarPasos([paso(1, P("pn"), H("hn"))]), datos, "pn")
  comprobar(
    "se corta en un hilo: no llega a la OLT y el aviso dice dónde",
    !cortado.rutas[0].llegaALaOlt &&
      cortado.avisos[0] === "El recorrido no llega a la OLT: termina en el hilo 21 del cable 2102701, que no tiene más conexiones registradas.",
    cortado.avisos[0],
  )
  const sinEntrada = armarTablaHaciaArriba(normalizarPasos([paso(1, H("hn"), P("ps"))]), datos, "hn")
  comprobar(
    "termina en la salida de un divisor sin recorrido de su entrada: el aviso lo dice",
    sinEntrada.avisos[0]?.endsWith("termina en el puerto S3 del divisor 1 (1x8PC) de CO19, y la entrada de ese divisor no tiene recorrido hacia arriba en la caché."),
    sinEntrada.avisos[0],
  )
  const vacios = { hilos: {}, cables: {}, puertos: {}, tarjetas: {}, equipos: {}, divisores: {}, cubiertas: {}, cabeceras: {} }
  const sinDatos = armarTablaHaciaArriba(pasos, vacios, "pd")
  comprobar(
    "sin datos de la base: filas con lo que se sepa (el UUID siempre) y el aviso",
    sinDatos.rutas[0].filas.length === 5 && sinDatos.rutas[0].filas[1].contenedor === "Cable" && sinDatos.rutas[0].filas[1].codigo === "h2" &&
      sinDatos.avisos.some((a) => a.startsWith("5 elementos del recorrido no están en la base")),
    sinDatos.avisos.join(" / "),
  )
  const suelto = armarTablaHaciaArriba([...pasos, ...normalizarPasos([paso(9, H("hb"), P("pb2"))])], datos, "pd")
  comprobar(
    "pasos que no encadenan con el origen: el aviso los cuenta",
    suelto.avisos.some((a) => a.startsWith("2 elementos de la caché no encadenan")),
    suelto.avisos.join(" / "),
  )
  const ciclo = normalizarPasos([paso(1, H("h1"), H("h2")), paso(2, H("h2"), H("h1"))])
  comprobar("un ciclo en los pasos no se recorre para siempre", rutasDelRecorrido(ciclo, "h1").length === 1)

  const r = clasificarRespuestaTrace(
    200,
    JSON.parse(
      JSON.stringify({
        encontrado: true,
        pasos,
        totalPasos: 4,
        tabla: { rutas: [...bifurcada.rutas, { filas: [{ tipo: "Otro" }] }], avisos: [...bifurcada.avisos, 7] },
        tramos: [{ idOrigen: "pd", pasos: pasos.slice(0, 2), totalPasos: 2, atenuacionTotal: "0.1", calculadoEn: "2026-10-08", geomPath: null }, { pasos: [] }],
        errorTabla: null,
      }),
    ),
  )
  comprobar(
    "la respuesta trae la tabla por rutas (y descarta lo raro)",
    r.estado === "ok" && r.tabla?.rutas.length === 3 && r.tabla.rutas[2].filas.length === 0 && r.tabla.avisos.length === 1 &&
      r.tabla.rutas[0].filas[1].idCable === "c2" && r.errorTabla === null,
  )
  comprobar(
    "la respuesta trae los recorridos con que se continuó",
    r.estado === "ok" && r.tramos.length === 1 && r.tramos[0].pasos.length === 2 && r.tramos[0].atenuacionTotal === 0.1,
  )
  const conError = clasificarRespuestaTrace(200, { encontrado: true, pasos, tabla: null, errorTabla: { message: "No se pudieron leer…", detalle: "x" } })
  comprobar("si la tabla falla, el error llega aparte", conError.estado === "ok" && conError.tabla === null && conError.errorTabla?.detalle === "x")
}

console.log("\n6) EXCEL (.xlsx)\n")
{
  const leer = (datos) => new TextDecoder().decode(datos)
  const texto = leer(
    crearXlsx({
      nombre: "Trace hacia arriba",
      filas: [
        { celdas: ["Trace hacia arriba — ñ <&>"], estilo: "titulo" },
        { celdas: ["Tipo", "Longitud"], estilo: "encabezado" },
        { celdas: ["Hilo", 116.65] },
        { celdas: ["Suma", { formula: "SUM(B3:B3)", valor: 116.65 }], estilo: "total" },
      ],
      combinar: ["A1:B1"],
      filasFijas: 2,
      filtro: "A2:B3",
      horizontal: true,
    }),
  )
  comprobar("empieza como un zip (PK)", texto.charCodeAt(0) === 0x50 && texto.charCodeAt(1) === 0x4b)
  comprobar(
    "trae las seis partes de un .xlsx",
    ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"].every((n) => texto.includes(n)),
  )
  comprobar("los números van como números", texto.includes("<v>116.65</v>"))
  comprobar("el texto va escapado", texto.includes("ñ &lt;&amp;&gt;"))
  comprobar("la suma va con su fórmula y su valor", texto.includes("<f>SUM(B3:B3)</f><v>116.65</v>"))
  comprobar(
    "título combinado, encabezado fijo, filtro e impresión horizontal",
    texto.includes('<mergeCell ref="A1:B1"/>') && texto.includes('ySplit="2" topLeftCell="A3"') && texto.includes('<autoFilter ref="A2:B3"/>') &&
      texto.includes("_xlnm._FilterDatabase") && texto.includes("'Trace hacia arriba'!$A$2:$B$3") && texto.includes('orientation="landscape"'),
  )
  const hoja = texto.slice(texto.indexOf("<worksheet"))
  const orden = ["<sheetPr", "<dimension", "<sheetViews", "<sheetData", "<autoFilter", "<mergeCells", "<pageMargins", "<pageSetup"].map((e) => hoja.indexOf(e))
  comprobar("las partes de la hoja en el orden que exige Excel", orden.every((v, i) => v > 0 && (i === 0 || v > orden[i - 1])), orden.join(","))

  // La hoja del trace: contexto, encabezado, filas, Suma con fórmula y avisos.
  const ruta = {
    filas: [
      { tipo: "Hilo", codigo: "21", ubica: "Buffer", codigoUbica: "2", longitudM: 44.58, contenedor: "Cable", codigoContenedor: "2102701" },
      { tipo: "Puerto", codigo: "S3", ubica: "Divisor", codigoUbica: "1", longitudM: null, contenedor: "Cub nivel 1", codigoContenedor: "CO06" },
      { tipo: "Central", codigo: "01a0dfa5-a770-7f3f-8d26-c13ec2a30807", ubica: null, codigoUbica: null, longitudM: null, contenedor: null, codigoContenedor: null, nombre: "HUB LA UNION" },
    ],
    sumaM: 44.58,
    llegaALaOlt: true,
    divisores: ["divisor 1 (1x8PC) de CO06, de S3 a E1"],
  }
  const h = hojaDelTraceHaciaArriba({
    ruta,
    origen: "Hilo 21 del cable 2102701",
    idOrigen: "01a0e8eb-a10e-7ac2-b47c-2f035ae45d86",
    numeroDeRuta: 2,
    totalDeRutas: 2,
    pasos: 12,
    atenuacionDb: 0.6,
    calculadoEn: "8 oct 2026",
    exportadoEn: "9 oct 2026",
    avisos: ["El recorrido se abre en 2 después del hilo 13."],
  })
  const fila = (texto0) => h.filas.findIndex((f) => f.celdas[0] === texto0) + 1
  const encabezado = fila("Tipo elemento")
  const suma = h.filas.findIndex((f) => f.celdas[3] === "Suma") + 1
  comprobar(
    "el origen en palabras cuando no llega elegido",
    origenDeLaRuta({ ...ruta, filas: [{ tipo: "Hilo", nombre: "21", nombreContenedor: "2102701" }] }) === "Hilo 21 del cable 2102701" &&
      origenDeLaRuta({ ...ruta, filas: [{ tipo: "Puerto", nombre: "E1", ubica: "Divisor", codigoUbica: "1", contenedor: "Cub nivel 2", nombreContenedor: "7-ago" }] }) ===
        "Puerto E1 del divisor 1 de 7-ago" &&
      origenDeLaRuta({ ...ruta, filas: [{ tipo: "Puerto", nombre: "7", ubica: "Tarjeta", codigoUbica: "5", contenedor: "OLT", nombreContenedor: "1" }] }) ===
        "Puerto 7 de la tarjeta 5 de la OLT 1",
  )
  comprobar("el título dice el origen y la ruta", h.filas[0].celdas[0] === "Trace hacia arriba — Hilo 21 del cable 2102701 (ruta 2 de 2)")
  comprobar(
    "el contexto dice a dónde llega y que la atenuación no tiene el divisor",
    String(h.filas[1].celdas[0]).includes("llega a la OLT de HUB LA UNION") && String(h.filas[1].celdas[0]).includes("0,60 dB según la caché, sin la pérdida del divisor"),
    String(h.filas[1].celdas[0]),
  )
  comprobar("el divisor por donde pasa va arriba", h.filas[2].celdas[0] === "Pasa por el divisor 1 (1x8PC) de CO06, de S3 a E1.")
  comprobar(
    "las columnas del ingeniero como tabla de Excel, fijas al bajar, con la Suma como fila de totales",
    encabezado === 5 && h.filasFijas === 5 && h.tabla?.rango === "A5:G9" && h.tabla.totales?.[3] === "Suma" && h.filtro === undefined,
    `${encabezado} ${h.tabla?.rango}`,
  )
  comprobar(
    "la Suma suma la columna de longitud (solo lo visible al filtrar)",
    suma === 9 && h.filas[suma - 1].celdas[4].formula === "SUBTOTAL(109,TraceHaciaArriba[Longitud (m)])" && h.filas[suma - 1].celdas[4].valor === 44.58,
  )
  comprobar("los avisos van al final", String(h.filas.at(-1).celdas[0]).startsWith("• El recorrido se abre en 2") && h.horizontal === true)
  const xlsx = leer(crearXlsx(h))
  comprobar(
    "el .xlsx lleva la tabla: su parte, su relación y su tipo",
    xlsx.includes("xl/tables/table1.xml") && xlsx.includes("xl/worksheets/_rels/sheet1.xml.rels") && xlsx.includes("spreadsheetml.table+xml") &&
      xlsx.includes('<tablePart r:id="rId1"/>'),
  )
  comprobar(
    "la tabla: rango, filtro sin la Suma, columnas del encabezado y totales",
    xlsx.includes('name="TraceHaciaArriba" displayName="TraceHaciaArriba" ref="A5:G9" totalsRowCount="1"') &&
      xlsx.includes('<autoFilter ref="A5:G8"/>') && xlsx.includes('<tableColumn id="4" name="Código ubica" totalsRowLabel="Suma"/>') &&
      xlsx.includes('<tableColumn id="5" name="Longitud (m)" totalsRowFunction="sum"/>'),
  )
}

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
