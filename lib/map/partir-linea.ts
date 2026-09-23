/**
 * Parte una línea en dos mitades de igual largo, para pintar un cable en dos
 * colores: el tramo junto a la mufa de donde sale y el tramo junto a la mufa a
 * la que entra.
 *
 * Trabaja sobre coordenadas planas (las del mapa), sin depender de
 * OpenLayers, para poder probarla sola.
 */

export type Coordenada = number[]

function distancia(a: Coordenada, b: Coordenada): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/**
 * Devuelve las dos mitades, la primera desde el inicio de la línea. El punto
 * medio queda en las dos, para que no haya hueco entre los colores.
 */
export function partirPorLaMitad(coordenadas: Coordenada[]): [Coordenada[], Coordenada[]] {
  if (coordenadas.length < 2) return [coordenadas, coordenadas]

  const tramos: number[] = []
  for (let i = 1; i < coordenadas.length; i++) tramos.push(distancia(coordenadas[i - 1], coordenadas[i]))
  const mitad = tramos.reduce((a, b) => a + b, 0) / 2

  let recorrido = 0
  for (let i = 0; i < tramos.length; i++) {
    if (recorrido + tramos[i] >= mitad) {
      // El punto medio cae en este tramo: se interpola dentro de él.
      const fraccion = tramos[i] === 0 ? 0 : (mitad - recorrido) / tramos[i]
      const a = coordenadas[i]
      const b = coordenadas[i + 1]
      const medio = [a[0] + (b[0] - a[0]) * fraccion, a[1] + (b[1] - a[1]) * fraccion]
      return [
        [...coordenadas.slice(0, i + 1), medio],
        [medio, ...coordenadas.slice(i + 1)],
      ]
    }
    recorrido += tramos[i]
  }
  return [coordenadas, [coordenadas[coordenadas.length - 1]]]
}

/**
 * Ordena la línea para que empiece en la punta más cercana a `desde`. Los
 * cables no siempre están dibujados en el sentido de la señal, así que antes
 * de partir hay que saber qué punta es la de salida.
 */
export function orientarDesde(coordenadas: Coordenada[], desde: Coordenada): Coordenada[] {
  if (coordenadas.length < 2) return coordenadas
  const alInicio = distancia(coordenadas[0], desde)
  const alFinal = distancia(coordenadas[coordenadas.length - 1], desde)
  return alInicio <= alFinal ? coordenadas : [...coordenadas].reverse()
}
