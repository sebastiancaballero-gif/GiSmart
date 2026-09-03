import { serveGeoJsonView } from "@/lib/supabase-geojson"

// Cabeceras centrales: el origen de la red.
export async function GET() {
  return serveGeoJsonView({
    schema: "geo_infra",
    view: "cabecera_central_geojson",
    entidad: "las cabeceras centrales",
    columns: [
      "id",
      "nombre",
      "codigo",
      "id_proyecto",
      "etiqueta",
      "est_const",
      "direccion_catastral",
      "desc_capacidad",
      "creado_en",
      "actualizado_en",
    ],
  })
}
