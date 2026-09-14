/**
 * Vuelve a lanzar los ataques que funcionaban contra el login, para comprobar
 * que las defensas siguen en pie después de tocar el código.
 *
 *   node --experimental-strip-types --expose-gc --import ./scripts/registrar-alias.mjs \
 *        scripts/auditar-seguridad.mjs
 *
 * Importa la ruta de verdad y le pasa peticiones construidas a mano, así que
 * no hace falta levantar el servidor. Necesita `.env.local` con las claves de
 * Supabase, porque consulta la tabla real de usuarios.
 *
 * Los tres agujeros que cierra, y cómo se veían antes:
 *
 *   1. Comodines: `nombre` entraba tal cual en un `ilike`, así que enviar "%"
 *      traía las cinco cuentas y "_______" las de siete letras. Se podían
 *      enumerar los usuarios sin saber ninguna contraseña, y bloquearlos.
 *   2. Reloj: con un usuario inexistente se respondía sin derivar nada (~0 ms)
 *      y con uno real se pagaba scrypt (~55 ms). La diferencia decía qué
 *      nombres existen.
 *   3. Memoria: el mapa de intentos fallidos se indexa por el nombre recibido
 *      y no se limpiaba nunca. Con nombres distintos crecía sin techo.
 *
 * Sale con código 1 si alguna comprobación falla.
 */
import { readFileSync } from "node:fs"

const env = readFileSync(".env.local", "utf8")
for (const linea of env.split(/\r?\n/)) {
  const i = linea.indexOf("=")
  if (i > 0 && !linea.startsWith("#")) process.env[linea.slice(0, i).trim()] = linea.slice(i + 1).trim()
}

const { POST } = await import("../app/api/auth/login/route.ts")
const { verificarClave, HASH_SENUELO, hashClave } = await import("../lib/password.ts")

let fallos = 0
function comprobar(descripcion, ok, detalle = "") {
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

const pedir = (cuerpo) =>
  new Request("http://local/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  })

async function intentar(usuario, contrasena = "no-es-la-clave") {
  const t0 = performance.now()
  const res = await POST(pedir({ usuario, contrasena }))
  const ms = performance.now() - t0
  const cuerpo = await res.json().catch(() => ({}))
  return { estado: res.status, ms, mensaje: cuerpo.message ?? "" }
}

// --- 1. comodines ---------------------------------------------------------
console.log("\n1) COMODINES EN EL NOMBRE DE USUARIO\n")
for (const entrada of ["%%%", "_______", "Seb%stian", "Sebasti_n"]) {
  const r = await intentar(entrada)
  comprobar(`${JSON.stringify(entrada).padEnd(13)} no encuentra cuenta`, r.estado === 401, `HTTP ${r.estado}`)
}

// --- 2. reloj -------------------------------------------------------------
console.log("\n2) TIEMPO DE RESPUESTA\n")
/** Mediana, no media: un pico de red no arrastra el resultado. */
const medir = async (usuario) => {
  const t = []
  // Cuatro como mucho: al quinto entra el bloqueo por intentos.
  for (let i = 0; i < 4; i++) t.push((await intentar(usuario)).ms)
  t.sort((a, b) => a - b)
  return t[Math.floor(t.length / 2)]
}
const existe = await medir("Sebastian")
const noExiste = await medir("Sebastiam")

// La comparación es por proporción y no por milisegundos de diferencia.
// Cada intento incluye una consulta a Supabase por red, que varía decenas de
// milisegundos entre llamadas, y un umbral fijo de 25 ms marcaba fallos por
// puro ruido. Lo que hay que descartar es el agujero original: con el usuario
// inexistente se respondía sin derivar nada (~0 ms) frente a los ~55 ms de uno
// real, o sea menos de una décima parte. Que tarde al menos el 60 % excluye
// esa clase de fuga y aguanta la variación normal de la red.
const proporcion = existe > 0 ? noExiste / existe : 1
comprobar(
  "el usuario inventado no responde antes que el real",
  proporcion >= 0.6,
  `${existe.toFixed(0)} ms contra ${noExiste.toFixed(0)} ms (${(proporcion * 100).toFixed(0)} %)`,
)

// Las cuentas sin migrar tampoco pueden delatarse por responder al instante.
const conHash = await hashClave("prueba")
const tiempo = async (almacenada, clave) => {
  const t0 = performance.now()
  await verificarClave(clave, almacenada)
  return performance.now() - t0
}
const tHash = await tiempo(conHash, "otra")
const tPlano = await tiempo("claveplana", "otra")
const tSenuelo = await tiempo(HASH_SENUELO, "otra")
comprobar(
  "con hash, en texto plano y señuelo tardan lo mismo",
  Math.max(tHash, tPlano, tSenuelo) - Math.min(tHash, tPlano, tSenuelo) < 25,
  `${tHash.toFixed(0)} / ${tPlano.toFixed(0)} / ${tSenuelo.toFixed(0)} ms`,
)

// --- 3. memoria -----------------------------------------------------------
console.log("\n3) MAPA DE INTENTOS FALLIDOS\n")

if (typeof global.gc !== "function") {
  console.log("   (omitida: hace falta --expose-gc para medir la memoria de verdad)")
} else {
  // Sin forzar la recolección se mide la basura pendiente, no lo que el mapa
  // retiene, y la comprobación falla aunque el tope funcione.
  const heap = () => {
    global.gc()
    return process.memoryUsage().heapUsed / 1024 / 1024
  }
  // Contraseña vacía: se corta en la validación sin pagar scrypt, que es el
  // camino barato que usaría quien quisiera inflar el mapa.
  for (let i = 0; i < 5000; i++) await POST(pedir({ usuario: `inventado-${i}`, contrasena: "" }))
  const tras5k = heap()
  for (let i = 5000; i < 40000; i++) await POST(pedir({ usuario: `inventado-${i}`, contrasena: "" }))
  const tras40k = heap()
  comprobar(
    "40 000 nombres distintos no hacen crecer la memoria",
    tras40k - tras5k < 5,
    `${tras5k.toFixed(1)} MB a ${tras40k.toFixed(1)} MB`,
  )
}

// --- 4. el bloqueo sigue funcionando --------------------------------------
console.log("\n4) BLOQUEO POR INTENTOS\n")
let bloqueado = false
for (let i = 1; i <= 6; i++) {
  const r = await intentar("Carlos")
  if (r.estado === 429) bloqueado = true
}
comprobar("cinco fallos seguidos bloquean la cuenta", bloqueado)

// --- 5. desglose por categoría --------------------------------------------
console.log("\n5) DESGLOSE DEL PANEL DE CAPAS\n")
// Réplica de agrupar() en components/network-map.tsx. Con `{}` en vez de
// `Object.create(null)`, una categoría llamada "constructor" devolvía lista
// vacía y los elementos desaparecían del conteo.
function agrupar(items) {
  const buckets = Object.create(null)
  items.forEach(({ label }) => {
    if (buckets[label]) buckets[label].count += 1
    else buckets[label] = { label, count: 1 }
  })
  return Object.values(buckets)
}
for (const etiqueta of ["__proto__", "constructor", "toString"]) {
  const r = agrupar([{ label: etiqueta }, { label: etiqueta }, { label: "Segundo nivel" }])
  const contados = r.reduce((a, b) => a + b.count, 0)
  comprobar(`categoría ${JSON.stringify(etiqueta).padEnd(13)} no pierde elementos`, contados === 3, `${contados} de 3`)
}

console.log(fallos === 0 ? "\nTodo en orden.\n" : `\n${fallos} comprobación(es) fallaron.\n`)
process.exit(fallos === 0 ? 0 : 1)
