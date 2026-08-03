import { type NextRequest, NextResponse } from "next/server"

// Credenciales de demostración (en producción esto lo valida el backend C#)
const VALID_USERS: Record<string, { password: string; role: string; nombre: string }> = {
  vallecauca: { password: "gismart2024", role: "ingeniero_red", nombre: "Ing. Valle del Cauca" },
  admin: { password: "admin123", role: "administrador", nombre: "Administrador GiSmart" },
  disenador: { password: "fibra2024", role: "disenador_red", nombre: "Diseñador de Red" },
}

// Control de intentos por usuario (en memoria, solo demo)
const attempts = new Map<string, { count: number; lockedUntil: number }>()
const MAX_ATTEMPTS = 5
const LOCK_MS = 30_000

// Genera un token tipo JWT (base64url) solo para la demo del frontend
function fakeJwt(usuario: string, role: string) {
  const header = { alg: "HS256", typ: "JWT" }
  const payload = {
    sub: usuario,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, // 8 horas
  }
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
  return `${enc(header)}.${enc(payload)}.demo-signature`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Solicitud inválida.", field: null }, { status: 400 })
  }

  const usuario = typeof body.usuario === "string" ? body.usuario.trim() : ""
  const contrasena = typeof body.contrasena === "string" ? body.contrasena : ""

  // Simula latencia de red
  await new Promise((r) => setTimeout(r, 1000))

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
  if (!/^[a-zA-Z0-9._-]+$/.test(usuario)) {
    return NextResponse.json(
      { message: "El usuario contiene caracteres no permitidos.", field: "usuario" },
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

  const account = VALID_USERS[key]
  if (!account || account.password !== contrasena) {
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

  // Éxito: limpia intentos
  attempts.delete(key)

  return NextResponse.json({
    token: fakeJwt(key, account.role),
    user: { usuario: key, role: account.role, nombre: account.nombre },
  })
}
