import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"

/**
 * Acceso a Supabase desde el servidor.
 *
 * Antes cada petición creaba su propio cliente: una consulta de conectividad,
 * una de cables y la carga de las tres capas armaban cinco clientes nuevos, con
 * su configuración y su conexión. Ahora hay uno por esquema y se reutiliza.
 *
 * La clave de servicio solo existe aquí: esta aplicación no tiene cliente de
 * Supabase en el navegador a propósito.
 */

/**
 * Lo más que se espera a Supabase por consulta. El navegador deja de esperar a
 * los 20–30 s, pero sin este tope la ruta seguía colgada en el servidor; así
 * la consulta se corta y la ruta responde con su error de siempre.
 */
const ESPERA_MAXIMA_MS = 15_000

const crearCliente = (url: string, clave: string, esquema: string) =>
  createClient(url, clave, {
    db: { schema: esquema },
    // En el servidor no hay sesión de Supabase que guardar ni renovar.
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (entrada, opciones) =>
        fetch(entrada, {
          ...opciones,
          signal: opciones?.signal
            ? AbortSignal.any([opciones.signal, AbortSignal.timeout(ESPERA_MAXIMA_MS)])
            : AbortSignal.timeout(ESPERA_MAXIMA_MS),
        }),
    },
  })

type ClienteSupabase = ReturnType<typeof crearCliente>

const clientes = new Map<string, ClienteSupabase>()

/** Cliente con la clave de servicio para ese esquema, o `null` si faltan las variables. */
export function clienteSupabase(esquema = "public"): ClienteSupabase | null {
  const url = process.env.SUPABASE_URL
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!url || !clave) return null

  // La URL y la clave van en la llave: si cambian (otro .env), no se reutiliza
  // un cliente armado con las anteriores.
  const llave = `${url}|${clave.slice(-8)}|${esquema}`
  const existente = clientes.get(llave)
  if (existente) return existente
  const nuevo = crearCliente(url, clave, esquema)
  clientes.set(llave, nuevo)
  return nuevo
}

export function faltaConfiguracion(extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { message: "SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.", ...extra },
    { status: 500 },
  )
}

/** Solo fuera de producción: en producción el detalle nombra tablas y permisos de la base. */
export function detalleSoloEnDesarrollo(detalle: string): { detalle?: string } {
  return process.env.NODE_ENV === "production" ? {} : { detalle }
}

// Los ids de cubiertas y cables son UUID. Validarlo evita mandarle a la base
// cualquier cosa que llegue en la URL.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Mensaje para los fallos conocidos de una función de la base, en palabras de
 * quien usa el mapa (o de quien lo soporta).
 */
export function mensajeDeFuncion(
  codigo: string | undefined,
  { nombre, esquemaPermiso, porDefecto }: { nombre: string; esquemaPermiso: string; porDefecto: string },
): string {
  switch (codigo) {
    case "42501":
      return `La base no permite ejecutar la función de ${nombre}: falta un permiso sobre el esquema ${esquemaPermiso}.`
    case "PGRST202":
      return `La función de ${nombre} no existe en la base o cambió de nombre o de parámetros.`
    // La función nombra una columna o tabla que ya no está (pasó al recrear
    // tablas). Se arregla en la función, no aquí.
    case "42703":
    case "42P01":
      return `La función de ${nombre} de la base usa una columna o tabla que ya no existe. Hay que actualizarla.`
    default:
      return porDefecto
  }
}

/**
 * Todo lo que comparten las rutas que llaman una función de la base con el
 * UUID de la URL: exigir sesión, validar el UUID, llamar la función, registrar
 * y traducir el error, y responder. Cada ruta solo dice qué función llama y qué
 * hace con lo que devuelve.
 */
export async function responderConFuncion({
  request,
  params,
  idInvalido,
  esquema = "public",
  funcion,
  argumento,
  mensajes,
  sinConexion,
  responder,
}: {
  request: Request
  params: Promise<{ id: string }>
  /** Qué decir si el id de la URL no es un UUID. */
  idInvalido: string
  esquema?: string
  funcion: string
  /** Nombre del argumento en la base (`p_uuid_cubierta`, `p_cubierta_id`…). */
  argumento: string
  mensajes: { nombre: string; esquemaPermiso: string; porDefecto: string }
  /** Qué decir si no se pudo hablar con Supabase. */
  sinConexion: string
  responder: (data: unknown) => NextResponse
}): Promise<NextResponse> {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ message: idInvalido }, { status: 400 })

  const cliente = clienteSupabase(esquema)
  if (!cliente) return faltaConfiguracion()

  try {
    const { data, error } = await cliente.rpc(funcion, { [argumento]: id })
    if (error) {
      console.error(`[${funcion} ${id}] ${error.code} ${error.message}`)
      return NextResponse.json(
        { message: mensajeDeFuncion(error.code, mensajes), ...detalleSoloEnDesarrollo(`${error.code}: ${error.message}`) },
        { status: 502 },
      )
    }
    return responder(data)
  } catch (e) {
    return NextResponse.json(
      { message: sinConexion, ...detalleSoloEnDesarrollo(e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    )
  }
}
