/**
 * Reporte PDF de los empalmes de una MUFA.
 *
 * No captura el lienzo de JointJS ni un recorte de lo visible: construye un
 * documento de impresión a partir de la misma lista del panel derecho, con
 * todas las filas (aunque el panel tenga scroll) y paleta clara (fondo blanco,
 * texto negro) para que se lea al imprimir.
 */

export type FilaReporteEmpalme = {
  origenHilo: string
  origenColor: string
  origenCable: string
  destinoHilo: string
  destinoColor: string
  destinoCable: string
  traza: string
  via: string
  atenuacion: string
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
const ALTO_FILA = 38
const RADIO_PUNTO = 3.2

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
  if (indice % 2 === 0) {
    pdf.setFillColor(248, 250, 252)
    pdf.rect(x, y, anchoUtil, ALTO_FILA, "F")
  }

  pdf.setDrawColor(...rgb(COLOR.linea))
  pdf.setLineWidth(0.3)
  pdf.line(x, y + ALTO_FILA, x + anchoUtil, y + ALTO_FILA)

  const centro = y + ALTO_FILA / 2
  pintarPunto(pdf, x + 10, centro - 6, fila.origenColor)
  pintarPunto(pdf, x + 86, centro - 6, fila.destinoColor)

  pdf.setFont("courier", "bold")
  pdf.setFontSize(9)
  pdf.setTextColor(...rgb(COLOR.texto))
  pdf.text(fila.origenHilo, x + 16, centro - 4)
  pdf.text("→", x + 72, centro - 4)
  pdf.text(fila.destinoHilo, x + 92, centro - 4)

  pdf.setFont("courier", "normal")
  pdf.setFontSize(8)
  pdf.setTextColor(...rgb(COLOR.suave))
  pdf.text(`${fila.atenuacion} dB`, x + anchoUtil - 8, centro - 4, { align: "right" })

  pdf.setFont("courier", "bold")
  pdf.setFontSize(8)
  pdf.setTextColor(8, 51, 68)
  pdf.text(fila.traza, x + 10, centro + 8)

  pdf.setFont("courier", "normal")
  pdf.setTextColor(...rgb(COLOR.suave))
  const detalle = `${fila.via}  ·  ${fila.origenCable} → ${fila.destinoCable}`
  pdf.text(detalle, x + 10, centro + 16)
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
  const filasPorPagina = Math.max(1, Math.floor((alto - CABECERA - PIE) / ALTO_FILA))
  const totalPaginas = Math.ceil(opciones.filas.length / filasPorPagina)

  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    if (pagina > 1) pdf.addPage()
    cabeceraPagina(pdf, opciones, ancho)

    const inicio = (pagina - 1) * filasPorPagina
    const bloque = opciones.filas.slice(inicio, inicio + filasPorPagina)
    bloque.forEach((fila, i) => {
      dibujarFila(pdf, fila, CABECERA + i * ALTO_FILA, anchoUtil, inicio + i)
    })

    piePagina(pdf, pagina, totalPaginas, ancho, alto)
  }

  pdf.save(opciones.nombreArchivo)
}
