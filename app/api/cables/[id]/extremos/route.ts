import { NextResponse } from "next/server"
import { normalizarExtremos } from "@/lib/map/extremos-cable"
import { responderConFuncion } from "@/lib/supabase-servidor"

/**
 * Extremos de un cable (su cubierta de entrada y la de salida), según la
 * función `geo_fiber.fn_json_extremos_cable` del equipo de backend.
 *
 * La función vive en `geo_fiber` y su argumento se llama `p_uuid_cable`. Un
 * tiempo falló porque leía `cub.nombre`, columna que no existe; eso se arregla
 * en la función, no aquí.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responderConFuncion({
    request,
    params,
    idInvalido: "El identificador del cable no es válido.",
    esquema: "geo_fiber",
    funcion: "fn_json_extremos_cable",
    argumento: "p_uuid_cable",
    mensajes: {
      nombre: "extremos del cable",
      esquemaPermiso: "geo_fiber",
      porDefecto: "No se pudieron obtener los extremos de este cable.",
    },
    sinConexion: "No se pudo conectar con Supabase para leer los extremos del cable.",
    responder: (data) => NextResponse.json({ extremos: normalizarExtremos(data) }),
  })
}
