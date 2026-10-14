/**
 * Limpieza de lo que se escribe o se pega en los campos.
 *
 * Al pegar desde Excel, un correo o un PDF suelen venir caracteres que no se
 * ven: saltos de línea, tabuladores, el carácter nulo, marcas de dirección
 * (U+202E da vuelta el texto que sigue) o espacios de ancho cero. En un nombre
 * o en una búsqueda no sirven para nada y confunden: el texto se ve igual pero
 * no coincide, o se muestra al revés.
 */

/** Saltos de línea y tabuladores: se cambian por un espacio. */
const ESPACIOS_DE_CONTROL = /[\t\n\r\v\f]+/g

/**
 * Caracteres de control y de formato (invisibles), menos los que arman
 * emojis: el ZWJ (U+200D) une 👨‍👩‍👧 y las etiquetas (U+E0020–E007F) arman
 * banderas. Quitarlos partía esos emojis en varios.
 */
const INVISIBLES = /(?![\u200D\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}]/gu

/** El texto sin lo que no se ve: saltos y tabuladores pasan a espacio, lo demás se quita. */
export function sinInvisibles(texto: string): string {
  return texto.replace(ESPACIOS_DE_CONTROL, " ").replace(INVISIBLES, "")
}

/** Si el texto trae caracteres de control o de formato (aquí sí cuenta el ZWJ: en un nombre de usuario no va). */
export function tieneInvisibles(texto: string): boolean {
  return /[\p{Cc}\p{Cf}]/u.test(texto)
}

/** Lo más largo que puede ser el nombre de un elemento del mapa. */
export const MAX_NOMBRE = 80

/**
 * Un nombre de elemento mientras se escribe: sin invisibles y con su tope,
 * contado en caracteres que se ven (cortar por unidades de texto dejaba medio
 * emoji al final).
 */
export function limpiarNombre(texto: string): string {
  const limpio = sinInvisibles(texto)
  if (typeof Intl === "undefined" || !("Segmenter" in Intl)) return [...limpio].slice(0, MAX_NOMBRE).join("")
  let nombre = ""
  let cuantos = 0
  for (const { segment } of new Intl.Segmenter("es", { granularity: "grapheme" }).segment(limpio)) {
    if (cuantos++ >= MAX_NOMBRE) break
    nombre += segment
  }
  return nombre
}
