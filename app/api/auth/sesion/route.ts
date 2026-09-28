import { NextResponse } from "next/server"
import { sesionDeLaPeticion } from "@/lib/auth-server"

/**
 * ¿Hay una sesión válida? Lo pregunta el tablero al abrir: la cookie es
 * httpOnly, así que el navegador no puede mirarla, y lo que guardó el login en
 * el navegador (nombre, vencimiento) no prueba nada por sí solo.
 */
export async function GET(request: Request) {
  const sesion = sesionDeLaPeticion(request)
  if (!sesion) {
    return NextResponse.json(
      { message: "Tu sesión no es válida o expiró. Vuelve a iniciar sesión." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }
  return NextResponse.json(
    { usuario: sesion.sub, role: sesion.role, expira: sesion.exp * 1000 },
    { headers: { "Cache-Control": "no-store" } },
  )
}
