/**
 * Pruebas de lo que usan las ventanas «Redes/Nodo» y «GPON»
 * (lib/map/red-de-fibra.ts).
 *
 * No necesita la base ni el navegador. Se corre con `pnpm run red`.
 */
const { nodosDeFibra, cubiertasNivel1, buscarNodos, vecinoEnLista } = await import("../lib/map/red-de-fibra.ts")

let fallos = 0
let pruebas = 0

function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

const e = (clave, tipo, nombre, detalle = "", categoria) => ({ clave, tipo, nombre, detalle, alias: [], ...(categoria ? { categoria } : {}) })
const INDICE = [
  e("1", "cabecera", "Cabecera La Unión", "Cabecera central"),
  e("2", "cabecera", "HUB TORO", "Cabecera central"),
  e("3", "node", "CU-10", "Cubierta · Primer nivel", "Primer nivel"),
  e("4", "node", "CU-2", "Cubierta · Primer nivel", "Primer nivel"),
  e("5", "node", "13/14", "Cubierta · Segundo nivel", "Segundo nivel"),
  e("6", "fiber", "CB-1", "Cable · 12 hilos"),
  e("7", "node", "cu-1", "Cubierta · Primer nivel", "Primer nivel"),
]
const nombres = (lista) => (lista ?? []).map((x) => x.nombre).join(", ")

console.log("\n1) NODOS DE FIBRA\n")
{
  const nodos = nodosDeFibra(INDICE)
  comprobar("solo las cabeceras", nodos.length === 2 && nodos.every((n) => ["1", "2"].includes(n.clave)), nombres(nodos))
  comprobar("conserva clave, nombre y detalle", nodos[0].clave === "1" && nodos[0].detalle === "Cabecera central")
  comprobar("sin cabeceras cargadas: lista vacía", nodosDeFibra(INDICE.filter((x) => x.tipo !== "cabecera")).length === 0)
}

console.log("\n2) COD. NIVEL 1 TOTALES\n")
{
  const nivel1 = cubiertasNivel1(INDICE)
  comprobar("solo cubiertas de primer nivel", nivel1.length === 3, nombres(nivel1))
  comprobar("orden numérico: CU-2 antes que CU-10", nombres(nivel1) === "cu-1, CU-2, CU-10", nombres(nivel1))
  comprobar("un cable o un segundo nivel no entra", !nivel1.some((c) => c.nombre === "CB-1" || c.nombre === "13/14"))
  comprobar("no cambia el índice que recibe", INDICE[2].nombre === "CU-10" && INDICE[3].nombre === "CU-2")
}

console.log("\n3) BÚSQUEDA POR CARACTERES\n")
{
  const nodos = nodosDeFibra(INDICE)
  comprobar("vacío o espacios: null (no es «sin resultados»)", buscarNodos(nodos, "   ") === null)
  comprobar("sin tildes ni mayúsculas", nombres(buscarNodos(nodos, "UNION")) === "Cabecera La Unión")
  comprobar("parte del nombre", nombres(buscarNodos(nodos, "tor")) === "HUB TORO")
  comprobar("varias coincidencias", buscarNodos(nodos, "u").length === 2)
  comprobar("sin coincidencias: lista vacía", buscarNodos(nodos, "xyz")?.length === 0)
}

console.log("\n4) FLECHAS DE COD. NIVEL 1\n")
{
  const l = ["a", "b", "c"]
  comprobar("siguiente", vecinoEnLista(l, 0, 1) === "b")
  comprobar("anterior", vecinoEnLista(l, 2, -1) === "b")
  comprobar("se detiene en la última", vecinoEnLista(l, 2, 1) === "c")
  comprobar("se detiene en la primera", vecinoEnLista(l, 0, -1) === "a")
  comprobar("lista vacía: null", vecinoEnLista([], 0, 1) === null)
}

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones pasaron.${fallos ? ` ${fallos} fallaron.` : ""}\n`)
process.exit(fallos ? 1 : 0)
