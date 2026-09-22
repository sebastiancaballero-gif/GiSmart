import GeoJSON from "ol/format/GeoJSON"
import type Feature from "ol/Feature"
import type { Geometry } from "ol/geom"
import type VectorSource from "ol/source/Vector"

import { fetchConSesion } from "@/lib/auth"
import { NOMBRE_VISIBLE } from "@/lib/map/symbology"

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
}: {
  url: string
  source: VectorSource
  isCancelled: () => boolean
  /** Nombre visible del elemento, a partir de sus propiedades. */
  nombreDe: (f: Feature<Geometry>) => string
  errorHttp: string
  errorRed: string
}): Promise<string | null> {
  try {
    const res = await fetchConSesion(url)
    const data = await res.json()
    if (isCancelled()) return null
    if (!res.ok) return (data?.message as string) ?? errorHttp

    const features = new GeoJSON().readFeatures(data, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    })
    features.forEach((f) => f.set(NOMBRE_VISIBLE, nombreDe(f)))

    if (isCancelled()) return null
    source.addFeatures(features)
    return null
  } catch (e) {
    if (isCancelled()) return null
    // El mensaje que ve el usuario habla de conexión, pero aquí también caen
    // los fallos al interpretar el GeoJSON (una geometría corrupta tumba la
    // capa entera). Sin registrarlo no había forma de distinguir un caso del
    // otro desde la consola del navegador.
    console.error(`[${url}] no se pudo cargar la capa:`, e)
    return errorRed
  }
}

/** Cubiertas de empalme, desde geo_fiber.cubierta_empalme. */
export function loadRealMufas(source: VectorSource, isCancelled: () => boolean) {
  return cargarCapa({
    url: "/api/mufas",
    source,
    isCancelled,
    // Desde que la tabla se recreó, `id` es un UUID: como respaldo del nombre
    // se usa el código anterior, `id_legacy`, que sí es legible.
    nombreDe: (f) =>
      (f.get("etiqueta") as string | null) || `Mufa ${f.get("id_legacy") ?? f.get("id")}`,
    // Ya no se siembra ningún esquema de ejemplo. Antes las 185 mufas cargaban
    // el mismo JSON inventado y «Ver conexiones» enseñaba el mismo diagrama
    // para todas. La conectividad real se pide a la base al elegir la mufa
    // (ver lib/map/conectividad.ts).
    errorHttp: "No se pudieron cargar las mufas reales.",
    errorRed: "No se pudo conectar con Supabase para cargar las mufas.",
  })
}

/** Tendido de fibra, desde geo_fiber.cable_fibra. */
export function loadRealFiberCables(source: VectorSource, isCancelled: () => boolean) {
  return cargarCapa({
    url: "/api/fiber-cables",
    source,
    isCancelled,
    nombreDe: (f) =>
      (f.get("nombre") as string | null) ||
      (f.get("codigo") as string | null) ||
      `Fibra ${f.get("id_legacy") ?? f.get("id")}`,
    errorHttp: "No se pudo cargar el tendido de fibra real.",
    errorRed: "No se pudo conectar con Supabase para cargar el tendido de fibra.",
  })
}

/** Cabeceras centrales, desde geo_infra.cabecera_central. */
export function loadRealCabeceras(source: VectorSource, isCancelled: () => boolean) {
  return cargarCapa({
    url: "/api/cabeceras",
    source,
    isCancelled,
    // `etiqueta` trae el nombre operativo ("HUB LA UNION"), más informativo en
    // el mapa que el código interno ("C001"), igual que en las mufas.
    nombreDe: (f) =>
      (f.get("etiqueta") as string | null) ||
      (f.get("nombre") as string | null) ||
      (f.get("codigo") as string | null) ||
      "Cabecera",
    errorHttp: "No se pudieron cargar las cabeceras centrales.",
    errorRed: "No se pudo conectar con Supabase para cargar las cabeceras centrales.",
  })
}
