/**
 * Pruebas de «Gestión de hilos» (lib/map/hilos-cable.ts y la ruta
 * GET /api/cables/{id}/hilos) que no necesitan la base. Se corre con
 * `pnpm run hilos`.
 */
process.env.AUTH_JWT_SECRET = "secreto-solo-para-las-pruebas-de-hilos-0123456789"

const { normalizarHilos, clasificarRespuestaHilos, colorParaMostrar } = await import("../lib/map/hilos-cable.ts")
const { emitirToken } = await import("../lib/auth-server.ts")
const { GET } = await import("../app/api/cables/[id]/hilos/route.ts")

let fallos = 0
let pruebas = 0
function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

console.log("\n1) LECTURA DE LAS FILAS DE hilo_cable\n")
{
  const hilos = normalizarHilos([
    { id: "b", id_legacy: 2100572, numero_hilo: 17, numero_buffer: 2, color_hilo: "Naranja", color_buffer: "Naranja", tipo_tecnologia: "GPON", estado_tec: "B" },
    { id: "a", id_legacy: 2100571, numero_hilo: 16, numero_buffer: 2, color_hilo: "Azul", color_buffer: "Naranja", tipo_tecnologia: "GPON", estado_tec: "B" },
    { id: "c", numero_hilo: "3" },
  ])
  comprobar("ordenados por número de hilo", hilos.map((h) => h.numero).join(",") === "3,16,17")
  comprobar(
    "cada campo en su sitio",
    hilos[1].identificador === "2100571" && hilos[1].buffer === 2 && hilos[1].colorHilo === "Azul" && hilos[1].tecnologia === "GPON" && hilos[1].estado === "B",
  )
  comprobar("un número que llega como texto se lee como número", hilos[0].numero === 3)
  comprobar("lo que falta queda vacío, no inventado", hilos[0].identificador === null && hilos[0].colorHilo === null)
}
{
  // Lo que pasa de verdad: la ruta lee las filas y el navegador vuelve a leer
  // su respuesta. La segunda lectura no puede perder nada.
  const fila = { id: "a", id_legacy: 2106555, numero_hilo: 1, numero_buffer: 1, color_hilo: "Azul", color_buffer: "Azul", tipo_tecnologia: "DARK", estado_tec: "Activo" }
  const enElNavegador = clasificarRespuestaHilos(200, JSON.parse(JSON.stringify({ hilos: normalizarHilos([fila]) })))
  const h = enElNavegador.estado === "ok" ? enElNavegador.hilos[0] : null
  comprobar(
    "servidor → navegador: el hilo llega entero",
    h?.identificador === "2106555" && h?.numero === 1 && h?.buffer === 1 && h?.colorHilo === "Azul" && h?.tecnologia === "DARK" && h?.estado === "Activo",
    JSON.stringify(h),
  )
}
{
  // El ID que se muestra al elegir un hilo: su UUID, y que no se pierda al
  // leer dos veces (servidor y navegador).
  const uuid = "01a0e8eb-a101-735f-82ff-1c8dbe28a96c"
  const [h] = clasificarRespuestaHilos(200, JSON.parse(JSON.stringify({ hilos: normalizarHilos([{ id: uuid, numero_hilo: 2 }]) }))).hilos
  comprobar("el UUID del hilo llega al navegador", h.uuid === uuid && h.id === uuid, JSON.stringify(h))
  const [sinUuid] = clasificarRespuestaHilos(200, JSON.parse(JSON.stringify({ hilos: normalizarHilos([{ numero_hilo: 3 }]) }))).hilos
  comprobar("la clave propia de un hilo sin ID no se muestra como su ID", sinUuid.uuid === null, JSON.stringify(sinUuid))
}
comprobar("filas sin número ni UUID se descartan", normalizarHilos([{ color_hilo: "Azul" }, null, 5]).length === 0)
{
  const sinId = normalizarHilos([{ num_hilo: 2 }, { num_hilo: 1 }])
  comprobar("un hilo sin UUID se muestra igual, con una clave propia", sinId.length === 2 && sinId[0].id !== sinId[1].id)
}
{
  // Lo que Carlos va a agregar a la función.
  const [h] = normalizarHilos([
    { id: "a", numero_hilo: 16, nodo_origen: "HUB LA UNION", rack: "Rack 1", odf: 3, puerto: 4, equipo_destino: "Div: 1 CO02" },
  ])
  comprobar(
    "rack, ODF, puerto y destino se leen en cuanto la función los traiga",
    h.nodoOrigen === "HUB LA UNION" && h.rack === "Rack 1" && h.odf === "3" && h.puerto === "4" && h.equipoDestino === "Div: 1 CO02",
    JSON.stringify(h),
  )
}
{
  // Lo que devolvía la función el 28/09: nombres distintos a los de la tabla.
  const [h] = normalizarHilos([{ id: "a", color: "Azul", estado: "Activo", num_buffer: 1, "Tecnología": "DARK", numero_hilo: 1 }])
  comprobar(
    "nombres con tilde, mayúscula o abreviados se reconocen",
    h.colorHilo === "Azul" && h.estado === "Activo" && h.buffer === 1 && h.tecnologia === "DARK" && h.numero === 1,
    JSON.stringify(h),
  )
}
comprobar("la lista también puede venir en { data: [...] }", normalizarHilos({ data: [{ id: "x", numero_hilo: 1 }] }).length === 1)
comprobar("también dentro de { hilos: [...] }", normalizarHilos({ hilos: [{ id: "x" }] }).length === 1)
comprobar("respuestas raras: lista vacía, sin reventar", [null, "hola", 7, {}].every((r) => normalizarHilos(r).length === 0))

console.log("\n2) COLORES\n")
comprobar("por nombre, con tildes", colorParaMostrar("Café", 1) === colorParaMostrar("cafe", 1) && colorParaMostrar("Café", 1) !== null)
comprobar("nombre desconocido: el color que le toca por posición (13 = Azul)", colorParaMostrar("Fucsia", 13) === colorParaMostrar("Azul", 1))
comprobar("sin nombre ni posición: nada", colorParaMostrar(null, null) === null)

console.log("\n3) RESPUESTA DE LA RUTA\n")
comprobar("200: hilos leídos", clasificarRespuestaHilos(200, { hilos: [{ id: "x" }] }).estado === "ok")
{
  const r = clasificarRespuestaHilos(502, { message: "falla", detalle: "42501: permiso" })
  comprobar("error con su mensaje y su detalle", r.estado === "error" && r.mensaje === "falla" && r.detalle === "42501: permiso")
}
comprobar("error sin cuerpo: dice el código HTTP", clasificarRespuestaHilos(500, null).mensaje.includes("HTTP 500"))

console.log("\n4) LA RUTA PIDE SESIÓN Y UN UUID\n")
const pedir = (id, token) =>
  GET(new Request(`http://local/api/cables/${id}/hilos`, { headers: token ? { authorization: `Bearer ${token}` } : {} }), {
    params: Promise.resolve({ id }),
  })
comprobar("sin sesión: 401", (await pedir("01a0c524-b611-7fc7-b56e-c93273914aa3")).status === 401)
comprobar("id que no es UUID: 400", (await pedir("no-es-un-uuid", emitirToken("Prueba", "operador"))).status === 400)

console.log("\n5) SECCIÓN DISTRIBUCIÓN (de la caché del trace)\n")
{
  const { armarDistribucion, salidaDeLaCubierta, salidasDelModelo, clasificarRespuestaDistribucion, idsParaDistribucion, SIN_CONECTAR } =
    await import("../lib/map/distribucion-cable.ts")
  const { GET: GET_DISTRIBUCION } = await import("../app/api/cables/[id]/distribucion/route.ts")

  comprobar("salidas del modelo: 1x8PC → 8", salidasDelModelo("1x8PC") === 8 && salidasDelModelo("1 x 16") === 16 && salidasDelModelo("raro") === null)
  const d1 = { id: "d1", num_divisor: 1, modelo_divisor: "1x8PC", id_cubierta_ubica: "co05" }
  const d2 = { id: "d2", num_divisor: 2, modelo_divisor: "1x8PC", id_cubierta_ubica: "co05" }
  comprobar("salida de la cubierta: puerto 1 del divisor 2 → 9, como el SIG anterior", salidaDeLaCubierta(d2, 1, [d2, d1]) === 9)
  comprobar("salida del divisor 1: el mismo puerto", salidaDeLaCubierta(d1, 7, [d1, d2]) === 7)
  comprobar("con números de divisor repetidos no se inventa la salida", salidaDeLaCubierta(d2, 1, [d2, { ...d1, num_divisor: 2 }]) === null)

  const cache = [
    // Hilo a: sale del puerto S3 del divisor 2 de CO05 y llega a la NAP 13/14.
    {
      id_origen: "a",
      direccion: "UPSTREAM",
      fecha_calculo: "2026-10-01",
      path_secuencia: [
        { paso: 2, tipo_contenedor: "DIVISOR", id_contenedor: "d2", tip_destino: "PUERTO", puerto_destino: "s3" },
        { paso: 1, tipo_contenedor: "CUB", id_contenedor: "n2", tip_destino: "HILO" },
      ],
    },
    {
      id_origen: "a",
      direccion: "DOWNSTREAM",
      fecha_calculo: "2026-10-01",
      path_secuencia: [{ paso: 1, tipo_contenedor: "CUB", id_contenedor: "nap", tip_destino: "PUERTO", puerto_destino: "e-nap" }],
    },
    // Hilo b (feeder): no cruza divisores hacia la fuente; llega a la entrada del divisor 1 de CO05.
    { id_origen: "b", direccion: "UPSTREAM", fecha_calculo: "2026-10-01", path_secuencia: [{ paso: 1, tipo_contenedor: "OLT" }] },
    {
      id_origen: "b",
      direccion: "DOWNSTREAM",
      fecha_calculo: "2026-10-01",
      path_secuencia: [{ paso: 1, tipo_contenedor: "CUB", id_contenedor: "co05", tip_destino: "PUERTO", puerto_destino: "e1" }],
    },
  ]
  const ids = idsParaDistribucion(cache)
  comprobar("pide solo los puertos de los pasos que importan", [...ids.puertos].sort().join(",") === "e-nap,e1,s3", ids.puertos.join(","))
  const filas = armarDistribucion({
    hilos: ["a", "b", "c"],
    cache,
    puertos: new Map([
      ["s3", { id: "s3", numero_puerto: 3, id_equipo_pert: "d2", tipo_equipo_pert: "DIV_N1" }],
      ["e-nap", { id: "e-nap", numero_puerto: 1, id_equipo_pert: "dnap", tipo_equipo_pert: "DIV_N2" }],
      ["e1", { id: "e1", numero_puerto: 1, id_equipo_pert: "d1", tipo_equipo_pert: "DIV_N1" }],
    ]),
    divisores: new Map([d1, d2, { id: "dnap", num_divisor: 1, modelo_divisor: "1x8PC", id_cubierta_ubica: "nap" }].map((d) => [d.id, d])),
    cubiertas: new Map([
      ["co05", { id: "co05", etiqueta: "CO05", funcion_cub: "Primer nivel" }],
      ["nap", { id: "nap", etiqueta: "13/14", funcion_cub: "Segundo nivel" }],
    ]),
    divisoresDeLaCubierta: new Map([["co05", [d1, d2]]]),
  })
  const [a, b, c] = filas
  comprobar(
    "hilo de distribución: cubierta, divisor, puerto y salida",
    a.cubierta === "CO05" && a.divisor === 2 && a.puertoDivisor === 3 && a.salida === 11,
    JSON.stringify(a),
  )
  comprobar("llega a una cubierta de segundo nivel: «NAP 13/14»", a.destino === "NAP 13/14", String(a.destino))
  comprobar(
    "hilo del feeder: sin divisor de origen, llega al divisor de primer nivel",
    b.cubierta === null && b.destino === "Divisor 1 de CO05",
    String(b.destino),
  )
  comprobar("hilo sin recorrido: «Sin conectar»", c.cubierta === null && c.destino === SIN_CONECTAR)

  const leida = clasificarRespuestaDistribucion(200, JSON.parse(JSON.stringify({ hilos: filas })))
  comprobar("servidor → navegador: la fila llega entera", leida.estado === "ok" && JSON.stringify(leida.hilos[0]) === JSON.stringify(a))
  const error = clasificarRespuestaDistribucion(502, { message: "falla", detalle: "tab_fiber.element_connection → 42501: permiso" })
  comprobar("error con su mensaje y su detalle", error.estado === "error" && error.mensaje === "falla" && error.detalle?.includes("42501"))

  const pedirDistribucion = (id, token) =>
    GET_DISTRIBUCION(
      new Request(`http://local/api/cables/${id}/distribucion`, { headers: token ? { authorization: `Bearer ${token}` } : {} }),
      { params: Promise.resolve({ id }) },
    )
  comprobar("la ruta sin sesión: 401", (await pedirDistribucion("01a0c524-b611-7fc7-b56e-c93273914aa3")).status === 401)
  comprobar("la ruta con un id que no es UUID: 400", (await pedirDistribucion("no-es-un-uuid", emitirToken("Prueba", "operador"))).status === 400)
}

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
