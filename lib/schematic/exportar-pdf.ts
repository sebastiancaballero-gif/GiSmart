/**
 * Reporte PDF de los empalmes de una MUFA.
 *
 * No captura el lienzo de JointJS ni un recorte de lo visible: construye un
 * documento de impresión a partir de la misma lista del panel derecho, con
 * todas las filas (aunque el panel tenga scroll) y paleta clara (fondo blanco,
 * texto negro) para que se lea al imprimir.
 */

/** Una tarjeta del panel: título, dB y sus renglones (Origen, Divisor, Destino). */
export type FilaReporteEmpalme = {
  titulo: string
  atenuacion: string
  tramos: { etiqueta: string; texto: string; color: string | null }[]
}

export type OpcionesReporteEmpalmesPdf = {
  titulo: string
  subtitulo?: string
  nombreArchivo: string
  filas: FilaReporteEmpalme[]
}

const MARGEN = 36
const CABECERA = 64
const PIE = 28
const ALTO_TITULO = 18
const ALTO_TRAMO = 12
const RELLENO_FILA = 8
const RADIO_PUNTO = 3.2

function altoFila(fila: FilaReporteEmpalme): number {
  return ALTO_TITULO + fila.tramos.length * ALTO_TRAMO + RELLENO_FILA
}

/** Las fuentes estándar de jsPDF (WinAnsi) no tienen la flecha. */
function textoPdf(texto: string): string {
  return texto.replace(/→/g, "->")
}

const COLOR = {
  fondo: "#ffffff",
  texto: "#0f172a",
  suave: "#475569",
  linea: "#cbd5e1",
  encabezado: "#e2e8f0",
} as const

function rgb(hex: string): [number, number, number] {
  const valor = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1]
  if (!valor) return [15, 23, 42]
  return [
    parseInt(valor.slice(0, 2), 16),
    parseInt(valor.slice(2, 4), 16),
    parseInt(valor.slice(4, 6), 16),
  ]
}

function pintarPunto(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  x: number,
  y: number,
  hex: string,
) {
  const [r, g, b] = rgb(hex)
  pdf.setFillColor(r, g, b)
  pdf.setDrawColor(15, 23, 42)
  pdf.setLineWidth(0.4)
  pdf.circle(x, y, RADIO_PUNTO, "FD")
}

function cabeceraPagina(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  opciones: OpcionesReporteEmpalmesPdf,
  ancho: number,
) {
  pdf.setFillColor(...rgb(COLOR.fondo))
  pdf.rect(0, 0, ancho, pdf.internal.pageSize.getHeight(), "F")

  pdf.setFont("courier", "bold")
  pdf.setFontSize(12)
  pdf.setTextColor(...rgb(COLOR.texto))
  pdf.text(opciones.titulo, MARGEN, 28)

  if (opciones.subtitulo) {
    pdf.setFont("courier", "normal")
    pdf.setFontSize(8)
    pdf.setTextColor(...rgb(COLOR.suave))
    pdf.text(opciones.subtitulo, MARGEN, 42)
  }

  pdf.setDrawColor(...rgb(COLOR.linea))
  pdf.setLineWidth(0.6)
  pdf.line(MARGEN, 50, ancho - MARGEN, 50)
}

function piePagina(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  pagina: number,
  total: number,
  ancho: number,
  alto: number,
) {
  pdf.setDrawColor(...rgb(COLOR.linea))
  pdf.setLineWidth(0.4)
  pdf.line(MARGEN, alto - 20, ancho - MARGEN, alto - 20)
  pdf.setFont("courier", "normal")
  pdf.setFontSize(8)
  pdf.setTextColor(...rgb(COLOR.suave))
  pdf.text(`Página ${pagina} de ${total}`, ancho - MARGEN, alto - 10, { align: "right" })
}

function dibujarFila(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  fila: FilaReporteEmpalme,
  y: number,
  anchoUtil: number,
  indice: number,
) {
  const x = MARGEN
  const alto = altoFila(fila)
  if (indice % 2 === 0) {
    pdf.setFillColor(248, 250, 252)
    pdf.rect(x, y, anchoUtil, alto, "F")
  }

  pdf.setDrawColor(...rgb(COLOR.linea))
  pdf.setLineWidth(0.3)
  pdf.line(x, y + alto, x + anchoUtil, y + alto)

  pdf.setFont("courier", "bold")
  pdf.setFontSize(9)
  pdf.setTextColor(...rgb(COLOR.texto))
  pdf.text(textoPdf(fila.titulo), x + 10, y + 13)

  pdf.setFont("courier", "normal")
  pdf.setFontSize(8)
  pdf.setTextColor(...rgb(COLOR.suave))
  pdf.text(`${fila.atenuacion} dB`, x + anchoUtil - 8, y + 13, { align: "right" })

  fila.tramos.forEach((tramo, i) => {
    const base = y + ALTO_TITULO + i * ALTO_TRAMO + 6
    pdf.setFont("courier", "bold")
    pdf.setFontSize(7)
    pdf.setTextColor(...rgb(COLOR.suave))
    pdf.text(tramo.etiqueta.toUpperCase(), x + 10, base)

    if (tramo.color) pintarPunto(pdf, x + 64, base - 2.5, tramo.color)

    pdf.setFont("courier", "normal")
    pdf.setFontSize(8)
    pdf.setTextColor(...rgb(COLOR.texto))
    pdf.text(textoPdf(tramo.texto), x + 72, base)
  })
}

/** Genera y descarga el reporte de empalmes. */
export async function exportarReporteEmpalmesPdf(
  opciones: OpcionesReporteEmpalmesPdf,
): Promise<void> {
  if (opciones.filas.length === 0) {
    throw new Error("No hay empalmes documentados para exportar.")
  }

  const { jsPDF } = await import("jspdf")
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true })
  pdf.setProperties({
    title: opciones.titulo,
    subject: opciones.subtitulo ?? "",
    creator: "GiSmart",
  })

  const ancho = pdf.internal.pageSize.getWidth()
  const alto = pdf.internal.pageSize.getHeight()
  const anchoUtil = ancho - 2 * MARGEN

  // Las tarjetas por divisor llevan un renglón más: se reparten por altura y
  // ninguna queda partida entre dos páginas.
  const paginas: { fila: FilaReporteEmpalme; y: number; indice: number }[][] = [[]]
  let y = CABECERA
  opciones.filas.forEach((fila, indice) => {
    const altoActual = altoFila(fila)
    if (y + altoActual > alto - PIE && paginas[paginas.length - 1].length > 0) {
      paginas.push([])
      y = CABECERA
    }
    paginas[paginas.length - 1].push({ fila, y, indice })
    y += altoActual
  })

  paginas.forEach((bloque, i) => {
    if (i > 0) pdf.addPage()
    cabeceraPagina(pdf, opciones, ancho)
    for (const item of bloque) dibujarFila(pdf, item.fila, item.y, anchoUtil, item.indice)
    piePagina(pdf, i + 1, paginas.length, ancho, alto)
  })

  pdf.save(opciones.nombreArchivo)
}
