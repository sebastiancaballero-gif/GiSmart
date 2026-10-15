/**
 * Pruebas del módulo «Avanzado» (modulos/avanzado) que no necesitan la base
 * ni el navegador: las funciones de la cinta en Ctrl+K y los marcadores.
 *
 *   pnpm run avanzado
 */
const { comandosDeLaCinta, buscarComandos } = await import("../modulos/avanzado/comandos.ts")
const { leerMarcadores, guardarMarcadores, nuevoMarcador, MAX_MARCADORES } = await import("../modulos/avanzado/marcadores/marcadores.ts")
const { RIBBON_TABS } = await import("../components/dashboard-ribbon-data.ts")

let fallos = 0
let pruebas = 0

function comprobar(descripcion, ok, detalle = "") {
  pruebas++
  console.log(`   ${ok ? "OK  " : "FALLA"}  ${descripcion}${detalle ? "  ·  " + detalle : ""}`)
  if (!ok) fallos++
}

console.log("\n1) LA PESTAÑA «AVANZADO»\n")
{
  const avanzado = RIBBON_TABS.find((t) => t.id === "avanzado")
  comprobar("está en la cinta, al final", avanzado && RIBBON_TABS.at(-1) === avanzado)
  const items = avanzado?.groups.flatMap((g) => g.items) ?? []
  comprobar("cada botón dice qué herramienta abre", items.every((i) => i.modulo), items.map((i) => i.label).join(", "))
  comprobar("los que ya funcionan tienen su acción", items.filter((i) => i.accion === "modulo").map((i) => i.modulo).join(",") === "marcadores,atajos")
}

console.log("\n2) FUNCIONES EN CTRL+K\n")
{
  const comandos = comandosDeLaCinta()
  const ids = new Set(comandos.map((c) => c.id))
  comprobar("sin repetidas", ids.size === comandos.length, `${comandos.length} funciones`)
  comprobar("solo las que funcionan (sin «Snap» ni «Generar BOM»)", !comandos.some((c) => c.etiqueta === "Snap" || c.etiqueta === "Generar BOM"))
  const trace = comandos.find((c) => c.etiqueta === "Trace")
  comprobar("dice dónde está cada una", trace?.ruta === "Red de fibra › Reportes", trace?.ruta)
  comprobar("incluye las del módulo", comandos.some((c) => c.etiqueta === "Marcadores" && c.ruta === "Avanzado › Vista"))

  const nombres = (lista) => lista.map((c) => c.etiqueta).join(", ")
  comprobar("«trac» encuentra el Trace primero", buscarComandos(comandos, "trac")[0]?.etiqueta === "Trace", nombres(buscarComandos(comandos, "trac")))
  comprobar("por lo que hace: «distancia» encuentra Mediciones", buscarComandos(comandos, "distancia").some((c) => c.etiqueta === "Mediciones"))
  comprobar("sin tildes: «gestion de hilos» encuentra Hilos", buscarComandos(comandos, "gestion de hilos")[0]?.etiqueta === "Hilos")
  comprobar("con una sola letra no ofrece nada", buscarComandos(comandos, "a").length === 0)
  comprobar("como mucho cinco", buscarComandos(comandos, "de").length <= 5)
  comprobar("lo que no existe no aparece", buscarComandos(comandos, "zzzz").length === 0)
}

console.log("\n3) MARCADORES\n")
{
  // Un almacenamiento de mentira, como el del navegador.
  const datos = new Map()
  globalThis.localStorage = {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  }
  const vista = { centro: [-76.0883, 4.5333], zoom: 16.789 }
  const m = nuevoMarcador("  HUB​ La Unión \n", vista)
  comprobar("el nombre se limpia (invisibles, saltos)", m.nombre === "HUB La Unión", JSON.stringify(m.nombre))
  comprobar("sin nombre queda «Vista sin nombre»", nuevoMarcador("   ", vista).nombre === "Vista sin nombre")
  comprobar("el zoom se redondea", m.zoom === 16.79)

  comprobar("se guarda y se lee", guardarMarcadores("sebas", [m]) && leerMarcadores("sebas")[0]?.nombre === "HUB La Unión")
  comprobar("cada usuario tiene los suyos", leerMarcadores("otro").length === 0)

  datos.set("gismart_marcadores_rotos", JSON.stringify([m, { id: "x", nombre: "sin centro" }, { ...m, id: "y", centro: [200, 4] }, "basura"]))
  comprobar("lo que no es un marcador se ignora", leerMarcadores("rotos").length === 1)
  datos.set("gismart_marcadores_json", "{no es json")
  comprobar("un JSON roto no revienta", leerMarcadores("json").length === 0)

  const muchos = Array.from({ length: MAX_MARCADORES + 10 }, (_, i) => nuevoMarcador(`V${i}`, vista))
  guardarMarcadores("muchos", muchos)
  comprobar(`no pasa de ${MAX_MARCADORES}`, leerMarcadores("muchos").length === MAX_MARCADORES)

  globalThis.localStorage = {
    getItem: () => {
      throw new Error("bloqueado")
    },
    setItem: () => {
      throw new Error("bloqueado")
    },
  }
  comprobar("si el navegador bloquea el almacenamiento: leer da vacío", leerMarcadores("sebas").length === 0)
  comprobar("y guardar dice que no pudo", guardarMarcadores("sebas", [m]) === false)
}

console.log(`\n${pruebas - fallos}/${pruebas} pruebas bien.`)
process.exit(fallos ? 1 : 0)
