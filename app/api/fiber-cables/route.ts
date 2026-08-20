import { NextResponse } from "next/server"

// Trae los cables de fibra reales desde pg_featureserv (variable FIBER_API_URL,
// hoy un entorno de pruebas en http://). Se hace del lado del servidor para
// evitar el bloqueo de "contenido mixto" cuando la app se sirve por HTTPS.
export async function GET() {
  const baseUrl = process.env.FIBER_API_URL
  if (!baseUrl) {
    return NextResponse.json(
      { message: "FIBER_API_URL no está configurado.", features: [] },
      { status: 500 },
    )
  }

  try {
    const res = await fetch(`${baseUrl}?limit=1000`, {
      headers: { Accept: "application/geo+json" },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        { message: `El servidor de cables respondió ${res.status}.`, features: [] },
        { status: 502 },
      )
    }

    const geojson = await res.json()
    return NextResponse.json(geojson)
  } catch {
    return NextResponse.json(
      { message: "No se pudo conectar con el servidor de cables de fibra.", features: [] },
      { status: 502 },
    )
  }
}
