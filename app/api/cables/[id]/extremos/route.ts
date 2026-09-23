import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import { normalizarExtremos } from "@/lib/map/extremos-cable"

/**
 * Extremos de un cable, según la función `geo_fiber.fn_obtener_extremos_cable`
 * del equipo de backend.
 *
 * Va por el servidor, como las otras consultas: la clave con la que se
 * consulta no sale nunca de aquí. La función vive en `geo_fiber` y su
 * argumento se llama `p_uuid_cable`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { id } = await params
  if (!UUID.test(id)) {
    return NextResponse.json({ message: "El identificador del cable no es válido." }, { status: 400 })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json(
      { message: "SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados." },
      { status: 500 },
    )
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      db: { schema: "geo_fiber" },
    })
    const { data, error } = await supabase.rpc("fn_obtener_extremos_cable", { p_uuid_cable: id })

    if (error) {
      console.error(`[extremos ${id}] ${error.code} ${error.message}`)
      return NextResponse.json(
        {
          message: mensajeDeError(error.code),
          ...(process.env.NODE_ENV === "production" ? {} : { detalle: `${error.code}: ${error.message}` }),
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ extremos: normalizarExtremos(data) })
  } catch {
    return NextResponse.json(
      { message: "No se pudo conectar con Supabase para leer los extremos del cable." },
      { status: 502 },
    )
  }
}

/** Traduce los fallos conocidos a algo que el usuario (o quien lo soporte) entienda. */
function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    case "42501":
      return "La base no permite ejecutar la función de extremos: falta un permiso sobre el esquema geo_fiber."
    case "PGRST202":
      return "La función de extremos del cable no existe en la base o cambió de nombre o de parámetros."
    // Así falla hoy: la función busca geo_fiber.cabecera_central, que está en
    // geo_infra. Se arregla en la función, no aquí.
    case "42703":
    case "42P01":
      return "La función de extremos del cable usa una columna o tabla que no existe. Hay que corregirla en la base."
    default:
      return "No se pudieron obtener los extremos de este cable."
  }
}
