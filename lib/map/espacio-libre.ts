/** Un recuadro en píxeles de pantalla: el de una ventana que tapa parte del mapa. */
export type Recuadro = { top: number; left: number; right: number; bottom: number }

/** Una zona del mapa, en sus píxeles (0, 0 es su esquina de arriba a la izquierda). */
export type Zona = { x0: number; y0: number; x1: number; y1: number }

/**
 * El espacio del mapa que deja libre una ventana encima: de los cuatro que
 * quedan alrededor (arriba, abajo, a la izquierda y a la derecha), el más
 * grande que mida al menos `minimo` de ancho y de alto. Si la ventana no toca
 * el mapa o ninguno alcanza, el mapa entero.
 *
 * `caja` es el recuadro del mapa en pantalla (`getBoundingClientRect`).
 */
export function espacioLibre(
  caja: { left: number; top: number; width: number; height: number },
  ventana: Recuadro | undefined,
  minimo: { ancho: number; alto: number },
): Zona {
  const todo = { x0: 0, y0: 0, x1: caja.width, y1: caja.height }
  if (!ventana) return todo
  const v = {
    x0: Math.max(0, ventana.left - caja.left),
    y0: Math.max(0, ventana.top - caja.top),
    x1: Math.min(caja.width, ventana.right - caja.left),
    y1: Math.min(caja.height, ventana.bottom - caja.top),
  }
  if (v.x0 >= v.x1 || v.y0 >= v.y1) return todo
  const area = (z: Zona) => (z.x1 - z.x0) * (z.y1 - z.y0)
  const libres = [
    { x0: 0, y0: 0, x1: caja.width, y1: v.y0 },
    { x0: 0, y0: v.y1, x1: caja.width, y1: caja.height },
    { x0: 0, y0: 0, x1: v.x0, y1: caja.height },
    { x0: v.x1, y0: 0, x1: caja.width, y1: caja.height },
  ].filter((z) => z.x1 - z.x0 >= minimo.ancho && z.y1 - z.y0 >= minimo.alto)
  return libres.sort((a, b) => area(b) - area(a))[0] ?? todo
}

/**
 * El margen para `view.fit` (arriba, derecha, abajo, izquierda) que deja lo
 * encuadrado dentro de esa zona: 50 px contra el borde del mapa, como lo
 * definió el ingeniero, y 24 px contra el borde de la ventana.
 */
export function margenParaZona(caja: { width: number; height: number }, zona: Zona): [number, number, number, number] {
  const margen = (hastaElBorde: number) => Math.round(hastaElBorde <= 0 ? 50 : hastaElBorde + 24)
  return [margen(zona.y0), margen(caja.width - zona.x1), margen(caja.height - zona.y1), margen(zona.x0)]
}
