import type { ElementoDelMapa } from "@/components/network-map"
import { columna, type FilaXlsx, type HojaXlsx } from "@/lib/excel"
import { NOMBRE_DE_CAPA_TABLA, textoDeCelda, valorDeCelda, type CapaDeTabla, type Columna } from "./columnas"

/**
 * La tabla tal como se ve (mismas columnas, filtro y orden) en una hoja de
 * Excel: título, una línea de contexto, encabezado fijo con filtro y una fila
 * por elemento. Los números van como números, para que Excel los sume y ordene.
 */
export function hojaDeLaTabla({
  capa,
  columnas,
  filas,
  nombres,
  contexto,
}: {
  capa: CapaDeTabla
  columnas: Columna[]
  filas: ElementoDelMapa[]
  nombres: Map<string, string>
  /** Qué se exportó: «Solo lo seleccionado · Consulta: …». */
  contexto: string
}): HojaXlsx {
  const ultima = columna(Math.max(columnas.length - 1, 0))
  const encabezado = 3
  const datos: FilaXlsx[] = filas.map((e) => ({
    celdas: columnas.map((c) => valorDeCelda(e, c.clave, nombres)),
    estilo: "dato",
  }))
  // Ancho de cada columna: lo que ocupa su texto más largo, entre 8 y 40 caracteres.
  const anchos = columnas.map((c, i) =>
    Math.min(40, Math.max(8, c.titulo.length + 2, ...datos.map((f) => textoDeCelda(f.celdas[i] as string | number | null).length + 2))),
  )
  return {
    nombre: NOMBRE_DE_CAPA_TABLA[capa],
    anchos,
    filas: [
      { celdas: [`${NOMBRE_DE_CAPA_TABLA[capa]} (${filas.length})`], estilo: "titulo" },
      { celdas: [contexto], estilo: "nota" },
      { celdas: columnas.map((c) => c.titulo), estilo: "encabezado" },
      ...datos,
    ],
    combinar: columnas.length > 1 ? [`A1:${ultima}1`, `A2:${ultima}2`] : undefined,
    filasFijas: encabezado,
    filtro: `A${encabezado}:${ultima}${encabezado + Math.max(filas.length, 1)}`,
    horizontal: columnas.length > 6,
  }
}
