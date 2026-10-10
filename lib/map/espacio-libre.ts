/** Un recuadro en píxeles de pantalla: el de una ventana que tapa parte del mapa. */
export type Recuadro = { top: number; left: number; right: number; bottom: number }

/** Una zona del mapa, en sus píxeles (0, 0 es su esquina de arriba a la izquierda). */
export type Zona = { x0: number; y0: number; x1: number; y1: number }

type CajaDelMapa = { left: number; top: number; width: number; height: number }

const area = (z: Zona) => (z.x1 - z.x0) * (z.y1 - z.y0)

/** Lo que el recuadro tapa del mapa, en píxeles del mapa; `null` si no lo toca. */
function enElMapa(caja: CajaDelMapa, r: Recuadro): Zona | null {
  const z = {
    x0: Math.max(0, r.left - caja.left),
    y0: Math.max(0, r.top - caja.top),
    x1: Math.min(caja.width, r.right - caja.left),
    y1: Math.min(caja.height, r.bottom - caja.top),
  }
  return z.x0 < z.x1 && z.y0 < z.y1 ? z : null
}

/** Lo que queda de la zona a cada lado de la tapa (si no se tocan, la zona entera). */
function sinLaTapa(z: Zona, t: Zona): Zona[] {
  if (t.x1 <= z.x0 || t.x0 >= z.x1 || t.y1 <= z.y0 || t.y0 >= z.y1) return [z]
  return [
    { ...z, x1: t.x0 },
    { ...z, x0: t.x1 },
    { ...z, y1: t.y0 },
    { ...z, y0: t.y1 },
  ].filter((p) => p.x0 < p.x1 && p.y0 < p.y1)
}

/**
 * El espacio del mapa (en sus píxeles) donde se ve lo que se encuadra: de los
 * cuatro que deja libres la ventana (arriba, abajo, a la izquierda y a la
 * derecha), el más grande que mida al menos `minimo` de ancho y de alto, y
 * que además esquive lo demás que flota sobre el mapa (`otras`: herramientas,
 * leyenda, ficha del elemento, controles).
 *
 * Si nada alcanza esquivándolo todo, el que solo esquiva la ventana; si
 * tampoco, el mapa entero. `caja` es el recuadro del mapa en pantalla.
 */
export function espacioLibre(
  caja: CajaDelMapa,
  ventana: Recuadro | undefined,
  minimo: { ancho: number; alto: number },
  otras: Recuadro[] = [],
): Zona {
  const todo = { x0: 0, y0: 0, x1: caja.width, y1: caja.height }
  const alcanza = (z: Zona) => z.x1 - z.x0 >= minimo.ancho && z.y1 - z.y0 >= minimo.alto
  const mayor = (zonas: Zona[]) => zonas.filter(alcanza).sort((a, b) => area(b) - area(a))[0]

  const v = ventana ? enElMapa(caja, ventana) : null
  const alrededor = v
    ? [
        { x0: 0, y0: 0, x1: caja.width, y1: v.y0 },
        { x0: 0, y0: v.y1, x1: caja.width, y1: caja.height },
        { x0: 0, y0: 0, x1: v.x0, y1: caja.height },
        { x0: v.x1, y0: 0, x1: caja.width, y1: caja.height },
      ].filter((z) => z.x0 < z.x1 && z.y0 < z.y1)
    : [todo]

  let zonas = alrededor.filter(alcanza)
  for (const tapa of otras.flatMap((r) => enElMapa(caja, r) ?? [])) {
    const vistas = new Set<string>()
    zonas = zonas
      .flatMap((z) => sinLaTapa(z, tapa))
      .filter((z) => {
        const clave = `${z.x0},${z.y0},${z.x1},${z.y1}`
        if (!alcanza(z) || vistas.has(clave)) return false
        vistas.add(clave)
        return true
      })
  }
  return mayor(zonas) ?? mayor(alrededor) ?? todo
}

/**
 * El margen para `view.fit` (arriba, derecha, abajo, izquierda) que deja lo
 * encuadrado dentro de esa zona: 50 px contra el borde del mapa, como lo
 * definió el ingeniero, y 24 px contra el borde de lo que la tapa.
 */
export function margenParaZona(caja: { width: number; height: number }, zona: Zona): [number, number, number, number] {
  const margen = (hastaElBorde: number) => Math.round(hastaElBorde <= 0 ? 50 : hastaElBorde + 24)
  return [margen(zona.y0), margen(caja.width - zona.x1), margen(caja.height - zona.y1), margen(zona.x0)]
}
