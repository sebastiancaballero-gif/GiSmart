import type { FilaXlsx, HojaXlsx } from "@/lib/excel"
import type { RutaHaciaArriba } from "@/lib/map/trace"

/**
 * La hoja de Excel del trace hacia arriba: la misma tabla de la ventana, con
 * las columnas que pidió el ingeniero, y arriba lo necesario para saber de
 * qué recorrido es (origen, a dónde llega, cuándo se calculó y se exportó).
 * La Suma va con su fórmula; si los datos tienen algo raro, los avisos van al
 * final, como en la ventana.
 */

/** Las columnas de la tabla del trace hacia arriba, como las pidió el ingeniero. */
export const COLUMNAS_TRACE_ARRIBA = [
  "Tipo elemento",
  "Código elemento",
  "Elemento ubica",
  "Código ubica",
  "Longitud (m)",
  "Contenedor",
  "Código contenedor",
] as const

export type DatosDelExcelDelTrace = {
  ruta: RutaHaciaArriba
  /** De dónde sale, en palabras: «Hilo 13 del cable 2100555»; si no se sabe, `null`. */
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
const TABLA = "TraceHaciaArriba"

/** Alto para una nota de una celda combinada de A a G, que no crece sola. */
const altoDeNota = (texto: string) => 14 * Math.max(1, Math.ceil(texto.length / 120))

/**
 * El origen en palabras, sacado de la primera fila de la ruta, para cuando no
 * llega elegido de otra ventana: «Hilo 21 del cable 2102701», «Puerto E1 del
 * divisor 1 de 7-ago», «Puerto 30 de la bandeja 144 del ODF 1».
 */
export function origenDeLaRuta(ruta: RutaHaciaArriba): string | null {
  const f = ruta.filas[0]
  if (!f || f.tipo === "Central") return null
  if (f.tipo === "Hilo") return `Hilo ${f.nombre ?? "?"}${f.nombreContenedor ? ` del cable ${f.nombreContenedor}` : ""}`
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

export function hojaDelTraceHaciaArriba(d: DatosDelExcelDelTrace): HojaXlsx {
  const centralFila = d.ruta.filas.find((f) => f.tipo === "Central")
  const central = centralFila?.nombre ?? centralFila?.codigo
  const contexto = [
    d.origen ? `UUID ${d.idOrigen}` : `Origen ${d.idOrigen}`,
    d.ruta.llegaALaOlt ? `llega a la OLT${central ? ` de ${central}` : ""}` : "no llega a la OLT",
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
    `Trace hacia arriba — ${d.origen ?? origenDeLaRuta(d.ruta) ?? "desde un puerto o un hilo"}${d.totalDeRutas > 1 ? ` (ruta ${d.numeroDeRuta} de ${d.totalDeRutas})` : ""}`,
    "titulo",
  )
  nota(contexto)
  for (const divisor of d.ruta.divisores) nota(`Pasa por el ${divisor}.`)
  filas.push({ celdas: [] })

  filas.push({ celdas: [...COLUMNAS_TRACE_ARRIBA], estilo: "encabezado" })
  const encabezado = filas.length
  for (const f of d.ruta.filas) {
    filas.push({ celdas: [f.tipo, f.codigo, f.ubica, f.codigoUbica, f.longitudM, f.contenedor, f.codigoContenedor] })
  }
  // La Suma es la fila de totales de la tabla de Excel: no se mezcla con los
  // datos al filtrar ni al ordenar, y suma solo lo que se ve.
  filas.push({
    celdas: [null, null, null, "Suma", { formula: `SUBTOTAL(109,${TABLA}[${COLUMNAS_TRACE_ARRIBA[4]}])`, valor: d.ruta.sumaM }, null, null],
    estilo: "total",
  })
  const totales = filas.length

  if (d.avisos.length > 0) {
    filas.push({ celdas: [] })
    nota("Avisos sobre los datos de la base")
    for (const aviso of d.avisos) nota(`• ${aviso}`)
  }

  return {
    nombre: "Trace hacia arriba",
    // Las dos columnas de código llevan UUID (36 caracteres).
    anchos: [14, 38, 15, 13, 14, 14, 38],
    filas,
    combinar,
    filasFijas: encabezado,
    tabla: {
      nombre: TABLA,
      rango: `A${encabezado}:${ULTIMA}${totales}`,
      totales: [null, null, null, "Suma", { suma: true }, null, null],
    },
    horizontal: true,
  }
}
