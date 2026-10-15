"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { Bot, CircleAlert, KeyRound, Loader2, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react"
import { fetchConSesion } from "@/lib/auth"
import type { AccionDelAsistente } from "./acciones"

type Mensaje =
  | { rol: "usuario"; texto: string }
  | { rol: "asistente"; texto: string; usadas: string[] }
  | { rol: "error"; texto: string; detalle?: string }

/** Cómo se lee cada herramienta en la línea «Consultó: …». */
const NOMBRE_DE_HERRAMIENTA: Record<string, string> = {
  buscar_elementos: "búsqueda",
  resumen_red: "resumen de la red",
  ficha_cubierta: "ficha de cubierta",
  ficha_cable: "ficha de cable",
  trace: "trace",
  mostrar_en_mapa: "mapa",
  seleccionar_en_mapa: "selección en el mapa",
  abrir_trace: "ventana del trace",
}

const SUGERENCIAS = [
  "¿Cuántas cubiertas hay de cada nivel?",
  "Muéstrame CO19 en el mapa",
  "¿Qué cables llegan y salen de CO19?",
  "¿Cuántos hilos del cable 2102262 están conectados?",
  "Haz el trace hacia arriba del hilo 5 del cable 2102262",
]

/** «**negrita**» y listas con «- »: lo poco de formato que usa Gemini, sin HTML de por medio. */
function TextoConFormato({ texto }: { texto: string }) {
  const lineas = texto.split("\n")
  const enLinea = (linea: string) =>
    linea.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
      parte.startsWith("**") && parte.endsWith("**") ? <strong key={i}>{parte.slice(2, -2)}</strong> : <Fragment key={i}>{parte}</Fragment>,
    )
  return (
    <div className="space-y-1">
      {lineas.map((l, i) => {
        const item = /^\s*[-*•]\s+(.*)$/.exec(l)
        if (item) {
          return (
            <p key={i} className="flex gap-1.5 pl-1">
              <span aria-hidden="true">•</span>
              <span>{enLinea(item[1])}</span>
            </p>
          )
        }
        return l.trim() ? <p key={i}>{enLinea(l)}</p> : null
      })}
    </div>
  )
}

/**
 * Asistente de IA (Gemini): preguntas en español sobre la red. Responde con
 * los datos de la base y puede mover el mapa, seleccionar o abrir el trace.
 * Solo consulta: no cambia nada de la red.
 *
 * Va acoplado a la derecha del panel del mapa, a todo lo alto (con
 * `data-acoplado`, el panel le deja ese espacio): el mapa y la tabla se
 * angostan y la ficha y la leyenda siguen a la vista.
 */
export function PanelAsistente({
  ficha,
  lugar,
  onAcciones,
  onCerrar,
}: {
  /** Lo que muestra la ficha ahora, para que «esta cubierta» tenga sentido. */
  ficha: () => string | null
  lugar: string
  /** Lo que el asistente pidió hacer en el mapa; devuelve avisos si algo no se encontró. */
  onAcciones: (acciones: AccionDelAsistente[]) => string[]
  onCerrar: () => void
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [conversacion, setConversacion] = useState<string | null>(null)
  const [texto, setTexto] = useState("")
  const [pensando, setPensando] = useState(false)
  const [sinClave, setSinClave] = useState<string | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: "smooth" })
  }, [mensajes, pensando])

  useEffect(() => {
    campoRef.current?.focus()
  }, [])

  async function enviar(pregunta: string) {
    const mensaje = pregunta.trim()
    if (!mensaje || pensando) return
    setTexto("")
    setMensajes((m) => [...m, { rol: "usuario", texto: mensaje }])
    setPensando(true)
    try {
      const res = await fetchConSesion("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje, conversacion, contexto: { ficha: ficha(), lugar } }),
      })
      const datos = await res.json().catch(() => null)
      if (res.status === 503 && datos?.codigo === "sin-clave") {
        setSinClave(datos.message)
        setMensajes((m) => m.slice(0, -1))
        return
      }
      if (!res.ok) {
        setMensajes((m) => [
          ...m,
          { rol: "error", texto: datos?.message ?? `El servidor respondió ${res.status}.`, detalle: datos?.detalle ? `/api/asistente → ${datos.detalle}` : undefined },
        ])
        return
      }
      setConversacion(datos.conversacion ?? null)
      const avisos = Array.isArray(datos.acciones) && datos.acciones.length > 0 ? onAcciones(datos.acciones) : []
      setMensajes((m) => [
        ...m,
        { rol: "asistente", texto: String(datos.respuesta ?? ""), usadas: Array.isArray(datos.usadas) ? datos.usadas : [] },
        ...avisos.map((a) => ({ rol: "error" as const, texto: a })),
      ])
    } catch (e) {
      setMensajes((m) => [
        ...m,
        { rol: "error", texto: "No se pudo hablar con el servidor.", detalle: e instanceof Error ? e.message : String(e) },
      ])
    } finally {
      setPensando(false)
      campoRef.current?.focus()
    }
  }

  function nuevaConversacion() {
    setMensajes([])
    setConversacion(null)
    setTexto("")
    campoRef.current?.focus()
  }

  return (
    <aside
      data-acoplado
      aria-label="Asistente de IA"
      className="absolute inset-y-0 right-0 z-30 flex w-96 flex-col overflow-hidden border-l border-border bg-card shadow-xl gismart-panel max-md:w-full"
    >
      <div className="h-1 shrink-0 bg-gradient-to-r from-[#2a9bc4] via-[#6fc5df] to-[#2f6d9e]" aria-hidden="true" />
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Asistente IA</h2>
          <p className="text-[11px] text-muted-foreground">Pregunta sobre la red en tus palabras · Gemini</p>
        </div>
        <button
          type="button"
          onClick={nuevaConversacion}
          disabled={mensajes.length === 0 || pensando}
          aria-label="Nueva conversación"
          title="Nueva conversación"
          className="rounded-md p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
        >
          <RotateCcw className="size-4" />
        </button>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el asistente"
          className="rounded-md p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={listaRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3" aria-live="polite">
        {sinClave ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-6 text-center ring-1 ring-amber-500/25">
            <KeyRound className="size-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Falta configurar Gemini</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Quien administra el servidor debe agregar <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> (una clave de
              Google AI Studio) en <code className="rounded bg-muted px-1">.env.local</code> y reiniciar GISmart.
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">{sinClave}</p>
          </div>
        ) : mensajes.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-foreground ring-1 ring-primary/15">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p>
                Pregúntame por cubiertas, cables, hilos o recorridos. Consulto la base y puedo llevar el mapa a lo que
                encuentre. Solo consulto: no cambio nada de la red.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void enviar(s)}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-left text-xs text-foreground outline-none transition hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          mensajes.map((m, i) =>
            m.rol === "usuario" ? (
              <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-primary px-3 py-2 text-xs leading-relaxed text-primary-foreground">
                {m.texto}
              </div>
            ) : m.rol === "asistente" ? (
              <div key={i} className="mr-4 space-y-1">
                <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-xs leading-relaxed text-foreground">
                  <TextoConFormato texto={m.texto} />
                </div>
                {m.usadas.length > 0 && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    Consultó: {[...new Set(m.usadas.map((u) => NOMBRE_DE_HERRAMIENTA[u] ?? u))].join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <div key={i} role="alert" className="mr-4 flex gap-2 rounded-xl bg-destructive/8 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/20">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  {m.texto}
                  {m.detalle && <span className="mt-0.5 block break-words font-mono text-[11px] opacity-80">{m.detalle}</span>}
                </span>
              </div>
            ),
          )
        )}
        {pensando && (
          <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Consultando la red…
          </p>
        )}
      </div>

      <form
        className="border-t border-border p-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar(texto)
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={campoRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void enviar(texto)
              }
            }}
            rows={2}
            maxLength={2000}
            disabled={Boolean(sinClave)}
            placeholder="Pregunta sobre la red, o pídele que te muestre algo…"
            aria-label="Pregunta para el asistente"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!texto.trim() || pensando || Boolean(sinClave)}
            aria-label="Enviar la pregunta"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            <SendHorizontal className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 px-0.5 text-[10px] leading-snug text-muted-foreground">
          Lo que preguntas y los datos que consulta se envían a Google (Gemini). Enter envía · Mayús+Enter, otra línea.
        </p>
      </form>
    </aside>
  )
}
