import GeoJSON from "ol/format/GeoJSON"
import type Feature from "ol/Feature"
import type { Geometry } from "ol/geom"
import type VectorSource from "ol/source/Vector"

import { fetchConSesion } from "@/lib/auth"
import { NOMBRE_VISIBLE } from "@/lib/map/symbology"
import { nombreDeCubierta } from "@/lib/map/nombre-cubierta"

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
 * Devuelven el error si algo falla, o `null` si todo salió bien.
 */

/**
 * Por qué no cargó una capa. `detalle` es lo técnico: la vista o tabla y lo que
 * respondió la base (solo fuera de producción), o el fallo del navegador.
 */
export type ErrorDeCapa = { mensaje: string; detalle?: string }

/**
 * Cuánto se espera cada capa. El servidor corta cada consulta a la base a los
 * 15 s; esto cubre la red: si se cae a mitad de camino, el navegador podía
 * quedarse minutos con «Cargando…» sin decir nada.
 */
export const ESPERA_MAXIMA_CAPA_MS = 60_000

/** Cuánto se espera antes del único reintento de una capa que falló de paso. */
export const PAUSA_REINTENTO_CAPA_MS = 1_500

type DatosDeCapa = {
  url: string
  source: VectorSource
  isCancelled: () => boolean
  /** Nombre visible del elemento, a partir de sus propiedades. */
  nombreDe: (f: Feature<Geometry>) => string
  errorHttp: string
  errorRed: string
}

/**
 * Carga una capa. Si falla de paso (el servidor respondió 5xx, o la red falló
 * antes de que llegara la respuesta), se reintenta una vez: un 502 suelto de la
 * base al abrir el tablero dejaba la capa vacía hasta pulsar «Actualizar». Lo
 * que no se arregla reintentando (un 4xx, un GeoJSON roto, el tope de 60 s ya
 * vencido) avisa de una.
 */
async function cargarCapa(datos: DatosDeCapa, pausa = PAUSA_REINTENTO_CAPA_MS): Promise<ErrorDeCapa | null> {
  const primero = await intentarCapa(datos)
  if (!primero.reintentable || datos.isCancelled()) return primero.error
  await new Promise((listo) => setTimeout(listo, pausa))
  if (datos.isCancelled()) return null
  return (await intentarCapa(datos)).error
}

async function intentarCapa({ url, source, isCancelled, nombreDe, errorHttp, errorRed }: DatosDeCapa): Promise<{
  error: ErrorDeCapa | null
  /** Si vale la pena intentarlo otra vez (ver cargarCapa). */
  reintentable: boolean
}> {
  let llego = false
  try {
    const res = await fetchConSesion(url, { signal: AbortSignal.timeout(ESPERA_MAXIMA_CAPA_MS) })
    llego = true
    // Una respuesta de error puede no ser JSON (una página 500): sin este
    // `catch` caía como si fuera un fallo de conexión. Si el tope vence a mitad
    // del cuerpo, se trata como el tope.
    const data = await res.json().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "TimeoutError") throw e
      return null
    })
    if (isCancelled()) return { error: null, reintentable: false }
    if (!res.ok) {
      return {
        error: {
          mensaje: typeof data?.message === "string" ? data.message : `${errorHttp} (HTTP ${res.status})`,
          detalle: typeof data?.detalle === "string" ? data.detalle : `${url} → HTTP ${res.status}`,
        },
        reintentable: res.status >= 500,
      }
    }

    const features = new GeoJSON().readFeatures(data, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    })
    features.forEach((f) => f.set(NOMBRE_VISIBLE, nombreDe(f)))

    if (isCancelled()) return { error: null, reintentable: false }
    source.addFeatures(features)
    return { error: null, reintentable: false }
  } catch (e) {
    if (isCancelled()) return { error: null, reintentable: false }
    // El mensaje que ve el usuario habla de conexión, pero aquí también caen
    // los fallos al interpretar el GeoJSON (una geometría corrupta tumba la
    // capa entera). Sin registrarlo no había forma de distinguir un caso del
    // otro desde la consola del navegador.
    console.error(`[${url}] no se pudo cargar la capa:`, e)
    if (e instanceof DOMException && e.name === "TimeoutError") {
      return {
        error: {
          mensaje: `${errorHttp} El servidor no respondió en ${ESPERA_MAXIMA_CAPA_MS / 1000} segundos: revisa la conexión y pulsa «Actualizar».`,
          detalle: `${url} → sin respuesta en ${ESPERA_MAXIMA_CAPA_MS / 1000} s`,
        },
        reintentable: false,
      }
    }
    return {
      error: { mensaje: errorRed, detalle: `${url} → ${e instanceof Error ? e.message : String(e)}` },
      // La red falló antes de la respuesta: puede ser de paso. Un GeoJSON roto, no.
      reintentable: !llego,
    }
  }
}

/** Cubiertas de empalme, desde geo_fiber.cubierta_empalme. */
export function loadRealMufas(source: VectorSource, isCancelled: () => boolean) {
  return cargarCapa({
    url: "/api/mufas",
    source,
    isCancelled,
    // El nombre viene en `etiqueta` o, desde el 20-oct-2026, en `salidas_div1`
    // (ver nombreDeCubierta). Desde que la tabla se recreó, `id` es un UUID:
    // como respaldo del nombre se usa el código anterior, `id_legacy`, que sí
    // es legible.
    nombreDe: (f) => nombreDeCubierta(f.getProperties()) ?? `Cubierta ${f.get("id_legacy") ?? f.get("id")}`,
    // Ya no se siembra ningún esquema de ejemplo. Antes las 185 mufas cargaban
    // el mismo JSON inventado y «Ver conexiones» enseñaba el mismo diagrama
    // para todas. La conectividad real se pide a la base al elegir la mufa
    // (ver lib/map/conectividad.ts).
    errorHttp: "No se pudieron cargar las cubiertas reales.",
    errorRed: "No se pudo conectar con Supabase para cargar las cubiertas.",
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
