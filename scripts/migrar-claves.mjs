/**
 * Migra a hash las contraseñas que sigan en texto plano en `usuario_app`.
 *
 * No hace falta ejecutarlo: la ruta de login migra cada cuenta sola la primera
 * vez que esa persona entra. Sirve para cerrar la migración de una vez sin
 * esperar a que todos inicien sesión.
 *
 *   node scripts/migrar-claves.mjs                      → solo informa, no cambia nada
 *   node scripts/migrar-claves.mjs --aplicar            → escribe los hashes
 *   node scripts/migrar-claves.mjs --aplicar --solo Ana → solo esa cuenta
 *
 * Conviene migrar primero una cuenta propia y comprobar que se puede entrar,
 * antes de tocar las de los demás: el cambio no tiene vuelta atrás.
 *
 * Requisitos en la base (ver docs/base-de-datos.md). Desde que la tabla se
 * recreó, `clave` es de tipo text y ya caben los hashes; faltan los permisos:
 *   grant select on public.usuario_app to service_role;
 *   grant update (clave) on public.usuario_app to service_role;
 */
import { readFileSync } from "node:fs"
import { randomBytes, scrypt } from "node:crypto"
import { promisify } from "node:util"
import { createClient } from "@supabase/supabase-js"

const scryptAsync = promisify(scrypt)
const APLICAR = process.argv.includes("--aplicar")

// Mismos parámetros que lib/password.ts. Si cambian allí, cambiarlos aquí.
const PREFIJO = "scrypt"
const N = 16384
const R = 8
const P = 1

function leerEnv(clave) {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  const linea = env.split(/\r?\n/).find((l) => l.startsWith(`${clave}=`))
  return linea?.slice(clave.length + 1).trim()
}

async function hashClave(clave) {
  const sal = randomBytes(16)
  const derivada = await scryptAsync(clave.normalize("NFKC"), sal, 32, { N, r: R, p: P })
  return [PREFIJO, N, R, P, sal.toString("base64"), derivada.toString("base64")].join("$")
}

const supabase = createClient(leerEnv("SUPABASE_URL"), leerEnv("SUPABASE_SECRET_KEY"))

const { data: usuarios, error } = await supabase
  .from("usuario_app")
  .select("nombre_usuario, clave")

if (error) {
  console.error("No se pudo leer usuario_app:", error.message)
  process.exit(1)
}

const indiceSolo = process.argv.indexOf("--solo")
const soloEste = indiceSolo > -1 ? process.argv[indiceSolo + 1]?.toLowerCase() : null

// El estado real se calcula sobre todas las cuentas; `--solo` acota lo que se
// va a escribir, no lo que se informa. Mezclarlo daba un recuento engañoso:
// las cuentas excluidas por el filtro se contaban como ya migradas.
const enTextoPlano = usuarios.filter((u) => u.clave && !u.clave.startsWith(`${PREFIJO}$`))
const pendientes = soloEste
  ? enTextoPlano.filter((u) => u.nombre_usuario.toLowerCase() === soloEste)
  : enTextoPlano

if (soloEste) console.log(`(acotado a la cuenta "${soloEste}")\n`)

console.log(`usuarios: ${usuarios.length}`)
console.log(`ya con hash: ${usuarios.length - enTextoPlano.length}`)
console.log(`en texto plano: ${enTextoPlano.length}`)
if (soloEste) console.log(`de esas, se tocará: ${pendientes.length}`)

if (pendientes.length === 0) {
  console.log("\nNada que migrar.")
  process.exit(0)
}

if (!APLICAR) {
  console.log("\nSe migrarían (sin mostrar las contraseñas):")
  pendientes.forEach((u) => console.log(`  ${u.nombre_usuario}`))
  console.log("\nEjecuta con --aplicar para escribir los cambios.")
  process.exit(0)
}

let migrados = 0
for (const usuario of pendientes) {
  const { error: fallo } = await supabase
    .from("usuario_app")
    .update({ clave: await hashClave(usuario.clave) })
    .eq("nombre_usuario", usuario.nombre_usuario)

  if (fallo) {
    console.error(`  FALLA  ${usuario.nombre_usuario}: ${fallo.message}`)
  } else {
    migrados += 1
    console.log(`  OK     ${usuario.nombre_usuario}`)
  }
}

console.log(`\nMigrados ${migrados} de ${pendientes.length}.`)
if (migrados < pendientes.length) {
  console.log("Revisa que exista el permiso de UPDATE sobre la columna clave.")
}
