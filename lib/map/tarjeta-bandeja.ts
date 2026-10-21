/**
 * Una tarjeta de la OLT o una bandeja del ODF (`tab_fiber.tarjeta_bandeja_eqp`):
 * su slot, de qué tipo de equipo es y a qué equipo pertenece.
 *
 * El 20 de octubre de 2026 la base renombró `id_equipo` → `id_equipo_pert` y
 * `tipo_equipo` → `tipo_equipo_pert` (como ya se llaman en `puerto_equipo`), y
 * la tabla del trace y el ODF y la OLT de Gestión de hilos fallaron con 42703.
 * Las rutas piden la fila entera y la leen con esto, que acepta los dos
 * nombres: el nuevo primero.
 */
export type TarjetaOBandeja = {
  id: string
  num_slot: number | null
  /** «OLT» o «ODF». */
  tipo_equipo: string | null
  /** El equipo (`tab_fiber.equipo_red`) al que pertenece. */
  id_equipo: string | null
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/** La tarjeta o bandeja de una fila de la base, con las columnas como se llamen. */
export function tarjetaDeFila(fila: Record<string, unknown>): TarjetaOBandeja {
  const slot = typeof fila.num_slot === "string" ? Number(fila.num_slot) : fila.num_slot
  return {
    id: String(fila.id ?? ""),
    num_slot: typeof slot === "number" && Number.isFinite(slot) ? slot : null,
    tipo_equipo: texto(fila.tipo_equipo_pert) ?? texto(fila.tipo_equipo),
    id_equipo: texto(fila.id_equipo_pert) ?? texto(fila.id_equipo),
  }
}
