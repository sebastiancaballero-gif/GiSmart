import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import { normalizarCablesDeMufa } from "@/lib/map/cables-de-mufa"

/**
 * Cables de entrada y salida de una cubierta, según la función
 * `geo_fiber.fn_obtener_conectividad_cables` de Carlos.
 *
 * Va por el servidor, como la conectividad fina: la clave con la que se
 * consulta no sale nunca de aquí. Al navegador solo le llegan el UUID, la
 * dirección y el color de cada cable; la geometría que hoy manda la función se
 * queda aquí, porque el mapa ya tiene los cables dibujados.
 *
 * La función vive en `geo_fiber`, no en `public`, y su argumento se llama
 * `p_uuid_cubierta` (no `p_cubierta_id`, como el de la conectividad fina).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { id } = await params
  if (!UUID.test(id)) {
    return NextResponse.json({ message: "El identificador de la mufa no es válido." }, { status: 400 })
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
    const { data, error } = await supabase.rpc("fn_obtener_conectividad_cables", { p_uuid_cubierta: id })

    if (error) {
      console.error(`[cables ${id}] ${error.code} ${error.message}`)
      return NextResponse.json(
        {
          message: mensajeDeError(error.code),
          ...(process.env.NODE_ENV === "production" ? {} : { detalle: `${error.code}: ${error.message}` }),
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ cables: normalizarCablesDeMufa(data) })
  } catch {
    return NextResponse.json(
      { message: "No se pudo conectar con Supabase para leer los cables de la mufa." },
      { status: 502 },
    )
  }
}

/** Traduce los fallos conocidos a algo que el usuario (o quien lo soporte) entienda. */
function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    case "42501":
      return "La base no permite ejecutar la función de cables: falta un permiso sobre el esquema geo_fiber."
    case "PGRST202":
      return "La función de cables no existe en la base o cambió de nombre o de parámetros."
    case "42703":
    case "42P01":
      return "La función de cables de la base usa una columna o tabla que ya no existe. Hay que actualizarla."
    default:
      return "No se pudieron obtener los cables de esta mufa."
  }
}
