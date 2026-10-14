import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import { sinInvisibles } from "@/lib/texto"

// Búsqueda de zonas/direcciones contra Nominatim (OpenStreetMap). Igual que
// /api/reverse-geocode, se llama desde el servidor para poder identificar la
// aplicación en el User-Agent y aprovechar la caché.
const USER_AGENT = "GISmart/1.0 (G&G Technology SAS)"

/** Un número decimal como se escribe en una coordenada: «-76.0883», «4.53». */
const DECIMAL = /^[-+]?\d{1,3}(?:\.\d{1,15})?$/

/** Cuánto alrededor del centro del mapa se prefieren los resultados, en grados (unos 50 km). */
const CERCA_GRADOS = 0.5
/** Al diezmilésimo: 4.53 + 0.5 da 5.029999… */
const borde = (n: number) => Math.round(n * 10_000) / 10_000

type NominatimResult = {
  display_name?: string
  lat?: string
  lon?: string
  type?: string
}

export async function GET(request: Request) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { searchParams } = new URL(request.url)
  // Sin caracteres invisibles (el nulo, saltos de línea, marcas de dirección):
  // no ayudan a buscar y no tienen por qué salir hacia Nominatim.
  const q = sinInvisibles(searchParams.get("q") ?? "").trim()

  if (q.length < 3) {
    return NextResponse.json({ message: "La búsqueda debe tener al menos 3 caracteres.", results: [] }, { status: 400 })
  }
  // Nominatim es un servicio público y compartido: se identifica con el
  // User-Agent de la aplicación, así que un abuso desde aquí se paga con el
  // bloqueo de toda la empresa. Un tope de largo corta lo más obvio.
  if (q.length > 120) {
    return NextResponse.json(
      { message: "La búsqueda es demasiado larga.", results: [] },
      { status: 400 },
    )
  }

  // Se limita a Colombia porque la red es nacional: evita que "La Unión"
  // devuelva municipios de otros países antes que el del Valle. Con el centro
  // del mapa (`lon`, `lat`), se prefieren los resultados de alrededor sin
  // descartar los demás: antes «Calle 16 La Union» daba primero La Unión de
  // Antioquia.
  const lon = Number(DECIMAL.test(searchParams.get("lon") ?? "") ? searchParams.get("lon") : NaN)
  const lat = Number(DECIMAL.test(searchParams.get("lat") ?? "") ? searchParams.get("lat") : NaN)
  const cerca =
    Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
      ? `&viewbox=${borde(lon - CERCA_GRADOS)},${borde(lat + CERCA_GRADOS)},${borde(lon + CERCA_GRADOS)},${borde(lat - CERCA_GRADOS)}`
      : ""
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8` +
    `&countrycodes=co&accept-language=es${cerca}&q=${encodeURIComponent(q)}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // Sin límite, un Nominatim lento dejaba la petición colgada y con ella
      // el hilo que la atiende.
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    })

    if (!res.ok) {
      return NextResponse.json({ message: `Nominatim respondió ${res.status}.`, results: [] }, { status: 502 })
    }

    const data = (await res.json()) as NominatimResult[]
    // Sin repetidas: Nominatim devuelve a veces el mismo nombre dos veces (una
    // calle partida en tramos).
    const vistas = new Set<string>()
    const results = (Array.isArray(data) ? data : [])
      .filter((r) => r.lat && r.lon && r.display_name)
      .filter((r) => !vistas.has(r.display_name as string) && vistas.add(r.display_name as string))
      .slice(0, 5)
      .map((r) => ({
        label: r.display_name as string,
        lat: Number(r.lat),
        lon: Number(r.lon),
        tipo: r.type ?? null,
      }))

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json(
      { message: "No se pudo consultar el servicio de búsqueda.", results: [] },
      { status: 502 },
    )
  }
}
