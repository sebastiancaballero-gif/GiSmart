import { exigirSesion } from "@/lib/auth-server"
import { serveGeoJsonView } from "@/lib/supabase-geojson"

// Cubiertas de empalme (mufas) de la red.
export async function GET(request: Request) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  return serveGeoJsonView({
    schema: "geo_fiber",
    view: "cubierta_empalme_geojson",
    entidad: "las mufas",
  })
}
