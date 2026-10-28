/**
 * El nombre de una cubierta: «CO13» en las de primer nivel, «17/18» o «3+15»
 * en las NAP.
 *
 * Vivía en `geo_fiber.cubierta_empalme.etiqueta`. El 20 de octubre de 2026 la
 * tabla se recreó y esa columna pasó a llamarse `salidas_div1`, con los mismos
 * valores (las salidas del divisor de primer nivel que alimentan la NAP). El
 * 27 de octubre volvió a cambiar: ya no hay ni `etiqueta` ni `salidas_div1`, el
 * de las NAP está en `cod_operativo` y el de las de primer nivel en
 * `cod_inventario`; la otra columna de cada una dice «---». Se aceptan todos
 * los nombres, en ese orden, y «---» cuenta como vacío: el mapa, el trace y
 * Gestión de hilos no se rompen si la columna vuelve a cambiar de nombre en una
 * de esas idas y vueltas.
 */
export const COLUMNAS_DEL_NOMBRE_DE_CUBIERTA = ["etiqueta", "salidas_div1", "cod_operativo", "cod_inventario"] as const

/** Lo que la base pone cuando no hay dato: «---», «-». */
const SIN_DATO = /^-+$/

/** El nombre de la cubierta según su fila de la base, o `null` si no tiene. */
export function nombreDeCubierta(fila: Record<string, unknown> | null | undefined): string | null {
  for (const columna of COLUMNAS_DEL_NOMBRE_DE_CUBIERTA) {
    const valor = fila?.[columna]
    if (typeof valor === "string" && valor.trim() && !SIN_DATO.test(valor.trim())) return valor.trim()
  }
  return null
}
