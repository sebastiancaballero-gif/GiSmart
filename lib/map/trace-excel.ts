import type { FilaXlsx, HojaXlsx } from "@/lib/excel"
import type { DireccionTrace, RutaDelTrace } from "@/lib/map/trace"

/**
 * La hoja de Excel del trace, hacia arriba o hacia abajo: la misma tabla de la
 * ventana, con las columnas que pidió el ingeniero, y arriba lo necesario para
 * saber de qué recorrido es (origen, a dónde llega, cuándo se calculó y se
 * exportó).
 * La Suma va con su fórmula; si los datos tienen algo raro, los avisos van al
 * final, como en la ventana.
 */

/**
 * Las columnas de la tabla del trace, con los nombres que pidieron (octubre de
 * 2026): «Número» es la que antes se llamaba «Código ubica» y va antes de
 * «Elemento ubica»; los códigos de elemento y contenedor (los UUID) se llaman
 * «Identificador». La Longitud sigue en la quinta: la Suma la nombra.
 */
export const COLUMNAS_TRACE = [
  "Tipo elemento",
  "Identificador elemento",
  "Número",
  "Elemento ubica",
  "Longitud (m)",
  "Contenedor",
  "Identificador contenedor",
] as const

export type DatosDelExcelDelTrace = {
  direccion: DireccionTrace
  ruta: RutaDelTrace
  /** De dónde sale, en palabras: «Hilo 13 del cable 01a0e04f-…» (el identificador del cable); si no se sabe, `null`. */
  origen: string | null
  idOrigen: string
  /** Cuál de las rutas es, cuando el recorrido se abre en varias. */
  numeroDeRuta: number
  totalDeRutas: number
  pasos: number
  atenuacionDb: number | null
  /** Fechas ya escritas para leer: «8 oct 2026, 8:48 a. m.». */
  calculadoEn: string | null
  exportadoEn: string
  avisos: string[]
}

const ULTIMA = "G"
/** El nombre de la tabla de Excel, para la fórmula de la Suma. */
const TABLA: Record<DireccionTrace, string> = { UPSTREAM: "TraceHaciaArriba", DOWNSTREAM: "TraceHaciaAbajo" }
const SENTIDO: Record<DireccionTrace, string> = { UPSTREAM: "hacia arriba", DOWNSTREAM: "hacia abajo" }

/** Alto para una nota de una celda combinada de A a G, que no crece sola. */
const altoDeNota = (texto: string) => 14 * Math.max(1, Math.ceil(texto.length / 120))

/**
 * El origen en palabras, sacado de la primera fila de la ruta, para cuando no
 * llega elegido de otra ventana: «Hilo 21 del cable 2102701», «Puerto E1 del
 * divisor 1 de 7-ago», «Puerto 30 de la bandeja 144 del ODF 1».
 */
export function origenDeLaRuta(ruta: RutaDelTrace, conIdentificador = false): string | null {
  // Hacia abajo la central puede ir primero: el origen es lo que sigue.
  const f = ruta.filas.find((x) => x.tipo !== "Central")
  if (!f || f.tipo === "Central") return null
  // Con identificador, el cable va por su UUID, como en la ventana; sin él, por
  // su código (para el nombre del archivo).
  const cable = conIdentificador ? (f.codigoContenedor ?? f.nombreContenedor) : f.nombreContenedor
  if (f.tipo === "Hilo") return `Hilo ${f.nombre ?? "?"}${cable ? ` del cable ${cable}` : ""}`
  const enCubierta = f.ubica === "Divisor"
  const articulo = f.ubica === "Divisor" ? "del divisor" : f.ubica === "Bandeja" ? "de la bandeja" : f.ubica === "Tarjeta" ? "de la tarjeta" : f.ubica ? `de ${f.ubica}` : ""
  const donde = articulo ? ` ${articulo}${f.codigoUbica ? ` ${f.codigoUbica}` : ""}` : ""
  const en = !f.nombreContenedor
    ? ""
    : enCubierta
      ? ` de ${f.nombreContenedor}`
      : ` ${f.contenedor === "OLT" ? "de la OLT" : `del ${f.contenedor ?? "equipo"}`} ${f.nombreContenedor}`
  return `Puerto ${f.nombre ?? "?"}${donde}${en}`
}

const decimales = (n: number) => n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function hojaDelTrace(d: DatosDelExcelDelTrace): HojaXlsx {
  const haciaArriba = d.direccion === "UPSTREAM"
  const tabla = TABLA[d.direccion]
  const central = d.ruta.final ?? d.ruta.filas.find((f) => f.tipo === "Central")?.codigo
  const llegada = d.ruta.llega
    ? haciaArriba
      ? `llega a la OLT${central ? ` de ${central}` : ""}`
      : `llega al ${d.ruta.final ?? "divisor"}`
    : haciaArriba
      ? "no llega a la OLT"
      : "no llega a un divisor"
  const contexto = [
    d.origen ? `UUID ${d.idOrigen}` : `Origen ${d.idOrigen}`,
    // Hacia abajo, la central de donde sale (en la tabla solo va su UUID).
    !haciaArriba && d.ruta.filas[0]?.tipo === "Central" ? `sale de la central ${d.ruta.filas[0].nombre ?? d.ruta.filas[0].codigo}` : null,
    llegada,
    `${d.pasos} ${d.pasos === 1 ? "paso" : "pasos"}`,
    d.atenuacionDb !== null
      ? `${decimales(d.atenuacionDb)} dB según la caché${d.ruta.divisores.length > 0 ? ", sin la pérdida del divisor" : ""}`
      : null,
    d.calculadoEn ? `calculado el ${d.calculadoEn}` : null,
    `exportado el ${d.exportadoEn}`,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ")

  const filas: FilaXlsx[] = []
  const combinar: string[] = []
  const nota = (texto: string, estilo: FilaXlsx["estilo"] = "nota") => {
    filas.push({ celdas: [texto], estilo, alto: estilo === "nota" ? altoDeNota(texto) : undefined })
    combinar.push(`A${filas.length}:${ULTIMA}${filas.length}`)
  }

  nota(
    `Trace ${SENTIDO[d.direccion]} — ${d.origen ?? origenDeLaRuta(d.ruta, true) ?? "desde un puerto o un hilo"}${d.totalDeRutas > 1 ? ` (ruta ${d.numeroDeRuta} de ${d.totalDeRutas})` : ""}`,
    "titulo",
  )
  nota(contexto)
  for (const divisor of d.ruta.divisores) nota(`Pasa por el ${divisor}.`)
  filas.push({ celdas: [] })

  filas.push({ celdas: [...COLUMNAS_TRACE], estilo: "encabezado" })
  const encabezado = filas.length
  for (const f of d.ruta.filas) {
    // «Número» como número cuando lo es: como texto, Excel lo marcaba y ordenaba el 10 antes que el 2.
    const numero = f.codigoUbica !== null && /^\d{1,15}$/.test(f.codigoUbica) ? Number(f.codigoUbica) : f.codigoUbica
    filas.push({ celdas: [f.tipo, f.codigo, numero, f.ubica, f.longitudM, f.contenedor, f.codigoContenedor] })
  }
  // La Suma es la fila de totales de la tabla de Excel: no se mezcla con los
  // datos al filtrar ni al ordenar, y suma solo lo que se ve.
  filas.push({
    celdas: [null, null, null, "Suma", { formula: `SUBTOTAL(109,${tabla}[${COLUMNAS_TRACE[4]}])`, valor: d.ruta.sumaM }, null, null],
    estilo: "total",
  })
  const totales = filas.length

  if (d.avisos.length > 0) {
    filas.push({ celdas: [] })
    nota("Avisos sobre los datos de la base")
    for (const aviso of d.avisos) nota(`• ${aviso}`)
  }

  return {
    nombre: `Trace ${SENTIDO[d.direccion]}`,
    // Las dos columnas de código llevan UUID (36 caracteres).
    anchos: [14, 38, 10, 15, 14, 14, 38],
    filas,
    combinar,
    filasFijas: encabezado,
    tabla: {
      nombre: tabla,
      rango: `A${encabezado}:${ULTIMA}${totales}`,
      totales: [null, null, null, "Suma", { suma: true }, null, null],
    },
    horizontal: true,
  }
}
