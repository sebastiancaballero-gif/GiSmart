const THEME_KEY = "gismart_theme"

export type Theme = "light" | "dark"

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(THEME_KEY)
  return stored === "light" || stored === "dark" ? stored : null
}

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
  localStorage.setItem(THEME_KEY, theme)
}

export function toggleTheme(): Theme {
  const next: Theme = getCurrentTheme() === "dark" ? "light" : "dark"
  applyTheme(next)
  return next
}
