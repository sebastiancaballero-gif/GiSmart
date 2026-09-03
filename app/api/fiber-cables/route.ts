import { serveGeoJsonView } from "@/lib/supabase-geojson"

// Tendido de fibra de la red.
export async function GET() {
  return serveGeoJsonView({
    schema: "geo_fiber",
    view: "cable_fibra_geojson",
    entidad: "los cables",
    columns: [
      "id",
      "nombre",
      "codigo",
      "cod_fabricante",
      "estado_const",
      "id_proyecto",
      "etq_naps",
      "tipo_red_prin",
      "tipo_fibra",
      "atenuacion_1490",
      "atenuacion_1550",
      "tipo_instala",
      "tipo_cable",
      "marca",
      "modelo",
      "cant_buff",
      "cant_hilo",
      "longitud_medida",
      "longitud_calc",
    ],
  })
}
