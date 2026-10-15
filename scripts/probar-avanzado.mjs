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
const { preguntarAGemini, ErrorDeGemini, MAX_VUELTAS } = await import("../modulos/avanzado/asistente/servidor/gemini.ts")
const { herramientasDelAsistente, INSTRUCCIONES } = await import("../modulos/avanzado/asistente/servidor/herramientas.ts")

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
  comprobar("los que ya funcionan tienen su acción", items.filter((i) => i.accion === "modulo").map((i) => i.modulo).join(",") === "asistente,resumen,tabla,consulta,cercania,marcadores,imprimir,atajos")
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
    return { recibidas, config: { clave: "clave-de-prueba", modelo: "modelo-x", url: "https://gemini.test/interactions", fetch } }
  }
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
}

console.log(`\n${pruebas - fallos}/${pruebas} pruebas bien.`)
process.exit(fallos ? 1 : 0)
