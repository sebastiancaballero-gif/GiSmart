/**
 * Pruebas de cómo se leen las capas del mapa (lib/supabase-geojson.ts) contra
 * una base de mentira que, como PostgREST, entrega como mucho 1000 filas por
 * consulta. Con 2500 elementos tienen que llegar los 2500, por la vista o por
 * el respaldo desde la tabla. También el color de los cables por tipo de red
 * (feeder azul, distribución magenta), cómo se ven de lejos y elegidos, el
 * sentido de la señal y los códigos de la ficha leídos con los catálogos de la
 * base. Se corre con `pnpm run capas`.
 */
import { createServer } from "node:http"

const TOTAL = 2500
const TOPE = 1000
const filas = Array.from({ length: TOTAL }, (_, i) => ({
  id: `00000000-0000-7000-8000-${String(i).padStart(12, "0")}`,
  etiqueta: `C${i}`,
  geom: { type: "Point", coordinates: [-76.1 + i / 1e5, 4.53] },
}))

let vistaExiste = true
const pedidas = []
const servidor = createServer((req, res) => {
  const url = new URL(req.url, "http://local")
  pedidas.push(url.pathname)
  const responder = (cuerpo, desde, cuantas, tipo = "application/json") => {
    res.writeHead(200, {
      "content-type": tipo,
      "content-range": cuantas > 0 ? `${desde}-${desde + cuantas - 1}/${TOTAL}` : `*/${TOTAL}`,
    })
    res.end(JSON.stringify(cuerpo))
  }
  if (url.pathname.endsWith("/capa_geojson")) {
    if (!vistaExiste) {
      res.writeHead(404, { "content-type": "application/json" })
      res.end(JSON.stringify({ code: "PGRST205", message: "Could not find the table" }))
      return
    }
    // supabase-js pagina con offset y limit; PostgREST no da más que el tope.
    const desde = Number(url.searchParams.get("offset") ?? 0)
    const cuantas = Math.min(Number(url.searchParams.get("limit") ?? TOPE), TOPE)
    const pagina = filas.slice(desde, desde + cuantas)
    responder(pagina, desde, pagina.length)
    return
  }
  if (url.pathname.endsWith("/capa")) {
    // El respaldo pagina con la cabecera Range («0-999»).
    const [a, b] = (req.headers.range ?? `0-${TOPE - 1}`).split("-").map(Number)
    const desde = a
    const cuantas = Math.min(b - a + 1, TOPE)
    const pagina = filas.slice(desde, desde + cuantas)
    responder(
      { type: "FeatureCollection", features: pagina.map(({ geom, ...p }) => ({ type: "Feature", geometry: geom, properties: p })) },
      desde,
      pagina.length,
      "application/geo+json",
    )
    return
  }
  res.writeHead(404)
  res.end()
})
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok))
process.env.SUPABASE_URL = `http://127.0.0.1:${servidor.address().port}`
process.env.SUPABASE_SECRET_KEY = "clave-de-la-base-de-mentira"

const { serveGeoJsonView } = await import("../lib/supabase-geojson.ts")
const leer = async () => {
  pedidas.length = 0
  const r = await serveGeoJsonView({ schema: "geo_fiber", view: "capa_geojson", table: "capa", entidad: "las pruebas" })
  return { status: r.status, cuerpo: await r.json() }
}

let fallos = 0
let pruebas = 0
function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

console.log("\n1) POR LA VISTA\n")
{
  const { status, cuerpo } = await leer()
  const ids = new Set(cuerpo.features.map((f) => f.properties.id))
  comprobar("llegan los 2500 elementos, no solo los primeros 1000", status === 200 && cuerpo.features.length === TOTAL, `${cuerpo.features.length}`)
  comprobar("sin repetidos", ids.size === TOTAL)
  comprobar("en 3 páginas", pedidas.length === 3, `${pedidas.length} consultas`)
  comprobar("con su geometría y sin la columna geom en las propiedades", cuerpo.features[2499].geometry.type === "Point" && !("geom" in cuerpo.features[0].properties))
}

console.log("\n2) POR EL RESPALDO (LA VISTA NO EXISTE)\n")
{
  vistaExiste = false
  const { status, cuerpo } = await leer()
  comprobar("llegan los 2500 desde la tabla", status === 200 && cuerpo.features.length === TOTAL, `${cuerpo.features.length}`)
  comprobar("la segunda vez va directo a la tabla, en 3 páginas", (await leer(), pedidas.every((p) => p.endsWith("/capa")) && pedidas.length === 3), pedidas.join(" "))
}

console.log("\n3) LOS CABLES SEGÚN SU TIPO DE RED (FEEDER Y DISTRIBUTION)\n")
{
  const { colorForTipoRed, fiberStyle } = await import("../lib/map/symbology.ts")
  const { agrupar, COLOR_CATEGORIA_MIXTA } = await import("../lib/map/capas.ts")
  const { LAYER_COLORS } = await import("../lib/network-colors.ts")
  const { default: Feature } = await import("ol/Feature.js")
  const { default: LineString } = await import("ol/geom/LineString.js")

  const MAGENTA = "#d600d6"
  comprobar("FEEDER: el azul de siempre", colorForTipoRed("FEEDER") === LAYER_COLORS.fiber, colorForTipoRed("FEEDER"))
  comprobar("DISTRIBUTION: magenta", colorForTipoRed("DISTRIBUTION") === MAGENTA, colorForTipoRed("DISTRIBUTION"))
  comprobar("el valor se lee sin importar mayúsculas ni espacios", colorForTipoRed(" distribution ") === MAGENTA)
  comprobar("sin tipo o con uno desconocido: el azul", [null, "", "OTRO"].every((t) => colorForTipoRed(t) === LAYER_COLORS.fiber))

  const cable = (tipo) => new Feature({ geometry: new LineString([[0, 0], [100, 0]]), cant_hilo: 48, tipo_red_prin: tipo })
  // Alejado (sin rótulos): el segundo estilo es el trazo del cable.
  const trazo = (tipo) => fiberStyle(cable(tipo), 100)[1].getStroke()
  comprobar(
    "en el mapa, la distribución va en magenta y continua (sin raya)",
    trazo("DISTRIBUTION").getColor() === MAGENTA && !trazo("DISTRIBUTION").getLineDash()?.length,
  )
  comprobar("el feeder, en azul y continuo", trazo("FEEDER").getColor() === LAYER_COLORS.fiber && !trazo("FEEDER").getLineDash()?.length)

  const porTipo = (f) => ({ label: "48 hilos", color: colorForTipoRed(f.get("tipo_red_prin")) })
  const desglose = agrupar([cable("DISTRIBUTION"), cable("DISTRIBUTION")], porTipo)
  comprobar("el desglose muestra el color de su tipo", desglose[0].color === MAGENTA, JSON.stringify(desglose[0]))
  const mixto = agrupar([cable("FEEDER"), cable("DISTRIBUTION"), cable("FEEDER")], porTipo)
  comprobar(
    "una categoría con feeder y distribución queda neutra, no con el color de uno solo",
    mixto[0].count === 3 && mixto[0].color === COLOR_CATEGORIA_MIXTA,
    JSON.stringify(mixto[0]),
  )
}

console.log("\n4) CÓMO SE VEN LOS CABLES: ALEJADO, AL PASAR EL MOUSE Y ELEGIDOS\n")
{
  const { nodeStyle, marcadorStyle, brilloDeCableStyle, textoDeLongitud, SEGUNDO_NIVEL_PUNTO_RESOLUTION, FIBER_LABEL_MAX_RESOLUTION, fiberStyle } =
    await import("../lib/map/symbology.ts")
  const { default: Feature } = await import("ol/Feature.js")
  const { default: Point } = await import("ol/geom/Point.js")
  const { default: LineString } = await import("ol/geom/LineString.js")

  comprobar("longitud: metros si es corta, km si no", textoDeLongitud(85.4) === "85 m" && textoDeLongitud(946.8) === "947 m" && textoDeLongitud(1234) === "1.23 km")

  const cubierta = (funcion) => new Feature({ geometry: new Point([0, 0]), funcion_cub: funcion, nombre_visible: "X" })
  const lejos = SEGUNDO_NIVEL_PUNTO_RESOLUTION + 1
  comprobar("alejado, la de segundo nivel es un punto (un solo símbolo, sin cruz)", nodeStyle(cubierta("Segundo nivel"), lejos).length === 1)
  comprobar("alejado, la de primer nivel conserva su símbolo con cruz", nodeStyle(cubierta("Primer nivel"), lejos).length === 3)
  comprobar("de cerca, la de segundo nivel tiene su cruz", nodeStyle(cubierta("Segundo nivel"), 1).length >= 3)

  const cable = new Feature({ geometry: new LineString([[0, 0], [100, 0]]), cant_hilo: 48, tipo_red_prin: "DISTRIBUTION" })
  comprobar("los rótulos de los cables salen de cerca, con los de las cubiertas", fiberStyle(cable, FIBER_LABEL_MAX_RESOLUTION + 0.5).length === 2 && fiberStyle(cable, 1).length > 2)

  const marca = marcadorStyle(cable)
  const trazos = marca.map((s) => s.getStroke()).filter(Boolean)
  comprobar(
    "el cable elegido: contorno rojo y adentro su color, sin raya",
    trazos.some((t) => t.getColor() === "#dc2626") && trazos.some((t) => t.getColor() === "#d600d6") && trazos.every((t) => !t.getLineDash()?.length),
  )
  comprobar("y marca sus dos puntas", marca.some((s) => s.getGeometryFunction()?.(cable)?.getCoordinates?.().length === 2))
  comprobar("el brillo al pasar el mouse va en su color, transparente", brilloDeCableStyle(cable).getStroke().getColor() === "rgba(214, 0, 214, 0.4)")
}

console.log("\n5) EL SENTIDO DE LA SEÑAL (FLECHAS DE CERCA)\n")
{
  const { sentidoDeLaSenal } = await import("../lib/map/sentido-senal.ts")
  const { fiberStyle, FLECHAS_MAX_RESOLUTION, SENTIDO_SENAL } = await import("../lib/map/symbology.ts")
  const { default: Feature } = await import("ol/Feature.js")
  const { default: LineString } = await import("ol/geom/LineString.js")

  // Cabecera → A (bien dibujado), B dibujado al revés (de B hacia A), C suelto, A–D–E–A un anillo.
  const sentidos = sentidoDeLaSenal(
    [
      { clave: "cab-a", desde: "CAB", hasta: "A" },
      { clave: "b-a", desde: "B", hasta: "A" },
      { clave: "suelto", desde: "C", hasta: "X" },
      { clave: "a-d", desde: "A", hasta: "D" },
      { clave: "a-e", desde: "A", hasta: "E" },
      { clave: "d-e", desde: "D", hasta: "E" },
      { clave: "sin-punta", desde: null, hasta: "A" },
    ],
    ["CAB"],
  )
  comprobar("dibujado desde la cabecera: 1", sentidos.get("cab-a") === 1)
  comprobar("dibujado al revés: -1 (la señal va de A a B)", sentidos.get("b-a") === -1)
  comprobar("al que no se llega desde la cabecera: sin sentido", !sentidos.has("suelto"))
  comprobar("los dos extremos a la misma distancia (anillo): sin sentido", !sentidos.has("d-e") && sentidos.get("a-d") === 1)
  comprobar("sin una de sus puntas: sin sentido", !sentidos.has("sin-punta"))

  const cable = (sentido) => {
    const f = new Feature({ geometry: new LineString([[0, 0], [300, 0]]), cant_hilo: 48, tipo_red_prin: "FEEDER" })
    f.set(SENTIDO_SENAL, sentido, true)
    return f
  }
  const flechas = (f, r) => fiberStyle(f, r).filter((s) => s.getImage() && s.getGeometry()).length
  comprobar("de cerca, un cable con sentido lleva flechas", flechas(cable(1), 1) >= 1, String(flechas(cable(1), 1)))
  comprobar("sin sentido conocido, ninguna", flechas(cable(0), 1) === 0)
  comprobar("más lejos, ninguna", flechas(cable(1), FLECHAS_MAX_RESOLUTION + 0.5) === 0)
}

console.log("\n6) LOS CÓDIGOS DE LA FICHA CON LOS CATÁLOGOS DE LA BASE\n")
{
  const { clasificarRespuestaCatalogos, nombreDelCodigo } = await import("../lib/map/catalogos.ts")
  const ok = clasificarRespuestaCatalogos(200, {
    tiposElemento: { CUB_N2: "Cubierta de nivel 2 (NAP)", RARO: 3 },
    fabricantes: { CORN: "CORNING" },
  })
  comprobar("una respuesta buena se lee", ok.estado === "ok")
  const catalogos = ok.estado === "ok" ? ok.catalogos : null
  comprobar("el fabricante por su nombre", nombreDelCodigo(catalogos, "cod_fabricante", "CORN") === "CORNING")
  comprobar("el tipo de elemento por su nombre", nombreDelCodigo(catalogos, "tip_elem_to", "CUB_N2") === "Cubierta de nivel 2 (NAP)")
  comprobar("un código que no está queda sin nombre", nombreDelCodigo(catalogos, "cod_fabricante", "XYZ") === null)
  comprobar("un campo sin catálogo queda sin nombre", nombreDelCodigo(catalogos, "tipo_cable", "CORN") === null)
  comprobar("un valor que no es texto se descarta", catalogos?.tiposElemento.RARO === undefined)
  comprobar("sin catálogos, nada se traduce", nombreDelCodigo(null, "cod_fabricante", "CORN") === null)
  const mal = clasificarRespuestaCatalogos(502, { message: "No se pudieron leer los catálogos de la base.", detalle: "geo_fiber.cat_tipos_elem → 42501: permission denied" })
  comprobar(
    "un error trae su aviso y el detalle de la base",
    mal.estado === "error" && /catálogos/.test(mal.mensaje) && /cat_tipos_elem/.test(mal.detalle ?? ""),
  )
  const sinCuerpo = clasificarRespuestaCatalogos(500, null)
  comprobar("un error sin cuerpo también avisa", sinCuerpo.estado === "error" && /HTTP 500/.test(sinCuerpo.mensaje))
}

console.log("\n7) LO QUE LA BASE RENOMBRÓ EL 20-OCT-2026: SE LEE CON LOS DOS NOMBRES\n")
{
  const { tarjetaDeFila } = await import("../lib/map/tarjeta-bandeja.ts")
  const nueva = tarjetaDeFila({ id: "t1", num_slot: 4, id_equipo_pert: "olt1", tipo_equipo_pert: "OLT", modelo_tjt_bdj: "GPON-16P-B1" })
  comprobar("tarjeta con los nombres nuevos (*_pert)", nueva.id_equipo === "olt1" && nueva.tipo_equipo === "OLT" && nueva.num_slot === 4)
  const vieja = tarjetaDeFila({ id: "t2", num_slot: "144", id_equipo: "odf1", tipo_equipo: "ODF" })
  comprobar("bandeja con los nombres de antes (y el slot como texto)", vieja.id_equipo === "odf1" && vieja.tipo_equipo === "ODF" && vieja.num_slot === 144)
  comprobar("si vinieran los dos, manda el nuevo", tarjetaDeFila({ id: "t3", id_equipo_pert: "nuevo", id_equipo: "viejo" }).id_equipo === "nuevo")
  comprobar("sin datos: vacíos, no «undefined»", JSON.stringify(tarjetaDeFila({ id: "t4" })) === JSON.stringify({ id: "t4", num_slot: null, tipo_equipo: null, id_equipo: null }))

  const { nombreDeCubierta } = await import("../lib/map/nombre-cubierta.ts")
  comprobar("desde el 20-oct-2026 viene en salidas_div1", nombreDeCubierta({ id: "x", salidas_div1: "CO13" }) === "CO13")
  comprobar("si vuelve a llamarse etiqueta, se lee igual", nombreDeCubierta({ etiqueta: "17/18" }) === "17/18")
  comprobar("si vinieran las dos, manda etiqueta", nombreDeCubierta({ etiqueta: "CO01", salidas_div1: "otra" }) === "CO01")
  comprobar("vacía o en blanco: sigue con la otra", nombreDeCubierta({ etiqueta: "  ", salidas_div1: " 9/10 " }) === "9/10")
  comprobar("sin ninguna: null (el mapa la llama «Cubierta <ID>»)", nombreDeCubierta({ id_legacy: 2094732 }) === null && nombreDeCubierta(null) === null)

  // El mapa: la capa de cubiertas con la columna nueva, por el respaldo desde la tabla.
  const { loadRealMufas } = await import("../lib/map/loaders.ts")
  const { NOMBRE_VISIBLE } = await import("../lib/map/symbology.ts")
  const { default: VectorSource } = await import("ol/source/Vector.js")
  const fuente = new VectorSource()
  const geojson = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [-76.1, 4.53] }, properties: { id: "u1", id_legacy: 1, salidas_div1: "CO13" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [-76.1, 4.53] }, properties: { id: "u2", id_legacy: 2094732 } },
    ],
  }
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify(geojson), { status: 200, headers: { "content-type": "application/json" } })
  try {
    const error = await loadRealMufas(fuente, () => false)
    const nombres = fuente.getFeatures().map((f) => f.get(NOMBRE_VISIBLE)).sort()
    comprobar("en el mapa se llaman CO13 y «Cubierta 2094732»", !error && nombres.join("|") === "CO13|Cubierta 2094732", nombres.join("|"))
    // Si la red se cae y vence el tope, la capa avisa que no respondió (no se queda cargando).
    let senal = null
    globalThis.fetch = async (_url, init) => {
      senal = init?.signal ?? null
      throw new DOMException("The operation timed out.", "TimeoutError")
    }
    const vencida = await loadRealMufas(new VectorSource(), () => false)
    comprobar("cada capa se pide con un tope de espera", senal instanceof AbortSignal)

    // Un fallo de paso se reintenta una vez; lo que no se arregla reintentando, no.
    const pedidasA = (respuestas) => {
      let n = 0
      globalThis.fetch = async () => {
        const r = respuestas[Math.min(n++, respuestas.length - 1)]
        if (r === "red") throw new TypeError("Failed to fetch")
        return new Response(JSON.stringify(r === 200 ? geojson : { message: `HTTP ${r}` }), { status: r, headers: { "content-type": "application/json" } })
      }
      return () => n
    }
    for (const [caso, respuestas] of [["un 502 suelto", [502, 200]], ["un corte de red", ["red", 200]]]) {
      const veces = pedidasA(respuestas)
      const fuenteR = new VectorSource()
      const error = await loadRealMufas(fuenteR, () => false)
      comprobar(`${caso}: se reintenta una vez y la capa carga`, !error && fuenteR.getFeatures().length === 2 && veces() === 2, `${veces()} pedidos`)
    }
    const veces404 = pedidasA([404, 200])
    const error404 = await loadRealMufas(new VectorSource(), () => false)
    comprobar("un 404 no se reintenta: avisa de una", error404 !== null && veces404() === 1)
    const vecesDoble = pedidasA([503, 503, 200])
    const errorDoble = await loadRealMufas(new VectorSource(), () => false)
    comprobar("si vuelve a fallar, avisa (no reintenta sin fin)", errorDoble !== null && vecesDoble() === 2)
    comprobar(
      "vencido el tope, avisa que el servidor no respondió y cómo seguir",
      /no respondió en 60 segundos/.test(vencida?.mensaje ?? "") && /Actualizar/.test(vencida?.mensaje ?? ""),
      vencida?.mensaje,
    )
  } finally {
    globalThis.fetch = fetchOriginal
  }
}

console.log("\n8) LOS RENGLONES DE LA LEYENDA QUE OCULTAN CUBIERTAS\n")
{
  const { nivelDeLeyenda } = await import("../lib/map/symbology.ts")
  const { default: Feature } = await import("ol/Feature.js")
  const nivel = (funcion_cub) => nivelDeLeyenda(new Feature({ funcion_cub }))
  comprobar("un nivel conocido es su renglón", nivel("Segundo nivel") === "Segundo nivel" && nivel("Empalme") === "Empalme")
  comprobar("escrito distinto o desconocido: «Otro / sin dato», como su color", nivel("Segundo Nivel") === "Otro / sin dato" && nivel("Tercer nivel") === "Otro / sin dato")
  comprobar("sin función: «Otro / sin dato»", nivel(null) === "Otro / sin dato" && nivel("") === "Otro / sin dato")
  comprobar("un nombre raro no se confunde con una propiedad del objeto", nivel("constructor") === "Otro / sin dato")
}

servidor.close()
console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
