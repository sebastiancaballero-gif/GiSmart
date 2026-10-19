/**
 * Las sugerencias de seguimiento: Gemini termina cada respuesta con una línea
 * «Sugerencias: … | … | …» (ver INSTRUCCIONES en servidor/herramientas.ts) y
 * aquí se separa del texto, que se ve sin ella. Si no la pone, o la pone de
 * otra forma (como lista), igual se entiende; si no hay, no hay botones.
 */

const MAXIMO = 3
const LARGO_MAXIMO = 100

export function separarSugerencias(texto: string): { texto: string; sugerencias: string[] } {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n")
  // La última línea que empieza por «Sugerencias:» (con o sin negrita o viñeta).
  let desde = -1
  for (let i = lineas.length - 1; i >= 0; i--) {
    if (/^\s*(?:[-*•]\s*)?\**\s*sugerencias?\s*\**\s*:/i.test(lineas[i])) {
      desde = i
      break
    }
  }
  if (desde === -1) return { texto: texto.trim(), sugerencias: [] }

  const resto = [lineas[desde].replace(/^\s*(?:[-*•]\s*)?\**\s*sugerencias?\s*\**\s*:\s*\**/i, ""), ...lineas.slice(desde + 1)].join("\n")
  const sugerencias = resto
    .split(/\s*\|\s*|\n/)
    .map((s) =>
      s
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/\*\*/g, "")
        .replace(/^["«“]|["»”]$/g, "")
        .trim(),
    )
    .filter((s) => s.length >= 3 && s.length <= LARGO_MAXIMO)
  return {
    texto: lineas.slice(0, desde).join("\n").trim(),
    sugerencias: [...new Set(sugerencias)].slice(0, MAXIMO),
  }
}
