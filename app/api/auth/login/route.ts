import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { emitirToken } from "@/lib/auth-server"
import { esHash, hashClave, verificarClave, HASH_SENUELO } from "@/lib/password"

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
const ROL_POR_DEFECTO = "usuario"

const MAX_INTENTOS = 5
const BLOQUEO_MS = 30_000
/** Tras este tiempo sin actividad se olvida el historial de una cuenta. */
const OLVIDO_MS = 15 * 60_000
/** Tope de cuentas vigiladas a la vez, por si la limpieza por tiempo no basta. */
const MAX_VIGILADAS = 5_000

/**
 * Intentos fallidos por usuario, en memoria del proceso.
 *
 * Se limpia sola. Antes no: como la clave es el nombre que llega en la
 * petición, bastaba con mandar nombres distintos —existan o no— para que el
 * mapa creciera sin techo hasta agotar la memoria del servidor.
 */
const intentos = new Map<string, { fallos: number; bloqueadaHasta: number; visto: number }>()
let proximaLimpieza = 0

function limpiarIntentos(ahora: number) {
  // Recorrer el mapa en cada login sería gasto inútil: se hace como mucho una
  // vez por minuto, o de inmediato si ya se pasó del tope.
  if (ahora < proximaLimpieza && intentos.size <= MAX_VIGILADAS) return
  proximaLimpieza = ahora + 60_000

  for (const [nombre, registro] of intentos) {
    if (registro.bloqueadaHasta <= ahora && ahora - registro.visto > OLVIDO_MS) {
      intentos.delete(nombre)
    }
  }

  // Si aun así sobran (una ráfaga muy grande en poco tiempo), se sueltan las
  // más antiguas: `Map` conserva el orden de inserción.
  let sobran = intentos.size - MAX_VIGILADAS
  if (sobran <= 0) return
  for (const nombre of intentos.keys()) {
    if (sobran-- <= 0) break
    intentos.delete(nombre)
  }
}

/**
 * Escapa los comodines de LIKE para que el nombre se busque tal cual.
 *
 * `ilike` interpreta `%` y `_` como comodines, y PostgREST además traduce `*`
 * a `%`. Al pasar el nombre sin escapar, enviar `%` traía todas las cuentas y
 * `_____` las de cinco letras: cualquiera podía averiguar qué usuarios existen
 * sin saber ninguna contraseña. El backslash es el escape por defecto de
 * PostgreSQL, así que también hay que escaparlo a él.
 */
function escaparComodines(valor: string): string {
  return valor.replace(/[\\%_*]/g, (caracter) => `\\${caracter}`)
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
  // Tope de largo: sin él, el nombre entra completo en la clave del mapa de
  // intentos y en la consulta, y no hay razón para admitir nombres enormes.
  if (usuario.length > 120) {
    return NextResponse.json(
      { message: "El usuario no puede superar los 120 caracteres.", field: "usuario" },
      { status: 400 },
    )
  }
  if (!contrasena) {
    return NextResponse.json({ message: "La contraseña es obligatoria.", field: "contrasena" }, { status: 400 })
  }
  // scrypt trabaja sobre la contraseña entera: sin tope, una contraseña de
  // varios megas obliga al servidor a derivarla igualmente.
  if (contrasena.length > 200) {
    return NextResponse.json(
      { message: "La contraseña no puede superar los 200 caracteres.", field: "contrasena" },
      { status: 400 },
    )
  }

  // Bloqueo por intentos fallidos
  const ahora = Date.now()
  limpiarIntentos(ahora)
  const clave = usuario.toLowerCase()
  const registro = intentos.get(clave)
  if (registro && registro.bloqueadaHasta > ahora) {
    const segundos = Math.ceil((registro.bloqueadaHasta - ahora) / 1000)
    return NextResponse.json(
      {
        message: `Cuenta bloqueada temporalmente. Intenta de nuevo en ${segundos}s.`,
        field: null,
        lockedUntil: registro.bloqueadaHasta,
      },
      { status: 429 },
    )
  }

  function registrarFalloDeAcceso() {
    const fallos = (registro?.fallos ?? 0) + 1
    const restantes = MAX_INTENTOS - fallos
    if (fallos >= MAX_INTENTOS) {
      intentos.set(clave, { fallos: 0, bloqueadaHasta: ahora + BLOQUEO_MS, visto: ahora })
      return NextResponse.json(
        {
          message: "Demasiados intentos fallidos. Cuenta bloqueada 30 segundos.",
          field: null,
          lockedUntil: ahora + BLOQUEO_MS,
        },
        { status: 429 },
      )
    }
    intentos.set(clave, { fallos, bloqueadaHasta: 0, visto: ahora })
    return NextResponse.json(
      {
        message: `Usuario o contraseña incorrectos. Te ${restantes === 1 ? "queda" : "quedan"} ${restantes} ${restantes === 1 ? "intento" : "intentos"}.`,
        field: null,
      },
      { status: 401 },
    )
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

  const { data: cuenta, error } = await supabase
    .from("usuario_app")
    .select("id_usr, codigo, nombre, clave, activo")
    .ilike("nombre", escaparComodines(usuario))
    .maybeSingle<UsuarioApp>()

  if (error) {
    return NextResponse.json(
      { message: "No se pudo conectar con la base de datos. Intenta de nuevo.", field: null },
      { status: 502 },
    )
  }

  // Segunda comprobación del nombre, ya en memoria: `ilike` sigue siendo una
  // comparación por patrón y esto la convierte en una igualdad exacta sin
  // distinguir mayúsculas, pase lo que pase con el escapado.
  const cuentaValida = cuenta && cuenta.nombre.toLowerCase() === clave ? cuenta : null

  // Se verifica siempre, exista la cuenta o no: si no hay contra qué comparar
  // se usa el hash señuelo, que cuesta lo mismo. Antes se salía sin verificar
  // y un nombre inexistente respondía en ~0 ms frente a los ~55 ms de uno
  // real, lo que permitía averiguar qué usuarios existen.
  const claveValida = await verificarClave(contrasena, cuentaValida?.clave || HASH_SENUELO)
  if (!cuentaValida || !claveValida) {
    return registrarFalloDeAcceso()
  }

  if (!cuentaValida.activo) {
    return NextResponse.json(
      { message: "Este usuario está inactivo. Contacta a un administrador.", field: null },
      { status: 403 },
    )
  }

  // Éxito: limpia intentos
  intentos.delete(clave)

  // Migración transparente: si la contraseña estaba en texto plano, se
  // reemplaza por su hash ahora que sabemos que es la correcta. Así las
  // cuentas se migran solas a medida que la gente entra, sin dejar a nadie
  // fuera ni tener que coordinar un cambio masivo.
  //
  // Es "el mejor esfuerzo": si el UPDATE falla (falta el permiso, o la columna
  // sigue siendo varchar(12) y el hash no cabe), se registra y el login
  // continúa. Nadie se queda sin entrar por esto.
  if (!esHash(cuentaValida.clave ?? "")) {
    try {
      const { error: errorMigracion } = await supabase
        .from("usuario_app")
        .update({ clave: await hashClave(contrasena) })
        .eq("id_usr", cuentaValida.id_usr)

      if (errorMigracion) {
        console.error(
          `[login] No se pudo migrar la clave de "${cuentaValida.nombre}" a hash: ${errorMigracion.message}`,
        )
      }
    } catch (e) {
      console.error(`[login] Fallo inesperado al migrar la clave a hash:`, e)
    }
  }

  return NextResponse.json({
    token: emitirToken(cuentaValida.nombre, ROL_POR_DEFECTO),
    user: { usuario: cuentaValida.nombre, role: ROL_POR_DEFECTO, nombre: cuentaValida.nombre },
  })
}
