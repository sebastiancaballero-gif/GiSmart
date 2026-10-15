import { RIBBON_TABS, type RibbonTab } from "@/components/dashboard-ribbon-data"
import { normalizar } from "@/lib/map/busqueda"

/**
 * Las funciones de la cinta, para encontrarlas con Ctrl+K por su nombre o por
 * lo que hacen («trace», «hilos», «medir distancia»), como la búsqueda de
 * comandos de RustGIS. Sale de la propia cinta, así que un botón nuevo aparece
 * solo; los que todavía no tienen función no se ofrecen.
 */
export type ComandoBuscable = {
  /** Único: pestaña y etiqueta. */
  id: string
  /** El nombre del botón. */
  etiqueta: string
  /** Dónde está: «Red de fibra › Consultas». */
  ruta: string
  /** Lo que hace (la etiqueta emergente del botón). */
  descripcion: string
  pestana: string
  /** Todo lo anterior, normalizado para comparar. */
  texto: string
}

export function comandosDeLaCinta(pestanas: RibbonTab[] = RIBBON_TABS): ComandoBuscable[] {
  const vistos = new Set<string>()
  const comandos: ComandoBuscable[] = []
  for (const pestana of pestanas) {
    for (const grupo of pestana.groups) {
      for (const item of grupo.items) {
        if (!item.accion || item.disabled) continue
        const id = `${pestana.id}:${item.label}`
        if (vistos.has(id)) continue
        vistos.add(id)
        const ruta = `${pestana.label} › ${grupo.label}`
        const descripcion = item.tooltip ?? item.label
        comandos.push({
          id,
          etiqueta: item.label,
          ruta,
          descripcion,
          pestana: pestana.id,
          texto: normalizar(`${item.label} ${descripcion} ${ruta}`),
        })
      }
    }
  }
  return comandos
}

/**
 * Las funciones que coinciden con lo escrito: todas las palabras deben estar
 * en el nombre, en lo que hace o en dónde está. Primero las que empiezan por
 * lo escrito. Desde dos letras, para no llenar la lista al escribir una.
 */
export function buscarComandos(comandos: ComandoBuscable[], consulta: string, maximo = 5): ComandoBuscable[] {
  const q = normalizar(consulta).trim()
  if (q.length < 2) return []
  const palabras = q.split(/\s+/)
  const puntaje = (c: ComandoBuscable) => {
    const nombre = normalizar(c.etiqueta)
    return nombre.startsWith(q) ? 0 : nombre.includes(q) ? 1 : 2
  }
  return comandos
    .filter((c) => palabras.every((p) => c.texto.includes(p)))
    .sort((a, b) => puntaje(a) - puntaje(b) || a.etiqueta.localeCompare(b.etiqueta, "es"))
    .slice(0, maximo)
}
