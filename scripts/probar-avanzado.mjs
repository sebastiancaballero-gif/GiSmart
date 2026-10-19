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
const { preguntarAGemini, ErrorDeGemini, MAX_VUELTAS, PAUSAS_MS } = await import("../modulos/avanzado/asistente/servidor/gemini.ts")
const { herramientasDelAsistente, INSTRUCCIONES, largoDeLineaM } = await import("../modulos/avanzado/asistente/servidor/herramientas.ts")
const { cortarTexto, duracionDeEscritura, describirAccion } = await import("../modulos/avanzado/asistente/escritura.ts")
const { bloquesDe, trozosDeLinea, enlazarTrozos } = await import("../modulos/avanzado/asistente/formato.ts")
const { separarSugerencias } = await import("../modulos/avanzado/asistente/sugerencias.ts")
const { describirPaso } = await import("../modulos/avanzado/asistente/pasos.ts")
const { leerApariencia, guardarApariencia, opacidadValida, teselaDeMuestra, APARIENCIA_INICIAL, OPACIDAD_MINIMA } = await import(
  "../modulos/avanzado/vista/apariencia.ts"
)

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
  comprobar("los que ya funcionan tienen su acción", items.filter((i) => i.accion === "modulo").map((i) => i.modulo).join(",") === "asistente,resumen,tabla,consulta,cercania,anterior,siguiente,recuadro,minimapa,marcadores,fondo,copiar,imprimir,atajos")
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

console.log("\n10) ASISTENTE (GEMINI DE MENTIRA, SIN GASTAR CUOTA)\n")
{
  /** Un Gemini de mentira: responde en orden lo que se le da y guarda lo que recibió. */
  function geminiFalso(respuestas) {
    const recibidas = []
    const fetch = async (url, init) => {
      recibidas.push({ url, headers: init.headers, cuerpo: JSON.parse(init.body) })
      const r = respuestas[Math.min(recibidas.length - 1, respuestas.length - 1)]
      return new Response(JSON.stringify(r.cuerpo ?? r), { status: r.estado ?? 200 })
    }
    // Las pausas entre reintentos se anotan en vez de esperarlas.
    const pausas = []
    const pausa = async (ms) => void pausas.push(ms)
    return { recibidas, pausas, config: { clave: "clave-de-prueba", modelo: "modelo-x", url: "https://gemini.test/interactions", fetch, pausa } }
  }
  /** Un Gemini de mentira que responde según el modelo pedido: `responder(modelo, n)` → { estado, cuerpo }. */
  function geminiPorModelo(responder, respaldo) {
    const recibidas = []
    const pausas = []
    const fetch = async (url, init) => {
      const cuerpo = JSON.parse(init.body)
      recibidas.push(cuerpo)
      const r = responder(cuerpo.model, recibidas.length)
      return new Response(JSON.stringify(r.cuerpo ?? r), { status: r.estado ?? 200 })
    }
    const config = { clave: "k", modelo: "principal", respaldo, url: "u", fetch, pausa: async (ms) => void pausas.push(ms) }
    return { recibidas, pausas, config, modelos: () => recibidas.map((c) => c.model).join(",") }
  }
  const saturado = { estado: 503, cuerpo: { error: { message: "principal is currently experiencing high demand" } } }
  const texto = (t) => ({ type: "model_output", content: [{ type: "text", text: t }] })
  const llamada = (id, name, args) => ({ type: "function_call", id, name, arguments: args, status: "waiting" })
  const contar = {
    name: "contar",
    description: "Cuenta",
    parameters: { type: "object", properties: {} },
    ejecutar: async (args) => ({ total: 185, pedido: args }),
  }
  const romper = {
    ...contar,
    name: "romper",
    ejecutar: async () => {
      throw new Error("la base no responde")
    },
  }
  const preguntar = (config, herramientas, mensaje = "x", previa = null) =>
    preguntarAGemini({ config, sistema: "S", herramientas, mensaje, previa })

  // Una respuesta directa, sin herramientas.
  {
    const g = geminiFalso([{ id: "i1", status: "completed", steps: [{ type: "user_input" }, texto("Hola.")] }])
    const r = await preguntar(g.config, [contar], "hola")
    const c = g.recibidas[0]
    comprobar("respuesta directa: el texto y el id de la conversación", r.texto === "Hola." && r.conversacion === "i1" && r.usadas.length === 0)
    comprobar("la clave va en la cabecera, nunca en la URL", c.headers["x-goog-api-key"] === "clave-de-prueba" && !c.url.includes("clave"))
    comprobar(
      "manda modelo, instrucciones, la pregunta y las herramientas declaradas (sin su código)",
      c.cuerpo.model === "modelo-x" &&
        c.cuerpo.system_instruction === "S" &&
        c.cuerpo.input === "hola" &&
        c.cuerpo.tools[0].type === "function" &&
        c.cuerpo.tools[0].name === "contar" &&
        !("ejecutar" in c.cuerpo.tools[0]),
    )
    comprobar("sin conversación previa no manda previous_interaction_id", !("previous_interaction_id" in c.cuerpo))
  }
  // Sigue una conversación.
  {
    const g = geminiFalso([{ id: "i2", status: "completed", steps: [texto("Sí.")] }])
    await preguntar(g.config, [], "¿y?", "i1")
    comprobar("la siguiente pregunta sigue desde la anterior", g.recibidas[0].cuerpo.previous_interaction_id === "i1")
  }
  // Una vuelta de herramientas.
  {
    const g = geminiFalso([
      { id: "i3", status: "requires_action", steps: [{ type: "user_input" }, llamada("c1", "contar", { capa: "cubierta" })] },
      { id: "i4", status: "completed", steps: [{ type: "function_result" }, texto("Hay **185** cubiertas.")] },
    ])
    const r = await preguntar(g.config, [contar], "¿cuántas?")
    const segunda = g.recibidas[1]?.cuerpo
    const resultado = segunda?.input?.[0]
    const datos = resultado ? JSON.parse(resultado.result[0].text) : null
    comprobar("ejecuta la herramienta y responde con el texto final", r.texto === "Hay **185** cubiertas." && r.conversacion === "i4")
    comprobar("cuenta qué consultó", r.usadas.join() === "contar")
    comprobar(
      "devuelve el resultado con su call_id, encadenado a la interacción",
      resultado?.type === "function_result" && resultado.call_id === "c1" && resultado.name === "contar" && segunda.previous_interaction_id === "i3",
    )
    comprobar("el resultado va como JSON, con los argumentos que pidió", datos?.total === 185 && datos.pedido.capa === "cubierta")
  }
  // Los errores de las herramientas van a Gemini como dato: no tumban la pregunta.
  {
    const g = geminiFalso([
      { id: "i5", status: "requires_action", steps: [llamada("c1", "romper", {}), llamada("c2", "inventada", {})] },
      { id: "i6", status: "completed", steps: [{ type: "function_result" }, texto("No pude.")] },
    ])
    const r = await preguntar(g.config, [romper])
    const [a, b] = g.recibidas[1].cuerpo.input.map((x) => JSON.parse(x.result[0].text))
    comprobar("el error de una herramienta va a Gemini como dato", a.error === "la base no responde" && r.texto === "No pude.")
    comprobar("una herramienta que no existe se le dice", typeof b.error === "string" && b.error.includes("inventada"))
  }
  // Si Gemini no deja de pedir herramientas, se corta.
  {
    let n = 0
    const sinFin = async () => {
      n++
      return new Response(JSON.stringify({ id: `i${n}`, status: "requires_action", steps: [llamada(`c${n}`, "contar", {})] }))
    }
    const error = await preguntar({ clave: "k", modelo: "m", url: "u", fetch: sinFin }, [contar]).catch((e) => e)
    comprobar(`se corta a las ${MAX_VUELTAS} vueltas`, error instanceof ErrorDeGemini && n === MAX_VUELTAS + 1, `${n} llamadas`)
  }
  // Los errores de la API, en palabras.
  {
    const conEstado = (estado) =>
      preguntar(geminiFalso([{ estado, cuerpo: { error: { message: "detalle de Google" } } }]).config, []).catch((e) => e)
    const e401 = await conEstado(401)
    const e429 = await conEstado(429)
    const e404 = await conEstado(404)
    const e500 = await conEstado(500)
    comprobar("401: clave rechazada (502 al navegador)", e401.estado === 502 && e401.message.includes("GEMINI_API_KEY") && e401.detalle === "detalle de Google")
    comprobar("429: cuota agotada", e429.estado === 429 && e429.message.includes("cuota"))
    comprobar("404: modelo o dirección", e404.message.includes("modelo-x"))
    comprobar("500: error de Gemini con su número", e500.estado === 502 && e500.message.includes("500"))
    const sinRed = await preguntar(
      {
        clave: "k",
        modelo: "m",
        url: "u",
        fetch: async () => {
          throw new TypeError("fetch failed")
        },
      },
      [],
    ).catch((e) => e)
    comprobar("sin conexión: 504", sinRed.estado === 504)
    const fallida = await preguntar(geminiFalso([{ id: "f", status: "failed", error: { message: "safety" } }]).config, []).catch((e) => e)
    comprobar("una interacción fallida se informa", fallida instanceof ErrorDeGemini && fallida.detalle === "safety")
  }
  // Las herramientas del asistente.
  {
    const acciones = []
    const herramientas = herramientasDelAsistente({ acciones, leerTrace: async () => ({}) })
    const nombres = herramientas.map((h) => h.name)
    comprobar(
      "nombres únicos y válidos para Gemini",
      new Set(nombres).size === nombres.length && nombres.every((n) => /^[a-z_]{1,64}$/.test(n)),
      nombres.join(", "),
    )
    comprobar("cada una con descripción y parámetros de objeto", herramientas.every((h) => h.description && h.parameters.type === "object"))
    comprobar(
      "las instrucciones nombran las herramientas del mapa",
      ["mostrar_en_mapa", "seleccionar_en_mapa", "abrir_trace"].every((n) => INSTRUCCIONES.includes(n)),
    )
    const h = (n) => herramientas.find((x) => x.name === n)
    await h("mostrar_en_mapa").ejecutar({ tipo: "cable", nombre: " 2103191 " })
    await h("seleccionar_en_mapa").ejecutar({ tipo: "cubierta", nombres: ["CO12", "", "CO13"] })
    await h("abrir_trace").ejecutar({ id_origen: "01a0e04f-0000-4000-8000-000000000000", direccion: "abajo" })
    comprobar("mostrar: anota la acción para el navegador", acciones[0]?.tipo === "mostrar" && acciones[0].capa === "cable" && acciones[0].nombre === "2103191")
    comprobar("seleccionar: sin nombres vacíos", acciones[1]?.tipo === "seleccionar" && acciones[1].nombres.join() === "CO12,CO13")
    comprobar("abrir_trace: hacia abajo es DOWNSTREAM", acciones[2]?.tipo === "trace" && acciones[2].direccion === "DOWNSTREAM", JSON.stringify(acciones[2]))
    const malo = await h("abrir_trace").ejecutar({ id_origen: "no-es-uuid", direccion: "arriba" })
    comprobar("abrir_trace: un id que no es UUID no se anota", acciones.length === 3 && Boolean(malo?.error), JSON.stringify(malo))
  }
  // Google saturado: reintentos y modelos de respaldo.
  {
    const listo = (t, id = "ok") => ({ cuerpo: { id, status: "completed", steps: [texto(t)] } })
    const pregunta = (g) => preguntarAGemini({ config: g.config, sistema: "S", herramientas: [contar], mensaje: "x", previa: null })

    const g0 = geminiFalso([{ id: "i", status: "completed", steps: [texto("ok")] }])
    await preguntar(g0.config, [])
    comprobar("pide pensar poco (thinking_level «low»)", g0.recibidas[0].cuerpo.generation_config?.thinking_level === "low")

    const g1 = geminiPorModelo((m, n) => (n === 1 ? saturado : listo("Hola.")), [])
    const r1 = await pregunta(g1)
    comprobar("saturado una vez: reintenta el mismo modelo y responde", r1.texto === "Hola." && g1.modelos() === "principal,principal" && r1.respaldo === false)
    comprobar("espera antes de reintentar", g1.pausas.join() === String(PAUSAS_MS[0]), g1.pausas.join())

    const g2 = geminiPorModelo((m) => (m === "principal" ? saturado : listo("Desde el respaldo.")), ["r1", "r2"])
    const r2 = await pregunta(g2)
    comprobar(
      "saturado siempre: tras los reintentos pasa al respaldo",
      r2.texto === "Desde el respaldo." && g2.modelos() === `${"principal,".repeat(PAUSAS_MS.length + 1)}r1`,
      g2.modelos(),
    )
    comprobar("dice qué modelo respondió", r2.modelo === "r1" && r2.respaldo === true)

    const g3 = geminiPorModelo((m) => (m === "principal" ? { estado: 429, cuerpo: { error: { message: "quota" } } } : listo("Con cuota.")), ["r1"])
    const r3 = await pregunta(g3)
    comprobar("sin cuota: pasa al respaldo enseguida, sin esperar", r3.texto === "Con cuota." && g3.modelos() === "principal,r1" && g3.pausas.length === 0, g3.modelos())

    // Respaldo a mitad de las vueltas de herramientas: sigue con el mismo modelo.
    const g4 = geminiPorModelo(
      (m, n) =>
        m === "principal"
          ? saturado
          : n <= PAUSAS_MS.length + 2
            ? { cuerpo: { id: "i1", status: "requires_action", steps: [llamada("c1", "contar", {})] } }
            : listo("Hay 185."),
      ["r1"],
    )
    const r4 = await pregunta(g4)
    comprobar("las vueltas de herramientas siguen con el modelo que respondió", r4.texto === "Hay 185." && g4.modelos().endsWith("r1,r1"), g4.modelos())

    const g5 = geminiPorModelo(() => saturado, ["r1"])
    const e5 = await pregunta(g5).catch((e) => e)
    comprobar(
      "todos saturados: 503 con un mensaje claro",
      e5 instanceof ErrorDeGemini && e5.estado === 503 && e5.message.includes("saturado") && e5.message.includes("principal, r1"),
      e5.message,
    )

    const g6 = geminiPorModelo((m) => (m === "principal" ? { estado: 401, cuerpo: { error: { message: "bad key" } } } : listo("no")), ["r1"])
    const e6 = await pregunta(g6).catch((e) => e)
    comprobar("una clave mala no se reintenta ni pasa al respaldo", e6 instanceof ErrorDeGemini && g6.modelos() === "principal", g6.modelos())
  }
}

console.log("\n11) ANIMACIÓN DE LAS RESPUESTAS\n")
{
  const t = "La cubierta **CO19** tiene 2 cables."
  comprobar("no corta palabras a la mitad", cortarTexto(t, 5) === "La cubierta", cortarTexto(t, 5))
  comprobar("una negrita a medias se cierra (no se ven los asteriscos)", cortarTexto(t, 14) === "La cubierta **CO19**", cortarTexto(t, 14))
  comprobar("al final, el texto entero tal cual", cortarTexto(t, t.length) === t && cortarTexto(t, 999) === t)
  comprobar("al principio, nada", cortarTexto(t, 0) === "")
  comprobar("las listas se cortan por línea", cortarTexto("Llega:\n- cable 1\n- cable 2", 10) === "Llega:\n- cable")
  comprobar("una respuesta corta se escribe rápido, una larga en 2 s como mucho", duracionDeEscritura(10) === 450 && duracionDeEscritura(5000) === 2000)
  comprobar("ficha: mostrar", describirAccion({ tipo: "mostrar", capa: "cubierta", nombre: "CO19" }).texto === "Mapa en CO19")
  comprobar(
    "ficha: seleccionar por nivel",
    describirAccion({ tipo: "seleccionar", capa: "cubierta", nombres: [], nivel: "primer" }).texto === "Cubiertas de primer nivel seleccionadas" &&
      describirAccion({ tipo: "seleccionar", capa: "cubierta", nombres: [], nivel: "Empalme" }).texto === "Cubiertas de empalme seleccionadas",
  )
  comprobar(
    "ficha: seleccionar por nombre, en singular y plural",
    describirAccion({ tipo: "seleccionar", capa: "cable", nombres: ["2102262"] }).texto === "1 cable en la tabla" &&
      describirAccion({ tipo: "seleccionar", capa: "cubierta", nombres: ["CO1", "CO2"] }).texto === "2 cubiertas en la tabla",
  )
  comprobar("ficha: trace", describirAccion({ tipo: "trace", idOrigen: "x", direccion: "UPSTREAM", etiqueta: null }).texto === "Trace hacia la fuente")
}

console.log("\n12) FORMATO, NOMBRES CLICABLES, SUGERENCIAS Y PASOS\n")
{
  const tipos = (t) => bloquesDe(t).map((b) => b.tipo).join(",")
  const tabla = bloquesDe("Así está:\n| Cable | Hilos |\n|---|---|\n| 2103630 | 144 |\n| 2108994 | 48 |\nListo.")
  comprobar("una tabla con cabecera", tipos("| a | b |\n|---|---|\n| 1 | 2 |") === "tabla" && tabla[1].cabecera?.length === 2 && tabla[1].filas.length === 2, JSON.stringify(tabla[1].filas.map((f) => f.map((c) => c[0]?.texto))))
  comprobar("párrafo, tabla y párrafo en su orden", tipos("Así está:\n| Cable | Hilos |\n|---|---|\n| 2103630 | 144 |\nListo.") === "parrafo,tabla,parrafo")
  const numerada = bloquesDe("1. Primero\n2. Segundo\n   - detalle\n3) Tercero")
  comprobar(
    "lista numerada con una sublista dentro",
    numerada.length === 1 && numerada[0].ordenada && numerada[0].items.map((i) => `${i.numero ?? "•"}:${i.nivel}`).join() === "1:0,2:0,•:1,3:0",
    JSON.stringify(numerada[0].items.map((i) => [i.numero, i.nivel])),
  )
  comprobar("títulos con #", tipos("### Resumen\nTexto") === "titulo,parrafo")
  const t = trozosDeLinea("La **CO19** usa `1x8` y *solo* fusiones")
  comprobar("negrita, código y cursiva", t.map((x) => (x.negrita ? "N" : x.codigo ? "C" : x.cursiva ? "I" : "-")).join("") === "-N-C-I-", t.map((x) => x.texto).join("|"))
  comprobar("un asterisco suelto no es cursiva", trozosDeLinea("2 * 3 = 6").length === 1)

  const mapa = { co19: "k-co19", "2103630": "k-cable", "13/14": "k-1314", "hub la union": "k-hub", "7-ago": "k-7ago" }
  const buscar = (n) => mapa[n.toLowerCase()] ?? null
  const enlazados = enlazarTrozos(trozosDeLinea("De **CO19** sale el cable 2103630 hacia 13/14 y 7-ago; tiene 185 cubiertas y 13 hilos."), buscar)
  const claves = enlazados.filter((x) => x.clave).map((x) => `${x.texto}→${x.clave}`).join(", ")
  comprobar("marca los nombres del mapa en el texto", claves === "CO19→k-co19, 2103630→k-cable, 13/14→k-1314, 7-ago→k-7ago", claves)
  comprobar("no marca cifras sueltas (185, 13)", !enlazados.some((x) => x.clave && /^(185|13)$/.test(x.texto)))
  comprobar("el texto sigue igual al unir los trozos", enlazados.map((x) => x.texto).join("") === "De CO19 sale el cable 2103630 hacia 13/14 y 7-ago; tiene 185 cubiertas y 13 hilos.")
  comprobar("una negrita entera que es un nombre", enlazarTrozos(trozosDeLinea("Todo sale del **HUB LA UNION**."), buscar).some((x) => x.clave === "k-hub"))
  comprobar("lo ambiguo o desconocido no se marca", enlazarTrozos(trozosDeLinea("N1 y CO99"), () => null).every((x) => !x.clave))
  comprobar("dentro de un código no se marca", enlazarTrozos(trozosDeLinea("`CO19`"), buscar).every((x) => !x.clave))

  const s1 = separarSugerencias("Hay 185 cubiertas.\n\nSugerencias: ¿Cuáles son de primer nivel? | Muéstrame CO19 | ¿Cuántos km de fibra hay?")
  comprobar("separa las sugerencias del texto", s1.texto === "Hay 185 cubiertas." && s1.sugerencias.length === 3 && s1.sugerencias[1] === "Muéstrame CO19", JSON.stringify(s1))
  const s2 = separarSugerencias("Listo.\n**Sugerencias:**\n- ¿Y el trace?\n- Selecciónalas")
  comprobar("también como lista y con negrita", s2.texto === "Listo." && s2.sugerencias.join("|") === "¿Y el trace?|Selecciónalas", JSON.stringify(s2))
  comprobar("sin sugerencias, el texto queda igual", separarSugerencias("Hola.").sugerencias.length === 0 && separarSugerencias("Hola.").texto === "Hola.")
  comprobar("como mucho tres", separarSugerencias("x\nSugerencias: uno uno | dos dos | tres tres | cuatro cuatro").sugerencias.length === 3)

  comprobar("paso: ficha de cubierta", describirPaso({ tipo: "herramienta", nombre: "ficha_cubierta", argumentos: { nombre: "CO19" } }) === "Leyendo la ficha de CO19")
  comprobar("paso: cable con hilos", describirPaso({ tipo: "herramienta", nombre: "ficha_cable", argumentos: { codigo: "2102262", con_hilos: true } }) === "Leyendo el cable 2102262 y sus hilos")
  comprobar("paso: reintento y respaldo", describirPaso({ tipo: "reintento", modelo: "m", esperaMs: 1500 }).includes("1.5 s") && describirPaso({ tipo: "respaldo", modelo: "gemini-x" }) === "Probando con gemini-x")
  comprobar("paso: un texto largo se acorta", describirPaso({ tipo: "herramienta", nombre: "buscar_elementos", argumentos: { texto: "x".repeat(200) } }).length < 60)

  // Las herramientas nuevas, con cubiertas y direcciones de mentira.
  const acciones = []
  const cubiertas = [
    { etiqueta: "CO19", nivel: "Primer nivel", lon: -76.10406, lat: 4.53887 },
    { etiqueta: "N1", nivel: "Segundo nivel", lon: -76.1038, lat: 4.5389 },
    { etiqueta: "3-abr", nivel: "Segundo nivel", lon: -76.1023, lat: 4.5336 },
    { etiqueta: null, nivel: "Empalme", lon: -76.09, lat: 4.52 },
  ]
  const geocodificadas = []
  const h = herramientasDelAsistente({
    acciones,
    leerTrace: async () => ({}),
    leerCubiertas: async () => cubiertas,
    geocodificar: async (q) => (geocodificadas.push(q), q.startsWith("Carrera 14") ? [{ etiqueta: "Carrera 14, La Unión, Valle del Cauca", lon: -76.1023, lat: 4.5337 }] : []),
  })
  const herramienta = (n) => h.find((x) => x.name === n)
  const ayuda = await herramienta("ayuda_gismart").ejecutar({ tema: "trace" })
  comprobar("ayuda: dice dónde está el trace", ayuda.funciones.some((f) => f.funcion === "Trace" && f.donde === "Red de fibra › Reportes"), JSON.stringify(ayuda.funciones[0]))
  const frase = await herramienta("ayuda_gismart").ejecutar({ tema: "cómo exporto la tabla a excel" })
  comprobar("ayuda: con una frase entera prueba palabra por palabra", frase.funciones.length > 0, frase.funciones.map((f) => f.funcion).join(", "))
  comprobar("ayuda: trae lo básico (atajos, capa activa)", ayuda.basico.some((b) => b.includes("Ctrl+I")) && ayuda.basico.some((b) => b.includes("Activar capa")))

  const deCO19 = await herramienta("cerca_de").ejecutar({ cubierta: "co19", radio_m: 100 })
  comprobar("cercanía de una cubierta: sin ella misma, de cerca a lejos", deCO19.mas_cercanas[0].etiqueta === "N1" && !deCO19.mas_cercanas.some((c) => c.etiqueta === "CO19"), JSON.stringify(deCO19.mas_cercanas))
  comprobar("marca el círculo en el mapa", acciones.at(-1)?.tipo === "cercania" && acciones.at(-1).radioM === 100 && acciones.at(-1).lat === 4.53887)
  const porCoordenada = await herramienta("cerca_de").ejecutar({ direccion: "4.5336, -76.1023" })
  comprobar("cercanía de una coordenada, sin buscar la dirección", porCoordenada.mas_cercanas[0].etiqueta === "3-abr" && geocodificadas.length === 0)
  const porCalle = await herramienta("cerca_de").ejecutar({ direccion: "Carrera 14", nivel: "segundo" })
  comprobar(
    "cercanía de una calle: la busca en La Unión y avisa que es aproximada",
    geocodificadas[0] === "Carrera 14, La Unión, Valle del Cauca" && porCalle.punto.aviso && porCalle.mas_cercanas.every((c) => c.nivel === "Segundo nivel"),
    JSON.stringify(porCalle.punto),
  )
  const noExiste = await herramienta("cerca_de").ejecutar({ direccion: "un lugar que no existe" })
  comprobar("una dirección que no aparece se explica", typeof noExiste.error === "string" && noExiste.error.includes("OpenStreetMap"))
  const lejos = await herramienta("cerca_de").ejecutar({ cubierta: "CO19", radio_m: 20 })
  comprobar("sin ninguna dentro del radio, da las más cercanas y lo dice", lejos.dentro_del_radio === 0 && lejos.mas_cercanas.length > 0 && Boolean(lejos.nota))
  comprobar("las instrucciones piden las sugerencias al final", INSTRUCCIONES.includes("Sugerencias:"))
  // El largo de un cable como lo mide el mapa: 0,001° de latitud son unos 111 m.
  const linea = { type: "LineString", coordinates: [[-76.1, 4.53], [-76.1, 4.531], [-76.1, 4.532]] }
  comprobar("largo de una línea: suma sus tramos (≈222 m)", Math.abs(largoDeLineaM(linea) - 222.4) < 1, largoDeLineaM(linea).toFixed(1))
  comprobar("largo de una multilínea y de algo sin geometría", Math.abs(largoDeLineaM({ type: "MultiLineString", coordinates: [linea.coordinates, linea.coordinates] }) - 444.8) < 2 && largoDeLineaM(null) === 0)
}

console.log("\n13) MAPA BASE, TRANSPARENCIA Y MINIMAPA\n")
{
  const datos = new Map()
  globalThis.localStorage = { getItem: (k) => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => void datos.set(k, String(v)) }
  comprobar("sin nada guardado: según el tema, todo opaco, sin minimapa", JSON.stringify(leerApariencia("ana")) === JSON.stringify(APARIENCIA_INICIAL))
  const elegida = { fondo: "gris", opacidades: { ...APARIENCIA_INICIAL.opacidades, fibers: 0.6 }, minimapa: true }
  comprobar("guarda y lee lo elegido", guardarApariencia("ana", elegida) && JSON.stringify(leerApariencia("ana")) === JSON.stringify(elegida))
  comprobar("cada usuario tiene lo suyo", leerApariencia("beto").fondo === "tema")
  datos.set("gismart.apariencia.carla", JSON.stringify({ fondo: "satelite", opacidades: { nodes: -3, fibers: "x", base: 0.33 }, minimapa: "si" }))
  const rara = leerApariencia("carla")
  comprobar(
    "lo que no tiene forma se arregla",
    rara.fondo === "tema" && rara.opacidades.nodes === OPACIDAD_MINIMA && rara.opacidades.fibers === 1 && rara.opacidades.base === 0.35 && rara.minimapa === false,
    JSON.stringify(rara),
  )
  datos.set("gismart.apariencia.dani", "{no es json")
  comprobar("un guardado roto da lo de siempre", leerApariencia("dani").fondo === "tema")
  comprobar("opacidad: entre la mínima y 1, en pasos de 5 %", opacidadValida(0) === OPACIDAD_MINIMA && opacidadValida(2) === 1 && opacidadValida(0.62) === 0.6)
  comprobar("la muestra es una tesela del centro de La Unión", /\/17\/37827\/63883\.png$/.test(teselaDeMuestra()), teselaDeMuestra())
  globalThis.localStorage = {
    getItem: () => {
      throw new Error("bloqueado")
    },
    setItem: () => {
      throw new Error("bloqueado")
    },
  }
  comprobar("con el almacenamiento bloqueado: lo de siempre, y guardar dice que no", leerApariencia("ana").fondo === "tema" && guardarApariencia("ana", elegida) === false)
}

console.log(`\n${pruebas - fallos}/${pruebas} pruebas bien.`)
process.exit(fallos ? 1 : 0)
