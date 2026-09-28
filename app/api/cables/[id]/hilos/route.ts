import { NextResponse } from "next/server"
import { normalizarHilos } from "@/lib/map/hilos-cable"
import { responderConFuncion } from "@/lib/supabase-servidor"

/**
 * Hilos de un cable, según la función `tab_fiber.fn_obtener_hilos_cable_json`
 * de Carlos, con el UUID del cable (su argumento se llama `p_id_cable`). Para
 * «Gestión de hilos» (ribbon: Red de fibra → Hilos).
 *
 * Antes se leía directo la tabla `tab_fiber.hilo_cable`; la función es la que
 * se va a ampliar con rack, ODF, puertos y equipos.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responderConFuncion({
    request,
    params,
    idInvalido: "El identificador del cable no es válido.",
    esquema: "tab_fiber",
    funcion: "fn_obtener_hilos_cable_json",
    argumento: "p_id_cable",
    mensajes: {
      nombre: "hilos del cable",
      esquemaPermiso: "tab_fiber",
      porDefecto: "No se pudieron obtener los hilos de este cable.",
    },
    sinConexion: "No se pudo conectar con Supabase para leer los hilos del cable.",
    responder: (data) => NextResponse.json({ hilos: normalizarHilos(data) }),
  })
}
