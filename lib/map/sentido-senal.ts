/**
 * Hacia dónde va la señal en cada cable: desde la cabecera hacia los usuarios.
 *
 * No se toma del sentido en que se dibujó el cable: en septiembre de 2026, 147
 * de los 182 estaban dibujados al revés (ver docs/base-de-datos.md). En octubre
 * los 173 a los que se llega desde la cabecera ya van bien, pero así no depende
 * de cómo se dibuje el próximo. Se recorre la red desde la cabecera por los
 * extremos de los cables (`id_elem_from`, `id_elem_to`): en cada cable, la
 * señal va del extremo más cercano a la cabecera al más lejano.
 *
 * Un cable al que no se llega desde la cabecera, o cuyos dos extremos quedan a
 * la misma distancia (un anillo), no tiene sentido conocido y no lleva flechas.
 */

export type CableDeLaRed = {
  /** Clave del cable en el mapa. */
  clave: string
  desde: string | null
  hasta: string | null
}

/**
 * `1` si la señal va como se dibujó el cable (de `desde` a `hasta`), `-1` si va
 * al revés. Los cables sin sentido conocido no están en el resultado.
 */
export function sentidoDeLaSenal(cables: CableDeLaRed[], origenes: string[]): Map<string, 1 | -1> {
  // Cada elemento (cubierta o cabecera) con los cables que llegan a él.
  const vecinos = new Map<string, string[]>()
  const unir = (a: string, b: string) => {
    const lista = vecinos.get(a)
    if (lista) lista.push(b)
    else vecinos.set(a, [b])
  }
  for (const { desde, hasta } of cables) {
    if (!desde || !hasta || desde === hasta) continue
    unir(desde, hasta)
    unir(hasta, desde)
  }

  // Distancia en saltos desde la cabecera (búsqueda en anchura).
  const distancia = new Map<string, number>()
  let frente = origenes.filter((o) => vecinos.has(o))
  for (const o of frente) distancia.set(o, 0)
  for (let paso = 1; frente.length > 0; paso++) {
    const siguiente: string[] = []
    for (const elemento of frente) {
      for (const vecino of vecinos.get(elemento) ?? []) {
        if (distancia.has(vecino)) continue
        distancia.set(vecino, paso)
        siguiente.push(vecino)
      }
    }
    frente = siguiente
  }

  const sentidos = new Map<string, 1 | -1>()
  for (const { clave, desde, hasta } of cables) {
    if (!desde || !hasta) continue
    const a = distancia.get(desde)
    const b = distancia.get(hasta)
    if (a === undefined || b === undefined || a === b) continue
    sentidos.set(clave, a < b ? 1 : -1)
  }
  return sentidos
}
