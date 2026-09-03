import { NextResponse } from "next/server"

// Búsqueda de zonas/direcciones contra Nominatim (OpenStreetMap). Igual que
// /api/reverse-geocode, se llama desde el servidor para poder identificar la
// aplicación en el User-Agent y aprovechar la caché.
const USER_AGENT = "GISmart/1.0 (G&G Technology SAS)"

type NominatimResult = {
  display_name?: string
  lat?: string
  lon?: string
  type?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()

  if (q.length < 3) {
    return NextResponse.json({ message: "La búsqueda debe tener al menos 3 caracteres.", results: [] }, { status: 400 })
  }

  // Se limita a Colombia porque la red es nacional: evita que "La Unión"
  // devuelva municipios de otros países antes que el del Valle.
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5` +
    `&countrycodes=co&accept-language=es&q=${encodeURIComponent(q)}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    })

    if (!res.ok) {
      return NextResponse.json({ message: `Nominatim respondió ${res.status}.`, results: [] }, { status: 502 })
    }

    const data = (await res.json()) as NominatimResult[]
    const results = (data ?? [])
      .filter((r) => r.lat && r.lon && r.display_name)
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
