import { exigirSesion } from "@/lib/auth-server"
import { serveGeoJsonView } from "@/lib/supabase-geojson"

// Tendido de fibra de la red.
export async function GET(request: Request) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  return serveGeoJsonView({
    schema: "geo_fiber",
    view: "cable_fibra_geojson",
    table: "cable_fibra",
    entidad: "los cables",
  })
}
