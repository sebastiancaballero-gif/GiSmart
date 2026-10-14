/**
 * Pruebas de lo que se escribe o se pega: entradas que no deberían llegar a
 * la base ni a Nominatim, y los textos raros en los nombres y en el Excel.
 * Se corre con `pnpm run entradas`. No necesita Supabase ni internet: la base
 * es un servidor local que cuenta las consultas, y Nominatim se intercepta.
 */
import { createServer } from "node:http"

let consultasALaBase = 0
const servidor = createServer((req, res) => {
  consultasALaBase++
  res.writeHead(200, { "content-type": "application/json" })
  res.end("[]")
})
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok))
process.env.SUPABASE_URL = `http://127.0.0.1:${servidor.address().port}`
process.env.SUPABASE_SECRET_KEY = "clave-de-la-base-de-mentira"
process.env.AUTH_JWT_SECRET = "secreto-solo-para-las-pruebas-de-entradas-0123456789"

// Nominatim: no se le manda nada de verdad; se anota lo que se le habría pedido.
const aNominatim = []
const fetchOriginal = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const u = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url)
  if (u.hostname.includes("nominatim")) {
    aNominatim.push(u)
    const repetida = { display_name: "Calle 16, San Luis, La Unión, Valle del Cauca, Colombia", lat: "4.53", lon: "-76.1", type: "residential" }
    const cuerpo = u.pathname.includes("reverse")
      ? { address: { city: "Cartago", state: "Valle del Cauca", country: "Colombia" } }
      : u.searchParams.get("q")?.includes("repetida")
        ? [repetida, repetida, { ...repetida, display_name: "Calle 16, La Unión, Antioquia, Colombia" }]
        : []
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } })
  }
  return fetchOriginal(url, init)
}

const { emitirToken, COOKIE_SESION } = await import("../lib/auth-server.ts")
const conSesion = { cookie: `${COOKIE_SESION}=${encodeURIComponent(emitirToken("prueba-entradas", "usuario"))}` }

let fallos = 0
let pruebas = 0
function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

const UUID = "01a0e3ce-a2f4-7814-b9a7-d42c9e8a8e31"
const IDS_RAROS = [
  "", " ", "abc", "1", "' OR 1=1--", "or=(id.eq.1)", "*", "../../etc/passwd", "<script>alert(1)</script>",
  `{${UUID}}`, `${UUID}::uuid`, `${UUID},${UUID}`, `${UUID}\u0000`, `‮${UUID}`, "x".repeat(5000), "🧵", "%00", "%E0%A4%A",
]

console.log("\n1) IDENTIFICADORES EN LA URL\n")
{
  const rutas = [
    ["cables/{id}/hilos", "../app/api/cables/[id]/hilos/route.ts"],
    ["cables/{id}/extremos", "../app/api/cables/[id]/extremos/route.ts"],
    ["mufas/{id}/cables", "../app/api/mufas/[id]/cables/route.ts"],
    ["mufas/{id}/conectividad", "../app/api/mufas/[id]/conectividad/route.ts"],
  ]
  for (const [nombre, archivo] of rutas) {
    const { GET } = await import(archivo)
    const pedir = (id) => GET(new Request("http://local/api/x", { headers: conSesion }), { params: Promise.resolve({ id }) })
    consultasALaBase = 0
    const estados = []
    for (const id of IDS_RAROS) estados.push((await pedir(id)).status)
    comprobar(`${nombre}: ${IDS_RAROS.length} ids raros → 400 sin consultar la base`, estados.every((s) => s === 400) && consultasALaBase === 0, `consultas: ${consultasALaBase}`)
    consultasALaBase = 0
    await pedir(UUID)
    comprobar(`${nombre}: un UUID sí llega a la base`, consultasALaBase > 0)
  }

  const { GET } = await import("../app/api/traces/[direccion]/[id]/route.ts")
  const pedir = (direccion, id) => GET(new Request("http://local/api/x", { headers: conSesion }), { params: Promise.resolve({ direccion, id }) })
  consultasALaBase = 0
  const estados = []
  for (const id of IDS_RAROS) estados.push((await pedir("upstream", id)).status)
  for (const direccion of ["", "up", "../", "upstream\u0000"]) estados.push((await pedir(direccion, UUID)).status)
  comprobar("traces: ids y direcciones raras → 400 sin consultar la base", estados.every((s) => s === 400) && consultasALaBase === 0, `consultas: ${consultasALaBase}`)
}

console.log("\n2) BUSCAR UNA DIRECCIÓN\n")
{
  const { GET } = await import("../app/api/geocode/route.ts")
  const buscar = async (q) => {
    aNominatim.length = 0
    const r = await GET(new Request(`http://local/api/geocode?q=${encodeURIComponent(q)}`, { headers: conSesion }))
    return { status: r.status, enviado: aNominatim[0]?.searchParams.get("q") ?? null }
  }
  const nulos = await buscar("\u0000\u0000\u0000")
  comprobar("tres caracteres nulos: es una búsqueda vacía (400) y no sale", nulos.status === 400 && nulos.enviado === null, `${nulos.status}`)
  const corta = await buscar("ab​‮")
  comprobar("«ab» con invisibles: muy corta (400) y no sale", corta.status === 400 && corta.enviado === null, `${corta.status}`)
  const sucia = await buscar("la\u0000 unión\n\tvalle‮")
  comprobar("con invisibles en medio: sale sin ellos", sucia.status === 200 && sucia.enviado === "la unión valle", JSON.stringify(sucia.enviado))
  aNominatim.length = 0
  const conCentro = await GET(new Request(`http://local/api/geocode?q=${encodeURIComponent("calle repetida")}&lon=-76.1&lat=4.53`, { headers: conSesion }))
  const respuesta = await conCentro.json()
  comprobar(
    "con el centro del mapa: se prefieren las de alrededor y sin repetidas",
    aNominatim[0]?.searchParams.get("viewbox") === "-76.6,5.03,-75.6,4.03" && respuesta.results.length === 2,
    `${aNominatim[0]?.searchParams.get("viewbox")} · ${respuesta.results.length} resultados`,
  )
  aNominatim.length = 0
  await GET(new Request(`http://local/api/geocode?q=${encodeURIComponent("la unión")}&lon=0x10&lat=abc`, { headers: conSesion }))
  comprobar("un centro mal escrito se ignora (sin viewbox)", aNominatim[0] && !aNominatim[0].searchParams.has("viewbox"))
  const larga = await buscar("a".repeat(121))
  comprobar("más de 120 caracteres: 400 y no sale", larga.status === 400 && larga.enviado === null, `${larga.status}`)
}

console.log("\n3) UBICACIÓN DE UN PUNTO (reverse-geocode)\n")
{
  const { GET } = await import("../app/api/reverse-geocode/route.ts")
  const pedir = async (qs) => {
    aNominatim.length = 0
    const r = await GET(new Request(`http://local/api/reverse-geocode?${qs}`, { headers: conSesion }))
    return { status: r.status, salio: aNominatim.length > 0 }
  }
  const malas = ["", "lon=&lat=", "lon=-76.1", "lat=4.5", "lon=0x10&lat=4", "lon=1e2&lat=4", "lon=Infinity&lat=4", "lon=NaN&lat=4", "lon=-76,1&lat=4,5", "lon=-76.1abc&lat=4.5", "lon=200&lat=4", "lon=-76&lat=-91"]
  const r = []
  for (const qs of malas) r.push({ qs, ...(await pedir(qs)) })
  const colados = r.filter((x) => x.status !== 400 || x.salio)
  comprobar(`${malas.length} coordenadas faltantes o mal escritas → 400 sin ir a Nominatim`, colados.length === 0, colados.map((x) => `«${x.qs}» ${x.status}`).join(", "))
  const buena = await pedir("lon=-76.0883&lat=4.53")
  comprobar("una coordenada normal sí se consulta", buena.status === 200 && buena.salio, `${buena.status}`)
  const conEspacios = await pedir("lon=%20-76.1%20&lat=+4.5")
  comprobar("con espacios alrededor también", conEspacios.status === 200 && conEspacios.salio, `${conEspacios.status}`)
}

console.log("\n4) INICIO DE SESIÓN\n")
{
  const { POST } = await import("../app/api/auth/login/route.ts")
  const entrar = async (cuerpo, cabeceras = {}) => {
    consultasALaBase = 0
    const r = await POST(
      new Request("http://local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", ...cabeceras },
        body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
      }),
    )
    return { status: r.status, cuerpo: await r.json().catch(() => ({})), consultas: consultasALaBase }
  }
  for (const [descripcion, usuario] of [
    ["marca de dirección (U+202E)", "‮usuario"],
    ["carácter nulo", "usu\u0000ario"],
    ["tabulador en medio", "usu\tario"],
    ["salto de línea en medio", "usu\nario"],
    ["espacio de ancho cero", "usu​ario"],
  ]) {
    const r = await entrar({ usuario, contrasena: "x" })
    comprobar(`usuario con ${descripcion}: 400 en el campo usuario, sin consultar`, r.status === 400 && r.cuerpo.field === "usuario" && r.consultas === 0, `${r.status} ${r.cuerpo.field ?? ""}`)
  }
  const normal = await entrar({ usuario: "usuario-normal\n", contrasena: "x" })
  comprobar("un salto de línea al final se recorta y se consulta normal", normal.status === 401 && normal.consultas > 0, `${normal.status}`)
  const grande = await entrar({ usuario: "usuario", contrasena: "x", relleno: "x".repeat(50_000) })
  comprobar("cuerpo de 50 KB: 413 sin consultar", grande.status === 413 && grande.consultas === 0, `${grande.status}`)
  const anunciado = await entrar({ usuario: "usuario", contrasena: "x" }, { "content-length": "50000000" })
  comprobar("si anuncia 50 MB ni se lee: 413", anunciado.status === 413 && anunciado.consultas === 0, `${anunciado.status}`)
  for (const cuerpo of ["no es json", "null", "[]", "123", '"x"']) {
    const r = await entrar(cuerpo)
    comprobar(`cuerpo ${JSON.stringify(cuerpo)}: 400`, r.status === 400 && r.consultas === 0, `${r.status}`)
  }
}

console.log("\n5) NOMBRES Y TEXTOS\n")
{
  const { sinInvisibles, tieneInvisibles, limpiarNombre, MAX_NOMBRE } = await import("../lib/texto.ts")
  comprobar("saltos y tabuladores pasan a espacio, lo invisible se quita", sinInvisibles("a\u0000b\tc‮d\r\ne") === "ab cd e", JSON.stringify(sinInvisibles("a\u0000b\tc‮d\r\ne")))
  comprobar("tildes, eñes y emojis se quedan", sinInvisibles("ñandú 🧵 Cañón") === "ñandú 🧵 Cañón")
  comprobar("detecta los invisibles", tieneInvisibles("ab​c") && !tieneInvisibles("Cubierta CO19 — ñ"))
  comprobar(`un nombre pegado de 200 000 caracteres queda en ${MAX_NOMBRE}`, limpiarNombre("x".repeat(200_000)).length === MAX_NOMBRE)
  comprobar("los emojis compuestos no se parten (👨‍👩‍👧, banderas con etiquetas)", limpiarNombre("Familia 👨‍👩‍👧") === "Familia 👨‍👩‍👧")
  const conEmojiAlFinal = limpiarNombre("x".repeat(MAX_NOMBRE - 1) + "🧵🧵")
  comprobar("el tope no corta un emoji por la mitad", conEmojiAlFinal === "x".repeat(MAX_NOMBRE - 1) + "🧵", JSON.stringify(conEmojiAlFinal.slice(-3)))
  comprobar("un nombre pegado de Excel con salto de línea queda en una línea", limpiarNombre("CO19\r\n") === "CO19 ", JSON.stringify(limpiarNombre("CO19\r\n")))

  const { colorParaMostrar } = await import("../lib/map/hilos-cable.ts")
  const raros = [123, {}, [], true, Infinity, -1, 2.5, NaN, "Azul", null]
  let lanzo = null
  for (const nombre of raros) for (const posicion of raros) {
    try {
      const color = colorParaMostrar(nombre, posicion)
      if (color !== null && typeof color !== "string") lanzo = `devolvió ${typeof color}`
    } catch (e) {
      lanzo = `${JSON.stringify(nombre)}, ${JSON.stringify(posicion)}: ${e.message}`
    }
  }
  comprobar("el color de un hilo no se cae con datos raros de la base", lanzo === null, lanzo ?? "")
  comprobar("y sigue dando el color por posición", typeof colorParaMostrar(null, 1) === "string")
}

console.log("\n6) EXCEL\n")
{
  const { crearXlsx } = await import("../lib/excel.ts")
  const xml = (hoja) => new TextDecoder().decode(crearXlsx(hoja))
  let error = null
  try {
    xml({ nombre: "Raros", filas: [{ celdas: [{}, undefined, { formula: 5 }, [], "a\u0000b", "\uD800 suelto"] }] })
  } catch (e) {
    error = e.message
  }
  comprobar("celdas raras (objeto, undefined, fórmula que no es texto) no rompen el archivo", error === null, error ?? "")
  const largo = xml({ nombre: "Largo", filas: [{ celdas: ["x".repeat(40_000)] }] })
  const enCelda = /<t xml:space="preserve">(x+…?)<\/t>/.exec(largo)?.[1] ?? ""
  comprobar("una celda de 40 000 caracteres queda en 32 767 (lo que admite Excel)", enCelda.length === 32_767, `${enCelda.length}`)
  const formula = xml({ nombre: "Fórmula", filas: [{ celdas: [{ formula: "SUM(A1:A2)", valor: 3 }, "=CMD()"] }] })
  comprobar("las fórmulas propias siguen siendo fórmulas", formula.includes("<f>SUM(A1:A2)</f>"))
  comprobar("un texto que empieza con «=» queda como texto", formula.includes("=CMD()") && !formula.includes("<f>CMD"))
}

servidor.close()
console.log(`\n${pruebas - fallos}/${pruebas} pruebas bien.\n`)
process.exit(fallos ? 1 : 0)
