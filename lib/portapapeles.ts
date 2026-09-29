/**
 * Copia texto al portapapeles. Nunca lanza: devuelve si pudo.
 *
 * `navigator.clipboard` solo existe con HTTPS o en localhost; detrás de un IIS
 * en HTTP se usa el camino antiguo (`execCommand`). El texto auxiliar de ese
 * camino va dentro de `junto` (por ejemplo, el diálogo abierto): fuera de él,
 * el diálogo recupera el foco y no queda nada seleccionado.
 */
export async function copiarTexto(texto: string, junto: Element = document.body): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const area = document.createElement("textarea")
      area.value = texto
      area.setAttribute("readonly", "")
      area.style.position = "fixed"
      area.style.opacity = "0"
      junto.appendChild(area)
      area.select()
      const ok = document.execCommand("copy")
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}
