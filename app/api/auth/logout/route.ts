import { NextResponse } from "next/server"
import { llegoPorHttps, quitarCookieDeSesion, vieneDeOtroSitio } from "@/lib/auth-server"

/**
 * Cierra la sesión: borra la cookie. El navegador no la puede borrar por su
 * cuenta porque es httpOnly.
 */
export async function POST(request: Request) {
  // Otra página no puede cerrar la sesión de alguien por su navegador.
  if (vieneDeOtroSitio(request)) return NextResponse.json({ message: "Solicitud no permitida." }, { status: 403 })
  const respuesta = NextResponse.json({ ok: true })
  quitarCookieDeSesion(respuesta, llegoPorHttps(request))
  return respuesta
}
