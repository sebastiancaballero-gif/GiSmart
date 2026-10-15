import type { ElementoDelMapa } from "@/components/network-map"
import { CABECERA_FIELD_LABELS, CAMPOS_REFERENCIA, FIBER_FIELD_LABELS, MUFA_FIELD_LABELS } from "@/lib/map/symbology"
import { normalizar } from "@/lib/map/busqueda"

/** Las capas que tienen tabla: las zonas no traen atributos de la base. */
export type CapaDeTabla = "node" | "fiber" | "cabecera"

export const NOMBRE_DE_CAPA_TABLA: Record<CapaDeTabla, string> = {
  node: "Cubiertas",
  fiber: "Cables",
  cabecera: "Cabeceras",
}

export type Columna = {
  /** El campo de la base, o «__nombre» / «__largo» para los que arma el mapa. */
  clave: string
  titulo: string
  /** Todos sus valores son números: se alinea a la derecha y se ordena como número. */
  numerica: boolean
}

export type Celda = string | number | null

const ETIQUETAS: Record<CapaDeTabla, Record<string, string>> = {
  node: MUFA_FIELD_LABELS,
  fiber: FIBER_FIELD_LABELS,
  cabecera: CABECERA_FIELD_LABELS,
}

/** Los campos de auditoría (UUID, quién y cuándo) no caben en una tabla de consulta: siguen en la ficha. */
const DE_AUDITORIA = new Set(["id", "id_legacy", "creado_en", "creado_por", "modificado_en", "modificado_por"])

/** El nombre de cada cubierta, cable o cabecera por su UUID: las referencias se leen por nombre. */
export function nombresPorId(elementos: ElementoDelMapa[]): Map<string, string> {
  const nombres = new Map<string, string>()
  for (const e of elementos) {
    const id = e.propiedades?.id
    if (typeof id === "string") nombres.set(id, e.nombre)
  }
  return nombres
}

/** El valor de una celda: el nombre en vez del UUID en las referencias, el largo del cable en metros. */
export function valorDeCelda(e: ElementoDelMapa, clave: string, nombres: Map<string, string>): Celda {
  if (clave === "__nombre") return e.nombre
  if (clave === "__largo") return e.largoM
  const crudo = e.propiedades?.[clave]
  if (crudo === null || crudo === undefined || crudo === "") return null
  if (CAMPOS_REFERENCIA.has(clave) && typeof crudo === "string") return nombres.get(crudo) ?? crudo
  if (typeof crudo === "number") return Number.isFinite(crudo) ? crudo : null
  if (typeof crudo === "boolean") return crudo ? "Sí" : "No"
  if (typeof crudo === "object") return JSON.stringify(crudo)
  return String(crudo)
}

/**
 * Las columnas de la tabla de esa capa: el nombre primero, después los campos
 * que la ficha de información ya sabe nombrar (sin los de auditoría) y que
 * tengan algún dato. Antes de mostrar cuarenta columnas vacías, se omiten.
 */
export function columnasDe(capa: CapaDeTabla, elementos: ElementoDelMapa[], nombres: Map<string, string>): Columna[] {
  const filas = elementos.filter((e) => e.tipo === capa)
  const columnas: Columna[] = [{ clave: "__nombre", titulo: "Nombre", numerica: false }]
  if (capa === "fiber") columnas.push({ clave: "__largo", titulo: "Longitud (m)", numerica: true })
  for (const [clave, titulo] of Object.entries(ETIQUETAS[capa])) {
    if (DE_AUDITORIA.has(clave)) continue
    const valores = filas.map((e) => valorDeCelda(e, clave, nombres)).filter((v) => v !== null)
    if (valores.length === 0) continue
    // El nombre ya va primero: un campo que en cada fila está vacío o repite el nombre sobra.
    if (
      filas.every((e) => {
        const v = valorDeCelda(e, clave, nombres)
        return v === null || v === e.nombre
      })
    )
      continue
    columnas.push({ clave, titulo, numerica: valores.every((v) => typeof v === "number") })
  }
  return columnas
}

const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 })

/** Cómo se lee una celda en pantalla y en el buscador de la tabla. */
export function textoDeCelda(valor: Celda): string {
  if (valor === null) return ""
  return typeof valor === "number" ? formatoNumero.format(valor) : valor
}

/** Para ordenar: números como números; textos sin tildes ni mayúsculas, y los vacíos al final. */
export function compararCeldas(a: Celda, b: Celda): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return normalizar(String(a)).localeCompare(normalizar(String(b)), "es", { numeric: true })
}

/** Si la fila tiene todas las palabras buscadas en alguna de sus celdas. */
export function filaCoincide(e: ElementoDelMapa, columnas: Columna[], nombres: Map<string, string>, busqueda: string): boolean {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const texto = normalizar(columnas.map((c) => textoDeCelda(valorDeCelda(e, c.clave, nombres))).join(" "))
  return palabras.every((p) => texto.includes(p))
}
