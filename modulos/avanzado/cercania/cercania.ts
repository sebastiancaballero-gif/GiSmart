import type { ElementoDelMapa } from "@/components/network-map"
import { aLonLat, distanciaM } from "../resumen/medidas"

const R_MERCATOR = 6_378_137

/** De longitud y latitud a Web Mercator (las coordenadas del mapa). */
export function aMercator([lon, lat]: [number, number]): [number, number] {
  const x = (lon * Math.PI * R_MERCATOR) / 180
  const y = R_MERCATOR * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  return [x, y]
}

/** El punto del segmento a–b más cercano a p (todo en Web Mercator). */
function masCercanoEnSegmento(p: number[], a: number[], b: number[]): number[] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const largo2 = dx * dx + dy * dy
  if (largo2 === 0) return a
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2))
  return [a[0] + t * dx, a[1] + t * dy]
}

/**
 * Metros desde el punto (longitud, latitud) hasta el elemento: hasta la
 * cubierta o cabecera, o hasta el punto más cercano de la línea de un cable.
 * `null` si el elemento no tiene geometría que medir.
 */
export function distanciaAlElementoM(centro: [number, number], e: ElementoDelMapa): number | null {
  if (e.punto) return distanciaM(centro, e.punto)
  if (!e.lineas?.length) return null
  const p = aMercator(centro)
  let mejor = Infinity
  for (const linea of e.lineas) {
    if (linea.length === 1) mejor = Math.min(mejor, distanciaM(centro, aLonLat(linea[0])))
    for (let i = 0; i + 1 < linea.length; i++) {
      const cercano = masCercanoEnSegmento(p, linea[i], linea[i + 1])
      mejor = Math.min(mejor, distanciaM(centro, aLonLat(cercano)))
    }
  }
  return Number.isFinite(mejor) ? mejor : null
}

export type Cercano = { elemento: ElementoDelMapa; distanciaM: number }

export type ResultadoDeCercania = {
  cubiertas: Cercano[]
  cables: Cercano[]
  cabeceras: Cercano[]
}

/**
 * Lo que está a `radioM` metros o menos del punto, de lo más cercano a lo más
 * lejano. Solo lo pintado (capa encendida y filtro): lo mismo que se ve dentro
 * del círculo.
 */
export function cercanos(elementos: ElementoDelMapa[], centro: [number, number], radioM: number): ResultadoDeCercania {
  const dentro = (tipo: ElementoDelMapa["tipo"]) =>
    elementos
      .filter((e) => e.tipo === tipo && e.visible)
      .map((e) => ({ elemento: e, distanciaM: distanciaAlElementoM(centro, e) }))
      .filter((c): c is Cercano => c.distanciaM !== null && c.distanciaM <= radioM)
      .sort((a, b) => a.distanciaM - b.distanciaM)
  return { cubiertas: dentro("node"), cables: dentro("fiber"), cabeceras: dentro("cabecera") }
}

/** «35 m», «1,2 km». */
export function textoDeDistancia(metros: number): string {
  return metros < 1000
    ? `${Math.round(metros)} m`
    : `${(metros / 1000).toLocaleString("es-CO", { maximumFractionDigits: 2 })} km`
}
