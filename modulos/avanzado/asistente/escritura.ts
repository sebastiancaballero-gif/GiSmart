import type { AccionDelAsistente } from "./acciones"

/**
 * Lo que necesita la animación de las respuestas del asistente: el texto que
 * se va escribiendo y las fichas de lo que hizo en el mapa. Va aparte del
 * panel para poder probarlo sin el navegador.
 */

/** Cuánto tarda en escribirse una respuesta de `largo` caracteres: rápida si es corta y nunca más de 2 s. */
export function duracionDeEscritura(largo: number): number {
  return Math.round(Math.min(2_000, Math.max(450, largo * 12)))
}

/**
 * Los primeros `n` caracteres, completando la palabra en curso (no se ve
 * media palabra) y cerrando una negrita abierta, para que «**185» se vea en
 * negrita mientras llega el resto y no con los asteriscos.
 */
export function cortarTexto(texto: string, n: number): string {
  if (n >= texto.length) return texto
  if (n <= 0) return ""
  let fin = n
  while (fin < texto.length && !/\s/.test(texto[fin])) fin++
  let parte = texto.slice(0, fin)
  if ((parte.match(/\*\*/g)?.length ?? 0) % 2 === 1) parte += "**"
  return parte
}

export type FichaDeAccion = { tipo: "mapa" | "seleccion" | "trace"; texto: string }

/** Cómo se lee en el panel lo que el asistente hizo en el mapa. */
export function describirAccion(accion: AccionDelAsistente): FichaDeAccion {
  switch (accion.tipo) {
    case "mostrar":
      return { tipo: "mapa", texto: `Mapa en ${accion.nombre}` }
    case "seleccionar": {
      if (accion.nivel) {
        const nivel = accion.nivel.trim().toLowerCase()
        return { tipo: "seleccion", texto: `Cubiertas de ${/nivel|empalme/.test(nivel) ? nivel : `${nivel} nivel`} seleccionadas` }
      }
      const n = accion.nombres.length
      const que = accion.capa === "cable" ? (n === 1 ? "cable" : "cables") : n === 1 ? "cubierta" : "cubiertas"
      return { tipo: "seleccion", texto: `${n} ${que} en la tabla` }
    }
    case "trace":
      return { tipo: "trace", texto: `Trace ${accion.direccion === "UPSTREAM" ? "hacia la fuente" : "hacia abajo"}` }
    case "cercania": {
      // «Calle 12, La Unión, Valle del Cauca, …» → «Calle 12»: lo demás ya se sabe.
      const lugar = accion.etiqueta.split(",")[0].trim().slice(0, 32)
      return { tipo: "mapa", texto: `${accion.radioM} m alrededor de ${lugar}` }
    }
  }
}
