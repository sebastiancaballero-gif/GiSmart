import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Trae las mufas reales desde Supabase (vista geo_fiber.cubierta_empalme_geojson,
// que expone `geom` ya convertido a GeoJSON). Se arma acá un FeatureCollection
// con el mismo formato que /api/fiber-cables, para reusar el mismo parseo en
// el mapa (ol/format/GeoJSON).
export async function GET() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json(
      { message: "SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.", features: [] },
      { status: 500 },
    )
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      db: { schema: "geo_fiber" },
    })

    const { data, error } = await supabase
      .from("cubierta_empalme_geojson")
      .select(
        "id, etiqueta, tipo_carcasa, funcion_cub, tipo_empalme, cod_fabricante, tipo_instala, estado_const, id_proyecto, direccion, ubicacion, capacidad_bandejas, fecha_creacion, fecha_ult_act, geom",
      )

    if (error) {
      return NextResponse.json(
        { message: `No se pudieron cargar las mufas: ${error.message}`, features: [] },
        { status: 502 },
      )
    }

    const features = (data ?? [])
      .filter((row) => row.geom)
      .map((row) => ({
        type: "Feature" as const,
        geometry: row.geom,
        properties: {
          id: row.id,
          etiqueta: row.etiqueta,
          tipo_carcasa: row.tipo_carcasa,
          funcion_cub: row.funcion_cub,
          tipo_empalme: row.tipo_empalme,
          cod_fabricante: row.cod_fabricante,
          tipo_instala: row.tipo_instala,
          estado_const: row.estado_const,
          id_proyecto: row.id_proyecto,
          direccion: row.direccion,
          ubicacion: row.ubicacion,
          capacidad_bandejas: row.capacidad_bandejas,
          fecha_creacion: row.fecha_creacion,
          fecha_ult_act: row.fecha_ult_act,
        },
      }))

    return NextResponse.json({ type: "FeatureCollection", features })
  } catch {
    return NextResponse.json(
      { message: "No se pudo conectar con Supabase para cargar las mufas.", features: [] },
      { status: 502 },
    )
  }
}
