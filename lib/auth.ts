const TOKEN_KEY = "gismart_token"
const USER_KEY = "gismart_user"

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
}

/**
 * `fetch` con la sesión adjunta.
 *
 * Las rutas de datos exigen el token, así que toda llamada a `/api` desde el
 * navegador debe pasar por acá. El servidor verifica la firma; lo que el
 * cliente lea del token es solo para la interfaz.
 *
 * Si el servidor responde 401, la sesión se da por terminada y se vuelve al
 * login. Antes no: el token dura ocho horas, así que vencía en plena jornada y
 * a partir de ahí las capas fallaban una tras otra sin que nadie avisara. Lo
 * que se veía era un mapa vacío, no una sesión caducada.
 */
export function fetchConSesion(url: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).then((res) => {
    if (res.status === 401) terminarSesionCaducada()
    return res
  })
}

// Varias capas se cargan a la vez: sin esto, cada 401 lanzaría su propia
// redirección y el aviso saldría repetido.
let cerrandoSesion = false

/** Cierra la sesión vencida y vuelve al login, una sola vez. */
export function terminarSesionCaducada() {
  if (cerrandoSesion || typeof window === "undefined") return
  cerrandoSesion = true
  clearSession()
  window.location.replace("/?sesion=caducada")
}

/**
 * Momento en que caduca el token, en milisegundos, o `null` si no se puede
 * leer. Solo sirve para la interfaz: quien decide de verdad es el servidor,
 * que comprueba la firma en cada petición.
 */
export function expiracionDelToken(token: string | null): number | null {
  if (!token) return null
  try {
    // El cuerpo va en base64url, que usa `-` y `_` donde base64 usa `+` y `/`:
    // `atob` no los admite y hay que traducirlos antes.
    const cuerpo = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/")
    if (!cuerpo) return null
    const carga = JSON.parse(atob(cuerpo))
    return typeof carga.exp === "number" ? carga.exp * 1000 : null
  } catch {
    return null
  }
}

export function isTokenValid(token: string | null): boolean {
  const expira = expiracionDelToken(token)
  return expira !== null && expira > Date.now()
}

export function saveSession(token: string, user: unknown, remember: boolean) {
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(TOKEN_KEY, token)
  storage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

export function logout() {
  clearSession()
  window.location.replace("/")
}

export function getUser() {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}