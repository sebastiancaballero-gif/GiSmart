/**
 * El nombre de una cubierta: «CO13» en las de primer nivel, «17/18» o «3+15»
 * en las NAP.
 *
 * Vivía en `geo_fiber.cubierta_empalme.etiqueta`. El 20 de octubre de 2026 la
 * tabla se recreó y esa columna pasó a llamarse `salidas_div1`, con los mismos
 * valores (las salidas del divisor de primer nivel que alimentan la NAP); llegó
 * además `etiqueta_puerto_n1`, por ahora vacía. Se aceptan los dos nombres, en
 * ese orden: el mapa, el trace y la sección distribución no se rompen si la
 * columna vuelve a cambiar de nombre en una de esas idas y vueltas.
 */
export const COLUMNAS_DEL_NOMBRE_DE_CUBIERTA = ["etiqueta", "salidas_div1"] as const

/** El nombre de la cubierta según su fila de la base, o `null` si no tiene. */
export function nombreDeCubierta(fila: Record<string, unknown> | null | undefined): string | null {
  for (const columna of COLUMNAS_DEL_NOMBRE_DE_CUBIERTA) {
    const valor = fila?.[columna]
    if (typeof valor === "string" && valor.trim()) return valor.trim()
  }
  return null
}
