import { NextResponse } from "next/server"
import { llegoPorHttps, quitarCookieDeSesion } from "@/lib/auth-server"

/**
 * Cierra la sesión: borra la cookie. El navegador no la puede borrar por su
 * cuenta porque es httpOnly.
 */
export async function POST(request: Request) {
  const respuesta = NextResponse.json({ ok: true })
  quitarCookieDeSesion(respuesta, llegoPorHttps(request))
  return respuesta
}
