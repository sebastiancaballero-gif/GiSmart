import { colorParaMostrar, textoSobre } from "@/lib/map/hilos-cable"

/**
 * El número de un hilo en una bolita de su color, como se ve en la bandeja.
 * La misma en Gestión de hilos y en la tabla del trace, para que un hilo se
 * reconozca igual en las dos. `chica` para las filas apretadas de la tabla.
 */
export function BolitaDeHilo({
  numero,
  color,
  chica = false,
  titulo,
}: {
  numero: number | string
  /** El color como lo nombra la base («Verde»); si no lo trae, el que le toca por posición. */
  color: string | null
  chica?: boolean
  titulo?: string
}) {
  const fondo = colorParaMostrar(color, Number(numero) || null)
  return (
    <span
      title={titulo}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums ring-1 ring-foreground/15 ${
        chica ? "h-5 min-w-5 px-1 text-[10px]" : "h-6 min-w-6 px-1.5 text-[11px]"
      }`}
      style={fondo ? { backgroundColor: fondo, color: textoSobre(fondo) } : undefined}
    >
      {numero}
    </span>
  )
}
