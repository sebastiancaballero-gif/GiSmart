import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import { funcionDeConectividad } from "@/lib/map/conectividad"
import { UUID, clienteSupabase, detalleSoloEnDesarrollo, faltaConfiguracion, responderConFuncion } from "@/lib/supabase-servidor"

/**
 * Conectividad interna de una cubierta (bandejas, empalmes e hilos), generada
 * por una función de la base según el nivel de la cubierta: las de empalme
 * (nivel 0) con `public.get_json_conectividad_cubierta_n0`, las de primer y
 * segundo nivel con `public.get_json_conectividad_cubierta_n12` (ver
 * `funcionDeConectividad`). Primero se lee el nivel en
 * `geo_fiber.cubierta_empalme`.
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
  // Sesión y UUID antes de leer el nivel: sin eso no se le pregunta nada a la base.
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ message: "El identificador de la cubierta no es válido." }, { status: 400 })

  const geo = clienteSupabase("geo_fiber")
  if (!geo) return faltaConfiguracion()
  let funcion: string
  try {
    const { data, error } = await geo.from("cubierta_empalme").select("nivel, funcion_cub").eq("id", id).maybeSingle()
    if (error) {
      console.error(`[conectividad ${id}] nivel de la cubierta: ${error.code} ${error.message}`)
      return NextResponse.json(
        {
          message: "No se pudo leer el nivel de la cubierta para elegir su función de conectividad.",
          funcion: "geo_fiber.cubierta_empalme",
          ...detalleSoloEnDesarrollo(`${error.code}: ${error.message}`),
        },
        { status: 502 },
      )
    }
    // Una cubierta que no está en la base no tiene conectividad: como cuando la función no devuelve nada.
    if (!data) return NextResponse.json({ message: "Esta cubierta no existe en la base." }, { status: 404 })
    const fila = data as { nivel: number | null; funcion_cub: string | null }
    funcion = funcionDeConectividad(fila.nivel, fila.funcion_cub)
  } catch (e) {
    return NextResponse.json(
      {
        message: "No se pudo conectar con Supabase para leer la conectividad.",
        funcion: "geo_fiber.cubierta_empalme",
        ...detalleSoloEnDesarrollo(e instanceof Error ? e.message : String(e)),
      },
      { status: 502 },
    )
  }

  return responderConFuncion({
    request,
    params,
    idInvalido: "El identificador de la cubierta no es válido.",
    funcion,
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
