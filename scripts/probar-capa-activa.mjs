/**
 * Pruebas de la capa activa (lib/map/capa-activa.ts): qué herramienta se puede
 * usar con qué capa activa y qué se le dice al usuario cuando no.
 *
 * No necesita la base ni el navegador. Se corre con `pnpm run capa`.
 */
const {
  CAPA_DE_TIPO,
  DIBUJO_DE_CAPA,
  HERRAMIENTAS_DE_EDICION,
  NOMBRE_DE_CAPA,
  esCapaEditable,
  motivoHerramientaBloqueada,
} = await import("../lib/map/capa-activa.ts")

let fallos = 0
let pruebas = 0

function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

const CAPAS = ["nodes", "fibers", "zones", "cabeceras"]
const TODAS = [null, ...CAPAS]

console.log("\n1) LO QUE NO CAMBIA EL MAPA NUNCA SE BLOQUEA\n")

for (const herramienta of ["pan", "measure-length", "measure-area", "conectividad", "sentido", "cable", "edit"]) {
  comprobar(
    `«${herramienta}» sirve con cualquier capa activa, y sin ninguna`,
    TODAS.every((capa) => motivoHerramientaBloqueada(herramienta, capa) === null),
  )
}

console.log("\n2) DIBUJAR SOLO EN SU CAPA\n")

for (const [herramienta, suCapa] of [
  ["node", "nodes"],
  ["fiber", "fibers"],
  ["zone", "zones"],
]) {
  comprobar(`«${herramienta}» sirve con «${NOMBRE_DE_CAPA[suCapa]}» activa`, motivoHerramientaBloqueada(herramienta, suCapa) === null)
  const otras = TODAS.filter((capa) => capa !== suCapa)
  comprobar(
    `«${herramienta}» se bloquea con cualquier otra capa, o sin ninguna`,
    otras.every((capa) => typeof motivoHerramientaBloqueada(herramienta, capa) === "string"),
  )
  comprobar(
    `el aviso de «${herramienta}» dice qué capa activar`,
    otras.every((capa) => motivoHerramientaBloqueada(herramienta, capa).includes(`«${NOMBRE_DE_CAPA[suCapa]}»`)),
    motivoHerramientaBloqueada(herramienta, null),
  )
}
comprobar(
  "con otra capa activa, el aviso dice cuál está activa",
  motivoHerramientaBloqueada("node", "zones").includes("Ahora está activa «Zonas»"),
  motivoHerramientaBloqueada("node", "zones"),
)
comprobar(
  "sin capa activa, el aviso dice dónde activarla",
  motivoHerramientaBloqueada("fiber", null).includes("«Activar capa»"),
)

console.log("\n3) ELIMINAR NECESITA UNA CAPA ACTIVA, LA QUE SEA\n")

comprobar("sin capa activa se bloquea", typeof motivoHerramientaBloqueada("delete", null) === "string", motivoHerramientaBloqueada("delete", null))
comprobar("con cualquier capa activa sirve", CAPAS.every((capa) => motivoHerramientaBloqueada("delete", capa) === null))

console.log("\n4) LAS TABLAS CUADRAN ENTRE SÍ\n")

comprobar(
  "el dibujo de cada capa se puede usar con esa capa activa",
  Object.entries(DIBUJO_DE_CAPA).every(([capa, herramienta]) => motivoHerramientaBloqueada(herramienta, capa) === null),
)
comprobar("las cabeceras no se dibujan desde el mapa", DIBUJO_DE_CAPA.cabeceras === undefined)
comprobar(
  "cada tipo de elemento tiene su capa, y todas son editables",
  ["node", "fiber", "zone", "cabecera"].every((tipo) => esCapaEditable(CAPA_DE_TIPO[tipo])),
)
comprobar(
  "esCapaEditable reconoce las cuatro capas y nada más",
  CAPAS.every(esCapaEditable) && !esCapaEditable("todo") && !esCapaEditable("") && !esCapaEditable("toString"),
)
comprobar(
  "todas las herramientas que se bloquean son de edición",
  ["node", "fiber", "zone", "delete"].every((h) => HERRAMIENTAS_DE_EDICION.includes(h)),
)

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
