import { NextResponse } from "next/server"
import { normalizarCablesDeMufa } from "@/lib/map/cables-de-mufa"
import { responderConFuncion } from "@/lib/supabase-servidor"

/**
 * Cables de entrada y salida de una cubierta, según la función
 * `geo_fiber.fn_json_conectividad_cubierta` de Carlos.
 *
 * Al navegador solo le llegan el UUID, la dirección y el color de cada cable;
 * la geometría que manda la función se queda aquí, porque el mapa ya tiene los
 * cables dibujados.
 *
 * La función vive en `geo_fiber`, no en `public`, y su argumento se llama
 * `p_uuid_cubierta` (no `p_cubierta_id`, como el de la conectividad fina).
 * Antes se llamó `fn_obtener_conectividad_cables` y luego
 * `fn_generar_conectividad_cables`; Carlos la renombró el 24 de septiembre de
 * 2026, con el mismo argumento y la misma respuesta.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responderConFuncion({
    request,
    params,
    idInvalido: "El identificador de la cubierta no es válido.",
    esquema: "geo_fiber",
    funcion: "fn_json_conectividad_cubierta",
    argumento: "p_uuid_cubierta",
    mensajes: {
      nombre: "cables",
      esquemaPermiso: "geo_fiber",
      porDefecto: "No se pudieron obtener los cables de esta cubierta.",
    },
    sinConexion: "No se pudo conectar con Supabase para leer los cables de la cubierta.",
    responder: (data) => NextResponse.json({ cables: normalizarCablesDeMufa(data) }),
  })
}
