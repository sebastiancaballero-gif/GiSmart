/**
 * Pruebas del módulo «Avanzado» (modulos/avanzado) que no necesitan la base
 * ni el navegador: las funciones de la cinta en Ctrl+K y los marcadores.
 *
 *   pnpm run avanzado
 */
const { comandosDeLaCinta, buscarComandos } = await import("../modulos/avanzado/comandos.ts")
const { leerMarcadores, guardarMarcadores, nuevoMarcador, MAX_MARCADORES } = await import("../modulos/avanzado/marcadores/marcadores.ts")
const { RIBBON_TABS } = await import("../components/dashboard-ribbon-data.ts")
const { recortarSegmento, largoDentroM, distanciaM, aLonLat } = await import("../modulos/avanzado/resumen/medidas.ts")
const { resumirEnPantalla } = await import("../modulos/avanzado/resumen/resumen.ts")

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
  comprobar("los que ya funcionan tienen su acción", items.filter((i) => i.accion === "modulo").map((i) => i.modulo).join(",") === "resumen,marcadores,atajos")
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

console.log("\n4) MEDIDAS EN PANTALLA\n")
{
  const caja = [0, 0, 10, 10]
  const t = recortarSegmento([-5, 5], [15, 5], caja)
  comprobar("un segmento que cruza se recorta al borde", t && t[0][0] === 0 && t[1][0] === 10, JSON.stringify(t))
  comprobar("uno que no toca no cuenta", recortarSegmento([20, 20], [30, 30], caja) === null)
  comprobar("uno de adentro queda entero", JSON.stringify(recortarSegmento([1, 1], [2, 2], caja)) === "[[1,1],[2,2]]")
  comprobar("uno sobre el borde izquierdo cuenta", recortarSegmento([0, -5], [0, 5], caja) !== null)
  // Un grado de longitud en el ecuador: unos 111,2 km.
  const d = distanciaM([0, 0], [1, 0])
  comprobar("distancia: 1° en el ecuador ≈ 111,2 km", Math.abs(d - 111195) < 50, Math.round(d) + " m")
  // En La Unión (latitud 4,5): 1 km hacia el este en Web Mercator, la mitad dentro de la pantalla.
  const y = 504_000
  const metro = 1 / Math.cos((aLonLat([0, y])[1] * Math.PI) / 180)
  const linea = [[-500 * metro, y], [500 * metro, y]]
  const dentro = largoDentroM([linea], [0, y - 100, 10_000, y + 100])
  comprobar("solo cuenta lo que cae en pantalla (500 de 1000 m)", Math.abs(dentro - 500) < 2, dentro.toFixed(1) + " m")
}

console.log("\n5) RESUMEN EN PANTALLA\n")
{
  const el = (tipo, categoria, extra = {}) => ({
    clave: Math.random().toString(),
    tipo,
    nombre: categoria,
    categoria,
    color: "#000",
    visible: true,
    hilos: null,
    largoM: null,
    lineas: null,
    punto: null,
    ...extra,
  })
  const caja = [0, 0, 1000, 1000]
  const r = resumirEnPantalla(
    [
      el("node", "Primer nivel"),
      el("node", "Segundo nivel"),
      el("node", "Segundo nivel"),
      el("node", "Segundo nivel", { visible: false }),
      el("fiber", "144 hilos", { lineas: [[[0, 500], [2000, 500]]] }),
      el("fiber", "48 hilos", { lineas: [[[100, 100], [100, 200]]] }),
      el("cabecera", "Cabecera", { nombre: "HUB LA UNION" }),
    ],
    caja,
  )
  comprobar("cuenta solo lo pintado (3 de 4 cubiertas, 1 oculta)", r.cubiertas.total === 3 && r.ocultos === 1)
  comprobar("por nivel, de más a menos", r.cubiertas.porNivel[0].etiqueta === "Segundo nivel" && r.cubiertas.porNivel[0].cantidad === 2)
  comprobar("cables por capacidad, de más km a menos", r.cables.porCapacidad[0].etiqueta === "144 hilos" && r.cables.total === 2)
  comprobar("los km son los que caen en pantalla", r.cables.km > 0 && r.cables.km < 2, r.cables.km.toFixed(4) + " km")
  comprobar("las cabeceras con su nombre", r.cabeceras.total === 1 && r.cabeceras.nombres[0] === "HUB LA UNION")
  comprobar("sin nada en pantalla, todo en cero", resumirEnPantalla([], caja).cables.km === 0)
}

console.log(`\n${pruebas - fallos}/${pruebas} pruebas bien.`)
process.exit(fallos ? 1 : 0)
