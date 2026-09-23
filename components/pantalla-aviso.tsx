import type { LucideIcon } from "lucide-react"
import { GismartLogo } from "@/components/gismart-mark"
import { TramaRed } from "@/components/trama-red"

/**
 * Pantalla completa para avisos que cortan el uso de la aplicación: página no
 * encontrada y error inesperado. Comparte el aspecto del login —trama de red,
 * tarjeta con el filo de color y el logo— para que no parezca otra aplicación.
 */
export function PantallaAviso({
  codigo,
  icono: Icono,
  tono = "info",
  titulo,
  descripcion,
  detalle,
  children,
}: {
  /** Número grande sobre el título, como el 404. */
  codigo?: string
  icono: LucideIcon
  /** `error` pinta el filo y el icono en rojo. */
  tono?: "info" | "error"
  titulo: string
  descripcion: string
  /** Algo más bajo la descripción, como la referencia de un error. */
  detalle?: React.ReactNode
  /** Las acciones: la principal primero. */
  children: React.ReactNode
}) {
  const esError = tono === "error"

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <TramaRed />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_8%,color-mix(in_oklch,var(--color-primary)_12%,transparent)_0%,transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/70 blur-2xl"
      />

      <div className="gismart-entrada relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-card text-center shadow-[0_20px_50px_-12px_rgb(15_23_42/0.25)] ring-1 ring-border">
        <div
          aria-hidden="true"
          className={`h-1.5 ${esError ? "bg-destructive" : "bg-gradient-to-r from-[#2a9bc4] via-[#6fc5df] to-[#2f6d9e]"}`}
        />

        <div className="px-7 pb-7 pt-6">
          <GismartLogo className="justify-center" tamanoMarca="h-9" tamanoNombre="text-2xl" />

          {codigo && (
            <p className="mt-6 text-6xl font-extrabold tabular-nums tracking-tight text-primary/85">{codigo}</p>
          )}

          <div
            className={`flex items-center justify-center gap-2 ${codigo ? "mt-2" : "mt-6"} ${
              esError ? "text-destructive" : "text-foreground"
            }`}
          >
            <Icono className={`size-5 ${esError ? "" : "text-primary"}`} aria-hidden="true" />
            <h1 className="text-lg font-bold tracking-tight">{titulo}</h1>
          </div>

          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{descripcion}</p>

          {detalle}

          <div className="mt-6 flex flex-col gap-2">{children}</div>
        </div>
      </div>
    </main>
  )
}

/** Clases de los botones de estas pantallas, para no repetirlas en cada una. */
export const BOTON_PRINCIPAL =
  "flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50"

export const BOTON_SECUNDARIO =
  "flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-2.5 text-sm font-medium text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
