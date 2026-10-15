import type { ElementoDelMapa } from "@/components/network-map"
import { normalizar } from "@/lib/map/busqueda"
import { textoDeCelda, valorDeCelda, type CapaDeTabla, type Columna } from "../tabla/columnas"

/**
 * «Seleccionar por atributos», como en RustGIS o ArcGIS, pero sin escribir
 * SQL: condiciones de campo, operador y valor, unidas con «y» u «o». Se
 * evalúa sobre lo que el mapa ya tiene cargado; no consulta la base.
 */
export type Operador = "igual" | "distinto" | "mayor" | "mayorIgual" | "menor" | "menorIgual" | "contiene" | "empieza" | "vacio" | "conDato"

export const OPERADORES: { id: Operador; texto: string; conValor: boolean }[] = [
  { id: "igual", texto: "es igual a", conValor: true },
  { id: "distinto", texto: "es distinto de", conValor: true },
  { id: "contiene", texto: "contiene", conValor: true },
  { id: "empieza", texto: "empieza por", conValor: true },
  { id: "mayor", texto: "es mayor que", conValor: true },
  { id: "mayorIgual", texto: "es mayor o igual que", conValor: true },
  { id: "menor", texto: "es menor que", conValor: true },
  { id: "menorIgual", texto: "es menor o igual que", conValor: true },
  { id: "vacio", texto: "está vacío", conValor: false },
  { id: "conDato", texto: "tiene dato", conValor: false },
]

export type Condicion = { campo: string; operador: Operador; valor: string }

export type Consulta = { capa: CapaDeTabla; union: "y" | "o"; condiciones: Condicion[] }

/** Qué se hace con lo que ya estaba seleccionado. */
export type ModoDeSeleccion = "nueva" | "agregar" | "quitar" | "dentro"

/** «1.234,5», «1234.5» o «144» como número; `null` si no es uno. */
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "")
  if (!/^[-+]?[\d.,]+$/.test(limpio)) return null
  // Con coma y punto, el último es el decimal; con solo coma, la coma es el decimal.
  const ultimoPunto = limpio.lastIndexOf(".")
  const ultimaComa = limpio.lastIndexOf(",")
  const normal =
    ultimaComa > ultimoPunto ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "")
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

function cumpleCondicion(e: ElementoDelMapa, c: Condicion, nombres: Map<string, string>): boolean {
  const valor = valorDeCelda(e, c.campo, nombres)
  if (c.operador === "vacio") return valor === null
  if (c.operador === "conDato") return valor !== null
  if (valor === null) return c.operador === "distinto"
  const buscado = c.valor.trim()
  const numero = leerNumero(buscado)
  if (typeof valor === "number" && numero !== null) {
    switch (c.operador) {
      case "igual":
        return valor === numero
      case "distinto":
        return valor !== numero
      case "mayor":
        return valor > numero
      case "mayorIgual":
        return valor >= numero
      case "menor":
        return valor < numero
      case "menorIgual":
        return valor <= numero
    }
  }
  const a = normalizar(textoDeCelda(valor))
  const b = normalizar(buscado)
  switch (c.operador) {
    case "igual":
      return a === b
    case "distinto":
      return a !== b
    case "contiene":
      return a.includes(b)
    case "empieza":
      return a.startsWith(b)
    case "mayor":
      return a.localeCompare(b, "es", { numeric: true }) > 0
    case "mayorIgual":
      return a.localeCompare(b, "es", { numeric: true }) >= 0
    case "menor":
      return a.localeCompare(b, "es", { numeric: true }) < 0
    case "menorIgual":
      return a.localeCompare(b, "es", { numeric: true }) <= 0
  }
}

/** Una condición está completa si tiene campo y, si el operador lo pide, valor. */
export function condicionCompleta(c: Condicion): boolean {
  const op = OPERADORES.find((o) => o.id === c.operador)
  return Boolean(c.campo) && Boolean(op) && (!op?.conValor || c.valor.trim() !== "")
}

/** Las claves de los elementos de la capa que cumplen la consulta (las condiciones incompletas no cuentan). */
export function evaluarConsulta(elementos: ElementoDelMapa[], consulta: Consulta, nombres: Map<string, string>): string[] {
  const condiciones = consulta.condiciones.filter(condicionCompleta)
  return elementos
    .filter((e) => e.tipo === consulta.capa)
    .filter((e) => {
      if (condiciones.length === 0) return false
      return consulta.union === "y"
        ? condiciones.every((c) => cumpleCondicion(e, c, nombres))
        : condiciones.some((c) => cumpleCondicion(e, c, nombres))
    })
    .map((e) => e.clave)
}

/** Aplica el resultado a la selección que había, según el modo. */
export function combinarSeleccion(actual: Set<string>, resultado: string[], modo: ModoDeSeleccion): Set<string> {
  const nuevos = new Set(resultado)
  switch (modo) {
    case "nueva":
      return nuevos
    case "agregar":
      return new Set([...actual, ...nuevos])
    case "quitar":
      return new Set([...actual].filter((c) => !nuevos.has(c)))
    case "dentro":
      return new Set([...actual].filter((c) => nuevos.has(c)))
  }
}

/** La consulta en palabras, para la tabla: «Cantidad de hilos es igual a 144 y Función contiene nivel». */
export function describirConsulta(consulta: Consulta, columnas: Columna[]): string {
  return consulta.condiciones
    .filter(condicionCompleta)
    .map((c) => {
      const campo = columnas.find((col) => col.clave === c.campo)?.titulo ?? c.campo
      const op = OPERADORES.find((o) => o.id === c.operador)
      return `${campo} ${op?.texto ?? c.operador}${op?.conValor ? ` ${c.valor.trim()}` : ""}`
    })
    .join(consulta.union === "y" ? " y " : " o ")
}
