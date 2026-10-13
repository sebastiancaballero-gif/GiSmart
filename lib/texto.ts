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

/** Caracteres de control y de formato (invisibles). */
const INVISIBLES = /[\p{Cc}\p{Cf}]/gu

/** El texto sin lo que no se ve: saltos y tabuladores pasan a espacio, lo demás se quita. */
export function sinInvisibles(texto: string): string {
  return texto.replace(ESPACIOS_DE_CONTROL, " ").replace(INVISIBLES, "")
}

/** Si el texto trae caracteres de control o de formato. */
export function tieneInvisibles(texto: string): boolean {
  return /[\p{Cc}\p{Cf}]/u.test(texto)
}

/** Lo más largo que puede ser el nombre de un elemento del mapa. */
export const MAX_NOMBRE = 80

/** Un nombre de elemento mientras se escribe: sin invisibles y con su tope. */
export function limpiarNombre(texto: string): string {
  return sinInvisibles(texto).slice(0, MAX_NOMBRE)
}
