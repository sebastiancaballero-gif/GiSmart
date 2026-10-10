/**
 * Todo lo que conviene correr antes de subir un cambio, en un solo comando:
 *
 *   pnpm verificar
 *
 * Tipos, lint y las pruebas que no necesitan la base ni el navegador. Las que
 * sí la necesitan (`pnpm run conectividad`, `pnpm auditar`) quedan aparte:
 * dependen de cómo esté la base ese día y la auditoría hace intentos de login
 * reales.
 *
 * El lint deja fuera `components/network-schematic.tsx`: no lo usa ninguna
 * página y lo mantiene otra persona del equipo (ver «Pendientes conocidos» en
 * el README).
 */
import { spawnSync } from "node:child_process"

const PRUEBAS = "node --experimental-strip-types --import ./scripts/registrar-alias.mjs"

const PASOS = [
  ["Tipos (TypeScript)", "npx tsc --noEmit"],
  ["Lint (ESLint)", "npx eslint . --ignore-pattern components/network-schematic.tsx"],
  ["Capa activa", `${PRUEBAS} scripts/probar-capa-activa.mjs`],
  ["Buscador de elementos", `${PRUEBAS} scripts/probar-busqueda.mjs`],
  ["Sesión en cookie", `${PRUEBAS} scripts/probar-sesion.mjs`],
  ["Inicio de sesión y bloqueo", `${PRUEBAS} scripts/probar-login.mjs`],
  ["Gestión de hilos", `${PRUEBAS} scripts/probar-hilos.mjs`],
  ["Redes/Nodo y GPON", `${PRUEBAS} scripts/probar-red-de-fibra.mjs`],
  ["Recorrido del trace", `${PRUEBAS} scripts/probar-trace.mjs`],
  ["Capas del mapa por páginas", `${PRUEBAS} scripts/probar-capas.mjs`],
]

const resultados = []
for (const [nombre, comando] of PASOS) {
  process.stdout.write(`\n▶ ${nombre}\n`)
  const inicio = Date.now()
  const r = spawnSync(comando, { shell: true, stdio: "inherit" })
  resultados.push({ nombre, ok: r.status === 0, segundos: ((Date.now() - inicio) / 1000).toFixed(1) })
}

console.log("\nResumen\n")
for (const { nombre, ok, segundos } of resultados) {
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${nombre}  ·  ${segundos} s`)
}
const fallidos = resultados.filter((r) => !r.ok).length
console.log(fallidos ? `\n${fallidos} paso(s) fallaron.\n` : "\nTodo en orden.\n")
process.exit(fallidos ? 1 : 0)
