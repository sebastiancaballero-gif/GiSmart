/**
 * Pruebas del inicio de sesión (app/api/auth/login) contra una base de
 * mentira: un servidor local que responde como PostgREST a la consulta de
 * `usuario_app`. No necesita Supabase. Se corre con `pnpm run login`.
 *
 * Lo principal es el bloqueo por intentos: 5 claves erradas bloquean la cuenta
 * 30 s, también cuando los intentos llegan todos a la vez.
 */
import { createServer } from "node:http"

const { hashClave } = await import("../lib/password.ts")
const CLAVE = "clave-buena-123"
const HASH = await hashClave(CLAVE)

let baseCaida = false
const servidor = createServer((req, res) => {
  if (baseCaida) {
    res.writeHead(503, { "content-type": "application/json" })
    res.end(JSON.stringify({ code: "PGRST000", message: "base caída (simulada)" }))
    return
  }
  const filtro = new URL(req.url, "http://local").searchParams.get("nombre_usuario") ?? ""
  const nombre = filtro.replace(/^ilike\./, "").replace(/\\(.)/g, "$1").toLowerCase()
  const cuentas = {
    ana: { nombre_usuario: "ana", nombre_completo: "Ana", clave: HASH, activo: true },
    inactiva: { nombre_usuario: "inactiva", nombre_completo: "Inactiva", clave: HASH, activo: false },
  }
  res.writeHead(200, { "content-type": "application/json" })
  res.end(JSON.stringify(cuentas[nombre] ? [cuentas[nombre]] : []))
})
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok))
process.env.SUPABASE_URL = `http://127.0.0.1:${servidor.address().port}`
process.env.SUPABASE_SECRET_KEY = "clave-de-la-base-de-mentira"
process.env.AUTH_JWT_SECRET = "secreto-solo-para-las-pruebas-del-login-0123456789"

const { POST } = await import("../app/api/auth/login/route.ts")
const entrar = async (usuario, contrasena) => {
  const r = await POST(
    new Request("http://local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario, contrasena }),
    }),
  )
  return { status: r.status, cuerpo: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie") }
}

let fallos = 0
let pruebas = 0
function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

console.log("\n1) BLOQUEO POR INTENTOS\n")
{
  const r = []
  for (let i = 0; i < 6; i++) r.push(await entrar("dora", "errada"))
  comprobar(
    "4 claves erradas avisan cuántos intentos quedan",
    r.slice(0, 4).every((x) => x.status === 401) && r[3].cuerpo.message?.includes("Te queda 1 intento"),
    r.slice(0, 4).map((x) => x.status).join(","),
  )
  comprobar("la quinta bloquea la cuenta 30 s", r[4].status === 429 && r[4].cuerpo.message?.includes("bloqueada 30 segundos"))
  comprobar("bloqueada, ni se consulta la clave", r[5].status === 429 && r[5].cuerpo.message?.startsWith("Cuenta bloqueada temporalmente"))
}

console.log("\n2) MUCHOS INTENTOS A LA VEZ\n")
{
  const r = await Promise.all(Array.from({ length: 20 }, () => entrar("beto", "errada")))
  const errados = r.filter((x) => x.status === 401).length
  const bloqueados = r.filter((x) => x.status === 429).length
  comprobar("20 intentos simultáneos: solo 4 llegan a probar la clave, el resto queda bloqueado", errados === 4 && bloqueados === 16, `401: ${errados} · 429: ${bloqueados}`)
  const despues = await entrar("beto", "errada")
  comprobar("y la cuenta queda bloqueada", despues.status === 429)
}

console.log("\n3) LA CLAVE CORRECTA\n")
{
  await entrar("ana", "errada")
  await entrar("ana", "errada")
  const bien = await entrar("ana", CLAVE)
  comprobar("entra y deja la cookie de sesión", bien.status === 200 && (bien.cookie ?? "").includes("HttpOnly"), `HTTP ${bien.status}`)
  const otra = await entrar("ana", "errada")
  comprobar("y los intentos vuelven a empezar", otra.status === 401 && otra.cuerpo.message?.includes("quedan 4 intentos"), otra.cuerpo.message)
}

console.log("\n4) LO QUE NO ES UNA CLAVE ERRADA NO CUENTA\n")
{
  baseCaida = true
  const caidas = []
  for (let i = 0; i < 6; i++) caidas.push(await entrar("eva", "errada"))
  baseCaida = false
  comprobar("con la base caída responde 502, sin bloquear", caidas.every((x) => x.status === 502))
  const luego = await entrar("eva", "errada")
  comprobar("al volver la base, el primer error deja 4 intentos", luego.status === 401 && luego.cuerpo.message?.includes("quedan 4 intentos"), luego.cuerpo.message)
  const inactiva = []
  for (let i = 0; i < 6; i++) inactiva.push(await entrar("inactiva", CLAVE))
  comprobar("cuenta inactiva con la clave correcta: 403, sin bloquear", inactiva.every((x) => x.status === 403))
}

servidor.close()
console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
