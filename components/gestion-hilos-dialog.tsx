"use client"

import { Fragment, useEffect, useImperativeHandle, useMemo, useState, type Ref } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Cable,
  ChevronRight,
  CircleAlert,
  Info,
  MapPinned,
  MousePointerClick,
  Network,
  RefreshCw,
  Route,
  Ruler,
  Scissors,
  Search,
  SearchX,
  TriangleAlert,
  X,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  BarraDeEstado,
  Boton,
  Campo,
  Dato,
  EncabezadoVentana,
  EstadoVacio,
  Hueso,
  PENDIENTE,
  type ManejadorDeVentana,
  type Mensaje,
} from "@/components/ventana-sig"
import { Tooltip } from "@/components/ui/tooltip"
import type { AccesoAlMapa, CableElegido } from "@/components/network-map"
import { colorParaMostrar, obtenerHilosDeCable, type HiloDeCable, type ResultadoHilos } from "@/lib/map/hilos-cable"

/**
 * «Gestión de hilos de cable de fibra óptica» (ribbon: Red de fibra → Hilos).
 *
 * Sigue la pantalla del SIG anterior: se elige el cable en el mapa con el
 * botón de selección, la grilla lista sus hilos (se desplaza a lo ancho, tiene
 * muchas columnas) y abajo quedan la simulación de corte y los recorridos.
 *
 * Para leerla mejor que la original: las columnas van agrupadas (hilo, origen,
 * equipo activo, servicio), los hilos se separan por buffer, el número del hilo
 * lleva su color, las primeras columnas quedan fijas al desplazarse a lo ancho
 * y se puede filtrar por buffer o buscar un hilo.
 *
 * Sin datos no se muestra una tabla vacía: sin cable, cargando, con error o
 * con un cable sin hilos, la grilla cede el lugar a un aviso con lo que hay que
 * hacer. Las columnas que la función todavía no devuelve (origen, equipo,
 * servicio) se marcan «pendiente» en vez de llenarse de rayas.
 *
 * Los hilos salen de `tab_fiber.fn_obtener_hilos_cable_json`. Los botones de
 * corte y recorrido están puestos pero sin funcionar: faltan sus funciones.
 */

/** Texto oscuro o claro sobre un color, según lo claro que sea. */
function textoSobre(hex: string): string {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16)
  if (!Number.isFinite(n)) return "#ffffff"
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#0f172a" : "#ffffff"
}

/**
 * Un color por su nombre. Sin nombre no se inventa: antes, si la función no
 * mandaba el color del buffer, salía una bolita sin texto al lado.
 */
function MuestraDeColor({ nombre, posicion }: { nombre: string | null; posicion: number | null }) {
  if (!nombre) return <Vacio />
  const color = colorParaMostrar(nombre, posicion)
  return (
    <span className="flex items-center gap-1.5">
      {color && (
        <span className="size-3 shrink-0 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: color }} aria-hidden="true" />
      )}
      {nombre}
    </span>
  )
}

/** Número del buffer con el color del buffer. */
function NumeroDeBuffer({ hilo }: { hilo: HiloDeCable }) {
  if (hilo.buffer === null) return <Vacio />
  const color = colorParaMostrar(hilo.colorBuffer, hilo.buffer)
  return (
    <span className="flex items-center gap-1.5 font-semibold tabular-nums">
      {color && <span className="h-3 w-1.5 shrink-0 rounded-sm ring-1 ring-foreground/20" style={{ backgroundColor: color }} aria-hidden="true" />}
      {hilo.buffer}
    </span>
  )
}

/** Número del hilo en una bolita de su color, como se ve en la bandeja. */
function NumeroDeHilo({ hilo }: { hilo: HiloDeCable }) {
  if (hilo.numero === null) return <Vacio />
  const color = colorParaMostrar(hilo.colorHilo, hilo.numero)
  return (
    <span
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ring-1 ring-foreground/15"
      style={color ? { backgroundColor: color, color: textoSobre(color) } : undefined}
    >
      {hilo.numero}
    </span>
  )
}

function Etiqueta({ texto, tono = "neutro" }: { texto: string | null; tono?: "ok" | "aviso" | "neutro" }) {
  if (!texto) return <Vacio />
  const clases =
    tono === "ok"
      ? "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300"
      : tono === "aviso"
        ? "bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300"
        : "bg-muted text-foreground ring-border"
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${clases}`}>{texto}</span>
}

/** Una celda sin dato en una columna que sí trae datos en otros hilos. */
function Vacio() {
  return <span className="text-muted-foreground/40">—</span>
}

const tonoDeEstado = (estado: string | null) =>
  !estado ? "neutro" : /activ|libre|disponible|ok/i.test(estado) ? "ok" : /da[nñ]|corte|fall|reserv|ocup/i.test(estado) ? "aviso" : "neutro"

type Columna = {
  titulo: string
  ancho: string
  valor: (h: HiloDeCable, cable: CableElegido) => React.ReactNode
  /** Si el hilo trae este dato. Una columna sin dato en ningún hilo se marca «pendiente». */
  tiene: (h: HiloDeCable, cable: CableElegido) => boolean
}

const texto = (campo: keyof HiloDeCable, titulo: string, ancho: string): Columna => ({
  titulo,
  ancho,
  valor: (h) => (h[campo] as string | null) ?? <Vacio />,
  tiene: (h) => h[campo] !== null,
})

/** Columnas de la grilla, en el orden del SIG anterior y agrupadas como se leen. */
const GRUPOS: { titulo: string; columnas: Columna[] }[] = [
  {
    titulo: "Hilo",
    columnas: [
      { titulo: "Buffer", ancho: "min-w-20", valor: (h) => <NumeroDeBuffer hilo={h} />, tiene: (h) => h.buffer !== null },
      {
        titulo: "Color hilo",
        ancho: "min-w-28",
        valor: (h) => <MuestraDeColor nombre={h.colorHilo} posicion={h.numero} />,
        tiene: (h) => h.colorHilo !== null,
      },
      {
        titulo: "Color buffer",
        ancho: "min-w-28",
        valor: (h) => <MuestraDeColor nombre={h.colorBuffer} posicion={h.buffer} />,
        tiene: (h) => h.colorBuffer !== null,
      },
      { titulo: "Tecno", ancho: "min-w-20", valor: (h) => <Etiqueta texto={h.tecnologia} />, tiene: (h) => h.tecnologia !== null },
      {
        titulo: "Est. op",
        ancho: "min-w-24",
        valor: (h) => <Etiqueta texto={h.estado} tono={tonoDeEstado(h.estado)} />,
        tiene: (h) => h.estado !== null,
      },
    ],
  },
  {
    titulo: "Origen",
    columnas: [
      // Mientras la función no lo traiga, el nodo de origen es la cubierta de
      // donde sale el cable.
      {
        titulo: "Nodo origen",
        ancho: "min-w-36",
        valor: (h, c) => h.nodoOrigen ?? c.origen ?? <Vacio />,
        tiene: (h, c) => (h.nodoOrigen ?? c.origen) !== null,
      },
      texto("rack", "Rack", "min-w-20"),
      texto("odf", "ODF", "min-w-16"),
      texto("puerto", "Puerto", "min-w-16"),
    ],
  },
  {
    titulo: "Equipo activo",
    columnas: [
      texto("rackEquipo", "Rack equipo", "min-w-28"),
      texto("equipo", "Equipo", "min-w-24"),
      texto("tarjeta", "Tarjeta", "min-w-20"),
      texto("puertoEquipo", "Puerto", "min-w-20"),
    ],
  },
  {
    titulo: "Servicio",
    columnas: [texto("transporta", "Transporta", "min-w-28"), texto("equipoDestino", "Equipo destino", "min-w-36")],
  },
]
const TOTAL_COLUMNAS = 2 + GRUPOS.reduce((total, g) => total + g.columnas.length, 0)
const clave = (g: string, c: string) => `${g}-${c}`

type Vista = "sin-cable" | "sin-id" | "cargando" | "error" | "vacio" | "datos"

/**
 * La ventana con su estado: abierta o no y el cable elegido. Si hay un cable
 * seleccionado en el mapa se abre con ese; si no, se elige con el botón de
 * selección. El tablero solo la abre (ver `ManejadorDeVentana`).
 */
export function GestionHilosDialog({ ref, mapa }: { ref?: Ref<ManejadorDeVentana>; mapa: AccesoAlMapa }) {
  const [abierta, setAbierta] = useState(false)
  const [cable, setCable] = useState<CableElegido | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      abrir: () => {
        // Una elección en el mapa que siguiera esperando ya no vale.
        mapa.api.current?.abandonarEleccion()
        const seleccionado = mapa.api.current?.cableSeleccionado()
        if (seleccionado) setCable(seleccionado)
        setAbierta(true)
      },
    }),
    [mapa.api],
  )

  // El botón de selección: se cierra, se elige el cable en el mapa y se vuelve
  // a abrir con él. Con Esc se vuelve con el que había; si mientras tanto se
  // abrió otra ventana, esta no se vuelve a abrir sola.
  async function elegirCable() {
    setAbierta(false)
    // Con el tendido oculto el click no encontraría ningún cable.
    mapa.mostrarCapa("fibers")
    const eleccion = await mapa.api.current?.elegirCable()
    if (eleccion?.estado === "abandonada") return
    if (eleccion?.estado === "elegido") setCable(eleccion.valor)
    setAbierta(true)
  }

  return <VentanaHilos open={abierta} onOpenChange={setAbierta} cable={cable} onElegirCable={elegirCable} />
}

function VentanaHilos({
  open,
  onOpenChange,
  cable,
  onElegirCable,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  /** El cable elegido; `null` hasta que se elige uno. */
  cable: CableElegido | null
  /** El botón de selección: cierra la ventana para elegir el cable en el mapa. */
  onElegirCable: () => void
}) {
  // El resultado se guarda con el UUID del cable al que pertenece: así no hace
  // falta un «cargando» aparte, cargando es no tener aún el de este cable.
  const [resultado, setResultado] = useState<{ id: string; r: ResultadoHilos } | null>(null)
  const [seleccion, setSeleccion] = useState<{ cable: string; hilo: string } | null>(null)
  // Los filtros también se guardan con su cable: al elegir otro vuelven a «todos».
  const [filtro, setFiltro] = useState<{ cable: string; buffer: number | null; texto: string } | null>(null)
  const [distancia, setDistancia] = useState("")
  const [hastaCeo, setHastaCeo] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [intento, setIntento] = useState(0)

  const idCable = cable?.id ?? null

  useEffect(() => {
    if (!open || !idCable) return
    let vigente = true
    void obtenerHilosDeCable(idCable).then((r) => {
      if (vigente) setResultado({ id: idCable, r })
    })
    return () => {
      vigente = false
    }
  }, [open, idCable, intento])

  const actual = idCable && resultado?.id === idCable ? resultado.r : null
  const hilos = useMemo(() => (actual?.estado === "ok" ? actual.hilos : []), [actual])
  const filtroActual = filtro && filtro.cable === idCable ? filtro : { cable: idCable ?? "", buffer: null, texto: "" }

  const vista: Vista = !cable
    ? "sin-cable"
    : !cable.id
      ? "sin-id"
      : !actual
        ? "cargando"
        : actual.estado === "error"
          ? "error"
          : hilos.length === 0
            ? "vacio"
            : "datos"

  // Buffers del cable, con su color y cuántos hilos tiene cada uno.
  const buffers = useMemo(() => {
    const porBuffer = new Map<number, { buffer: number; color: string | null; nombre: string | null; hilos: number }>()
    for (const h of hilos) {
      if (h.buffer === null) continue
      const b = porBuffer.get(h.buffer) ?? {
        buffer: h.buffer,
        color: colorParaMostrar(h.colorBuffer, h.buffer),
        nombre: h.colorBuffer,
        hilos: 0,
      }
      b.hilos += 1
      porBuffer.set(h.buffer, b)
    }
    return [...porBuffer.values()].sort((a, b) => a.buffer - b.buffer)
  }, [hilos])

  // Resumen de la tecnología y el estado, para verlo de un vistazo.
  const resumen = useMemo(() => {
    const contar = (campo: "tecnologia" | "estado") => {
      const cuenta = new Map<string, number>()
      for (const h of hilos) {
        const v = h[campo]
        if (v) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
      }
      return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
    }
    return { tecnologia: contar("tecnologia"), estado: contar("estado") }
  }, [hilos])

  // Columnas que ningún hilo trae todavía: se marcan «pendiente».
  const pendientes = useMemo(() => {
    const sinDato = new Set<string>()
    if (!cable || hilos.length === 0) return sinDato
    for (const g of GRUPOS) {
      for (const c of g.columnas) {
        if (!hilos.some((h) => c.tiene(h, cable))) sinDato.add(clave(g.titulo, c.titulo))
      }
    }
    return sinDato
  }, [hilos, cable])
  const grupoPendiente = (g: (typeof GRUPOS)[number]) => g.columnas.every((c) => pendientes.has(clave(g.titulo, c.titulo)))
  const hayPendientes = GRUPOS.some((g) => g.columnas.some((c) => pendientes.has(clave(g.titulo, c.titulo))))

  const visibles = useMemo(() => {
    const buscado = filtroActual.texto.trim().toLowerCase()
    return hilos.filter(
      (h) =>
        (filtroActual.buffer === null || h.buffer === filtroActual.buffer) &&
        (!buscado ||
          [h.numero, h.uuid, h.colorHilo, h.estado, h.tecnologia].some((v) => String(v ?? "").toLowerCase().includes(buscado))),
    )
  }, [hilos, filtroActual.buffer, filtroActual.texto])

  const hiloElegido = seleccion && seleccion.cable === idCable ? hilos.find((h) => h.id === seleccion.hilo) ?? null : null
  const colorElegido = hiloElegido ? colorParaMostrar(hiloElegido.colorHilo, hiloElegido.numero) : null

  function cambiarFiltro(cambio: Partial<{ buffer: number | null; texto: string }>) {
    if (idCable) setFiltro({ ...filtroActual, cable: idCable, ...cambio })
  }

  function elegirHilo(h: HiloDeCable) {
    if (idCable) setSeleccion({ cable: idCable, hilo: h.id })
    setMensaje(null)
  }

  function moverSeleccion(paso: number) {
    if (visibles.length === 0) return
    const i = hiloElegido ? visibles.indexOf(hiloElegido) : -1
    const siguiente = visibles[Math.min(visibles.length - 1, Math.max(0, i + paso))]
    elegirHilo(siguiente)
    document.getElementById(`hilo-${siguiente.id}`)?.scrollIntoView({ block: "nearest" })
  }

  function reintentar() {
    setResultado(null)
    setIntento((n) => n + 1)
  }

  /** Los botones que todavía no tienen función en la base. */
  function pendiente(nombre: string, necesitaHilo = true) {
    if (!cable) {
      setMensaje({ texto: "Primero elige un cable con el botón de selección.", tono: "aviso" })
    } else if (necesitaHilo && !hiloElegido) {
      setMensaje({ texto: "Primero selecciona un hilo de la tabla.", tono: "aviso" })
    } else {
      setMensaje({ texto: PENDIENTE(nombre), tono: "info" })
    }
  }

  // Lo que dice la barra de abajo: el último mensaje o, si no hay, el estado.
  const barra: Mensaje =
    mensaje ??
    {
      "sin-cable": { texto: "Pulsa «Elegir en el mapa» y haz click sobre un cable.", tono: "info" as const },
      "sin-id": { texto: `${cable?.codigo} se dibujó en el mapa y no existe en la base.`, tono: "aviso" as const },
      cargando: { texto: `Consultando los hilos de ${cable?.codigo}…`, tono: "info" as const },
      error: {
        texto: actual?.estado === "error" ? actual.mensaje : "",
        tono: "error" as const,
      },
      vacio: { texto: `La base no tiene hilos registrados para ${cable?.codigo}.`, tono: "aviso" as const },
      datos: hiloElegido
        ? { texto: `Hilo ${hiloElegido.numero ?? ""} seleccionado. Usa ↑ ↓ para moverte.`, tono: "info" as const }
        : { texto: `${hilos.length} hilos. Selecciona uno para simular un corte o ver su recorrido.`, tono: "info" as const },
    }[vista]

  const filtrando = filtroActual.buffer !== null || filtroActual.texto.trim() !== ""
  const muestraTabla = vista === "datos" || vista === "cargando"

  // Celdas fijas a la izquierda (flecha y número): siguen a la vista al
  // desplazar la grilla a lo ancho. Llevan fondo propio para tapar lo que pasa
  // por debajo. El orden de capas va en cada celda: encabezado fijo 40, resto
  // del encabezado 30, celdas fijas del cuerpo 10. Con un `z-[5]` común, esa
  // clase le ganaba al encabezado y al bajar la grilla las filas se montaban
  // encima de «Número».
  const fija = "sticky"
  const tramo = cable && (cable.origen || cable.destino)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[min(76rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
        <EncabezadoVentana
          icono={Cable}
          titulo="Gestión de hilos de cable de fibra óptica"
          descripcion={
            cable
              ? `Cable ${cable.codigo}${cable.hilos ? ` · ${cable.hilos} hilos` : ""}${
                  tramo ? ` · ${cable.origen ?? "sin dato"} → ${cable.destino ?? "sin dato"}` : ""
                }`
              : "Elige un cable en el mapa para ver sus hilos."
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/20 p-4">
          {/* Cable elegido */}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
            <Tooltip label="Seleccionar el cable en el mapa">
              <button
                type="button"
                onClick={onElegirCable}
                className="flex h-[34px] items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <MousePointerClick className="size-4" aria-hidden="true" />
                {cable ? "Elegir otro" : "Elegir en el mapa"}
              </button>
            </Tooltip>

            {cable ? (
              <>
                {/* El ID es el UUID del cable en la base, el mismo de su ficha
                    de información y con el que se buscan sus hilos. El código
                    es el número con que se conoce el cable. */}
                {/* En el celular el UUID no cabe entero: se corta con puntos suspensivos
                    (se puede seleccionar y copiar igual). */}
                <Dato etiqueta="ID" ancho="w-[min(19.5rem,calc(100vw-6rem))]" valor={cable.id} guia="sin ID en la base" />
                <Dato etiqueta="Código" valor={cable.codigo} />
                <Dato etiqueta="Hilos" ancho="w-16" valor={cable.hilos ? String(cable.hilos) : hilos.length ? String(hilos.length) : null} />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tramo</span>
                  {tramo ? (
                    <span className="flex h-[30px] items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs font-semibold text-foreground">
                      {cable.origen ?? <span className="font-normal italic text-muted-foreground">sin dato</span>}
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      {cable.destino ?? <span className="font-normal italic text-muted-foreground">sin dato</span>}
                    </span>
                  ) : (
                    <Campo etiqueta="Tramo" valor={null} ancho="w-40" guia="sin puntas en la base" />
                  )}
                </div>
              </>
            ) : (
              <p className="flex items-center gap-2 self-center text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" aria-hidden="true" />
                Ningún cable elegido. Al elegirlo aparecen aquí su ID, código, cantidad de hilos y tramo.
              </p>
            )}

            {/* Resumen de lo cargado (o su lugar mientras llega). */}
            {vista === "datos" && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5 self-center">
                <Etiqueta texto={`${buffers.length} ${buffers.length === 1 ? "buffer" : "buffers"}`} />
                {resumen.tecnologia.map(([t, n]) => (
                  <Etiqueta key={`t-${t}`} texto={`${t} · ${n}`} />
                ))}
                {resumen.estado.map(([e, n]) => (
                  <Etiqueta key={`e-${e}`} texto={`${e} · ${n}`} tono={tonoDeEstado(e)} />
                ))}
              </div>
            )}
            {vista === "cargando" && (
              <div className="ml-auto flex items-center gap-1.5 self-center" aria-hidden="true">
                <Hueso ancho="w-16" />
                <Hueso ancho="w-14" />
                <Hueso ancho="w-16" />
              </div>
            )}
          </div>

          {/* Pestaña, filtros y grilla */}
          <div className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <span className="rounded-t-lg border border-b-0 border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground">
                Sección troncal
                {vista === "datos" && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">{hilos.length}</span>
                )}
              </span>
              {vista === "datos" && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => cambiarFiltro({ buffer: null })}
                    aria-pressed={filtroActual.buffer === null}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                      filtroActual.buffer === null ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-foreground ring-border hover:bg-accent"
                    }`}
                  >
                    Todos
                  </button>
                  {buffers.map((b) => (
                    <button
                      key={b.buffer}
                      type="button"
                      onClick={() => cambiarFiltro({ buffer: filtroActual.buffer === b.buffer ? null : b.buffer })}
                      aria-pressed={filtroActual.buffer === b.buffer}
                      title={`Buffer ${b.buffer}${b.nombre ? ` (${b.nombre})` : ""} · ${b.hilos} hilos`}
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                        filtroActual.buffer === b.buffer
                          ? "bg-primary text-primary-foreground ring-primary"
                          : "bg-card text-foreground ring-border hover:bg-accent"
                      }`}
                    >
                      {b.color && (
                        <span className="size-2.5 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: b.color }} aria-hidden="true" />
                      )}
                      Buffer {b.buffer}
                    </button>
                  ))}
                  <label className="relative ml-1">
                    <span className="sr-only">Buscar hilo</span>
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      type="search"
                      value={filtroActual.texto}
                      onChange={(e) => cambiarFiltro({ texto: e.target.value })}
                      placeholder="Buscar hilo…"
                      className="h-7 w-40 rounded-full border border-input bg-card pl-7 pr-2.5 text-[11px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                </div>
              )}
            </div>

            <div
              role={muestraTabla ? "grid" : undefined}
              aria-label="Hilos del cable"
              aria-busy={vista === "cargando"}
              tabIndex={vista === "datos" ? 0 : undefined}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  moverSeleccion(1)
                } else if (e.key === "ArrowUp") {
                  e.preventDefault()
                  moverSeleccion(-1)
                }
              }}
              className={`relative h-[min(24rem,46vh)] rounded-b-xl rounded-tr-xl border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                muestraTabla ? "overflow-auto" : "overflow-hidden"
              }`}
            >
              {vista === "sin-cable" && (
                <EstadoVacio
                  icono={MousePointerClick}
                  titulo="Elige un cable para ver sus hilos"
                  texto="Pulsa el botón y haz click sobre un cable en el mapa. Si ya tenías uno seleccionado, la ventana se abre directamente con él."
                >
                  <Boton icono={MousePointerClick} onClick={onElegirCable}>
                    Elegir en el mapa
                  </Boton>
                </EstadoVacio>
              )}
              {vista === "sin-id" && (
                <EstadoVacio
                  icono={TriangleAlert}
                  tono="aviso"
                  titulo={`${cable?.codigo} no existe en la base`}
                  texto="Este cable se dibujó en el mapa y todavía no se ha guardado, así que no tiene hilos registrados."
                >
                  <Boton icono={MousePointerClick} onClick={onElegirCable}>
                    Elegir otro cable
                  </Boton>
                </EstadoVacio>
              )}
              {vista === "error" && actual?.estado === "error" && (
                <EstadoVacio
                  icono={CircleAlert}
                  tono="error"
                  titulo="No se pudieron traer los hilos"
                  texto={actual.mensaje}
                  detalle={`tab_fiber.fn_obtener_hilos_cable_json${actual.detalle ? ` → ${actual.detalle}` : ""}`}
                >
                  <Boton icono={RefreshCw} onClick={reintentar}>
                    Reintentar
                  </Boton>
                </EstadoVacio>
              )}
              {vista === "vacio" && (
                <EstadoVacio
                  icono={Cable}
                  tono="aviso"
                  titulo="Este cable no tiene hilos registrados"
                  texto={`La base no devolvió hilos para ${cable?.codigo}. Puede que todavía no se hayan cargado.`}
                >
                  <Boton icono={RefreshCw} onClick={reintentar}>
                    Volver a consultar
                  </Boton>
                  <Boton icono={MousePointerClick} onClick={onElegirCable}>
                    Elegir otro cable
                  </Boton>
                </EstadoVacio>
              )}

              {muestraTabla && (
                <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    {/* Grupos de columnas */}
                    <tr className="h-7">
                      <th
                        colSpan={2}
                        className="sticky left-0 top-0 z-40 h-7 border-b border-r-2 border-border bg-muted px-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        Hilo
                      </th>
                      {GRUPOS.map((g, i) => (
                        <th
                          key={g.titulo}
                          colSpan={g.columnas.length}
                          className="sticky top-0 z-30 h-7 border-b border-r border-border bg-muted px-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                        >
                          {i > 0 && (
                            <span className="flex items-center gap-1.5">
                              {g.titulo}
                              {vista === "datos" && grupoPendiente(g) && (
                                <span
                                  title="La función de hilos todavía no devuelve estos datos."
                                  className="rounded-full bg-amber-500/12 px-1.5 py-px text-[9px] font-semibold normal-case tracking-normal text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300"
                                >
                                  pendiente
                                </span>
                              )}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                    {/* Columnas */}
                    <tr>
                      <th
                        className={`${fija} left-0 top-7 z-40 w-8 min-w-8 max-w-8 border-b border-r border-border bg-muted`}
                        aria-label="Fila seleccionada"
                      />
                      <th
                        scope="col"
                        className={`${fija} left-8 top-7 z-40 w-20 min-w-20 max-w-20 border-b border-r-2 border-border bg-muted px-2.5 py-2 text-left font-semibold text-foreground`}
                      >
                        Número
                      </th>
                      {GRUPOS.flatMap((g) =>
                        g.columnas.map((c, i) => {
                          const sinDato = pendientes.has(clave(g.titulo, c.titulo))
                          return (
                            <th
                              key={clave(g.titulo, c.titulo)}
                              scope="col"
                              title={sinDato ? "La función de hilos todavía no devuelve este dato." : undefined}
                              className={`sticky top-7 z-30 ${c.ancho} border-b border-border bg-muted px-2.5 py-2 text-left font-semibold ${
                                sinDato ? "text-muted-foreground/60" : "text-foreground"
                              } ${i === g.columnas.length - 1 ? "border-r" : ""}`}
                            >
                              {c.titulo}
                            </th>
                          )
                        }),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {vista === "cargando" &&
                      Array.from({ length: 9 }, (_, i) => (
                        <tr key={`hueso-${i}`} aria-hidden="true" className={i % 2 === 1 ? "bg-foreground/[0.035]" : ""}>
                          <td className={`${fija} left-0 z-10 w-8 min-w-8 max-w-8 border-b border-r border-border bg-card`} />
                          <td className={`${fija} left-8 z-10 w-20 min-w-20 max-w-20 border-b border-r-2 border-border bg-card px-2.5 py-1.5`}>
                            <Hueso redondo />
                          </td>
                          {GRUPOS.flatMap((g) =>
                            g.columnas.map((c, j) => (
                              <td
                                key={clave(g.titulo, c.titulo)}
                                className={`border-b border-border px-2.5 py-2.5 ${j === g.columnas.length - 1 ? "border-r" : ""}`}
                              >
                                <Hueso ancho={j % 2 === 0 ? "w-14" : "w-10"} />
                              </td>
                            )),
                          )}
                        </tr>
                      ))}

                    {vista === "datos" && visibles.length === 0 && (
                      <tr>
                        <td colSpan={TOTAL_COLUMNAS} className="p-0">
                          <div className="sticky left-0 flex w-[min(72rem,calc(100vw-5rem))] flex-col items-center gap-2 px-6 py-10 text-center text-xs text-muted-foreground">
                            <SearchX className="size-6 text-muted-foreground/60" aria-hidden="true" />
                            Ningún hilo coincide con el filtro.
                            <button
                              type="button"
                              onClick={() => cambiarFiltro({ buffer: null, texto: "" })}
                              className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 font-semibold text-foreground ring-1 ring-border hover:bg-accent"
                            >
                              <X className="size-3" aria-hidden="true" />
                              Quitar filtro
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {vista === "datos" &&
                      cable &&
                      visibles.map((h, i) => {
                        const elegido = hiloElegido?.id === h.id
                        const colorBuffer = colorParaMostrar(h.colorBuffer, h.buffer)
                        // Al empezar un buffer nuevo (sin filtro por buffer), una
                        // franja lo presenta: los hilos se leen de doce en doce.
                        const empiezaBuffer =
                          filtroActual.buffer === null && h.buffer !== null && (i === 0 || visibles[i - 1].buffer !== h.buffer)
                        // Filas alternadas en gris neutro (el `muted` del tema
                        // tira a rosado sobre blanco y se veía raro).
                        const fondo = elegido ? "bg-primary/12" : i % 2 === 1 ? "bg-foreground/[0.035]" : "bg-card"
                        // Las celdas fijas necesitan un fondo opaco: el de la
                        // fila mezclado con el de la tarjeta, y el mismo al
                        // pasar el ratón.
                        const fondoFijo = elegido
                          ? "bg-[color-mix(in_oklch,var(--primary)_14%,var(--card))]"
                          : `${i % 2 === 1 ? "bg-[color-mix(in_oklch,var(--foreground)_3.5%,var(--card))]" : "bg-card"} group-hover:bg-[color-mix(in_oklch,var(--accent)_70%,var(--card))]`
                        const buffer = buffers.find((b) => b.buffer === h.buffer)
                        return (
                          <Fragment key={h.id}>
                            {empiezaBuffer && (
                              <tr aria-hidden="true">
                                <td colSpan={TOTAL_COLUMNAS} className="border-b border-border bg-muted/60 p-0">
                                  <span className="sticky left-0 flex w-fit items-center gap-2 px-3 py-1 text-[11px] font-semibold text-foreground">
                                    {colorBuffer && (
                                      <span className="size-2.5 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: colorBuffer }} />
                                    )}
                                    Buffer {h.buffer}
                                    {h.colorBuffer && <span className="font-normal text-muted-foreground">· {h.colorBuffer}</span>}
                                    {buffer && <span className="font-normal text-muted-foreground">· {buffer.hilos} hilos</span>}
                                  </span>
                                </td>
                              </tr>
                            )}
                            <tr
                              id={`hilo-${h.id}`}
                              aria-selected={elegido}
                              onClick={() => elegirHilo(h)}
                              className={`group cursor-pointer ${fondo} ${elegido ? "" : "hover:bg-accent/70"}`}
                            >
                              <td
                                className={`${fija} left-0 z-10 w-8 min-w-8 max-w-8 border-b border-r border-border px-1 text-center ${fondoFijo}`}
                                style={colorBuffer ? { boxShadow: `inset 3px 0 0 ${colorBuffer}` } : undefined}
                              >
                                {elegido && <ChevronRight className="mx-auto size-3.5 text-primary" aria-hidden="true" />}
                              </td>
                              <td className={`${fija} left-8 z-10 w-20 min-w-20 max-w-20 border-b border-r-2 border-border px-2.5 py-1 ${fondoFijo}`}>
                                <NumeroDeHilo hilo={h} />
                              </td>
                              {GRUPOS.flatMap((g) =>
                                g.columnas.map((c, j) => (
                                  <td
                                    key={clave(g.titulo, c.titulo)}
                                    className={`whitespace-nowrap border-b border-border px-2.5 py-1.5 tabular-nums text-foreground ${
                                      j === g.columnas.length - 1 ? "border-r" : ""
                                    }`}
                                  >
                                    {/* Columna que ningún hilo trae: celda limpia,
                                        sin una fila entera de rayas. */}
                                    {pendientes.has(clave(g.titulo, c.titulo)) ? null : c.valor(h, cable)}
                                  </td>
                                )),
                              )}
                            </tr>
                          </Fragment>
                        )
                      })}
                  </tbody>
                </table>
              )}
            </div>
            {vista === "datos" && (filtrando || hayPendientes) && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Info className="size-3 shrink-0" aria-hidden="true" />
                {filtrando ? `Mostrando ${visibles.length} de ${hilos.length} hilos. ` : ""}
                {hayPendientes ? "Las columnas «pendiente» se llenan cuando la función de hilos devuelva esos datos." : ""}
              </p>
            )}
          </div>

          {/* Simulación de corte y recorridos: botones puestos, sin función todavía. */}
          <div className={`grid gap-3 transition-opacity lg:grid-cols-[1.35fr_1fr] ${vista === "datos" ? "" : "opacity-60"}`}>
            <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 shadow-sm" aria-labelledby="titulo-corte">
              <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 id="titulo-corte" className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <span className="flex size-6 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                    <Scissors className="size-3.5" aria-hidden="true" />
                  </span>
                  Simulación de corte sobre hilo seleccionado
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {/* El ID del hilo elegido: su UUID en la base, como el del
                      cable arriba. Se puede seleccionar y copiar. */}
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">ID</span>
                    <Campo
                      etiqueta="ID del hilo seleccionado"
                      chico
                      ancho="w-[min(19.5rem,calc(100vw-8rem))]"
                      valor={hiloElegido ? (hiloElegido.uuid ?? null) : null}
                      guia={hiloElegido ? "sin ID en la base" : "Selecciona un hilo en la tabla"}
                    />
                  </span>
                  {hiloElegido && (
                    <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/25">
                      {colorElegido && (
                        <span className="size-2.5 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: colorElegido }} aria-hidden="true" />
                      )}
                      Hilo {hiloElegido.numero ?? ""}
                    </span>
                  )}
                </div>
              </header>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Distancia desde nodo</span>
                  <span className="relative">
                    <input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={distancia}
                      onChange={(e) => setDistancia(e.target.value)}
                      placeholder="0"
                      className="h-8 w-28 rounded-lg border border-input bg-card pl-2.5 pr-7 text-xs tabular-nums text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">m</span>
                  </span>
                </label>
                <Boton pendiente icono={MapPinned} onClick={() => pendiente("Ubicar")}>
                  Ubicar
                </Boton>
                <Boton pendiente icono={Scissors} onClick={() => pendiente("Simular corte")} colorIcono="text-destructive">
                  Simular corte
                </Boton>
                <Boton pendiente icono={Network} onClick={() => pendiente("Elementos afectados por corte")}>
                  Elementos afectados por corte
                </Boton>
              </div>
            </section>

            <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 shadow-sm" aria-labelledby="titulo-recorrido">
              <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 id="titulo-recorrido" className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <span className="flex size-6 items-center justify-center rounded-md bg-emerald-500/12 text-emerald-600">
                    <Route className="size-3.5" aria-hidden="true" />
                  </span>
                  Recorrido del hilo
                </h3>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Ruler className="size-3.5" aria-hidden="true" />
                  Longitud
                  <Campo
                    etiqueta="Longitud del cable"
                    chico
                    ancho="w-auto"
                    valor={cable ? `${cable.largoM.toLocaleString("es-CO")} m` : null}
                    guia="—"
                  />
                </span>
              </header>
              <div className="flex flex-wrap items-center gap-2">
                <Boton pendiente icono={ArrowLeft} onClick={() => pendiente("Recorrido hacia la fuente")} colorIcono="text-emerald-600">
                  Hacia la fuente
                </Boton>
                <Boton pendiente icono={ArrowRight} onClick={() => pendiente("Recorrido hacia abajo")} colorIcono="text-emerald-600" derecha>
                  Hacia abajo
                </Boton>
                <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={hastaCeo}
                    onChange={(e) => setHastaCeo(e.target.checked)}
                    className="size-3.5 accent-primary"
                  />
                  Hasta CEO
                </label>
              </div>
            </section>
          </div>
        </div>

        <BarraDeEstado
          mensaje={barra}
          cargando={vista === "cargando" && !mensaje}
          accion={vista === "error" ? { texto: "Reintentar", onClick: reintentar } : undefined}
        />
      </DialogContent>
    </Dialog>
  )
}
