import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"

/**
 * Conectividad interna de una mufa (bandejas, empalmes e hilos), generada por
 * la función `public.get_json_conectividad_cubierta` de la base.
 *
 * El ingeniero de backend la pensó para llamarla desde el navegador con
 * `supabase.rpc(...)`. Aquí va por el servidor, como todo lo demás: esta
 * aplicación no tiene cliente de Supabase en el navegador a propósito, porque
 * la clave con la que se consulta nunca debe salir del servidor.
 *
 * Ojo con el nombre del argumento: en la base se llama `p_cubierta_id`. El
 * ejemplo que llegó usaba `id_parametro`, y con ese nombre PostgREST responde
 * que la función no existe (PGRST202).
 */

// Los ids de `geo_fiber.cubierta_empalme` son UUID. Validarlo aquí evita
// mandarle a la base cualquier cosa que llegue en la URL.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { id } = await params
  if (!UUID.test(id)) {
    return NextResponse.json({ message: "El identificador de la cubierta no es válido." }, { status: 400 })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json(
      { message: "SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados." },
      { status: 500 },
    )
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
    const { data, error } = await supabase.rpc("get_json_conectividad_cubierta", { p_cubierta_id: id })

    if (error) {
      console.error(`[conectividad ${id}] ${error.code} ${error.message}`)
      return NextResponse.json(
        {
          message: mensajeDeError(error.code),
          ...(process.env.NODE_ENV === "production" ? {} : { detalle: `${error.code}: ${error.message}` }),
        },
        { status: 502 },
      )
    }

    // La función devuelve null (o algo que no es un objeto) cuando la mufa no
    // tiene nada registrado todavía. No es un fallo: es un dato que falta.
    if (data === null || typeof data !== "object") {
      return NextResponse.json(
        { message: "Esta cubierta todavía no tiene conectividad registrada en la base." },
        { status: 404 },
      )
    }

    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      {
        message: "No se pudo conectar con Supabase para leer la conectividad.",
        ...(process.env.NODE_ENV === "production" ? {} : { detalle: e instanceof Error ? e.message : String(e) }),
      },
      { status: 502 },
    )
  }
}

/** Traduce los fallos conocidos a algo que el usuario (o quien lo soporte) entienda. */
function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    // La función lee del esquema tab_fiber y el rol del servidor no tiene
    // permiso sobre él. Se arregla en la base: ver docs/base-de-datos.md.
    case "42501":
      return "La base no permite leer la conectividad todavía: falta un permiso sobre el esquema tab_fiber."
    case "PGRST202":
      return "La función de conectividad no existe en la base o cambió de nombre o de parámetros."
    // La función nombra una columna o tabla que ya no está. Pasó al recrear
    // cubierta_empalme: `modelo_div` se renombró a `modelo_divisor` y la función
    // siguió usando el nombre viejo. Se arregla en la función, no aquí.
    case "42703":
    case "42P01":
      return "La función de conectividad de la base usa una columna o tabla que ya no existe. Hay que actualizarla."
    default:
      return "No se pudo obtener la conectividad de esta cubierta."
  }
}
