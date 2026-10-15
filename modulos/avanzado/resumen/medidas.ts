/**
 * Medidas de lo que se ve en pantalla, sin depender del mapa: coordenadas en
 * Web Mercator (EPSG:3857, las del mapa) y distancias en metros sobre la Tierra.
 */

const RADIO_TIERRA_M = 6_371_008.8
const R_MERCATOR = 6_378_137

/** De Web Mercator a longitud y latitud, en grados. */
export function aLonLat([x, y]: number[]): [number, number] {
  const lon = (x / R_MERCATOR) * (180 / Math.PI)
  const lat = (2 * Math.atan(Math.exp(y / R_MERCATOR)) - Math.PI / 2) * (180 / Math.PI)
  return [lon, lat]
}

/** Distancia en metros entre dos puntos (longitud, latitud) sobre la esfera. */
export function distanciaM([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * El pedazo del segmento a–b que cae dentro del rectángulo
 * `[minX, minY, maxX, maxY]` (recorte de Liang–Barsky), o `null` si no toca.
 */
export function recortarSegmento(a: number[], b: number[], [minX, minY, maxX, maxY]: number[]): [number[], number[]] | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = 0
  let t1 = 1
  const p = [-dx, dx, -dy, dy]
  const q = [a[0] - minX, maxX - a[0], a[1] - minY, maxY - a[1]]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null
      continue
    }
    const r = q[i] / p[i]
    if (p[i] < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ]
}

/**
 * Metros de las líneas (cada una, una lista de puntos en Web Mercator) que
 * quedan dentro del rectángulo. Así «km en pantalla» es lo que se ve, no el
 * largo entero de cada cable que asoma por un borde.
 */
export function largoDentroM(lineas: number[][][], extension: number[]): number {
  let total = 0
  for (const linea of lineas) {
    for (let i = 0; i + 1 < linea.length; i++) {
      const tramo = recortarSegmento(linea[i], linea[i + 1], extension)
      if (tramo) total += distanciaM(aLonLat(tramo[0]), aLonLat(tramo[1]))
    }
  }
  return total
}
