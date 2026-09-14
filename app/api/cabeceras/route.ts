import { exigirSesion } from "@/lib/auth-server"
import { serveGeoJsonView } from "@/lib/supabase-geojson"

// Cabeceras centrales: el origen de la red.
export async function GET(request: Request) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  return serveGeoJsonView({
    schema: "geo_infra",
    view: "cabecera_central_geojson",
    table: "cabecera_central",
    entidad: "las cabeceras centrales",
  })
}
