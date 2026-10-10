/**
 * Pruebas de cómo se leen las capas del mapa (lib/supabase-geojson.ts) contra
 * una base de mentira que, como PostgREST, entrega como mucho 1000 filas por
 * consulta. Con 2500 elementos tienen que llegar los 2500, por la vista o por
 * el respaldo desde la tabla. Se corre con `pnpm run capas`.
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

servidor.close()
console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
