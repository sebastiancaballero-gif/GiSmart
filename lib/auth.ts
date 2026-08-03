const TOKEN_KEY = "gismart_token"
const USER_KEY = "gismart_user"

export type AuthUser = { usuario: string; role: string }

/** Guarda el token JWT. persist=true -> localStorage (recordar), si no sessionStorage. */
export function saveSession(token: string, user: AuthUser, persist: boolean) {
  if (typeof window === "undefined") return
  const store = persist ? window.localStorage : window.sessionStorage
  store.setItem(TOKEN_KEY, token)
  store.setItem(USER_KEY, JSON.stringify(user))
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY)
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(USER_KEY) ?? window.sessionStorage.getItem(USER_KEY)
  try {
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const [, payload] = token.split(".")
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
    return typeof decoded.exp === "number" && decoded.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export function clearSession() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(USER_KEY)
}
