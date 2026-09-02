import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Trae los cables de fibra reales desde Supabase (vista geo_fiber.cable_fibra_geojson,
// que expone `geom` ya convertido a GeoJSON). Reemplaza al servidor de pruebas
// pg_featureserv (testlab), que era intermitente.
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
      .from("cable_fibra_geojson")
      .select(
        "id, nombre, codigo, cod_fabricante, estado_const, id_proyecto, etq_naps, tipo_red_prin, tipo_fibra, atenuacion_1490, atenuacion_1550, tipo_instala, tipo_cable, marca, modelo, cant_buff, cant_hilo, longitud_medida, longitud_calc, geom",
      )

    if (error) {
      return NextResponse.json(
        { message: `No se pudieron cargar los cables: ${error.message}`, features: [] },
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
          nombre: row.nombre,
          codigo: row.codigo,
          cod_fabricante: row.cod_fabricante,
          estado_const: row.estado_const,
          id_proyecto: row.id_proyecto,
          etq_naps: row.etq_naps,
          tipo_red_prin: row.tipo_red_prin,
          tipo_fibra: row.tipo_fibra,
          atenuacion_1490: row.atenuacion_1490,
          atenuacion_1550: row.atenuacion_1550,
          tipo_instala: row.tipo_instala,
          tipo_cable: row.tipo_cable,
          marca: row.marca,
          modelo: row.modelo,
          cant_buff: row.cant_buff,
          cant_hilo: row.cant_hilo,
          longitud_medida: row.longitud_medida,
          longitud_calc: row.longitud_calc,
        },
      }))

    return NextResponse.json({ type: "FeatureCollection", features })
  } catch {
    return NextResponse.json(
      { message: "No se pudo conectar con Supabase para cargar los cables de fibra.", features: [] },
      { status: 502 },
    )
  }
}
