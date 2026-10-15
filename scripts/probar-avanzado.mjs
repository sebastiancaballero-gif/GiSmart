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
const { columnasDe, nombresPorId, valorDeCelda, compararCeldas, filaCoincide } = await import("../modulos/avanzado/tabla/columnas.ts")
const { evaluarConsulta, combinarSeleccion, describirConsulta, leerNumero } = await import("../modulos/avanzado/consulta/consulta.ts")
const { hojaDeLaTabla } = await import("../modulos/avanzado/tabla/excel-tabla.ts")
const { aMercator, distanciaAlElementoM, cercanos, textoDeDistancia } = await import("../modulos/avanzado/cercania/cercania.ts")
const { largoRedondoM } = await import("../modulos/avanzado/imprimir/componer.ts")

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
  comprobar("los que ya funcionan tienen su acción", items.filter((i) => i.accion === "modulo").map((i) => i.modulo).join(",") === "resumen,tabla,consulta,cercania,marcadores,imprimir,atajos")
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

console.log("\n6) TABLA DE ATRIBUTOS\n")
const elemento = (clave, tipo, nombre, propiedades, extra = {}) => ({
  clave,
  tipo,
  nombre,
  categoria: "",
  color: "#000",
  visible: true,
  hilos: null,
  largoM: null,
  lineas: null,
  punto: null,
  enVista: true,
  propiedades,
  ...extra,
})
const DATOS = [
  elemento("n1", "node", "CO19", { id: "u-co19", etiqueta: "CO19", funcion_cub: "Primer nivel", cant_div: 2, id_legacy: 7 }),
  elemento("n2", "node", "13/14", { id: "u-1314", etiqueta: "13/14", funcion_cub: "Segundo nivel", cant_div: 1 }),
  elemento("n3", "node", "Empalme cabecera", { id: "u-emp", etiqueta: null, funcion_cub: "Empalme", cant_div: 0 }),
  elemento("f1", "fiber", "2102262", { id: "c1", codigo: "2102262", cant_hilo: 144, estado_const: "Ex", id_elem_from: "u-co19", id_elem_to: "u-1314" }, { largoM: 131.77 }),
  elemento("f2", "fiber", "2100555", { id: "c2", codigo: "2100555", cant_hilo: 48, estado_const: "Pr", id_elem_from: null, id_elem_to: "u-emp" }, { largoM: 1020.5 }),
]
{
  const nombres = nombresPorId(DATOS)
  const colsCubierta = columnasDe("node", DATOS, nombres)
  comprobar("el nombre va primero", colsCubierta[0].clave === "__nombre")
  comprobar("sin campos de auditoría (UUID, sistema anterior)", !colsCubierta.some((c) => c.clave === "id" || c.clave === "id_legacy"))
  comprobar("un campo que repite el nombre sobra (etiqueta)", !colsCubierta.some((c) => c.clave === "etiqueta"))
  comprobar("los campos numéricos se marcan como tales", colsCubierta.find((c) => c.clave === "cant_div")?.numerica === true)
  const colsCable = columnasDe("fiber", DATOS, nombres)
  comprobar("los cables traen su longitud", colsCable[1]?.clave === "__largo")
  comprobar("las referencias se leen por nombre", valorDeCelda(DATOS[3], "id_elem_from", nombres) === "CO19")
  comprobar("un campo vacío es vacío, no «null»", valorDeCelda(DATOS[4], "id_elem_from", nombres) === null)
  comprobar("ordenar: números como números y vacíos al final", [null, 10, 9].sort(compararCeldas).join() === "9,10,")
  comprobar("ordenar textos con números: 2 antes que 10", ["CO10", "CO2"].sort(compararCeldas).join() === "CO2,CO10")
  comprobar("buscar en la tabla, sin tildes", filaCoincide(DATOS[0], colsCubierta, nombres, "primer NIVEL") && !filaCoincide(DATOS[1], colsCubierta, nombres, "primer"))

  const hoja = hojaDeLaTabla({ capa: "fiber", columnas: colsCable, filas: DATOS.filter((e) => e.tipo === "fiber"), nombres, contexto: "prueba" })
  comprobar("Excel: el encabezado con los títulos de las columnas", hoja.filas[2].celdas[0] === "Nombre" && hoja.filas[2].estilo === "encabezado")
  comprobar("Excel: los números van como números", typeof hoja.filas[3].celdas[1] === "number")
  comprobar("Excel: filtro sobre el encabezado y los datos", hoja.filtro?.startsWith("A3:") && hoja.filtro.endsWith("5"), hoja.filtro)
}

console.log("\n7) SELECCIONAR POR ATRIBUTOS\n")
{
  const nombres = nombresPorId(DATOS)
  const q = (capa, condiciones, union = "y") => evaluarConsulta(DATOS, { capa, union, condiciones }, nombres).join(",")
  comprobar("número igual: cables de 144 hilos", q("fiber", [{ campo: "cant_hilo", operador: "igual", valor: "144" }]) === "f1")
  comprobar("número mayor que", q("fiber", [{ campo: "cant_hilo", operador: "mayor", valor: "50" }]) === "f1")
  comprobar("texto contiene, sin tildes ni mayúsculas", q("node", [{ campo: "funcion_cub", operador: "contiene", valor: "NIVEL" }]) === "n1,n2")
  comprobar("«y»: todas las condiciones", q("node", [{ campo: "funcion_cub", operador: "contiene", valor: "nivel" }, { campo: "cant_div", operador: "mayorIgual", valor: "2" }]) === "n1")
  comprobar("«o»: alguna", q("node", [{ campo: "cant_div", operador: "igual", valor: "0" }, { campo: "cant_div", operador: "igual", valor: "2" }], "o") === "n1,n3")
  comprobar("por nombre en una referencia (destino = CO19 no, = 13/14 sí)", q("fiber", [{ campo: "id_elem_to", operador: "igual", valor: "13/14" }]) === "f1")
  comprobar("está vacío", q("fiber", [{ campo: "id_elem_from", operador: "vacio", valor: "" }]) === "f2")
  comprobar("una condición sin valor no selecciona todo", q("node", [{ campo: "funcion_cub", operador: "igual", valor: "" }]) === "")
  comprobar("solo de la capa pedida", q("node", [{ campo: "__nombre", operador: "contiene", valor: "2" }]) === "")
  comprobar("leer números: «1.234,5», «144», «abc»", leerNumero("1.234,5") === 1234.5 && leerNumero("144") === 144 && leerNumero("abc") === null)

  const actual = new Set(["a", "b"])
  const res = ["b", "c"]
  comprobar("modo nueva", [...combinarSeleccion(actual, res, "nueva")].join() === "b,c")
  comprobar("modo sumar", [...combinarSeleccion(actual, res, "agregar")].join() === "a,b,c")
  comprobar("modo quitar", [...combinarSeleccion(actual, res, "quitar")].join() === "a")
  comprobar("modo dentro", [...combinarSeleccion(actual, res, "dentro")].join() === "b")
  const cols = columnasDe("fiber", DATOS, nombres)
  comprobar(
    "la consulta en palabras",
    describirConsulta({ capa: "fiber", union: "y", condiciones: [{ campo: "cant_hilo", operador: "igual", valor: " 144 " }, { campo: "estado_const", operador: "vacio", valor: "" }] }, cols) ===
      "Cantidad de hilos es igual a 144 y Estado de construcción está vacío",
  )
}

console.log("\n8) CERCANÍA\n")
{
  const centro = [-76.1, 4.53]
  const [x, y] = aMercator(centro)
  const vuelta = aLonLat([x, y])
  comprobar("Web Mercator ida y vuelta", Math.abs(vuelta[0] - centro[0]) < 1e-9 && Math.abs(vuelta[1] - centro[1]) < 1e-9)
  // Una cubierta 0,001° al norte: unos 111 m.
  const cub = elemento("c1", "node", "Cerca", {}, { punto: [-76.1, 4.531] })
  comprobar("a una cubierta: ≈111 m", Math.abs(distanciaAlElementoM(centro, cub) - 111.2) < 1, distanciaAlElementoM(centro, cub).toFixed(1))
  // Un cable que pasa 0,001° al este, de sur a norte: la distancia es a su punto más cercano.
  const m = (lon, lat) => aMercator([lon, lat])
  const cable = elemento("k1", "fiber", "Cable", {}, { lineas: [[m(-76.099, 4.52), m(-76.099, 4.54)]] })
  const d = distanciaAlElementoM(centro, cable)
  comprobar("a un cable: al punto más cercano de la línea (≈111 m)", Math.abs(d - 110.9) < 1.5, d.toFixed(1))
  const lejos = elemento("c2", "node", "Lejos", {}, { punto: [-76.11, 4.53] })
  const oculto = elemento("c3", "node", "Oculto", {}, { punto: [-76.1, 4.5301], visible: false })
  const r = cercanos([lejos, cub, cable, oculto], centro, 300)
  comprobar("dentro del radio, de lo más cerca a lo más lejos", r.cubiertas.map((c) => c.elemento.nombre).join() === "Cerca" && r.cables.length === 1)
  comprobar("lo oculto por el filtro no cuenta", !r.cubiertas.some((c) => c.elemento.nombre === "Oculto"))
  comprobar("a 1,2 km lo de más lejos también", cercanos([lejos], centro, 1200).cubiertas.length === 1)
  comprobar("textos: «35 m», «1,2 km»", textoDeDistancia(35.4) === "35 m" && textoDeDistancia(1200) === "1,2 km")
}

console.log("\n9) IMPRIMIR\n")
comprobar("escala: 137 m → 100 m; 4 300 m → 2 km; 60 m → 50 m", largoRedondoM(137) === 100 && largoRedondoM(4300) === 2000 && largoRedondoM(60) === 50)
comprobar("escala: sin medida no hay barra", largoRedondoM(0) === 0 && largoRedondoM(Number.NaN) === 0)

console.log(`\n${pruebas - fallos}/${pruebas} pruebas bien.`)
process.exit(fallos ? 1 : 0)
