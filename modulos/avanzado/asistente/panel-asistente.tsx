"use client"

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Box,
  Check,
  CircleAlert,
  Copy,
  CornerDownRight,
  KeyRound,
  ListChecks,
  Maximize2,
  MapPin,
  Minimize2,
  RefreshCw,
  Route,
  Search,
  Spline,
  Sparkles,
  Square,
  SquarePen,
  X,
} from "lucide-react"
import { fetchConSesion, getUser } from "@/lib/auth"
import { copiarTexto } from "@/lib/portapapeles"
import type { AccionDelAsistente } from "./acciones"
import { cortarTexto, describirAccion, duracionDeEscritura, type FichaDeAccion } from "./escritura"
import { bloquesDe, enlazarTrozos, type Bloque, type Trozo } from "./formato"

type MensajeDelAsistente = {
  rol: "asistente"
  texto: string
  usadas: string[]
  respaldo?: string
  /** Lo que hizo en el mapa, para sus fichas. */
  acciones: AccionDelAsistente[]
  /** Lo que pidió mostrar y no estaba en el mapa. */
  avisos: string[]
  /** Preguntas para seguir, que propuso Gemini (ver sugerencias.ts). */
  sugerencias: string[]
  /** La pregunta que respondió y la conversación de antes: «Repetir» la vuelve a hacer desde ahí. */
  pregunta: string
  previa: string | null
}

type Mensaje =
  | { rol: "usuario"; texto: string }
  | MensajeDelAsistente
  | { rol: "error"; texto: string; detalle?: string; pregunta: string; previa: string | null }
  | { rol: "nota"; texto: string }

/** Lo que llega del servidor al terminar (o el error), sea de una vez o al final del flujo. */
type Respuesta = Record<string, unknown> & { tipo?: string; message?: string; detalle?: string }

/** Lo que consultó, como «fuentes» bajo la respuesta: con su ícono y su nombre. */
const FUENTE: Record<string, { texto: string; icono: typeof Box }> = {
  buscar_elementos: { texto: "Búsqueda", icono: Search },
  resumen_red: { texto: "Resumen de la red", icono: BarChart3 },
  ficha_cubierta: { texto: "Ficha de cubierta", icono: Box },
  ficha_cable: { texto: "Ficha de cable", icono: Spline },
  trace: { texto: "Trace", icono: Activity },
  mostrar_en_mapa: { texto: "Mapa", icono: MapPin },
  seleccionar_en_mapa: { texto: "Selección", icono: ListChecks },
  abrir_trace: { texto: "Ventana del trace", icono: Route },
  ayuda_gismart: { texto: "Ayuda de GISmart", icono: BookOpen },
  cerca_de: { texto: "Cercanía", icono: MapPin },
}

/** Las tarjetas de bienvenida: qué se le puede preguntar, con un ejemplo que se envía con un click. */
const TARJETAS = [
  { icono: BarChart3, titulo: "Conteos de la red", pregunta: "¿Cuántas cubiertas hay de cada nivel?" },
  { icono: Box, titulo: "Una cubierta", pregunta: "¿Qué cables llegan y salen de CO19?" },
  { icono: MapPin, titulo: "Qué hay cerca", pregunta: "¿Qué cubiertas hay a menos de 150 m de CO19?" },
  { icono: Activity, titulo: "Trace de un hilo", pregunta: "Haz el trace hacia arriba del hilo 5 del cable 2102262" },
]

/** Lo que dice mientras espera el primer paso; si tarda mucho, lo dice tal cual. */
const ESTADOS = ["Pensando", "Consultando la red", "Preparando la respuesta"]
const CAMBIO_DE_ESTADO_MS = 1_800
const TARDANZA_MS = 12_000
/** Los pasos ya hechos que quedan a la vista encima del actual. */
const PASOS_A_LA_VISTA = 3
/** El ancho del panel, normal o ampliado (el panel del mapa le deja ese espacio: ver app/dashboard/page.tsx). */
const CLAVE_AMPLIO = "gismart.asistente.amplio"

const ICONO_DE_FICHA: Record<FichaDeAccion["tipo"], typeof MapPin> = { mapa: MapPin, seleccion: ListChecks, trace: Route }

/** Con «reducir movimiento» en el sistema, las respuestas salen enteras de una vez. */
function sinMovimiento(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

/** El primer nombre de quien está conectado, para saludar: «Sebastián Caballero» → «Sebastián». */
function primerNombre(): string | null {
  const u = getUser() as { nombre?: unknown; usuario?: unknown } | null
  const nombre = typeof u?.nombre === "string" && u.nombre.trim() ? u.nombre : typeof u?.usuario === "string" ? u.usuario : ""
  const primero = nombre.trim().split(/\s+/)[0] ?? ""
  return primero ? primero[0].toUpperCase() + primero.slice(1) : null
}

function leerAmplio(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_AMPLIO) === "1"
  } catch {
    return false
  }
}

/**
 * Lee la respuesta por partes (una línea JSON por evento, ver la ruta): avisa
 * cada paso y devuelve el último evento, el de la respuesta o el del error.
 */
async function leerPasos(cuerpo: ReadableStream<Uint8Array>, onPaso: (texto: string) => void): Promise<Respuesta | null> {
  const lector = cuerpo.getReader()
  const decodificador = new TextDecoder()
  let resto = ""
  let final: Respuesta | null = null
  const procesar = (linea: string) => {
    if (!linea.trim()) return
    let evento: Respuesta
    try {
      evento = JSON.parse(linea)
    } catch {
      return
    }
    if (evento.tipo === "paso" && typeof evento.texto === "string") onPaso(evento.texto)
    else if (evento.tipo === "fin" || evento.tipo === "error") final = evento
  }
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    resto += decodificador.decode(value, { stream: true })
    const lineas = resto.split("\n")
    resto = lineas.pop() ?? ""
    lineas.forEach(procesar)
  }
  procesar(resto)
  return final
}

/**
 * Los destellos alrededor del ícono: dónde (relativo al ícono), de qué tamaño
 * y cuándo. Pocos y solo en el grande del inicio: con más, y también en la
 * cabecera, el ícono se movía demasiado.
 */
const COSITAS: Record<"grande" | "medio", { x: string; y: string; tam: number; retraso: number }[]> = {
  grande: [
    { x: "-16%", y: "-8%", tam: 8, retraso: 0 },
    { x: "112%", y: "4%", tam: 9, retraso: 1500 },
    { x: "-18%", y: "90%", tam: 7, retraso: 3000 },
  ],
  medio: [],
}

/** Una estrella de cuatro puntas, la forma de los destellos. */
function Estrella({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-full">
      <path d="M12 0 14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4Z" fill={color} />
    </svg>
  )
}

/**
 * El ícono del asistente: la marca en degradado con una chispa. `vivo` le da
 * movimiento (un reflejo que lo cruza, la chispa que titila, destellos
 * alrededor y, el grande del inicio, una órbita y flotar); `pensando`, un halo
 * de colores que gira detrás. Los de los mensajes van quietos para no recargar
 * la conversación. Todo en globals.css («avatar con vida»).
 */
function Avatar({
  tamano = "medio",
  pensando = false,
  vivo = false,
}: {
  tamano?: "chico" | "medio" | "grande"
  pensando?: boolean
  vivo?: boolean
}) {
  const nucleo = { chico: "size-6 rounded-lg shadow-sm", medio: "size-8 rounded-xl shadow-sm", grande: "size-14 rounded-2xl shadow-lg" }[tamano]
  const icono = { chico: "size-3.5", medio: "size-4", grande: "size-7" }[tamano]
  const cositas = vivo && tamano !== "chico" ? COSITAS[tamano] : []
  const animado = vivo || pensando
  return (
    <span
      className={`gismart-ia relative inline-flex shrink-0 ${tamano === "grande" && vivo ? "gismart-ia-flotar" : ""}`}
      data-pensando={pensando || undefined}
      aria-hidden="true"
    >
      {pensando && <span className="gismart-ia-halo" />}
      {tamano === "grande" && vivo && (
        <span className="gismart-ia-orbita">
          <span className="gismart-ia-satelite" />
        </span>
      )}
      <span className={`gismart-avatar-ia relative flex items-center justify-center overflow-hidden ${nucleo}`}>
        {animado && <span className="gismart-ia-brillo" />}
        <Sparkles className={`relative ${icono} ${animado ? "gismart-ia-chispa" : ""}`} />
      </span>
      {cositas.map((c, i) => (
        <span
          key={i}
          className="gismart-ia-cosita"
          style={{ "--x": c.x, "--y": c.y, "--tam": `${c.tam}px`, "--retraso": `${c.retraso}ms` } as CSSProperties}
        >
          <Estrella color={i % 2 ? "#2a9bc4" : "#6fc5df"} />
        </span>
      ))}
    </span>
  )
}

/** Los nombres de la red y cómo llevar el mapa hasta ellos (ver formato.ts). */
type Enlaces = { buscarNombre?: (nombre: string) => string | null; onUbicar?: (clave: string) => void }

function Trozos({ trozos, enlaces, cursor }: { trozos: Trozo[]; enlaces: Enlaces; cursor?: boolean }) {
  const marcados = enlaces.buscarNombre ? enlazarTrozos(trozos, enlaces.buscarNombre) : trozos
  return (
    <>
      {marcados.map((t, i) => {
        let nodo: ReactNode = t.texto
        if (t.codigo) nodo = <code className="rounded bg-muted px-1 font-mono text-[11.5px]">{t.texto}</code>
        if (t.cursiva) nodo = <em>{nodo}</em>
        if (t.negrita) nodo = <strong className="font-semibold">{nodo}</strong>
        if (t.clave && enlaces.onUbicar) {
          const clave = t.clave
          return (
            <button
              key={i}
              type="button"
              onClick={() => enlaces.onUbicar?.(clave)}
              title="Ver en el mapa"
              className="rounded-sm font-semibold text-primary underline decoration-primary/40 decoration-dotted underline-offset-2 outline-none transition hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {nodo}
            </button>
          )
        }
        return <Fragment key={i}>{nodo}</Fragment>
      })}
      {cursor && <span className="gismart-cursor" aria-hidden="true" />}
    </>
  )
}

/** Párrafos, títulos, listas (con viñetas o numeradas) y tablas; el cursor va al final del último. */
function Bloques({ bloques, enlaces, cursor }: { bloques: Bloque[]; enlaces: Enlaces; cursor: boolean }) {
  return (
    <div className="space-y-2">
      {bloques.map((b, i) => {
        const conCursor = cursor && i === bloques.length - 1
        if (b.tipo === "titulo") {
          return (
            <p key={i} className="pt-0.5 text-[13.5px] font-semibold">
              <Trozos trozos={b.trozos} enlaces={enlaces} cursor={conCursor} />
            </p>
          )
        }
        if (b.tipo === "lista") {
          return (
            <div key={i} className="space-y-1">
              {b.items.map((item, j) => (
                <p key={j} className="flex gap-2" style={{ paddingLeft: `${item.nivel * 14}px` }}>
                  {b.ordenada && item.numero ? (
                    <span
                      className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold tabular-nums text-primary"
                      aria-hidden="true"
                    >
                      {item.numero}
                    </span>
                  ) : (
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <Trozos trozos={item.trozos} enlaces={enlaces} cursor={conCursor && j === b.items.length - 1} />
                  </span>
                </p>
              ))}
            </div>
          )
        }
        if (b.tipo === "tabla") {
          return (
            <div key={i} className="overflow-x-auto rounded-xl ring-1 ring-border">
              <table className="w-full border-collapse text-[12px] leading-snug">
                {b.cabecera && (
                  <thead>
                    <tr className="bg-muted/70">
                      {b.cabecera.map((c, k) => (
                        <th key={k} className="whitespace-nowrap px-2.5 py-1.5 text-left text-[11px] font-semibold text-muted-foreground">
                          <Trozos trozos={c} enlaces={enlaces} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {b.filas.map((fila, k) => (
                    <tr key={k} className="border-t border-border/70">
                      {fila.map((c, l) => (
                        // Lo corto («116,7 m», «Llega») en un renglón; lo largo se parte.
                        <td key={l} className={`px-2.5 py-1.5 align-top ${c.reduce((n, t) => n + t.texto.length, 0) <= 14 ? "whitespace-nowrap" : ""}`}>
                          <Trozos trozos={c} enlaces={enlaces} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {conCursor && <span className="gismart-cursor ml-2.5" aria-hidden="true" />}
            </div>
          )
        }
        return (
          <p key={i}>
            <Trozos trozos={b.trozos} enlaces={enlaces} cursor={conCursor} />
          </p>
        )
      })}
      {cursor && bloques.length === 0 && <span className="gismart-cursor" aria-hidden="true" />}
    </div>
  )
}

/** Un botón chico de la barra bajo una respuesta (copiar, repetir). */
function BotonDeRespuesta({ etiqueta, onClick, children }: { etiqueta: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="rounded-md p-1 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {children}
    </button>
  )
}

/**
 * Una respuesta del asistente, sin burbuja y con el avatar al lado, como los
 * asistentes conocidos. Se escribe sola, palabra por palabra (un click la
 * muestra entera); al terminar aparecen lo consultado (como fuentes), lo que
 * hizo en el mapa, copiar y repetir y, en la última, las preguntas para seguir.
 * El lector de pantalla recibe el texto entero de una vez.
 */
function RespuestaDelAsistente({
  mensaje,
  onAvance,
  enlaces,
  ultima,
  ocupado,
  onSugerencia,
  onRepetir,
}: {
  mensaje: MensajeDelAsistente
  onAvance: () => void
  enlaces: Enlaces
  /** La última respuesta muestra siempre su barra y sus sugerencias; las anteriores, la barra al pasar el ratón. */
  ultima: boolean
  ocupado: boolean
  onSugerencia: (pregunta: string) => void
  onRepetir: () => void
}) {
  const largo = mensaje.texto.length
  const [mostrados, setMostrados] = useState(() => (sinMovimiento() ? largo : 0))
  const [copiado, setCopiado] = useState(false)
  const listo = mostrados >= largo

  useEffect(() => {
    if (listo) return
    const total = duracionDeEscritura(largo)
    const inicio = performance.now()
    let cuadro = 0
    const paso = (ahora: number) => {
      const n = Math.min(largo, Math.ceil((largo * (ahora - inicio)) / total))
      setMostrados(n)
      onAvance()
      if (n < largo) cuadro = requestAnimationFrame(paso)
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
  }, [listo, largo, onAvance])

  async function copiar() {
    if (await copiarTexto(mensaje.texto)) {
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1_500)
    }
  }

  const fichas = mensaje.acciones.map(describirAccion)
  const fuentes = [...new Set(mensaje.usadas)].map((u) => FUENTE[u] ?? { texto: u, icono: Search })

  return (
    <div className="gismart-burbuja-ia group/respuesta flex gap-2.5">
      <Avatar tamano="chico" />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <div
          onClick={listo ? undefined : () => setMostrados(largo)}
          title={listo ? undefined : "Mostrar la respuesta entera"}
          className={`text-[13px] leading-relaxed text-foreground ${listo ? "" : "cursor-pointer"}`}
        >
          {/* Mientras se escribe, el lector de pantalla lee el texto entero de una vez; al terminar, el de la vista (con sus enlaces). */}
          {!listo && <span className="sr-only">{mensaje.texto}</span>}
          <div aria-hidden={listo ? undefined : true}>
            <Bloques bloques={bloquesDe(cortarTexto(mensaje.texto, mostrados))} enlaces={enlaces} cursor={!listo} />
          </div>
        </div>

        {listo && fichas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {fichas.map((f, i) => {
              const Icono = ICONO_DE_FICHA[f.tipo]
              return (
                <span
                  key={i}
                  className="gismart-pop inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary ring-1 ring-primary/20"
                  style={{ "--retraso": `${i * 90}ms` } as CSSProperties}
                >
                  <Icono className="size-3" aria-hidden="true" />
                  {f.texto}
                </span>
              )
            })}
          </div>
        )}

        {listo && mensaje.avisos.length > 0 && (
          <div className="animate-gismart-fade-in space-y-1">
            {mensaje.avisos.map((a, i) => (
              <p key={i} role="alert" className="flex gap-1.5 text-[11px] text-destructive">
                <CircleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
                {a}
              </p>
            ))}
          </div>
        )}

        {listo && (
          <div
            className={`animate-gismart-fade-in flex flex-wrap items-center gap-x-1 gap-y-1 transition-opacity ${
              ultima ? "" : "opacity-0 group-hover/respuesta:opacity-100 group-focus-within/respuesta:opacity-100"
            }`}
          >
            <BotonDeRespuesta etiqueta={copiado ? "Copiado" : "Copiar la respuesta"} onClick={() => void copiar()}>
              {copiado ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3.5" />}
            </BotonDeRespuesta>
            {!ocupado && (
              <BotonDeRespuesta etiqueta="Repetir la respuesta" onClick={onRepetir}>
                <RefreshCw className="size-3.5" />
              </BotonDeRespuesta>
            )}
            {fuentes.length > 0 && <span className="mx-1 h-3.5 w-px bg-border" aria-hidden="true" />}
            {fuentes.map((f) => {
              const Icono = f.icono
              return (
                <span key={f.texto} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title="Lo que consultó">
                  <Icono className="size-3" aria-hidden="true" />
                  {f.texto}
                </span>
              )
            })}
          </div>
        )}
        {listo && mensaje.respaldo && (
          <p className="text-[10px] text-muted-foreground">Respondió {mensaje.respaldo}: el modelo principal no estaba disponible.</p>
        )}

        {listo && ultima && !ocupado && mensaje.sugerencias.length > 0 && (
          <div className="flex flex-col items-start gap-1.5 pt-1" aria-label="Preguntas para seguir">
            {mensaje.sugerencias.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => onSugerencia(s)}
                style={{ "--retraso": `${150 + i * 90}ms` } as CSSProperties}
                className="gismart-pop flex max-w-full items-start gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-left text-[11.5px] text-foreground shadow-xs outline-none transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <CornerDownRight className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden="true" />
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Mientras Gemini responde: el avatar con ondas y lo que está haciendo, con
 * un brillo que recorre el texto. Con los pasos del servidor dice qué
 * consulta («Leyendo la ficha de CO19»), con los anteriores marcados.
 */
function Pensando({ pasos }: { pasos: string[] }) {
  const [tiempo, setTiempo] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTiempo((t) => t + 1), CAMBIO_DE_ESTADO_MS)
    return () => window.clearInterval(id)
  }, [])
  const generico =
    tiempo * CAMBIO_DE_ESTADO_MS >= TARDANZA_MS ? "Gemini está tardando más de lo normal" : ESTADOS[Math.min(tiempo, ESTADOS.length - 1)]
  const actual = pasos.at(-1) ?? generico
  const primero = Math.max(0, pasos.length - 1 - PASOS_A_LA_VISTA)
  const hechos = pasos.slice(primero, -1)
  return (
    <div className="gismart-burbuja-ia flex gap-2.5" role="status">
      <Avatar tamano="chico" pensando />
      <div className="min-w-0 flex-1 space-y-1 pt-1">
        {hechos.map((p, i) => (
          <p key={primero + i} className="gismart-estado flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            {p}
          </p>
        ))}
        <p key={actual} className="gismart-estado flex items-center gap-2 text-[12.5px]">
          <span className="gismart-brillo-texto font-medium">{actual}…</span>
        </p>
      </div>
    </div>
  )
}

/**
 * Asistente de IA (Gemini): preguntas en español sobre la red. Responde con
 * los datos de la base y puede mover el mapa, seleccionar o abrir el trace.
 * Solo consulta: no cambia nada de la red.
 *
 * Va acoplado a la derecha del panel del mapa, a todo lo alto (con
 * `data-acoplado`, el panel le deja ese espacio, normal o ampliado): el mapa
 * y la tabla se angostan y la ficha y la leyenda siguen a la vista.
 *
 * El diseño sigue el de los asistentes conocidos: saludo y tarjetas al
 * empezar, las preguntas en burbuja y las respuestas como texto con el
 * avatar, fuentes, copiar y repetir bajo cada una, y una caja de escritura
 * con el botón adentro, que mientras piensa sirve para detener.
 *
 * Las animaciones (globals.css, «Asistente IA») se apagan con «reducir
 * movimiento» en el sistema, como el resto de la aplicación.
 */
export function PanelAsistente({
  ficha,
  lugar,
  onAcciones,
  onCerrar,
  buscarNombre,
  onUbicar,
  pedido,
  onPedidoAtendido,
}: {
  /** Lo que muestra la ficha ahora, para que «esta cubierta» tenga sentido. */
  ficha: () => string | null
  lugar: string
  /** Lo que el asistente pidió hacer en el mapa; devuelve avisos si algo no se encontró. */
  onAcciones: (acciones: AccionDelAsistente[]) => string[]
  onCerrar: () => void
  /** La clave del elemento del mapa con ese nombre, si hay uno solo: los nombres de las respuestas se vuelven clicables. */
  buscarNombre?: (nombre: string) => string | null
  /** Lleva el mapa a ese elemento y abre su ficha. */
  onUbicar?: (clave: string) => void
  /** Una pregunta que llega de afuera (Ctrl+K): se envía sola al abrir. */
  pedido?: { texto: string; n: number } | null
  onPedidoAtendido?: () => void
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [conversacion, setConversacion] = useState<string | null>(null)
  const [texto, setTexto] = useState("")
  const [pensando, setPensando] = useState(false)
  const [pasos, setPasos] = useState<string[]>([])
  const [sinClave, setSinClave] = useState<string | null>(null)
  const [amplio, setAmplio] = useState(leerAmplio)
  const [lejosDelFinal, setLejosDelFinal] = useState(false)
  const [nombre] = useState(primerNombre)
  const listaRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)
  const detenerRef = useRef<AbortController | null>(null)
  const enlaces: Enlaces = { buscarNombre, onUbicar }

  useEffect(() => {
    // Sin conversación no hay final al que bajar: el saludo queda arriba.
    if (mensajes.length === 0 && !pensando) return
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: "smooth" })
  }, [mensajes, pensando, pasos])

  // Mientras la respuesta se escribe, la lista la sigue hacia abajo, salvo que
  // se haya subido a leer algo anterior.
  const seguirAbajo = useCallback(() => {
    const lista = listaRef.current
    if (lista && lista.scrollHeight - lista.scrollTop - lista.clientHeight < 200) lista.scrollTop = lista.scrollHeight
  }, [])

  useEffect(() => {
    campoRef.current?.focus()
  }, [])

  // La caja de escritura crece con el texto, hasta seis renglones.
  useEffect(() => {
    const campo = campoRef.current
    if (!campo) return
    campo.style.height = "auto"
    campo.style.height = `${Math.min(campo.scrollHeight, 132)}px`
  }, [texto])

  function alternarAncho() {
    setAmplio((a) => {
      try {
        window.localStorage.setItem(CLAVE_AMPLIO, a ? "0" : "1")
      } catch {
        // Sin almacenamiento, el ancho dura lo que dure el panel abierto.
      }
      return !a
    })
  }

  /**
   * Envía la pregunta. Con `desde`, rehace una respuesta («Repetir» o
   * «Reintentar»): quita lo que había desde esa pregunta y pregunta otra vez
   * desde la conversación de antes.
   */
  async function enviar(pregunta: string, desde?: { indice: number; previa: string | null }) {
    const mensaje = pregunta.trim()
    if (!mensaje || pensando) return
    const previa = desde ? desde.previa : conversacion
    setTexto("")
    setMensajes((m) => [...(desde ? m.slice(0, desde.indice) : m), { rol: "usuario", texto: mensaje }])
    setPasos([])
    setPensando(true)
    const control = new AbortController()
    detenerRef.current = control
    try {
      const res = await fetchConSesion("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje, conversacion: previa, progreso: true, contexto: { ficha: ficha(), lugar } }),
        signal: control.signal,
      })
      // Lo que se rechaza antes de empezar (sin clave, sin sesión, límite)
      // llega como siempre; lo demás, por partes.
      const porPartes = res.ok && (res.headers.get("content-type") ?? "").includes("ndjson") && res.body
      const datos: Respuesta | null = porPartes
        ? await leerPasos(res.body as ReadableStream<Uint8Array>, (paso) => setPasos((p) => [...p, paso]))
        : await res.json().catch(() => null)
      if (!porPartes && res.status === 503 && datos?.codigo === "sin-clave") {
        setSinClave(String(datos.message ?? ""))
        setMensajes((m) => m.slice(0, -1))
        return
      }
      if (!datos || !res.ok || datos.tipo === "error") {
        const estado = typeof datos?.estado === "number" ? datos.estado : res.status
        setMensajes((m) => [
          ...m,
          {
            rol: "error",
            texto: typeof datos?.message === "string" ? datos.message : datos ? `El servidor respondió ${estado}.` : "La respuesta se cortó antes de terminar.",
            detalle: typeof datos?.detalle === "string" ? `/api/asistente → ${datos.detalle}` : undefined,
            pregunta: mensaje,
            previa,
          },
        ])
        return
      }
      setConversacion(typeof datos.conversacion === "string" ? datos.conversacion : null)
      const acciones: AccionDelAsistente[] = Array.isArray(datos.acciones) ? (datos.acciones as AccionDelAsistente[]) : []
      const avisos = acciones.length > 0 ? onAcciones(acciones) : []
      setMensajes((m) => [
        ...m,
        {
          rol: "asistente",
          texto: String(datos.respuesta ?? ""),
          usadas: Array.isArray(datos.usadas) ? (datos.usadas as string[]) : [],
          respaldo: datos.respaldo && typeof datos.modelo === "string" ? datos.modelo : undefined,
          acciones,
          avisos,
          sugerencias: Array.isArray(datos.sugerencias) ? (datos.sugerencias as unknown[]).filter((s): s is string => typeof s === "string") : [],
          pregunta: mensaje,
          previa,
        },
      ])
    } catch (e) {
      if (control.signal.aborted) {
        // Detenida a pedido: la conversación sigue desde antes de esta pregunta.
        setMensajes((m) => [...m, { rol: "nota", texto: "Respuesta detenida." }])
      } else {
        setMensajes((m) => [
          ...m,
          { rol: "error", texto: "No se pudo hablar con el servidor.", detalle: e instanceof Error ? e.message : String(e), pregunta: mensaje, previa },
        ])
      }
    } finally {
      detenerRef.current = null
      setPensando(false)
      setPasos([])
      campoRef.current?.focus()
    }
  }

  // Una pregunta que llega desde el buscador (Ctrl+K) se envía sola. El número
  // del último pedido atendido evita mandarlo dos veces: en desarrollo React
  // corre los efectos dos veces al montar, y la pregunta salía repetida.
  const enviarRef = useRef(enviar)
  const atendidoRef = useRef(0)
  useEffect(() => {
    enviarRef.current = enviar
  })
  useEffect(() => {
    if (!pedido || pedido.n === atendidoRef.current) return
    atendidoRef.current = pedido.n
    const t = pedido.texto
    onPedidoAtendido?.()
    // Fuera del efecto: enviar cambia el estado del panel.
    window.setTimeout(() => void enviarRef.current(t), 0)
  }, [pedido, onPedidoAtendido])

  function nuevaConversacion() {
    setMensajes([])
    setConversacion(null)
    setTexto("")
    campoRef.current?.focus()
  }

  /** La pregunta de un mensaje (respuesta o error), para rehacerla desde ahí. */
  function rehacer(indice: number) {
    const m = mensajes[indice]
    if (!m || (m.rol !== "asistente" && m.rol !== "error")) return
    // Se quita también la pregunta: `enviar` la vuelve a poner.
    void enviar(m.pregunta, { indice: Math.max(0, indice - 1), previa: m.previa })
  }

  const ultima = mensajes.length - 1

  return (
    <aside
      data-acoplado={amplio ? "amplio" : "normal"}
      aria-label="Asistente de IA"
      className={`gismart-asistente absolute inset-y-0 right-0 z-30 flex flex-col overflow-hidden border-l border-border bg-card shadow-xl max-md:w-full ${
        amplio ? "w-[34rem]" : "w-96"
      }`}
    >
      <div className={`gismart-franja h-1 shrink-0 ${pensando ? "gismart-franja-viva" : ""}`} aria-hidden="true" />

      {/* Cabecera */}
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <Avatar tamano="medio" pensando={pensando} vivo />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold leading-tight text-foreground">Asistente IA</h2>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`size-1.5 rounded-full ${sinClave ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden="true" />
            Gemini · solo consulta
          </p>
        </div>
        <button
          type="button"
          onClick={alternarAncho}
          aria-label={amplio ? "Hacer el panel más angosto" : "Ampliar el panel"}
          title={amplio ? "Hacer el panel más angosto" : "Ampliar el panel"}
          className="rounded-md p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-md:hidden"
        >
          {amplio ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button
          type="button"
          onClick={nuevaConversacion}
          disabled={mensajes.length === 0 || pensando}
          aria-label="Nueva conversación"
          title="Nueva conversación"
          className="rounded-md p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
        >
          <SquarePen className="size-4" />
        </button>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el asistente"
          title="Cerrar (Ctrl+I)"
          className="rounded-md p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Conversación */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listaRef}
          onScroll={(e) => {
            const l = e.currentTarget
            setLejosDelFinal(l.scrollHeight - l.scrollTop - l.clientHeight > 240)
          }}
          className="h-full space-y-5 overflow-y-auto px-4 py-4"
          aria-live="polite"
        >
          {sinClave ? (
            <div className="gismart-burbuja-ia flex flex-col items-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-6 text-center ring-1 ring-amber-500/25">
              <KeyRound className="size-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Falta configurar Gemini</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Quien administra el servidor debe agregar <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> (una clave de
                Google AI Studio) en <code className="rounded bg-muted px-1">.env.local</code> y reiniciar GISmart.
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">{sinClave}</p>
            </div>
          ) : mensajes.length === 0 ? (
            // Centrado con `my-auto` y no con `justify-center`: si no cabe (pantallas
            // bajas), así se desplaza en vez de quedar cortado arriba.
            <div className="flex min-h-full flex-col">
            <div className="my-auto flex flex-col gap-5 py-1">
              <div className="gismart-entrada flex flex-col items-center gap-3 text-center">
                <span className="py-3">
                  <Avatar tamano="grande" vivo />
                </span>
                <div>
                  <p className="gismart-nombre text-xl font-bold tracking-tight">{nombre ? `Hola, ${nombre}` : "Hola"}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">¿Qué quieres saber de la red?</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TARJETAS.map((t, i) => {
                  const Icono = t.icono
                  return (
                    <button
                      key={t.titulo}
                      type="button"
                      onClick={() => void enviar(t.pregunta)}
                      style={{ "--retraso": `${120 + i * 70}ms` } as CSSProperties}
                      className="gismart-entrada group flex flex-col items-start gap-1.5 rounded-xl border border-border bg-card p-2.5 text-left outline-none transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:hover:translate-y-0"
                    >
                      <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icono className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="text-[12px] font-semibold text-foreground">{t.titulo}</span>
                      <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{t.pregunta}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                También: qué hay cerca de una dirección o cómo hacer algo en GISmart.
              </p>
            </div>
            </div>
          ) : (
            mensajes.map((m, i) =>
              m.rol === "usuario" ? (
                <div key={i} className="flex justify-end">
                  <div className="gismart-burbuja-yo max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[13px] leading-relaxed text-foreground">
                    {m.texto}
                  </div>
                </div>
              ) : m.rol === "asistente" ? (
                <RespuestaDelAsistente
                  key={i}
                  mensaje={m}
                  onAvance={seguirAbajo}
                  enlaces={enlaces}
                  ultima={i === ultima}
                  ocupado={pensando}
                  onSugerencia={(s) => void enviar(s)}
                  onRepetir={() => rehacer(i)}
                />
              ) : m.rol === "nota" ? (
                <p key={i} className="animate-gismart-fade-in text-center text-[11px] text-muted-foreground">
                  {m.texto}
                </p>
              ) : (
                <div key={i} role="alert" className="gismart-burbuja-error flex gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive" aria-hidden="true">
                    <CircleAlert className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5 pt-0.5 text-[12.5px] text-destructive">
                    <p>{m.texto}</p>
                    {m.detalle && <p className="break-words font-mono text-[11px] opacity-80">{m.detalle}</p>}
                    {i === ultima && !pensando && (
                      <button
                        type="button"
                        onClick={() => rehacer(i)}
                        className="inline-flex items-center gap-1 rounded-full border border-destructive/30 px-2.5 py-0.5 text-[11px] font-medium outline-none transition hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <RefreshCw className="size-3" aria-hidden="true" />
                        Reintentar
                      </button>
                    )}
                  </div>
                </div>
              ),
            )
          )}
          {pensando && <Pensando pasos={pasos} />}
        </div>

        {lejosDelFinal && (
          <button
            type="button"
            onClick={() => listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: "smooth" })}
            aria-label="Ir al final de la conversación"
            className="gismart-pop absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      {/* Escritura */}
      <form
        className="px-3 pb-2.5 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (pensando) detenerRef.current?.abort()
          else void enviar(texto)
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 pl-3 shadow-sm transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30">
          <textarea
            ref={campoRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (!pensando) void enviar(texto)
              }
            }}
            rows={1}
            maxLength={2000}
            disabled={Boolean(sinClave)}
            placeholder="Pregunta sobre la red…"
            aria-label="Pregunta para el asistente"
            className="max-h-33 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13px] leading-snug outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          {pensando ? (
            <button
              type="submit"
              aria-label="Detener la respuesta"
              title="Detener"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background outline-none transition hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-90 motion-reduce:active:scale-100"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!texto.trim() || Boolean(sinClave)}
              aria-label="Enviar la pregunta"
              title="Enviar (Enter)"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-90 disabled:bg-muted disabled:text-muted-foreground motion-reduce:active:scale-100"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-center text-[10px] leading-snug text-muted-foreground">
          Gemini puede equivocarse: revisa los datos importantes. Lo que preguntas se envía a Google.
        </p>
      </form>
    </aside>
  )
}
