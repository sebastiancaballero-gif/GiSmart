import { createHmac, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

/**
 * Emisión y verificación del token de sesión (HMAC-SHA256).
 *
 * No es un JWT de Supabase Auth: `usuario_app` es una tabla propia, así que el
 * token lo emitimos y validamos nosotros. Firmar y verificar viven juntos a
 * propósito, para que no se puedan desincronizar.
 */

export const VIGENCIA_SEGUNDOS = 60 * 60 * 8 // 8 horas

/** Valor de muestra de `.env.example`: si llega hasta producción, no sirve. */
const SECRETO_DE_MUESTRA = "cambia-este-valor-por-un-secreto-aleatorio"
const LARGO_MINIMO_SECRETO = 32

/**
 * Devuelve el secreto de firma solo si sirve para firmar.
 *
 * Toda la sesión se apoya en este valor: quien lo adivine puede fabricar
 * tokens y entrar como cualquiera. Un secreto corto o el de muestra son
 * adivinables, así que se rechazan en producción antes de emitir nada. En
 * desarrollo solo se avisa, para no estorbar mientras se prueba.
 */
function secretoDeFirma(): string | null {
  const secreto = process.env.AUTH_JWT_SECRET
  if (!secreto) return null

  const debil = secreto === SECRETO_DE_MUESTRA || secreto.length < LARGO_MINIMO_SECRETO
  if (!debil) return secreto

  const aviso =
    `AUTH_JWT_SECRET es demasiado débil (mínimo ${LARGO_MINIMO_SECRETO} caracteres y distinto del de ejemplo). ` +
    `Genera uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

  if (process.env.NODE_ENV === "production") {
    console.error(`[auth] ${aviso}`)
    return null
  }
  console.warn(`[auth] ${aviso}`)
  return secreto
}

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
  const secreto = secretoDeFirma()
  if (!secreto) throw new Error("AUTH_JWT_SECRET no está configurado o no es válido.")

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
  const secreto = secretoDeFirma()
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
 * Nombre de la cookie de sesión.
 *
 * La sesión viaja en una cookie `httpOnly`: el navegador la manda sola en cada
 * petición y el JavaScript de la página no la puede leer. Antes el token vivía
 * en localStorage, al alcance de cualquier script inyectado (XSS).
 */
export const COOKIE_SESION = "gismart_sesion"

/** El token de la petición: la cookie de sesión o, para los scripts, `Authorization: Bearer`. */
export function tokenDeLaPeticion(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? ""
  for (const parte of cookies.split(";")) {
    const igual = parte.indexOf("=")
    if (igual < 0) continue
    if (parte.slice(0, igual).trim() === COOKIE_SESION) {
      try {
        return decodeURIComponent(parte.slice(igual + 1).trim()) || null
      } catch {
        return null
      }
    }
  }
  const cabecera = request.headers.get("authorization")
  return cabecera?.toLowerCase().startsWith("bearer ") ? cabecera.slice(7).trim() : null
}

/** La sesión de la petición, si es auténtica y no ha caducado. */
export function sesionDeLaPeticion(request: Request): SesionToken | null {
  return verificarToken(tokenDeLaPeticion(request))
}

/**
 * Si la petición llegó por HTTPS. Detrás de IIS la conexión con Node es HTTP,
 * así que se mira también la cabecera que pone el proxy.
 */
export function llegoPorHttps(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
  if (proto) return proto === "https"
  try {
    return new URL(request.url).protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Deja la sesión en la cookie. Con «Recordar usuario» dura lo que el token
 * (ocho horas) aunque se cierre el navegador; sin él, es una cookie de sesión
 * que se borra al cerrarlo.
 *
 * `SameSite=Strict`: otra web no puede hacer que el navegador la mande, así que
 * no sirve para peticiones falsificadas (CSRF). `Secure` solo por HTTPS: en
 * `pnpm dev` o en una red interna sin certificado el navegador la rechazaría.
 */
export function ponerCookieDeSesion(
  respuesta: NextResponse,
  token: string,
  { recordar, https }: { recordar: boolean; https: boolean },
) {
  respuesta.cookies.set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: https,
    path: "/",
    ...(recordar ? { maxAge: VIGENCIA_SEGUNDOS } : {}),
  })
}

export function quitarCookieDeSesion(respuesta: NextResponse, https: boolean) {
  respuesta.cookies.set(COOKIE_SESION, "", { httpOnly: true, sameSite: "strict", secure: https, path: "/", maxAge: 0 })
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
  if (sesionDeLaPeticion(request)) return null

  return NextResponse.json(
    { message: "Tu sesión no es válida o expiró. Vuelve a iniciar sesión.", features: [] },
    { status: 401 },
  )
}
