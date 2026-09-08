import { createHmac, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

/**
 * Emisión y verificación del token de sesión (HMAC-SHA256).
 *
 * No es un JWT de Supabase Auth: `usuario_app` es una tabla propia, así que el
 * token lo emitimos y validamos nosotros. Firmar y verificar viven juntos a
 * propósito, para que no se puedan desincronizar.
 */

const VIGENCIA_SEGUNDOS = 60 * 60 * 8 // 8 horas

export type SesionToken = {
  sub: string
  role: string
  iat: number
  exp: number
}

function base64url(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor)).toString("base64url")
}

function firmar(entrada: string, secreto: string): string {
  return createHmac("sha256", secreto).update(entrada).digest("base64url")
}

export function emitirToken(usuario: string, role: string): string {
  const secreto = process.env.AUTH_JWT_SECRET
  if (!secreto) throw new Error("AUTH_JWT_SECRET no está configurado.")

  const ahora = Math.floor(Date.now() / 1000)
  const cuerpo = base64url({ alg: "HS256", typ: "JWT" }) + "." +
    base64url({ sub: usuario, role, iat: ahora, exp: ahora + VIGENCIA_SEGUNDOS })

  return `${cuerpo}.${firmar(cuerpo, secreto)}`
}

/**
 * Devuelve la sesión si el token es auténtico y no ha caducado; `null` si no.
 * La firma se compara en tiempo constante para no filtrar información por el
 * tiempo de respuesta.
 */
export function verificarToken(token: string | null | undefined): SesionToken | null {
  const secreto = process.env.AUTH_JWT_SECRET
  if (!token || !secreto) return null

  const partes = token.split(".")
  if (partes.length !== 3) return null

  const [cabecera, cuerpo, firmaRecibida] = partes
  const esperada = firmar(`${cabecera}.${cuerpo}`, secreto)

  const a = Buffer.from(firmaRecibida)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const carga = JSON.parse(Buffer.from(cuerpo, "base64url").toString()) as SesionToken
    if (typeof carga.exp !== "number" || carga.exp * 1000 <= Date.now()) return null
    return carga
  } catch {
    return null
  }
}

/**
 * Comprueba la sesión de una petición.
 *
 * Devuelve `null` si todo está en orden, o la respuesta 401 que la ruta debe
 * devolver. Se usa así para que cada endpoint sea una línea:
 *
 *     const sinSesion = exigirSesion(request)
 *     if (sinSesion) return sinSesion
 */
export function exigirSesion(request: Request): NextResponse | null {
  const cabecera = request.headers.get("authorization")
  const token = cabecera?.toLowerCase().startsWith("bearer ") ? cabecera.slice(7).trim() : null

  if (verificarToken(token)) return null

  return NextResponse.json(
    { message: "Tu sesión no es válida o expiró. Vuelve a iniciar sesión.", features: [] },
    { status: 401 },
  )
}
