import type { MufaCampoJSON } from "./mufa-field-data"

// Puente simple entre el panel de la mufa en el mapa y la página
// /dashboard/mufa: guarda el esquema de la mufa que se acaba de seleccionar
// para que esa página lo lea al abrirse, en vez de usar el mockup fijo.
const KEY = "gismart_selected_mufa"

export function setSelectedMufaSchema(schema: MufaCampoJSON) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(KEY, JSON.stringify(schema))
}

export function getSelectedMufaSchema(): MufaCampoJSON | null {
  if (typeof window === "undefined") return null
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as MufaCampoJSON
  } catch {
    return null
  }
}
