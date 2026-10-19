/**
 * El formato de las respuestas del asistente: lo poco de Markdown que usa
 * Gemini (negritas, código, listas con viñetas o numeradas, títulos y tablas)
 * convertido en bloques, sin HTML de por medio, y los nombres de la red que
 * aparecen en el texto (CO19, el cable 2103630, 13/14…) marcados para que un
 * click lleve el mapa hasta ellos. Va aparte del panel para probarlo sin el
 * navegador.
 */

export type Trozo = {
  texto: string
  negrita?: boolean
  cursiva?: boolean
  codigo?: boolean
  /** Si es un elemento del mapa: su clave, para llevar el mapa hasta él. */
  clave?: string
}

export type ItemDeLista = { trozos: Trozo[]; nivel: number; numero?: number }

export type Bloque =
  | { tipo: "parrafo"; trozos: Trozo[] }
  | { tipo: "titulo"; trozos: Trozo[] }
  | { tipo: "lista"; ordenada: boolean; items: ItemDeLista[] }
  | { tipo: "tabla"; cabecera: Trozo[][] | null; filas: Trozo[][][] }

/** «**negrita**», «`código`» y «*cursiva*» dentro de una línea. */
export function trozosDeLinea(linea: string): Trozo[] {
  const trozos: Trozo[] = []
  for (const parte of linea.split(/(\*\*[^*]+\*\*|`[^`]+`|(?<![\w*])\*[^*\s][^*]*?\*(?![\w*]))/g)) {
    if (!parte) continue
    if (parte.length > 4 && parte.startsWith("**") && parte.endsWith("**")) trozos.push({ texto: parte.slice(2, -2), negrita: true })
    else if (parte.length > 2 && parte.startsWith("`") && parte.endsWith("`")) trozos.push({ texto: parte.slice(1, -1), codigo: true })
    else if (parte.length > 2 && parte.startsWith("*") && parte.endsWith("*")) trozos.push({ texto: parte.slice(1, -1), cursiva: true })
    else trozos.push({ texto: parte })
  }
  return trozos
}

const FILA_DE_TABLA = /^\s*\|.*\|?\s*$/
const SEPARADOR_DE_TABLA = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const VINETA = /^(\s*)[-*•]\s+(.*)$/
const NUMERO = /^(\s*)(\d{1,3})[.)]\s+(.*)$/
const TITULO = /^\s*#{1,6}\s+(.*)$/

function celdas(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim())
}

/** El texto de la respuesta, en bloques: párrafos, títulos, listas y tablas. */
export function bloquesDe(texto: string): Bloque[] {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n")
  const bloques: Bloque[] = []
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    if (!linea.trim()) continue

    if (FILA_DE_TABLA.test(linea) && linea.trim().startsWith("|")) {
      const filas: string[] = []
      while (i < lineas.length && lineas[i].trim().startsWith("|")) filas.push(lineas[i++])
      i--
      const conCabecera = filas.length > 1 && SEPARADOR_DE_TABLA.test(filas[1])
      const cuerpo = (conCabecera ? filas.slice(2) : filas).filter((f) => !SEPARADOR_DE_TABLA.test(f))
      bloques.push({
        tipo: "tabla",
        cabecera: conCabecera ? celdas(filas[0]).map(trozosDeLinea) : null,
        filas: cuerpo.map((f) => celdas(f).map(trozosDeLinea)),
      })
      continue
    }

    const titulo = TITULO.exec(linea)
    if (titulo) {
      bloques.push({ tipo: "titulo", trozos: trozosDeLinea(titulo[1].replace(/^\*\*(.*)\*\*$/, "$1")) })
      continue
    }

    const vineta = VINETA.exec(linea)
    const numero = vineta ? null : NUMERO.exec(linea)
    if (vineta || numero) {
      const ordenada = Boolean(numero)
      const item: ItemDeLista = vineta
        ? { trozos: trozosDeLinea(vineta[2]), nivel: Math.min(3, Math.floor(vineta[1].length / 2)) }
        : { trozos: trozosDeLinea(numero![3]), nivel: Math.min(3, Math.floor(numero![1].length / 2)), numero: Number(numero![2]) }
      const anterior = bloques.at(-1)
      // Una sublista con viñetas dentro de una numerada (o al revés) sigue en la misma lista.
      if (anterior?.tipo === "lista" && (anterior.ordenada === ordenada || item.nivel > 0)) anterior.items.push(item)
      else bloques.push({ tipo: "lista", ordenada, items: [item] })
      continue
    }

    bloques.push({ tipo: "parrafo", trozos: trozosDeLinea(linea) })
  }
  return bloques
}

/**
 * Lo que en el texto puede ser el nombre de un elemento de la red: una
 * etiqueta con letras y número (CO19), un código de cable (6 a 9 cifras),
 * «13/14» o «7-ago». Un número suelto corto (185, 13) no: es una cifra.
 */
const CANDIDATO =
  /(?<![\p{L}\p{N}/-])(\p{L}{1,5}\d{1,4}\p{L}?|\d{6,9}|\d{1,3}\/\d{1,3}|\d{1,2}-\p{L}{3})(?![\p{L}\p{N}/])/gu

/**
 * Marca los nombres de la red dentro de los trozos. `buscar` devuelve la clave
 * del elemento si el nombre corresponde a uno solo del mapa (con dos «N1», no
 * hay a cuál llevar, y no se marca). Una negrita entera que es un nombre
 * («**HUB LA UNION**») también se marca. El código no se toca.
 */
export function enlazarTrozos(trozos: Trozo[], buscar: (nombre: string) => string | null): Trozo[] {
  const salida: Trozo[] = []
  for (const t of trozos) {
    if (t.codigo || t.clave) {
      salida.push(t)
      continue
    }
    if (t.negrita) {
      const clave = buscar(t.texto.trim())
      if (clave) {
        salida.push({ ...t, clave })
        continue
      }
    }
    let desde = 0
    for (const m of t.texto.matchAll(CANDIDATO)) {
      const clave = buscar(m[1])
      if (!clave) continue
      const inicio = m.index ?? 0
      if (inicio > desde) salida.push({ ...t, texto: t.texto.slice(desde, inicio) })
      salida.push({ ...t, texto: m[1], clave })
      desde = inicio + m[1].length
    }
    if (desde < t.texto.length) salida.push(desde === 0 ? t : { ...t, texto: t.texto.slice(desde) })
  }
  return salida
}
