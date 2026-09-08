import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

/**
 * Sirve una vista `*_geojson` de Supabase como GeoJSON FeatureCollection.
 *
 * Las tres capas del mapa (mufas, cables y cabeceras) se leen igual: misma
 * validación de variables de entorno, misma conversión de filas a features y
 * los mismos códigos de error. Esta función concentra ese trabajo para que cada
 * ruta solo declare de dónde lee y qué columnas pide.
 *
 * La geometría llega ya como GeoJSON desde la vista (`st_asgeojson(geom)::json`),
 * porque PostgREST devolvería las columnas `geometry` de PostGIS en WKB, que
 * OpenLayers no sabe leer.
 */
export async function serveGeoJsonView({
  schema,
  view,
  entidad,
}: {
  schema: string
  view: string
  /** Nombre en plural para los mensajes de error, p. ej. "las mufas". */
  entidad: string
}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json(
      { message: "SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.", features: [] },
      { status: 500 },
    )
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      db: { schema },
    })

    // Se piden todas las columnas: la vista ya define qué se expone, y repetir
    // la lista acá solo servía para que la ruta se rompiera cada vez que
    // cambiaba el esquema (pasó al renombrarse `est_const` a `tipo_est_const`).
    const { data, error } = await supabase.from(view).select("*")

    if (error) {
      // El detalle técnico de PostgREST viene en inglés y no le dice nada a
      // quien usa el visor: se registra en el servidor y al cliente va un
      // mensaje entendible.
      console.error(`[${schema}.${view}] ${error.message}`)
      return NextResponse.json(
        {
          message: `No hay datos disponibles de ${entidad} en este momento.`,
          detalle: error.message,
          features: [],
        },
        { status: 502 },
      )
    }

    // `select()` recibe las columnas como string, así que Supabase no puede
    // inferir la forma de la fila: acá se trata como un registro genérico.
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    const features = rows
      .filter((row) => row.geom)
      .map(({ geom, ...properties }) => ({
        type: "Feature" as const,
        geometry: geom,
        properties,
      }))

    return NextResponse.json({ type: "FeatureCollection", features })
  } catch {
    return NextResponse.json(
      { message: `No se pudo conectar con Supabase para cargar ${entidad}.`, features: [] },
      { status: 502 },
    )
  }
}
