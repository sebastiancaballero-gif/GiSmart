import GeoJSON from "ol/format/GeoJSON"
import type Feature from "ol/Feature"
import type { Geometry } from "ol/geom"
import type VectorSource from "ol/source/Vector"

import { MUFA_SCHEMA_EXAMPLE } from "@/lib/mufa-schema"

/**
 * Carga de las capas reales del mapa.
 *
 * Las tres capas se piden igual: se llama al endpoint propio, se leen los
 * features en EPSG:3857 y se vuelcan en la fuente vectorial. Lo único que
 * cambia entre ellas es de dónde se saca el nombre visible, así que eso se pasa
 * como función y el resto se comparte.
 *
 * Todas reciben `isCancelled` porque React StrictMode monta el efecto dos veces
 * en desarrollo (monta → limpia → monta). Sin ese guard, las dos cargas
 * resolvían después de la limpieza y los datos se sumaban por duplicado
 * (por ejemplo, 370 mufas en vez de 185).
 *
 * Devuelven un mensaje de error si algo falla, o `null` si todo salió bien.
 */
async function cargarCapa({
  url,
  source,
  isCancelled,
  nombreDe,
  errorHttp,
  errorRed,
  alCargar,
}: {
  url: string
  source: VectorSource
  isCancelled: () => boolean
  /** Nombre visible del elemento, a partir de sus propiedades. */
  nombreDe: (f: Feature<Geometry>) => string
  errorHttp: string
  errorRed: string
  /** Ajustes extra sobre cada feature ya cargado. */
  alCargar?: (f: Feature<Geometry>) => void
}): Promise<string | null> {
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (isCancelled()) return null
    if (!res.ok) return (data?.message as string) ?? errorHttp

    const features = new GeoJSON().readFeatures(data, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    })
    features.forEach((f) => {
      f.set("nombre", nombreDe(f))
      alCargar?.(f)
    })

    if (isCancelled()) return null
    source.addFeatures(features)
    return null
  } catch {
    return isCancelled() ? null : errorRed
  }
}

/** Cubiertas de empalme, desde geo_fiber.cubierta_empalme_geojson. */
export function loadRealMufas(source: VectorSource, isCancelled: () => boolean) {
  return cargarCapa({
    url: "/api/mufas",
    source,
    isCancelled,
    nombreDe: (f) => (f.get("etiqueta") as string | null) || `Mufa ${f.get("id")}`,
    // El esquema de empalme (cables/bandejas/hilos) todavía no viene de esa
    // tabla, así que se siembra con el ejemplo hasta que haya una fuente real
    // para "Gestionar esquema" y "Ver conexiones".
    alCargar: (f) => f.set("esquema", { ...MUFA_SCHEMA_EXAMPLE }),
    errorHttp: "No se pudieron cargar las mufas reales.",
    errorRed: "No se pudo conectar con Supabase para cargar las mufas.",
  })
}

/** Tendido de fibra, desde geo_fiber.cable_fibra_geojson. */
export function loadRealFiberCables(source: VectorSource, isCancelled: () => boolean) {
  return cargarCapa({
    url: "/api/fiber-cables",
    source,
    isCancelled,
    nombreDe: (f) =>
      (f.get("nombre") as string | null) || (f.get("codigo") as string | null) || `Fibra ${f.get("id")}`,
    errorHttp: "No se pudo cargar el tendido de fibra real.",
    errorRed: "No se pudo conectar con Supabase para cargar el tendido de fibra.",
  })
}

/** Cabeceras centrales, desde geo_infra.cabecera_central_geojson. */
export function loadRealCabeceras(source: VectorSource, isCancelled: () => boolean) {
  return cargarCapa({
    url: "/api/cabeceras",
    source,
    isCancelled,
    nombreDe: (f) =>
      (f.get("nombre") as string | null) || (f.get("codigo") as string | null) || `Cabecera ${f.get("id")}`,
    errorHttp: "No se pudieron cargar las cabeceras centrales.",
    errorRed: "No se pudo conectar con Supabase para cargar las cabeceras centrales.",
  })
}
