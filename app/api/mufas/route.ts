import { serveGeoJsonView } from "@/lib/supabase-geojson"

// Cubiertas de empalme (mufas) de la red.
export async function GET() {
  return serveGeoJsonView({
    schema: "geo_fiber",
    view: "cubierta_empalme_geojson",
    entidad: "las mufas",
    columns: [
      "id",
      "etiqueta",
      "tipo_carcasa",
      "funcion_cub",
      "tipo_empalme",
      "cod_fabricante",
      "tipo_instala",
      "estado_const",
      "id_proyecto",
      "direccion",
      "ubicacion",
      "capacidad_bandejas",
      "fecha_creacion",
      "fecha_ult_act",
    ],
  })
}
