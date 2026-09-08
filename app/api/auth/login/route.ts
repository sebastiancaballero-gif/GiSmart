import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { emitirToken } from "@/lib/auth-server"
import { esHash, hashClave, verificarClave } from "@/lib/password"

// Los usuarios reales viven en la tabla `usuario_app` de Supabase (columnas:
// id_usr, codigo, nombre, clave, activo). El login se hace por `nombre`.
// Las contraseñas se guardan con hash scrypt (ver lib/password.ts). Las que
// quedaran en texto plano de antes siguen funcionando y se migran solas la
// primera vez que esa persona inicia sesión.
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

  const claveValida = account ? await verificarClave(contrasena, account.clave ?? "") : false
  if (!account || !claveValida) {
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

  // Migración transparente: si la contraseña estaba en texto plano, se
  // reemplaza por su hash ahora que sabemos que es la correcta. Así las
  // cuentas se migran solas a medida que la gente entra, sin dejar a nadie
  // fuera ni tener que coordinar un cambio masivo.
  //
  // Es "el mejor esfuerzo": si el UPDATE falla (falta el permiso, o la columna
  // sigue siendo varchar(12) y el hash no cabe), se registra y el login
  // continúa. Nadie se queda sin entrar por esto.
  if (!esHash(account.clave ?? "")) {
    try {
      const { error: errorMigracion } = await supabase
        .from("usuario_app")
        .update({ clave: await hashClave(contrasena) })
        .eq("id_usr", account.id_usr)

      if (errorMigracion) {
        console.error(
          `[login] No se pudo migrar la clave de "${account.nombre}" a hash: ${errorMigracion.message}`,
        )
      }
    } catch (e) {
      console.error(`[login] Fallo inesperado al migrar la clave a hash:`, e)
    }
  }

  return NextResponse.json({
    token: emitirToken(account.nombre, DEFAULT_ROLE),
    user: { usuario: account.nombre, role: DEFAULT_ROLE, nombre: account.nombre },
  })
}
