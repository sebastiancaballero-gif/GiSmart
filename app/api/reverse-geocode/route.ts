import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"

// Nominatim (OpenStreetMap) exige identificar la aplicación en el User-Agent y
// limita la frecuencia de consultas. Por eso se llama desde el servidor y no
// desde el navegador: así se puede fijar la cabecera y aprovechar la caché.
const USER_AGENT = "GISmart/1.0 (G&G Technology SAS)"

/** Un número decimal como se escribe en una coordenada: «-76.0883», «4.53». */
const DECIMAL = /^[-+]?\d{1,3}(?:\.\d{1,15})?$/

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

  // Solo números decimales escritos como tales. Antes `Number(null)` daba 0:
  // sin `lon` o `lat` se consultaba el punto (0, 0), en medio del océano, y
  // `0x10` pasaba como 16.
  const { searchParams } = new URL(request.url)
  const crudoLon = searchParams.get("lon")?.trim() ?? ""
  const crudoLat = searchParams.get("lat")?.trim() ?? ""
  const lon = DECIMAL.test(crudoLon) ? Number(crudoLon) : NaN
  const lat = DECIMAL.test(crudoLat) ? Number(crudoLat) : NaN

  // Además de numéricas, tienen que ser coordenadas posibles: `Number.isFinite`
  // deja pasar un 1e30 que luego se envía tal cual a Nominatim, y el servicio
  // es compartido y se identifica con el User-Agent de la empresa.
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
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
