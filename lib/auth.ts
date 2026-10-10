/**
 * La sesión vista desde el navegador.
 *
 * El token vive en una cookie httpOnly que pone el servidor al iniciar sesión
 * (ver lib/auth-server.ts): el JavaScript de la página no lo ve ni lo guarda.
 * Aquí solo se recuerda lo que la interfaz necesita mostrar: quién entró y
 * cuándo vence la sesión.
 */

const USER_KEY = "gismart_user"
const EXPIRA_KEY = "gismart_expira"
// Donde vivía el token antes de la cookie; se borra si quedó de una versión anterior.
const TOKEN_ANTERIOR_KEY = "gismart_token"

/**
 * El almacenamiento del navegador, o `null` si está bloqueado (navegación
 * privada estricta, políticas de la empresa): ahí hasta leer `localStorage`
 * lanza un error, y el login decía «Error de red» aunque la clave era buena.
 * Sin almacenamiento la sesión sigue en la cookie; el tablero se la pregunta
 * al servidor.
 */
function almacen(tipo: "local" | "sesion"): Storage | null {
  try {
    return tipo === "local" ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

/**
 * `fetch` con la sesión.
 *
 * La cookie va sola en cada petición al mismo origen; esta función existe para
 * reaccionar al 401. Si el servidor responde 401, la sesión se da por
 * terminada y se vuelve al login. Antes no: la sesión dura ocho horas, así que
 * vencía en plena jornada y a partir de ahí las capas fallaban una tras otra
 * sin que nadie avisara. Lo que se veía era un mapa vacío, no una sesión
 * caducada.
 */
export function fetchConSesion(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { credentials: "same-origin", ...init }).then((res) => {
    if (res.status === 401) terminarSesionCaducada()
    return res
  })
}

// Varias capas se cargan a la vez: sin esto, cada 401 lanzaría su propia
// redirección y el aviso saldría repetido.
let cerrandoSesion = false

/** Borra la cookie en el servidor. Si falla la red, igual se sale: la cookie vence sola. */
function cerrarEnServidor(): Promise<void> {
  return fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
    .then(() => undefined)
    .catch(() => undefined)
}

/** Cierra la sesión vencida y vuelve al login, una sola vez. */
export function terminarSesionCaducada() {
  if (cerrandoSesion || typeof window === "undefined") return
  cerrandoSesion = true
  clearSession()
  void cerrarEnServidor().then(() => window.location.replace("/?sesion=caducada"))
}

/** Lo que el login dejó en el navegador: quién entró y cuándo vence, en milisegundos. */
export function saveSession(user: unknown, expira: number, remember: boolean) {
  clearSession()
  try {
    const storage = almacen(remember ? "local" : "sesion")
    storage?.setItem(USER_KEY, JSON.stringify(user))
    storage?.setItem(EXPIRA_KEY, String(expira))
  } catch {
    // Lleno o bloqueado: la sesión sigue en la cookie.
  }
}

export function clearSession() {
  for (const storage of [almacen("local"), almacen("sesion")]) {
    try {
      storage?.removeItem(USER_KEY)
      storage?.removeItem(EXPIRA_KEY)
      storage?.removeItem(TOKEN_ANTERIOR_KEY)
    } catch {
      // Bloqueado: no hay nada que borrar.
    }
  }
}

/** Cuándo vence la sesión según lo que guardó el login, o `null` si no hay. */
export function expiracionGuardada(): number | null {
  if (typeof window === "undefined") return null
  const crudo = almacen("local")?.getItem(EXPIRA_KEY) ?? almacen("sesion")?.getItem(EXPIRA_KEY) ?? null
  const valor = Number(crudo)
  return crudo && Number.isFinite(valor) ? valor : null
}

/**
 * Pregunta al servidor si la cookie de sesión sigue siendo válida.
 * `"sin-red"` si no se pudo preguntar: no es lo mismo que una sesión vencida.
 */
export async function verificarSesion(): Promise<{ expira: number; usuario: string | null } | "invalida" | "sin-red"> {
  try {
    const res = await fetch("/api/auth/sesion", { credentials: "same-origin", cache: "no-store" })
    if (res.status === 401) return "invalida"
    if (!res.ok) return "sin-red"
    const cuerpo = (await res.json()) as { expira?: unknown; usuario?: unknown }
    return typeof cuerpo.expira === "number"
      ? { expira: cuerpo.expira, usuario: typeof cuerpo.usuario === "string" ? cuerpo.usuario : null }
      : "invalida"
  } catch {
    return "sin-red"
  }
}

export async function logout() {
  clearSession()
  await cerrarEnServidor()
  window.location.replace("/")
}

export function getUser() {
  if (typeof window === "undefined") return null
  const raw = almacen("local")?.getItem(USER_KEY) || almacen("sesion")?.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
