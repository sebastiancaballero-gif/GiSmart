import { NextResponse } from "next/server"
import { responderConFuncion } from "@/lib/supabase-servidor"

/**
 * Conectividad interna de una cubierta (bandejas, empalmes e hilos), generada
 * por la función `public.get_json_conectividad_cubierta` de la base.
 *
 * El ingeniero de backend la pensó para llamarla desde el navegador con
 * `supabase.rpc(...)`. Aquí va por el servidor, como todo lo demás: la clave
 * con la que se consulta nunca debe salir del servidor.
 *
 * Ojo con el nombre del argumento: en la base se llama `p_cubierta_id`. El
 * ejemplo que llegó usaba `id_parametro`, y con ese nombre PostgREST responde
 * que la función no existe (PGRST202).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responderConFuncion({
    request,
    params,
    idInvalido: "El identificador de la cubierta no es válido.",
    funcion: "get_json_conectividad_cubierta",
    argumento: "p_cubierta_id",
    mensajes: {
      nombre: "conectividad",
      // La función lee del esquema tab_fiber (ver docs/base-de-datos.md).
      esquemaPermiso: "tab_fiber",
      porDefecto: "No se pudo obtener la conectividad de esta cubierta.",
    },
    sinConexion: "No se pudo conectar con Supabase para leer la conectividad.",
    responder: (data) => {
      // La función devuelve null (o algo que no es un objeto) cuando la
      // cubierta no tiene nada registrado todavía. No es un fallo: es un dato
      // que falta.
      if (data === null || typeof data !== "object") {
        return NextResponse.json(
          { message: "Esta cubierta todavía no tiene conectividad registrada en la base." },
          { status: 404 },
        )
      }
      return NextResponse.json(data)
    },
  })
}
