/**
 * Pruebas del buscador de elementos de la red (lib/map/busqueda.ts).
 *
 * No necesita la base ni el navegador. Se corre con `pnpm run busqueda`.
 */
const { buscarElementos, normalizar } = await import("../lib/map/busqueda.ts")

let fallos = 0
let pruebas = 0

function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

const e = (clave, tipo, nombre, detalle = "", alias = []) => ({ clave, tipo, nombre, detalle, alias })
const INDICE = [
  e("1", "node", "3/4", "Cubierta · Segundo nivel", ["01a0c59c-fe01"]),
  e("2", "node", "13/14", "Cubierta · Segundo nivel"),
  e("3", "node", "CO01", "Cubierta · Primer nivel"),
  e("4", "node", "CO02", "Cubierta · Primer nivel"),
  e("5", "fiber", "2109680", "Cable · 48 hilos", ["01a0c524-b611"]),
  e("6", "fiber", "Troncal La Unión", "Cable · 144 hilos", ["2100001"]),
  e("7", "cabecera", "HUB LA UNION", "Cabecera central", ["C001"]),
  e("8", "node", "Cubierta 1555766", "Cubierta · Empalme"),
]
const nombres = (lista) => lista.map((x) => x.nombre).join(", ")

console.log("\n1) NORMALIZAR\n")
comprobar("sin tildes ni mayúsculas", normalizar("  Unión  CENTRAL ") === "union central")

console.log("\n2) ORDEN DE LOS RESULTADOS\n")
{
  const r = buscarElementos(INDICE, "3/4")
  comprobar("el nombre exacto va primero", r[0]?.nombre === "3/4", nombres(r))
}
comprobar(
  "lo que va después de la barra también cuenta",
  buscarElementos(INDICE, "14").some((x) => x.nombre === "13/14"),
  nombres(buscarElementos(INDICE, "14")),
)
{
  const r = buscarElementos(INDICE, "co0")
  comprobar("los que empiezan igual, en orden natural", nombres(r) === "CO01, CO02", nombres(r))
}
comprobar("sin importar tildes", buscarElementos(INDICE, "union")[0]?.nombre === "HUB LA UNION", nombres(buscarElementos(INDICE, "union")))
comprobar(
  "una palabra que empieza igual cuenta más que estar en medio",
  buscarElementos(INDICE, "la")[0]?.nombre === "Troncal La Unión" || buscarElementos(INDICE, "la")[0]?.nombre === "HUB LA UNION",
  nombres(buscarElementos(INDICE, "la")),
)

console.log("\n3) ALIAS: CÓDIGO Y UUID\n")
comprobar("por el código de la cabecera", buscarElementos(INDICE, "c001")[0]?.nombre === "HUB LA UNION")
comprobar("por el principio del UUID", buscarElementos(INDICE, "01a0c524")[0]?.nombre === "2109680")
comprobar(
  "coincidir por nombre gana a coincidir por alias",
  nombres(buscarElementos(INDICE, "210")) === "2109680, Troncal La Unión",
  nombres(buscarElementos(INDICE, "210")),
)

console.log("\n4) LÍMITES Y CASOS RAROS\n")
comprobar("consulta vacía: nada", buscarElementos(INDICE, "   ").length === 0)
comprobar("sin coincidencias: nada", buscarElementos(INDICE, "xyz").length === 0)
comprobar("respeta el límite", buscarElementos(INDICE, "cubierta", 1).length === 1)
comprobar("índice vacío: nada, sin reventar", buscarElementos([], "3/4").length === 0)
comprobar(
  "elementos sin alias no revientan",
  buscarElementos([{ clave: "x", tipo: "zone", nombre: "Zona 1", detalle: "Zona" }], "zona").length === 1,
)

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
