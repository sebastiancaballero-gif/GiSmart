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

console.log("\n5) TRAZA DE LOS HILOS: SECCIÓN FEEDER Y DISTRIBUCIÓN (tablas traza_* y attr_traza_*)\n")
{
  const { filasDeTraza, columnasDeTraza, armarTrazas, salidaDeLaCubierta, salidasDelModelo, clasificarRespuestaTrazas, esTipoTraza, CAMPOS_TRAZA } =
    await import("../lib/map/traza-hilos.ts")
  const { GET: GET_TRAZAS } = await import("../app/api/cables/[id]/trazas/route.ts")

  // Lo que hay en tab_fiber.attr_traza_feeder (26/10): así lo devolvería la función.
  const feeder = {
    id_puerto_ini: "01a0f9bf-be86-7ef5-b39f-af31373a07af",
    num_puerto_ini: "Puerto 16",
    tipo_equipo: "TJT 3",
    equipo_ubica: "OLT 1",
    rack_ubica: "Rack Rack 1",
    posicion_u: "30",
    cubierta_fin: "Cub ---",
    divisor_fin: "Div D-1",
    id_puerto_fin: "01a0f9bf-bdc5-7c2b-83b1-dad46e6f14e7",
  }
  const [fila] = filasDeTraza(feeder)
  comprobar("un objeto es una fila, con sus campos", fila?.num_puerto_ini === "Puerto 16" && fila?.equipo_ubica === "OLT 1", JSON.stringify(fila))
  comprobar("una lista (hilo en dos trazas) son dos filas", filasDeTraza([feeder, { ...feeder, num_puerto_ini: "Puerto 2" }]).length === 2)
  comprobar("también dentro de { data: [...] }", filasDeTraza({ data: [feeder] }).length === 1)
  comprobar("sin traza (null, lista vacía, objeto vacío): ninguna fila", [null, [], {}, "x", 3].every((d) => filasDeTraza(d).length === 0))
  comprobar("números y sí/no se leen como texto", JSON.stringify(filasDeTraza({ posicion_u: 30, activo: true })[0]) === '{"posicion_u":"30","activo":"Sí"}')

  // El orden: el de las tablas de atributos, desde num_puerto_ini (jsonb no guarda el orden).
  const ordenFeeder = columnasDeTraza("FEEDER", []).map((c) => c.campo).join(",")
  comprobar(
    "feeder: columnas en el orden de attr_traza_feeder, desde num_puerto_ini",
    ordenFeeder === "num_puerto_ini,tipo_equipo,equipo_ubica,rack_ubica,posicion_u,cubierta_fin,divisor_fin,id_puerto_fin",
    ordenFeeder,
  )
  const ordenDistribucion = columnasDeTraza("DISTRIBUCION", []).map((c) => c.campo).join(",")
  comprobar(
    "distribución: columnas en el orden de attr_traza_distribucion, desde num_puerto_ini",
    ordenDistribucion === "num_puerto_ini,num_salida_ini,divisor_ini,cubierta_ini,divisor_fin,nap_destino,salidas_dest",
    ordenDistribucion,
  )
  const conExtra = columnasDeTraza("FEEDER", [{ id: "h", filas: filasDeTraza({ ...feeder, zeta: "z", alfa: "a" }) }])
  comprobar(
    "un campo que los atributos agreguen va al final; id_puerto_ini no se muestra",
    conExtra.slice(-2).map((c) => `${c.campo}:${c.titulo}`).join(",") === "alfa:Alfa,zeta:Zeta" && !conExtra.some((c) => c.campo === "id_puerto_ini"),
    conExtra.map((c) => c.campo).join(","),
  )
  comprobar("cada tipo tiene sus columnas", CAMPOS_TRAZA.FEEDER.length === 8 && CAMPOS_TRAZA.DISTRIBUCION.length === 7)
  comprobar("tipos válidos: FEEDER y DISTRIBUCION", esTipoTraza("FEEDER") && esTipoTraza("DISTRIBUCION") && !esTipoTraza("feeder") && !esTipoTraza(null))

  // La salida de la cubierta: las de los divisores anteriores más el puerto.
  const d1 = { id: "d1", num_divisor: 1, modelo_divisor: "1x8PC", id_cubierta_ubica: "co06" }
  const d2 = { id: "d2", num_divisor: 2, modelo_divisor: "1x8PC", id_cubierta_ubica: "co06" }
  comprobar("salidas del modelo: 1x8PC → 8", salidasDelModelo("1x8PC") === 8 && salidasDelModelo("1 x 16") === 16 && salidasDelModelo("raro") === null)
  comprobar("D1 P3 → salida 3; D2 P3 → salida 11 (dos 1x8)", salidaDeLaCubierta(d1, 3, [d1, d2]) === 3 && salidaDeLaCubierta(d2, 3, [d1, d2]) === 11)
  comprobar("números de divisor repetidos: no se sabe", salidaDeLaCubierta(d2, 3, [d1, { ...d2, id: "x", num_divisor: 1 }, d2]) === null)

  // El armado, con lo que hay en la base (2102603: CO06 D2 P3 → NAP 11/12).
  const distribucion = armarTrazas({
    tipo: "DISTRIBUCION",
    hilos: ["H1", "h2", "h3"],
    trazas: [{ id: "t1", id_puerto_inicio: "P3", id_divisor_inicio: "D2", path_hilos: ["otro", "h1"] }],
    atributos: new Map([
      ["p3", { id_puerto_ini: "p3", num_puerto_ini: "Puerto 3", num_salida_ini: null, divisor_ini: "Div D-2", cubierta_ini: "Cub ---", nap_destino: "Nap 11-dic" }],
    ]),
    divisores: new Map([["d2", d2]]),
    hermanos: new Map([["co06", [d1, d2]]]),
    puertos: new Map([["p3", 3]]),
    nombres: new Map([["co06", "CO06"]]),
  })
  const [conTraza] = distribucion[0].filas
  comprobar(
    "distribución: la cubierta «Cub ---» se completa con su nombre y la salida con la de la cubierta",
    conTraza?.cubierta_ini === "Cub CO06" && conTraza?.num_salida_ini === "Salida 11" && conTraza?.nap_destino === "Nap 11-dic",
    JSON.stringify(conTraza),
  )
  comprobar("los hilos se buscan sin mayúsculas, y los que no están en ninguna traza quedan sin filas", distribucion.length === 3 && distribucion[1].filas.length === 0)
  const feederArmado = armarTrazas({
    tipo: "FEEDER",
    hilos: ["h1", "h9"],
    trazas: [
      { id: "t1", id_puerto_inicio: feeder.id_puerto_ini, id_divisor_fin: "d1", path_hilos: ["h1"] },
      { id: "t2", id_puerto_inicio: "otro-puerto", id_divisor_fin: "sin-cubierta", path_hilos: ["h1"] },
    ],
    atributos: new Map([[feeder.id_puerto_ini, feeder]]),
    divisores: new Map([["d1", d1], ["sin-cubierta", { ...d1, id: "sin-cubierta", id_cubierta_ubica: null }]]),
    hermanos: new Map(),
    puertos: new Map(),
    nombres: new Map([["co06", "CO06"]]),
  })
  const [primera, segunda] = feederArmado[0].filas
  comprobar(
    "feeder: «Rack Rack 1» → «Rack 1» y «Cub ---» → el nombre de la cubierta del divisor fin",
    primera?.rack_ubica === "Rack 1" && primera?.cubierta_fin === "Cub CO06" && primera?.tipo_equipo === "TJT 3",
    JSON.stringify(primera),
  )
  comprobar("un hilo en dos trazas tiene dos filas; sin cubierta conocida, queda vacía (no «Cub ---»)", feederArmado[0].filas.length === 2 && segunda?.cubierta_fin === null)
  comprobar("lo que ya trae dato no se toca", armarTrazas({
    tipo: "FEEDER",
    hilos: ["h1"],
    trazas: [{ id: "t1", id_puerto_inicio: "p", id_divisor_fin: "d1", path_hilos: ["h1"] }],
    atributos: new Map([["p", { cubierta_fin: "Cub CO01" }]]),
    divisores: new Map([["d1", d1]]),
    hermanos: new Map(),
    puertos: new Map(),
    nombres: new Map([["co06", "CO06"]]),
  })[0].filas[0].cubierta_fin === "Cub CO01")

  const leida = clasificarRespuestaTrazas(200, JSON.parse(JSON.stringify({ tipo: "FEEDER", hilos: [{ id: "h1", filas: [fila] }] })), "FEEDER")
  comprobar("servidor → navegador: la traza llega entera", leida.estado === "ok" && leida.hilos[0].filas[0].tipo_equipo === "TJT 3")
  const error = clasificarRespuestaTrazas(502, { message: "falla", detalle: "tab_fiber.traza_feeder → 42501: permiso" }, "FEEDER")
  comprobar("error con su mensaje y su detalle", error.estado === "error" && error.mensaje === "falla" && error.detalle?.includes("traza_feeder"))
  comprobar("error sin cuerpo: dice el código HTTP", clasificarRespuestaTrazas(500, null, "FEEDER").mensaje.includes("HTTP 500"))

  const pedirTrazas = (id, tipo, token) =>
    GET_TRAZAS(new Request(`http://local/api/cables/${id}/trazas?tipo=${tipo}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }), {
      params: Promise.resolve({ id }),
    })
  const token = emitirToken("Prueba", "operador")
  comprobar("la ruta sin sesión: 401", (await pedirTrazas("01a0c524-b611-7fc7-b56e-c93273914aa3", "FEEDER")).status === 401)
  comprobar("la ruta con un id que no es UUID: 400", (await pedirTrazas("no-es-un-uuid", "FEEDER", token)).status === 400)
  comprobar("la ruta con otro tipo: 400", (await pedirTrazas("01a0c524-b611-7fc7-b56e-c93273914aa3", "TRONCAL", token)).status === 400)
}

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
