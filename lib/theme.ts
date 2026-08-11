const THEME_KEY = "gismart_theme"

export type Theme = "light" | "dark"

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(THEME_KEY)
  return stored === "light" || stored === "dark" ? stored : null
}

export function getCurrentTheme(): Theme {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
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
