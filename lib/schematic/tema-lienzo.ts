/**
 * Colores y tipografía del lienzo de JointJS.
 *
 * El esquema se dibuja en SVG, así que no puede usar clases de Tailwind: los
 * valores de cada tema son los de la paleta de Tailwind escritos a mano
 * (`slate-950`, `cyan-400`...), para que el lienzo case con la interfaz que lo
 * rodea. Las fuentes son pilas del sistema y no la Inter de `next/font`: el SVG
 * exportado a PDF se dibuja fuera de la página y no ve sus fuentes web.
 */
export type TemaLienzo = {
  oscuro: boolean
  /** Fondo del lienzo, detrás de las tarjetas. */
  fondo: string
  /** Puntos de la grilla del fondo. */
  grilla: string
  /** Fondo de cada tarjeta (cable o bandeja). */
  superficie: string
  borde: string
  texto: string
  textoSuave: string
  acentoEntrada: string
  acentoSalida: string
  /**
   * Borde opaco de las tarjetas de cable. Es el acento oscurecido: identifica
   * el rol sin el brillo del neón, que en tarjetas de 3.000 px de alto saturaba.
   */
  bordeEntrada: string
  bordeSalida: string
  acentoBandeja: string
  /** Color de las etiquetas de trazabilidad (`[SRC::…]`). */
  acentoTraza: string
  sombra: string
  /**
   * Con neón, el borde de cada tarjeta es de su color de acento y la sombra es
   * un resplandor de ese color, no una sombra gris debajo.
   */
  neon: boolean
  radioEsquina: number
  fuente: string
  fuenteMono: string
}

const FUENTE_MONO =
  'ui-monospace, "Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, Menlo, monospace'

/** Tema de las tarjetas del mapa de red, que comparte las formas con la mufa. */
export const TEMA_CLARO: TemaLienzo = {
  oscuro: false,
  fondo: "#f1f5f9",
  grilla: "#e2e8f0",
  superficie: "#ffffff",
  borde: "#e2e8f0",
  texto: "#1e293b",
  textoSuave: "#64748b",
  acentoEntrada: "#2563eb",
  acentoSalida: "#0ea5e9",
  bordeEntrada: "#e2e8f0",
  bordeSalida: "#e2e8f0",
  acentoBandeja: "#ea580c",
  acentoTraza: "#0e7490",
  sombra: "#0f172a",
  neon: false,
  radioEsquina: 14,
  // La página carga Inter con `next/font`, que le pone un nombre interno:
  // heredando, el texto usa la misma tipografía que el resto de la interfaz.
  fuente: "inherit",
  fuenteMono: "inherit",
}

/**
 * Tema oscuro limpio del esquema: fondo `slate-900`, tarjetas `slate-800` y
 * texto claro. Sin resplandor de neón, para que el interruptor de tema solo
 * cambie la luminosidad.
 */
export const TEMA_OSCURO: TemaLienzo = {
  oscuro: true,
  fondo: "#0f172a",
  grilla: "#334155",
  superficie: "#1e293b",
  borde: "#334155",
  texto: "#f8fafc",
  textoSuave: "#94a3b8",
  acentoEntrada: "#38bdf8",
  acentoSalida: "#818cf8",
  bordeEntrada: "#334155",
  bordeSalida: "#334155",
  acentoBandeja: "#fb923c",
  acentoTraza: "#67e8f9",
  sombra: "#020617",
  neon: false,
  radioEsquina: 10,
  fuente: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  fuenteMono: FUENTE_MONO,
}

/**
 * Tema de ingeniería oscuro del esquema de la mufa: `slate-950` de fondo,
 * tarjetas `slate-900` y un acento de neón por rol (cian la entrada, fucsia la
 * salida, ámbar las bandejas). Los cables y sus buffers no proyectan resplandor:
 * borde opaco y limpio. El brillo se reserva a las bandejas y a la fusión
 * resaltada. Los textos son `slate-100`/`slate-400` para que el contraste no
 * dependa del neón.
 */
export const TEMA_CYBER: TemaLienzo = {
  oscuro: true,
  fondo: "#020617",
  grilla: "#1e293b",
  superficie: "#0f172a",
  borde: "#1e293b",
  texto: "#f1f5f9",
  textoSuave: "#94a3b8",
  acentoEntrada: "#22d3ee",
  acentoSalida: "#e879f9",
  // cyan-800 / fuchsia-800
  bordeEntrada: "#155e75",
  bordeSalida: "#86198f",
  acentoBandeja: "#fbbf24",
  acentoTraza: "#67e8f9",
  sombra: "#000000",
  neon: true,
  radioEsquina: 6,
  fuente: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  fuenteMono: FUENTE_MONO,
}

/** Luminancia relativa (WCAG) de un color `#rrggbb`. */
function luminancia(hex: string): number {
  const valor = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1]
  if (!valor) return 0.5
  const canal = (inicio: number) => {
    const c = parseInt(valor.slice(inicio, inicio + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4)
}

/**
 * Contorno que necesita un hilo para verse sobre la tarjeta. El hilo blanco
 * desaparece en modo claro y el negro en modo oscuro; los demás colores se
 * leen bien solos y un contorno gris solo los ensucia.
 */
export function contornoHilo(hex: string, tema: TemaLienzo): string | null {
  const l = luminancia(hex)
  if (!tema.oscuro && l > 0.75) return "#94a3b8"
  if (tema.oscuro && l < 0.05) return "#64748b"
  return null
}

/**
 * Sombra de tarjeta. Con neón es un resplandor del color de acento, el
 * equivalente a `shadow-[0_0_15px_rgba(6,182,212,0.3)]`; sin neón, una sombra
 * suave tipo `shadow-md`.
 */
export function sombraTarjeta(tema: TemaLienzo, acento: string) {
  return tema.neon
    ? { name: "dropShadow" as const, args: { dx: 0, dy: 0, blur: 9, color: acento, opacity: 0.32 } }
    : {
        name: "dropShadow" as const,
        args: { dx: 0, dy: 2, blur: 6, color: tema.sombra, opacity: tema.oscuro ? 0.45 : 0.1 },
      }
}
