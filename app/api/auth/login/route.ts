import { createHmac } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

// Los usuarios reales viven en la tabla `usuario_app` de Supabase (columnas:
// id_usr, codigo, nombre, clave, activo). El login se hace por `nombre`.
// TODO: `clave` está en texto plano hoy — migrar a un hash (bcrypt) cuando
// se pueda tocar esa tabla; comparar en texto plano es un riesgo conocido.
type UsuarioApp = {
  id_usr: number
  codigo: string | null
  nombre: string
  clave: string
  activo: boolean
}

// Sin columna de rol todavía en usuario_app: se asigna uno genérico hasta
// que exista esa información real.
const DEFAULT_ROLE = "usuario"

// Control de intentos por usuario (en memoria, solo demo)
const attempts = new Map<string, { count: number; lockedUntil: number }>()
const MAX_ATTEMPTS = 5
const LOCK_MS = 30_000

// Genera un token tipo JWT firmado con HMAC-SHA256 para el frontend. No es un
// JWT emitido por Supabase Auth (usuario_app es una tabla propia, no auth.users).
function signToken(usuario: string, role: string) {
  const secret = process.env.AUTH_JWT_SECRET
  if (!secret) throw new Error("AUTH_JWT_SECRET no está configurado.")

  const header = { alg: "HS256", typ: "JWT" }
  const payload = {
    sub: usuario,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, // 8 horas
  }
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const signingInput = `${enc(header)}.${enc(payload)}`
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url")
  return `${signingInput}.${signature}`
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !process.env.AUTH_JWT_SECRET) {
    return NextResponse.json(
      { message: "El servidor de autenticación no está configurado. Revisa .env.local.", field: null },
      { status: 500 },
    )
  }

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Solicitud inválida.", field: null }, { status: 400 })
  }

  const usuario = typeof body.usuario === "string" ? body.usuario.trim() : ""
  const contrasena = typeof body.contrasena === "string" ? body.contrasena : ""

  // Validaciones de servidor (defensa en profundidad)
  if (!usuario) {
    return NextResponse.json({ message: "El usuario es obligatorio.", field: "usuario" }, { status: 400 })
  }
  if (usuario.length < 3) {
    return NextResponse.json(
      { message: "El usuario debe tener al menos 3 caracteres.", field: "usuario" },
      { status: 400 },
    )
  }
  if (!contrasena) {
    return NextResponse.json({ message: "La contraseña es obligatoria.", field: "contrasena" }, { status: 400 })
  }

  // Bloqueo por intentos fallidos
  const key = usuario.toLowerCase()
  const record = attempts.get(key)
  const now = Date.now()
  if (record && record.lockedUntil > now) {
    const secs = Math.ceil((record.lockedUntil - now) / 1000)
    return NextResponse.json(
      { message: `Cuenta bloqueada temporalmente. Intenta de nuevo en ${secs}s.`, field: null, lockedUntil: record.lockedUntil },
      { status: 429 },
    )
  }

  function registerFailedAttempt() {
    const count = (record?.count ?? 0) + 1
    const remaining = MAX_ATTEMPTS - count
    if (count >= MAX_ATTEMPTS) {
      attempts.set(key, { count: 0, lockedUntil: now + LOCK_MS })
      return NextResponse.json(
        { message: "Demasiados intentos fallidos. Cuenta bloqueada 30 segundos.", field: null, lockedUntil: now + LOCK_MS },
        { status: 429 },
      )
    }
    attempts.set(key, { count, lockedUntil: 0 })
    return NextResponse.json(
      {
        message: `Usuario o contraseña incorrectos. Te ${remaining === 1 ? "queda" : "quedan"} ${remaining} ${remaining === 1 ? "intento" : "intentos"}.`,
        field: null,
      },
      { status: 401 },
    )
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

  const { data: account, error } = await supabase
    .from("usuario_app")
    .select("id_usr, codigo, nombre, clave, activo")
    .ilike("nombre", usuario)
    .maybeSingle<UsuarioApp>()

  if (error) {
    return NextResponse.json(
      { message: "No se pudo conectar con la base de datos. Intenta de nuevo.", field: null },
      { status: 502 },
    )
  }

  if (!account || account.clave !== contrasena) {
    return registerFailedAttempt()
  }

  if (!account.activo) {
    return NextResponse.json(
      { message: "Este usuario está inactivo. Contacta a un administrador.", field: null },
      { status: 403 },
    )
  }

  // Éxito: limpia intentos
  attempts.delete(key)

  return NextResponse.json({
    token: signToken(account.nombre, DEFAULT_ROLE),
    user: { usuario: account.nombre, role: DEFAULT_ROLE, nombre: account.nombre },
  })
}
