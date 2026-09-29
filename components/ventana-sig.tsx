"use client"

import { CircleAlert, Clock, Info, Loader2, TriangleAlert, type LucideIcon } from "lucide-react"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Tooltip } from "@/components/ui/tooltip"

/**
 * Piezas comunes de las ventanas de consulta que siguen al SIG anterior
 * («Gestión de hilos», «Redes por nodo», «GPON»): encabezado, campos de solo lectura
 * con el fondo amarillo de entonces, botones, avisos sin datos y la barra de
 * estado de abajo. Viven juntas para que todas las ventanas se vean iguales.
 */

export type TonoDeMensaje = "info" | "aviso" | "error"
export type Mensaje = { texto: string; tono: TonoDeMensaje; detalle?: string }

/**
 * Lo que el tablero puede hacer con una ventana: abrirla desde el ribbon. Lo
 * demás (qué cable, qué nodo, si está abierta) lo lleva la propia ventana.
 */
export type ManejadorDeVentana = { abrir: () => void }

/** Lo que dice un botón puesto que todavía no tiene su función en la base. */
export const PENDIENTE = (nombre: string) => `«${nombre}» todavía no está disponible: falta la función en la base.`

/** Franja de color, icono, título y una línea que resume lo que se está viendo. */
export function EncabezadoVentana({ icono: Icono, titulo, descripcion }: { icono: LucideIcon; titulo: string; descripcion: string }) {
  return (
    <>
      <div aria-hidden="true" className="h-1 shrink-0 bg-gradient-to-r from-[#2a9bc4] via-[#6fc5df] to-[#2f6d9e]" />
      <div className="flex items-center gap-3 border-b border-border px-5 py-3 pr-12">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icono className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className="mt-0.5 truncate text-xs">{descripcion}</DialogDescription>
        </div>
      </div>
    </>
  )
}

/**
 * Valor de solo lectura con el fondo amarillo del SIG anterior. Vacío no se
 * pinta como una caja amarilla sin nada: lleva borde punteado y un texto guía.
 */
export function Campo({
  valor,
  guia,
  ancho = "w-24",
  mono = true,
  etiqueta,
  chico = false,
}: {
  valor: string | null
  guia: string
  ancho?: string
  mono?: boolean
  etiqueta: string
  chico?: boolean
}) {
  const alto = chico ? "py-0.5 text-[12px]" : "py-1 text-[13px]"
  if (!valor) {
    return (
      <output
        aria-label={etiqueta}
        className={`${ancho} ${alto} truncate rounded-md border border-dashed border-border bg-muted/30 px-2 italic text-muted-foreground`}
      >
        {guia}
      </output>
    )
  }
  return (
    <output
      aria-label={etiqueta}
      title={valor}
      className={`${ancho} ${alto} select-all truncate rounded-md border border-amber-200 bg-amber-50 px-2 font-semibold tabular-nums text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100 ${
        mono ? "font-mono" : ""
      }`}
    >
      {valor}
    </output>
  )
}

/** Un dato: etiqueta arriba y el valor debajo. */
export function Dato(props: { etiqueta: string; valor: string | null; ancho?: string; guia?: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <Rotulo>{props.etiqueta}</Rotulo>
      <Campo etiqueta={props.etiqueta} valor={props.valor} ancho={props.ancho} guia={props.guia ?? "—"} mono={props.mono} />
    </div>
  )
}

/** Rótulo pequeño en mayúsculas, encima de un campo. */
export function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
}

export function Boton({
  icono: Icono,
  children,
  onClick,
  colorIcono,
  derecha = false,
  principal = false,
  deshabilitado = false,
  titulo,
  pendiente = false,
}: {
  icono: LucideIcon
  children: React.ReactNode
  onClick: () => void
  colorIcono?: string
  derecha?: boolean
  /** Relleno con el color de la marca: la acción principal de la ventana. */
  principal?: boolean
  deshabilitado?: boolean
  titulo?: string
  /** Todavía no tiene su función en la base (ver `PENDIENTE`). */
  pendiente?: boolean
}) {
  const icono = (
    <Icono
      className={`size-4 shrink-0 ${principal ? "" : pendiente ? "text-muted-foreground/70" : (colorIcono ?? "text-primary")}`}
      aria-hidden="true"
    />
  )
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-disabled={pendiente ? true : undefined}
      title={pendiente ? "Próximamente: todavía no tiene su función en la base" : titulo}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
        principal
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : pendiente
            ? "border border-dashed border-border bg-card/60 text-muted-foreground shadow-none hover:bg-accent/60"
            : "border border-border bg-card text-foreground hover:-translate-y-px hover:bg-accent hover:shadow active:translate-y-0"
      }`}
    >
      {!derecha && icono}
      {children}
      {derecha && icono}
      {pendiente && (
        <>
          <Clock className="size-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="sr-only">(próximamente)</span>
        </>
      )}
    </button>
  )
}

/** Aviso que ocupa el lugar de una grilla cuando no hay nada que mostrar. */
export function EstadoVacio({
  icono: Icono,
  tono = "info",
  titulo,
  texto,
  detalle,
  children,
}: {
  icono: LucideIcon
  tono?: TonoDeMensaje
  titulo: string
  texto: string
  detalle?: string
  children?: React.ReactNode
}) {
  const colores =
    tono === "error"
      ? "bg-destructive/10 text-destructive ring-destructive/20"
      : tono === "aviso"
        ? "bg-amber-500/12 text-amber-600 ring-amber-500/25 dark:text-amber-400"
        : "bg-primary/10 text-primary ring-primary/20"
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:18px_18px] p-8 text-center">
      <span className={`flex size-14 items-center justify-center rounded-2xl shadow-sm ring-1 ${colores}`}>
        <Icono className="size-6" aria-hidden="true" />
      </span>
      <div className="max-w-md rounded-xl bg-card/80 px-4 py-2 backdrop-blur-sm">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{texto}</p>
        {detalle && <p className="mt-2 break-words rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{detalle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}

/**
 * Dos o más opciones excluyentes, como botones de radio en una sola pieza. Con
 * el teclado se comporta como un grupo de radio: Tab entra en la opción
 * marcada y las flechas pasan a la siguiente habilitada y la marcan.
 */
export function Opciones<T extends string>({
  valor,
  opciones,
  onChange,
  etiqueta,
}: {
  valor: T
  opciones: { id: T; texto: string; deshabilitada?: boolean; titulo?: string }[]
  onChange: (id: T) => void
  etiqueta: string
}) {
  function alTeclear(e: React.KeyboardEvent<HTMLDivElement>) {
    const paso =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!paso) return
    const habilitadas = opciones.filter((o) => !o.deshabilitada)
    if (habilitadas.length < 2) return
    e.preventDefault()
    const actual = habilitadas.findIndex((o) => o.id === valor)
    const siguiente = habilitadas[(actual + paso + habilitadas.length) % habilitadas.length]
    onChange(siguiente.id)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-opcion="${siguiente.id}"]`)?.focus()
  }
  // La que recibe el Tab: la marcada, o la primera habilitada si la marcada no se puede usar.
  const enfocable =
    opciones.find((o) => o.id === valor && !o.deshabilitada)?.id ?? opciones.find((o) => !o.deshabilitada)?.id

  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      onKeyDown={alTeclear}
      className="inline-flex flex-wrap rounded-lg bg-muted p-0.5 ring-1 ring-border"
    >
      {opciones.map((o) => {
        const activa = o.id === valor
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={activa}
            data-opcion={o.id}
            // Solo una entra en el orden de Tab; a las demás se llega con flechas.
            tabIndex={o.id === enfocable ? 0 : -1}
            disabled={o.deshabilitada}
            title={o.titulo}
            onClick={() => onChange(o.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45 ${
              activa ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex size-3 items-center justify-center rounded-full ring-1 ${activa ? "ring-primary" : "ring-muted-foreground/50"}`}
            >
              {activa && <span className="size-1.5 rounded-full bg-primary" />}
            </span>
            {o.texto}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Botón cuadrado con solo un icono y su explicación al pasar el ratón. Con
 * `pendiente` se ve apagado, con borde punteado y un reloj: así no se confunde
 * con los que ya funcionan (igual que los botones del ribbon). Se puede pulsar
 * igual, y la ventana dice qué falta.
 */
export function BotonIcono({
  icono: Icono,
  etiqueta,
  onClick,
  color,
  pendiente = false,
}: {
  icono: LucideIcon
  etiqueta: string
  onClick: () => void
  color?: string
  pendiente?: boolean
}) {
  return (
    // Arriba y no a la derecha: estos botones van en fila, y a la derecha la
    // etiqueta tapaba el botón de al lado mientras uno recorría la fila.
    <Tooltip label={pendiente ? `${etiqueta} · Próximamente` : etiqueta} side="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={pendiente ? `${etiqueta} (próximamente)` : etiqueta}
        aria-disabled={pendiente ? true : undefined}
        className={`relative flex size-8 shrink-0 items-center justify-center rounded-lg border outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
          pendiente
            ? "border-dashed border-border bg-card/60 hover:bg-accent/60"
            : "border-border bg-card shadow-sm hover:-translate-y-px hover:bg-accent"
        }`}
      >
        <Icono className={`size-4 ${pendiente ? "text-muted-foreground/60" : (color ?? "text-primary")}`} aria-hidden="true" />
        {pendiente && (
          <Clock
            className="absolute -right-1 -top-1 size-3 rounded-full bg-card text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </button>
    </Tooltip>
  )
}

/** Clases de las listas desplegables de estas ventanas. */
export const claseSelect =
  "h-8 rounded-lg border border-input bg-card px-2.5 text-xs font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground"

/** Un grupo con título sobre el borde, como los recuadros del SIG anterior. */
export function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-border bg-card px-3.5 pb-3.5 pt-2 shadow-sm">
      <legend className="mx-auto rounded-full bg-primary/10 px-3 py-0.5 text-[11px] font-bold text-primary ring-1 ring-primary/20">
        {titulo}
      </legend>
      {children}
    </fieldset>
  )
}

/** Una barra gris que late: el lugar de un dato que está llegando. */
export function Hueso({ ancho = "w-16", redondo = false }: { ancho?: string; redondo?: boolean }) {
  return <span className={`block animate-pulse bg-muted ${redondo ? "size-6 rounded-full" : `h-3 ${ancho} rounded`}`} />
}

/** La barra de abajo, como la del SIG anterior: qué está pasando y, si falla, cómo reintentar. */
export function BarraDeEstado({
  mensaje,
  cargando = false,
  accion,
  children,
}: {
  mensaje: Mensaje
  cargando?: boolean
  accion?: { texto: string; onClick: () => void }
  /** Algo más a la derecha (por ejemplo, la barra de avance). */
  children?: React.ReactNode
}) {
  const Icono = mensaje.tono === "error" ? CircleAlert : mensaje.tono === "aviso" ? TriangleAlert : Info
  return (
    <div
      role="status"
      className={`flex items-center gap-2 border-t border-border px-4 py-2 text-xs ${
        mensaje.tono === "error"
          ? "bg-destructive/8 text-destructive"
          : mensaje.tono === "aviso"
            ? "bg-amber-500/8 text-amber-700 dark:text-amber-400"
            : "bg-card text-muted-foreground"
      }`}
    >
      {cargando ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <Icono className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        {mensaje.texto}
        {mensaje.detalle && <span className="mt-0.5 block break-words font-mono text-[11px] opacity-80">{mensaje.detalle}</span>}
      </span>
      {accion && (
        <button
          type="button"
          onClick={accion.onClick}
          className="shrink-0 rounded-md px-2 py-0.5 font-semibold underline-offset-2 hover:underline"
        >
          {accion.texto}
        </button>
      )}
      {children}
    </div>
  )
}
