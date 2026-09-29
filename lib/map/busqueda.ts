/**
 * Búsqueda de elementos de la red por nombre, para el buscador de arriba.
 *
 * El buscador solo encontraba direcciones (Nominatim). Para ir a la cubierta
 * «3/4» o al cable «2109680» había que conocer la zona y buscarlos a ojo entre
 * cientos de símbolos. Ahora el mapa publica un índice de lo que tiene cargado
 * y aquí se filtra, sin preguntar a ningún servidor.
 *
 * También reconoce coordenadas («4.5333, -76.0883»): quien sale a campo trae
 * el punto del GPS, y antes esa búsqueda terminaba preguntándole a Nominatim.
 *
 * Son funciones puras: no tocan el mapa ni React, y se prueban solas
 * (`pnpm run busqueda`).
 */

export type TipoBuscable = "node" | "fiber" | "cabecera" | "zone"

export type ElementoBuscable = {
  /** Identifica el elemento dentro del mapa (el `getUid` de OpenLayers). */
  clave: string
  tipo: TipoBuscable
  /** Lo que se muestra y por lo que se busca primero. */
  nombre: string
  /** Una línea de contexto: nivel de la cubierta, hilos del cable… */
  detalle: string
  /** Otros textos por los que también se encuentra (código, UUID…). */
  alias?: string[]
  /** Nivel de la cubierta (Primer nivel, Segundo nivel…), para las listas por nivel. */
  categoria?: string
}

/** Minúsculas, sin tildes y con los espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Qué tan bien encaja un texto con la consulta: 0 igual, 1 empieza igual,
 * 2 alguna palabra empieza igual, 3 lo contiene; `null` si no aparece.
 */
function encaje(texto: string, consulta: string): number | null {
  const t = normalizar(texto)
  if (!t) return null
  if (t === consulta) return 0
  if (t.startsWith(consulta)) return 1
  if (t.split(/[\s·/\-_.]+/).some((palabra) => palabra.startsWith(consulta))) return 2
  if (t.includes(consulta)) return 3
  return null
}

/**
 * Los elementos que coinciden con la consulta, los mejores primero. Coincidir
 * por el nombre pesa más que por un alias; a igual encaje, el nombre más corto
 * (el más parecido a lo escrito) y luego el orden alfabético.
 */
export function buscarElementos(
  indice: readonly ElementoBuscable[],
  consulta: string,
  limite = 6,
): ElementoBuscable[] {
  const q = normalizar(consulta)
  if (!q) return []

  const encontrados: { elemento: ElementoBuscable; puntaje: number }[] = []
  for (const elemento of indice) {
    const porNombre = encaje(elemento.nombre, q)
    const porAlias = (elemento.alias ?? [])
      .map((a) => encaje(a, q))
      .filter((p): p is number => p !== null)
    const mejorAlias = porAlias.length ? Math.min(...porAlias) + 4 : null
    const puntaje = porNombre ?? mejorAlias
    if (puntaje !== null) encontrados.push({ elemento, puntaje })
  }

  return encontrados
    .sort(
      (a, b) =>
        a.puntaje - b.puntaje ||
        a.elemento.nombre.length - b.elemento.nombre.length ||
        a.elemento.nombre.localeCompare(b.elemento.nombre, "es", { numeric: true }),
    )
    .slice(0, limite)
    .map((e) => e.elemento)
}

export type Coordenada = { lat: number; lon: number }

// Dos números con punto decimal, separados por coma, punto y coma o espacios:
// «4.5333, -76.0883», «4.5333,-76.0883», «4.5333 -76.0883», «4.5333; -76.0883».
const CON_PUNTO = /^([-+]?\d+(?:\.\d+)?)\s*[,;\s]\s*([-+]?\d+(?:\.\d+)?)$/
// Con coma decimal (como se escribe en Colombia), separados por espacios o
// punto y coma: «4,5333 -76,0883», «4,5333; -76,0883».
const CON_COMA = /^([-+]?\d+(?:,\d+)?)\s*(?:;|\s)\s*([-+]?\d+(?:,\d+)?)$/

/**
 * La coordenada escrita en el buscador, o `null` si no es una. Se lee como
 * latitud, longitud (el orden de Google Maps y del GPS); si el primer número
 * no cabe como latitud y el segundo sí, se entiende al revés. Para no
 * confundir un código con una coordenada, al menos uno de los dos números debe
 * llevar decimales o signo.
 */
export function leerCoordenada(texto: string): Coordenada | null {
  const limpio = texto.replace(/°/g, "").trim()
  const partes = CON_PUNTO.exec(limpio) ?? CON_COMA.exec(limpio)
  if (!partes) return null
  const [a, b] = [partes[1], partes[2]]
  if (![a, b].some((n) => /[.,]|^[-+]/.test(n))) return null

  const x = Number(a.replace(",", "."))
  const y = Number(b.replace(",", "."))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (Math.abs(x) <= 90 && Math.abs(y) <= 180) return { lat: x, lon: y }
  if (Math.abs(y) <= 90 && Math.abs(x) <= 180) return { lat: y, lon: x }
  return null
}

/** «4.53330, -76.08830»: cinco decimales, cerca de un metro. */
export function textoDeCoordenada({ lat, lon }: Coordenada): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}
