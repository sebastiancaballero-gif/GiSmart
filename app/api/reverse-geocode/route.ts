import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"

// Nominatim (OpenStreetMap) exige identificar la aplicación en el User-Agent y
// limita la frecuencia de consultas. Por eso se llama desde el servidor y no
// desde el navegador: así se puede fijar la cabecera y aprovechar la caché.
const USER_AGENT = "GISmart/1.0 (G&G Technology SAS)"

type NominatimAddress = {
  city?: string
  town?: string
  village?: string
  municipality?: string
  county?: string
  state?: string
  country?: string
}

export async function GET(request: Request) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { searchParams } = new URL(request.url)
  const lon = Number(searchParams.get("lon"))
  const lat = Number(searchParams.get("lat"))

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return NextResponse.json({ message: "Se requieren `lon` y `lat` numéricos." }, { status: 400 })
  }

  // zoom=12 devuelve el nivel municipio/ciudad, que es la escala útil para el
  // subtítulo del mapa (no la calle exacta).
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=es` +
    `&lat=${lat}&lon=${lon}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // Sin límite, un Nominatim lento dejaba la petición colgada y con ella
      // el hilo que la atiende.
      signal: AbortSignal.timeout(8000),
      // Las coordenadas llegan redondeadas desde el cliente, así que el mismo
      // sector reutiliza la respuesta cacheada durante un día.
      next: { revalidate: 86400 },
    })

    if (!res.ok) {
      return NextResponse.json({ message: `Nominatim respondió ${res.status}.` }, { status: 502 })
    }

    const data = (await res.json()) as { address?: NominatimAddress }
    const address = data.address ?? {}
    const localidad =
      address.city ?? address.town ?? address.village ?? address.municipality ?? address.county
    const label = [localidad, address.state, address.country].filter(Boolean).join(", ")

    if (!label) {
      return NextResponse.json({ message: "Sin resultados para esas coordenadas." }, { status: 404 })
    }

    return NextResponse.json({ label })
  } catch {
    return NextResponse.json({ message: "No se pudo consultar el servicio de ubicación." }, { status: 502 })
  }
}
