/**
 * Pruebas de la sesión en cookie httpOnly (lib/auth-server.ts y las rutas
 * /api/auth/sesion y /api/auth/logout).
 *
 * No necesita la base ni el navegador: usa un secreto de prueba propio. Se
 * corre con `pnpm run sesion`.
 */
import { createHmac } from "node:crypto"

// Secreto de prueba, antes de importar nada que lo lea. No es el de .env.local.
process.env.AUTH_JWT_SECRET = "secreto-solo-para-las-pruebas-de-sesion-0123456789"

const {
  COOKIE_SESION,
  emitirToken,
  exigirSesion,
  llegoPorHttps,
  ponerCookieDeSesion,
  quitarCookieDeSesion,
  tokenDeLaPeticion,
  VIGENCIA_SEGUNDOS,
} = await import("../lib/auth-server.ts")
const { GET: GETsesion } = await import("../app/api/auth/sesion/route.ts")
const { POST: POSTlogout } = await import("../app/api/auth/logout/route.ts")
const { NextResponse } = await import("next/server")

let fallos = 0
let pruebas = 0

function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

const pedir = (cabeceras = {}, url = "http://local/api/mufas") => new Request(url, { headers: cabeceras })
const token = emitirToken("Prueba", "operador")

/** Un token firmado con el secreto de prueba pero ya vencido. */
function tokenVencido() {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url")
  const ahora = Math.floor(Date.now() / 1000)
  const cuerpo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "Prueba", role: "operador", iat: ahora - 100, exp: ahora - 10 })}`
  const firma = createHmac("sha256", process.env.AUTH_JWT_SECRET).update(cuerpo).digest("base64url")
  return `${cuerpo}.${firma}`
}

console.log("\n1) QUÉ SESIONES SE ACEPTAN\n")
comprobar("cookie válida", exigirSesion(pedir({ cookie: `${COOKIE_SESION}=${token}` })) === null)
comprobar(
  "cookie válida entre otras cookies",
  exigirSesion(pedir({ cookie: `tema=oscuro; ${COOKIE_SESION}=${encodeURIComponent(token)}; otra=1` })) === null,
)
comprobar("Bearer válido (los scripts de prueba lo usan)", exigirSesion(pedir({ authorization: `Bearer ${token}` })) === null)
comprobar("sin nada: 401", exigirSesion(pedir())?.status === 401)
comprobar("cookie alterada: 401", exigirSesion(pedir({ cookie: `${COOKIE_SESION}=${token.slice(0, -2)}xx` }))?.status === 401)
comprobar("cookie vencida: 401", exigirSesion(pedir({ cookie: `${COOKIE_SESION}=${tokenVencido()}` }))?.status === 401)
comprobar("cookie con otro nombre parecido: 401", exigirSesion(pedir({ cookie: `x${COOKIE_SESION}=${token}` }))?.status === 401)
{
  let ok = true
  try {
    ok = tokenDeLaPeticion(pedir({ cookie: `${COOKIE_SESION}=%E0%A4%A` })) === null
  } catch {
    ok = false
  }
  comprobar("cookie mal codificada: sin sesión, sin reventar", ok)
}

console.log("\n2) CÓMO SE PONE LA COOKIE\n")
{
  const r = NextResponse.json({})
  ponerCookieDeSesion(r, token, { recordar: false, https: false })
  const c = r.headers.get("set-cookie") ?? ""
  comprobar("httpOnly", /HttpOnly/i.test(c), c.replace(token, "…"))
  comprobar("SameSite=Strict", /SameSite=Strict/i.test(c))
  comprobar("para toda la aplicación (Path=/)", /Path=\//.test(c))
  comprobar("sin «Recordar»: cookie de sesión, sin Max-Age", !/Max-Age/i.test(c))
  comprobar("por HTTP no lleva Secure (si no, el navegador la rechaza)", !/Secure/i.test(c))
}
{
  const r = NextResponse.json({})
  ponerCookieDeSesion(r, token, { recordar: true, https: true })
  const c = r.headers.get("set-cookie") ?? ""
  comprobar(`con «Recordar»: dura lo que el token (${VIGENCIA_SEGUNDOS} s)`, c.includes(`Max-Age=${VIGENCIA_SEGUNDOS}`))
  comprobar("por HTTPS lleva Secure", /Secure/i.test(c))
}
{
  const r = NextResponse.json({})
  quitarCookieDeSesion(r, false)
  comprobar("quitarla la deja vacía y vencida", /Max-Age=0/.test(r.headers.get("set-cookie") ?? ""))
}
comprobar("detrás de IIS, X-Forwarded-Proto: https cuenta como HTTPS", llegoPorHttps(pedir({ "x-forwarded-proto": "https" })))
comprobar("X-Forwarded-Proto: http no cuenta aunque la URL diga https", !llegoPorHttps(pedir({ "x-forwarded-proto": "http" }, "https://x/")))
comprobar("sin cabecera, manda la URL", llegoPorHttps(pedir({}, "https://x/")) && !llegoPorHttps(pedir({}, "http://x/")))

console.log("\n3) LAS RUTAS DE SESIÓN\n")
{
  const r = await GETsesion(pedir({}, "http://local/api/auth/sesion"))
  comprobar("¿hay sesión? sin cookie: 401", r.status === 401)
}
{
  const r = await GETsesion(pedir({ cookie: `${COOKIE_SESION}=${token}` }, "http://local/api/auth/sesion"))
  const cuerpo = await r.json()
  comprobar("¿hay sesión? con cookie: quién es y cuándo vence", r.status === 200 && cuerpo.usuario === "Prueba" && cuerpo.expira > Date.now())
  comprobar("la respuesta no se guarda en caché", r.headers.get("cache-control") === "no-store")
  comprobar("no devuelve el token", !JSON.stringify(cuerpo).includes(token))
}
{
  const r = await POSTlogout(pedir({ cookie: `${COOKIE_SESION}=${token}` }, "http://local/api/auth/logout"))
  const c = r.headers.get("set-cookie") ?? ""
  comprobar("salir borra la cookie", r.status === 200 && c.startsWith(`${COOKIE_SESION}=;`) && /Max-Age=0/.test(c), c)
}

{
  // Toda ruta bajo app/api, salvo las de auth, pasa por `exigirSesion` (o por
  // `responderConFuncion`, que la llama). Una ruta nueva que se olvide queda
  // marcada acá, antes de llegar al servidor.
  const { readdirSync, readFileSync, statSync } = await import("node:fs")
  const { join, relative } = await import("node:path")
  const rutas = []
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else if (nombre === "route.ts") rutas.push(ruta)
    }
  }
  recorrer("app/api")
  const sinSesion = rutas
    .filter((r) => !relative("app/api", r).startsWith("auth"))
    .filter((r) => !/exigirSesion\(|responderConFuncion\(/.test(readFileSync(r, "utf8")))
    .map((r) => relative("app/api", r))
  comprobar(`toda ruta de datos exige sesión (${rutas.length} rutas revisadas)`, rutas.length > 5 && sinSesion.length === 0, sinSesion.join(", "))
  comprobar(
    "responderConFuncion la exige también",
    /exigirSesion\(/.test(readFileSync("lib/supabase-servidor.ts", "utf8").split("export async function responderConFuncion")[1] ?? ""),
  )
}

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
