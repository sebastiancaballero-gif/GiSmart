const THEME_KEY = "gismart_theme"

export type Theme = "light" | "dark"

/**
 * El tema que se ve. Sin uno elegido a mano, el del sistema: antes se daba por
 * claro, y con el equipo en oscuro el botón ofrecía «Cambiar a modo oscuro» y
 * el primer click no cambiaba nada.
 */
export function getCurrentTheme(): Theme {
  if (typeof document === "undefined") return "light"
  const clases = document.documentElement.classList
  if (clases.contains("dark")) return "dark"
  if (clases.contains("light")) return "light"
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.classList.toggle("light", theme === "light")
  // Con el almacenamiento bloqueado el tema cambia igual; solo no se recuerda.
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Nada que hacer.
  }
}

/** El tema pedido que todavía no se aplicó: el fundido lo aplica un fotograma después. */
let temaEnCamino: Theme | null = null

/**
 * Cambia de tema con un fundido de toda la pantalla. Antes el cambio era de
 * golpe: cada color saltaba por su lado y el mapa base se invertía de un
 * fotograma a otro. Donde el navegador no tiene `startViewTransition`, o el
 * sistema pide reducir el movimiento, cambia como antes.
 */
export function toggleTheme(): Theme {
  const next: Theme = (temaEnCamino ?? getCurrentTheme()) === "dark" ? "light" : "dark"
  const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (reducir || typeof document.startViewTransition !== "function") {
    applyTheme(next)
    return next
  }
  // Dos clicks seguidos: el segundo parte del tema que pidió el primero, no
  // del que todavía se ve.
  temaEnCamino = next
  const transicion = document.startViewTransition(() => {
    applyTheme(next)
    if (temaEnCamino === next) temaEnCamino = null
  })
  // Si llega otro click antes de que empiece, el navegador salta este fundido
  // y rechaza `ready`; sin atraparlo quedaba un error en la consola.
  transicion.ready.catch(() => {})
  return next
}
