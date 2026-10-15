import type Feature from "ol/Feature"
import type Map from "ol/Map"
import type { Geometry } from "ol/geom"
import type VectorLayer from "ol/layer/Vector"
import type VectorSource from "ol/source/Vector"

/**
 * Todo lo que hay bajo un click en las capas de la red, de arriba abajo, sin
 * repetir: una cubierta y los cables que pasan por ella, o dos cubiertas
 * pegadas. La ficha deja pasar de uno a otro («1 de 3»), como RustGIS; antes
 * solo se veía el de encima y los demás no había forma de elegirlos ahí.
 *
 * `primero` (el que eligió la selección) va al principio aunque no sea el de
 * encima, para que la ficha no cambie lo que ya mostraba.
 */
export function elementosEnElPunto(
  mapa: Map,
  pixel: number[],
  capas: VectorLayer<VectorSource>[],
  primero?: Feature<Geometry>,
  tolerancia = 4,
): Feature<Geometry>[] {
  const encontrados: Feature<Geometry>[] = []
  mapa.forEachFeatureAtPixel(
    pixel,
    (f) => {
      const feature = f as Feature<Geometry>
      if (!encontrados.includes(feature)) encontrados.push(feature)
    },
    { hitTolerance: tolerancia, layerFilter: (capa) => capas.includes(capa as VectorLayer<VectorSource>) },
  )
  if (primero) {
    const resto = encontrados.filter((f) => f !== primero)
    return [primero, ...resto]
  }
  return encontrados
}
