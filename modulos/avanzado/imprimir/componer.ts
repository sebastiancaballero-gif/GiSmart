import { FUNCION_CUB_COLORS, FUNCION_CUB_DEFAULT_COLOR } from "@/lib/map/symbology"
import { LAYER_COLORS } from "@/lib/network-colors"

/** Lo que se le pone al mapa para imprimirlo o guardarlo. */
export type OpcionesDeLamina = {
  titulo: string
  subtitulo: string
  /** Con el mapa base (calles, terreno) detrás de la red. */
  fondo: boolean
  /** Lo que exige el proveedor del mapa base («© OpenStreetMap»); va al pie si sale el fondo. */
  atribucion?: string | null
  leyenda: boolean
  escalaYNorte: boolean
  /** La fecha que se imprime abajo, o `null` para no ponerla. */
  fecha: string | null
}

/** La longitud «redonda» (1, 2 o 5 × 10ⁿ metros) que más se acerca a `objetivoM` sin pasarse. */
export function largoRedondoM(objetivoM: number): number {
  if (!(objetivoM > 0)) return 0
  const potencia = 10 ** Math.floor(Math.log10(objetivoM))
  for (const paso of [5, 2, 1]) if (paso * potencia <= objetivoM) return paso * potencia
  return potencia
}

/** «500 m», «2 km». */
const textoDeLargo = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`)

/**
 * La lámina para imprimir o guardar: arriba el título y el lugar; en medio el
 * mapa tal como se ve, con la escala y el norte abajo a la izquierda y la
 * leyenda abajo a la derecha; y una franja al pie con la fecha, GISmart y,
 * si sale el mapa base, su atribución.
 * `escala` es la de la pantalla (devicePixelRatio): todo se dibuja a esa
 * resolución para que la imagen salga nítida.
 */
export function componerLamina(
  mapa: { lienzo: HTMLCanvasElement; lienzoSinFondo?: HTMLCanvasElement; metrosPorPixel: number },
  opciones: OpcionesDeLamina,
  escala = 1,
): HTMLCanvasElement {
  const u = (n: number) => Math.round(n * escala)
  const fuente = (px: number, peso = 400) => `${peso} ${u(px)}px Inter, "Segoe UI", system-ui, sans-serif`
  const alto = { cabecera: u(58), pie: u(26) }
  const ancho = mapa.lienzo.width
  const lamina = document.createElement("canvas")
  lamina.width = ancho
  lamina.height = alto.cabecera + mapa.lienzo.height + alto.pie
  const ctx = lamina.getContext("2d")
  if (!ctx) return lamina

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, lamina.width, lamina.height)

  // Cabecera: franja de la marca, título y lugar.
  const franja = ctx.createLinearGradient(0, 0, ancho, 0)
  franja.addColorStop(0, "#2a9bc4")
  franja.addColorStop(0.5, "#6fc5df")
  franja.addColorStop(1, "#2f6d9e")
  ctx.fillStyle = franja
  ctx.fillRect(0, 0, ancho, u(4))
  ctx.fillStyle = "#0f172a"
  ctx.font = fuente(19, 700)
  ctx.textBaseline = "alphabetic"
  ctx.fillText(opciones.titulo || "Red de fibra óptica", u(16), u(32))
  if (opciones.subtitulo) {
    ctx.fillStyle = "#64748b"
    ctx.font = fuente(12)
    ctx.fillText(opciones.subtitulo, u(16), u(49))
  }

  // El mapa, con el fondo o sin él.
  const y0 = alto.cabecera
  ctx.drawImage(!opciones.fondo && mapa.lienzoSinFondo ? mapa.lienzoSinFondo : mapa.lienzo, 0, y0)
  ctx.strokeStyle = "#cbd5e1"
  ctx.lineWidth = u(1)
  ctx.strokeRect(0, y0, ancho, mapa.lienzo.height)

  const caja = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "rgba(255,255,255,0.92)"
    ctx.strokeStyle = "#cbd5e1"
    ctx.lineWidth = u(1)
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, u(6))
    ctx.fill()
    ctx.stroke()
  }

  if (opciones.escalaYNorte) {
    // Escala: una barra de longitud redonda de unos 120 px de pantalla.
    const metrosPorPixelLamina = mapa.metrosPorPixel / escala
    const largoM = largoRedondoM(metrosPorPixelLamina * u(120))
    const largoPx = largoM / metrosPorPixelLamina
    const x = u(14)
    const y = y0 + mapa.lienzo.height - u(46)
    caja(x - u(6), y - u(8), largoPx + u(64), u(38))
    ctx.fillStyle = "#0f172a"
    ctx.fillRect(x, y + u(10), largoPx / 2, u(6))
    ctx.strokeStyle = "#0f172a"
    ctx.lineWidth = u(1)
    ctx.strokeRect(x, y + u(10), largoPx, u(6))
    ctx.font = fuente(10, 600)
    ctx.fillText("0", x - u(2), y + u(6))
    ctx.fillText(textoDeLargo(largoM), x + largoPx - u(8), y + u(6))
    // Norte, a la derecha de la escala.
    const nx = x + largoPx + u(36)
    const ny = y + u(12)
    ctx.beginPath()
    ctx.moveTo(nx, ny - u(12))
    ctx.lineTo(nx + u(7), ny + u(8))
    ctx.lineTo(nx, ny + u(4))
    ctx.lineTo(nx - u(7), ny + u(8))
    ctx.closePath()
    ctx.fillStyle = "#0f172a"
    ctx.fill()
    ctx.font = fuente(10, 700)
    ctx.textAlign = "center"
    ctx.fillText("N", nx, ny + u(20))
    ctx.textAlign = "left"
  }

  if (opciones.leyenda) {
    const filas: { texto: string; dibujar: (cx: number, cy: number) => void }[] = [
      {
        texto: "Cabecera central",
        dibujar: (cx, cy) => {
          ctx.beginPath()
          ctx.arc(cx, cy, u(6), 0, Math.PI * 2)
          ctx.fillStyle = "#ffffff"
          ctx.fill()
          ctx.lineWidth = u(2)
          ctx.strokeStyle = LAYER_COLORS.cabecera
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(cx, cy - u(3.5))
          ctx.lineTo(cx + u(3.5), cy + u(2.5))
          ctx.lineTo(cx - u(3.5), cy + u(2.5))
          ctx.closePath()
          ctx.fillStyle = LAYER_COLORS.cabecera
          ctx.fill()
        },
      },
      ...[...Object.entries(FUNCION_CUB_COLORS), ["Otro / sin dato", FUNCION_CUB_DEFAULT_COLOR] as const].map(([texto, color]) => ({
        texto,
        dibujar: (cx: number, cy: number) => {
          ctx.beginPath()
          ctx.arc(cx, cy, u(6), 0, Math.PI * 2)
          ctx.fillStyle = "#ffffff"
          ctx.fill()
          ctx.lineWidth = u(2)
          ctx.strokeStyle = color
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(cx - u(6), cy)
          ctx.lineTo(cx + u(6), cy)
          ctx.moveTo(cx, cy - u(6))
          ctx.lineTo(cx, cy + u(6))
          ctx.stroke()
        },
      })),
      {
        texto: "Fibra óptica",
        dibujar: (cx, cy) => {
          ctx.beginPath()
          ctx.moveTo(cx - u(8), cy)
          ctx.lineTo(cx + u(8), cy)
          ctx.lineWidth = u(3)
          ctx.strokeStyle = LAYER_COLORS.fiber
          ctx.stroke()
        },
      },
    ]
    const w = u(150)
    const h = u(26) + filas.length * u(18)
    const x = ancho - w - u(12)
    const y = y0 + mapa.lienzo.height - h - u(12)
    caja(x, y, w, h)
    ctx.fillStyle = "#64748b"
    ctx.font = fuente(9, 700)
    ctx.fillText("LEYENDA", x + u(10), y + u(16))
    filas.forEach((f, i) => {
      const cy = y + u(30) + i * u(18)
      f.dibujar(x + u(18), cy)
      ctx.fillStyle = "#0f172a"
      ctx.font = fuente(11)
      ctx.textBaseline = "middle"
      ctx.fillText(f.texto, x + u(32), cy)
      ctx.textBaseline = "alphabetic"
    })
  }

  // Pie.
  const yPie = y0 + mapa.lienzo.height
  ctx.fillStyle = "#f8fafc"
  ctx.fillRect(0, yPie, ancho, alto.pie)
  ctx.fillStyle = "#64748b"
  ctx.font = fuente(10)
  ctx.textBaseline = "middle"
  ctx.fillText("GISmart · SIG de red FTTH · G&G Technology SAS", u(16), yPie + alto.pie / 2)
  const derecha = [opciones.fondo ? opciones.atribucion : null, opciones.fecha].filter(Boolean).join("  ·  ")
  if (derecha) {
    ctx.textAlign = "right"
    ctx.fillText(derecha, ancho - u(16), yPie + alto.pie / 2)
    ctx.textAlign = "left"
  }
  ctx.textBaseline = "alphabetic"
  return lamina
}
