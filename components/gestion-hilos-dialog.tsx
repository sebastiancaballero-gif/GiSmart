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
import { BolitaDeHilo } from "@/components/bolita-de-hilo"
import { colorParaMostrar, obtenerHilosDeCable, type HiloDeCable, type ResultadoHilos } from "@/lib/map/hilos-cable"
import {
  TABLAS_TRAZA,
  columnasDeTraza,
  obtenerTrazasDeCable,
  type CampoDeTraza,
  type FilaDeTraza,
  type ResultadoTrazas,
  type TipoTraza,
} from "@/lib/map/traza-hilos"
import type { DireccionTrace } from "@/lib/map/trace"

/**
 * «Gestión de hilos de cable de fibra óptica» (ribbon: Red de fibra → Hilos).
 *
 * Sigue la pantalla del SIG anterior: se elige el cable en el mapa con el
 * botón de selección, la grilla lista sus hilos (se desplaza a lo ancho, tiene
 * muchas columnas) y abajo quedan la simulación de corte y los recorridos.
 *
 * Para leerla mejor que la original: las columnas van agrupadas (hilo, inicio
 * y fin de la traza), los hilos se separan por buffer, el número del hilo
 * lleva su color, las primeras columnas quedan fijas al desplazarse a lo ancho
 * y se puede filtrar por buffer o buscar un hilo.
 *
 * Sin datos no se muestra una tabla vacía: sin cable, cargando, con error o
 * con un cable sin hilos, la grilla cede el lugar a un aviso con lo que hay que
 * hacer.
 *
 * Dos pestañas, como en el SIG anterior: «Sección feeder» (antes «Sección
 * troncal») y «Sección distribución». Los hilos salen de
 * `tab_fiber.fn_get_json_hilos_cable`; las columnas de la traza de cada uno,
 * desde su puerto de inicio, de las tablas de traza del tipo de la pestaña
 * («FEEDER» o «DISTRIBUCION»): los campos de `tab_fiber.fn_get_json_hilos`,
 * que falla en la base, leídos de las mismas tablas que ella (ver
 * `lib/map/traza-hilos.ts`). La traza de cada pestaña se pide la primera vez
 * que se abre y queda guardada con su cable. La simulación de corte está
 * puesta pero sin funcionar: falta su función.
 */

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

/** Número del hilo en una bolita de su color, como se ve en la bandeja (la misma de la tabla del trace). */
function NumeroDeHilo({ hilo }: { hilo: HiloDeCable }) {
  if (hilo.numero === null) return <Vacio />
  return <BolitaDeHilo numero={hilo.numero} color={hilo.colorHilo} />
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

/** Una celda sin dato. */
function Vacio() {
  return <span className="text-muted-foreground/40">—</span>
}

/**
 * Un campo de la traza del hilo: vacío si el hilo no está en ninguna traza; si
 * está en dos (pasa en algunos hilos feeder), un valor por renglón, en el mismo
 * orden en todas las columnas.
 */
function ValorDeTraza({ filas, campo }: { filas: FilaDeTraza[] | undefined; campo: string }) {
  const valores = (filas ?? []).map((f) => f[campo] ?? null)
  if (!valores.some((v) => v !== null)) return <Vacio />
  // Un UUID (id_puerto_fin) en letra fija y más chica: se lee y se copia mejor.
  const clase = campo.startsWith("id_") ? "font-mono text-[11px]" : ""
  if (valores.length === 1) return <span className={clase}>{valores[0]}</span>
  return (
    <span className="flex flex-col gap-0.5">
      {valores.map((v, i) => (
        <span key={i} className={clase}>
          {v ?? <Vacio />}
        </span>
      ))}
    </span>
  )
}

const tonoDeEstado = (estado: string | null) =>
  !estado ? "neutro" : /activ|libre|disponible|ok/i.test(estado) ? "ok" : /da[nñ]|corte|fall|reserv|ocup/i.test(estado) ? "aviso" : "neutro"

type Columna = {
  clave: string
  titulo: string
  ancho: string
  /** `filas`: la traza del hilo, cuando ya llegó. */
  valor: (h: HiloDeCable, filas: FilaDeTraza[] | undefined) => React.ReactNode
  /** Sale de la traza: mientras llega, la celda muestra su hueso. */
  deTraza?: boolean
}

type Grupo = { titulo: string; columnas: Columna[] }

/** Lo que trae la lista de hilos del cable. */
const GRUPO_HILO: Grupo = {
  titulo: "Hilo",
  columnas: [
    { clave: "buffer", titulo: "Buffer", ancho: "min-w-20", valor: (h) => <NumeroDeBuffer hilo={h} /> },
    { clave: "color-hilo", titulo: "Color hilo", ancho: "min-w-28", valor: (h) => <MuestraDeColor nombre={h.colorHilo} posicion={h.numero} /> },
    {
      clave: "color-buffer",
      titulo: "Color buffer",
      ancho: "min-w-28",
      valor: (h) => <MuestraDeColor nombre={h.colorBuffer} posicion={h.buffer} />,
    },
    { clave: "tecno", titulo: "Tecno", ancho: "min-w-20", valor: (h) => <Etiqueta texto={h.tecnologia} /> },
    { clave: "estado", titulo: "Est. op", ancho: "min-w-24", valor: (h) => <Etiqueta texto={h.estado} tono={tonoDeEstado(h.estado)} /> },
  ],
}

const TITULOS_DE_GRUPO: Record<CampoDeTraza["grupo"], string> = {
  Inicio: "Inicio de la traza",
  Fin: "Fin de la traza",
  Otros: "Otros datos de la traza",
}

const columnaDeTraza = (c: CampoDeTraza): Columna => ({
  clave: c.campo,
  titulo: c.titulo,
  ancho: c.ancho,
  deTraza: true,
  valor: (_, filas) => <ValorDeTraza filas={filas} campo={c.campo} />,
})

/** Las columnas de la traza agrupadas en inicio, fin y lo demás, en su orden. */
function gruposDeTraza(campos: CampoDeTraza[]): Grupo[] {
  const grupos: Grupo[] = []
  for (const c of campos) {
    const titulo = TITULOS_DE_GRUPO[c.grupo]
    const ultimo = grupos.at(-1)
    if (ultimo?.titulo === titulo) ultimo.columnas.push(columnaDeTraza(c))
    else grupos.push({ titulo, columnas: [columnaDeTraza(c)] })
  }
  return grupos
}

const clave = (g: string, c: string) => `${g}-${c}`

type Filtro = { cable: string; buffer: number | null; texto: string; conInfo: boolean }

/** Qué decir cuando el filtro deja la grilla vacía, y el botón para salir de ahí. */
type SinFilas = { texto: string; boton: string; onClick: () => void }

type Vista = "sin-cable" | "sin-id" | "cargando" | "error" | "vacio" | "datos"

type Pestana = "feeder" | "distribucion"
const PESTANAS: { id: Pestana; nombre: string; tipo: TipoTraza; deLaTraza: string }[] = [
  { id: "feeder", nombre: "Sección feeder", tipo: "FEEDER", deLaTraza: "feeder" },
  { id: "distribucion", nombre: "Sección distribución", tipo: "DISTRIBUCION", deLaTraza: "de distribución" },
]

/** Las primeras columnas de «Sección distribución», con los nombres del SIG anterior; las demás son de la traza. */
const COLUMNAS_HILO_DISTRIBUCION: Columna[] = [
  { clave: "identificador", titulo: "Identificador", ancho: "min-w-28", valor: (h) => h.identificador ?? <Vacio /> },
  { clave: "numero", titulo: "Número", ancho: "min-w-20", valor: (h) => <NumeroDeHilo hilo={h} /> },
]

/** La traza de cada hilo por su UUID en minúsculas. */
const trazaPorHilo = (r: ResultadoTrazas | null) =>
  new Map((r?.estado === "ok" ? r.hilos : []).map((t) => [t.id.toLowerCase(), t.filas]))

/**
 * Cómo se presenta el hilo en «Recorrido del trace»: con el identificador del
 * cable (su UUID, como en la tabla del trace), lo que se lee al pasar el mouse
 * y su color.
 */
export type HiloParaRecorrer = { etiqueta: string; titulo: string; color: string | null }

/**
 * La ventana con su estado: abierta o no y el cable elegido. Si hay un cable
 * seleccionado en el mapa se abre con ese; si no, se elige con el botón de
 * selección. El tablero solo la abre (ver `ManejadorDeVentana`).
 */
export function GestionHilosDialog({
  ref,
  mapa,
  onRecorrerHilo,
}: {
  ref?: Ref<ManejadorDeVentana>
  mapa: AccesoAlMapa
  /**
   * «Recorrido del hilo»: el tablero abre «Recorrido del trace» desde ese hilo.
   * Esta ventana se cierra antes, porque tapa el mapa donde se pinta.
   */
  onRecorrerHilo?: (idHilo: string, direccion: DireccionTrace, hilo: HiloParaRecorrer) => void
}) {
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

  function recorrerHilo(idHilo: string, direccion: DireccionTrace, hilo: HiloParaRecorrer) {
    setAbierta(false)
    onRecorrerHilo?.(idHilo, direccion, hilo)
  }

  return (
    <VentanaHilos
      open={abierta}
      onOpenChange={setAbierta}
      cable={cable}
      onElegirCable={elegirCable}
      onRecorrer={onRecorrerHilo ? recorrerHilo : undefined}
    />
  )
}

function VentanaHilos({
  open,
  onOpenChange,
  cable,
  onElegirCable,
  onRecorrer,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  /** El cable elegido; `null` hasta que se elige uno. */
  cable: CableElegido | null
  /** El botón de selección: cierra la ventana para elegir el cable en el mapa. */
  onElegirCable: () => void
  /** «Hacia la fuente» / «Hacia abajo» con el hilo seleccionado. */
  onRecorrer?: (idHilo: string, direccion: DireccionTrace, hilo: HiloParaRecorrer) => void
}) {
  // El resultado se guarda con el UUID del cable al que pertenece: así no hace
  // falta un «cargando» aparte, cargando es no tener aún el de este cable.
  const [resultado, setResultado] = useState<{ id: string; r: ResultadoHilos } | null>(null)
  const [seleccion, setSeleccion] = useState<{ cable: string; hilo: string } | null>(null)
  // Los filtros también se guardan con su cable: al elegir otro vuelven a «todos».
  // `conInfo`: solo los hilos que tienen traza en la pestaña abierta.
  const [filtro, setFiltro] = useState<Filtro | null>(null)
  const [distancia, setDistancia] = useState("")
  const [hastaCeo, setHastaCeo] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [intento, setIntento] = useState(0)
  const [pestana, setPestana] = useState<Pestana>("feeder")
  // La traza de los hilos, una por tipo: se pide al abrir su pestaña y queda
  // guardada con su cable (y su intento), así que volver a la pestaña no la
  // pide otra vez.
  const [trazas, setTrazas] = useState<Partial<Record<TipoTraza, { id: string; intento: number; r: ResultadoTrazas }>>>({})
  const [intentoTraza, setIntentoTraza] = useState(0)

  const idCable = cable?.id ?? null
  const pestanaActual = PESTANAS.find((p) => p.id === pestana) ?? PESTANAS[0]
  const tipo = pestanaActual.tipo
  const guardada = trazas[tipo]
  const trazaCargada = guardada?.id === idCable && guardada.intento === intentoTraza

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

  useEffect(() => {
    if (!open || !idCable || trazaCargada) return
    let vigente = true
    void obtenerTrazasDeCable(idCable, tipo).then((r) => {
      if (vigente) setTrazas((t) => ({ ...t, [tipo]: { id: idCable, intento: intentoTraza, r } }))
    })
    return () => {
      vigente = false
    }
  }, [open, idCable, tipo, intentoTraza, trazaCargada])

  // Al volver a abrir (por ejemplo después de ver el recorrido de un hilo), la
  // grilla baja hasta el hilo que seguía seleccionado.
  useEffect(() => {
    if (!open || !seleccion) return
    const espera = window.setTimeout(
      () => document.getElementById(`hilo-${seleccion.hilo}`)?.scrollIntoView({ block: "nearest" }),
      150,
    )
    return () => window.clearTimeout(espera)
  }, [open, seleccion])

  const actual = idCable && resultado?.id === idCable ? resultado.r : null
  const hilos = useMemo(() => (actual?.estado === "ok" ? actual.hilos : []), [actual])
  const filtroActual: Filtro = filtro && filtro.cable === idCable ? filtro : { cable: idCable ?? "", buffer: null, texto: "", conInfo: false }

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

  // La traza de la pestaña abierta, para el cable elegido.
  const trazaActual = idCable && guardada?.id === idCable ? guardada.r : null
  const porHilo = useMemo(() => trazaPorHilo(trazaActual), [trazaActual])
  const campos = useMemo(() => columnasDeTraza(tipo, trazaActual?.estado === "ok" ? trazaActual.hilos : []), [tipo, trazaActual])
  const grupos = useMemo(() => [GRUPO_HILO, ...gruposDeTraza(campos)], [campos])
  const totalColumnas = 2 + grupos.reduce((total, g) => total + g.columnas.length, 0)
  const enDistribucion = pestana === "distribucion"
  const filasDe = (h: HiloDeCable) => (h.uuid ? porHilo.get(h.uuid.toLowerCase()) : undefined)

  // «Conectados» filtra cuando la traza de la pestaña ya llegó: mientras
  // tanto se ven todos, con el hueso en las columnas de la traza.
  const trazaLista = trazaActual?.estado === "ok"
  const soloConInfo = filtroActual.conInfo && trazaLista

  // La búsqueda mira lo que muestra la pestaña: lo del hilo y lo de su traza
  // («OLT 1», «Nap 3-abr»).
  const visibles = useMemo(() => {
    const buscado = filtroActual.texto.trim().toLowerCase()
    return hilos.filter((h) => {
      if (filtroActual.buffer !== null && h.buffer !== filtroActual.buffer) return false
      const filas = h.uuid ? porHilo.get(h.uuid.toLowerCase()) ?? [] : []
      if (soloConInfo && filas.length === 0) return false
      if (!buscado) return true
      const deLaTraza = filas.flatMap((f) => Object.values(f))
      return [h.numero, h.uuid, h.identificador, h.colorHilo, h.estado, h.tecnologia, ...deLaTraza].some((v) =>
        String(v ?? "").toLowerCase().includes(buscado),
      )
    })
  }, [hilos, filtroActual.buffer, filtroActual.texto, soloConInfo, porHilo])

  const hiloElegido = seleccion && seleccion.cable === idCable ? hilos.find((h) => h.id === seleccion.hilo) ?? null : null
  const colorElegido = hiloElegido ? colorParaMostrar(hiloElegido.colorHilo, hiloElegido.numero) : null
  // Mientras los hilos no estén, la pestaña muestra lo mismo que la otra (elegir cable, cargando, error…).
  const vistaDistribucion: "cargando" | "error" | "datos" | null =
    !enDistribucion || vista !== "datos" ? null : !trazaActual ? "cargando" : trazaActual.estado === "error" ? "error" : "datos"
  const conTraza = hilos.filter((h) => filasDe(h)?.length).length
  const enDosTrazas = hilos.filter((h) => (filasDe(h)?.length ?? 0) > 1).length
  // La cuenta de la pestaña distribución: los hilos con traza de distribución, cuando ya se leyó.
  const trazaDistribucion = idCable && trazas.DISTRIBUCION?.id === idCable ? trazas.DISTRIBUCION.r : null
  const conTrazaDistribucion = useMemo(() => {
    if (trazaDistribucion?.estado !== "ok") return null
    const conFilas = new Set(trazaDistribucion.hilos.filter((t) => t.filas.length).map((t) => t.id.toLowerCase()))
    return hilos.filter((h) => h.uuid && conFilas.has(h.uuid.toLowerCase())).length
  }, [trazaDistribucion, hilos])
  // La traza llega después que los hilos: mientras tanto sus columnas muestran
  // huesos; si falla, en feeder el aviso va bajo la grilla.
  const trazaCargando = (vista === "cargando" || vista === "datos") && !trazaActual
  const errorDeTraza = vista === "datos" && !enDistribucion && trazaActual?.estado === "error" ? trazaActual : null

  function cambiarFiltro(cambio: Partial<Omit<Filtro, "cable">>) {
    if (idCable) setFiltro({ ...filtroActual, cable: idCable, ...cambio })
  }

  // La grilla vacía por el filtro: si es porque ningún hilo tiene traza, se dice
  // así y el botón vuelve a todos; si no, se quitan todos los filtros.
  const sinFilas: SinFilas =
    soloConInfo && conTraza === 0
      ? {
          texto: `Ningún hilo de este cable tiene traza ${pestanaActual.deLaTraza}.`,
          boton: "Ver todos los hilos",
          onClick: () => cambiarFiltro({ conInfo: false }),
        }
      : { texto: "Ningún hilo coincide con el filtro.", boton: "Quitar filtro", onClick: () => cambiarFiltro({ buffer: null, texto: "", conInfo: false }) }

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

  function reintentarTraza() {
    setTrazas((t) => ({ ...t, [tipo]: undefined }))
    setIntentoTraza((n) => n + 1)
  }

  /**
   * «Recorrido del hilo»: el recorrido sale de la caché del trace con el UUID
   * del hilo seleccionado (el mismo que se ve en «ID»), hacia la fuente (la
   * OLT) o hacia abajo (el usuario).
   */
  function recorrer(direccion: DireccionTrace) {
    if (!cable) {
      setMensaje({ texto: "Primero elige un cable con el botón de selección.", tono: "aviso" })
    } else if (!hiloElegido) {
      setMensaje({ texto: "Primero selecciona un hilo de la tabla.", tono: "aviso" })
    } else if (!hiloElegido.uuid) {
      setMensaje({ texto: `El hilo ${hiloElegido.numero ?? ""} no tiene ID en la base: no se puede recorrer.`, tono: "aviso" })
    } else if (!onRecorrer) {
      setMensaje({ texto: PENDIENTE(direccion === "UPSTREAM" ? "Hacia la fuente" : "Hacia abajo"), tono: "info" })
    } else {
      onRecorrer(hiloElegido.uuid, direccion, {
        etiqueta: `Hilo ${hiloElegido.numero ?? ""} del cable ${cable.id ?? cable.codigo}`,
        titulo: `Hilo ${hiloElegido.numero ?? ""} del cable ${cable.codigo}`,
        color: colorElegido,
      })
    }
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
    (vista === "datos" && trazaCargando
      ? { texto: `Consultando la traza ${pestanaActual.deLaTraza} de ${cable?.codigo}…`, tono: "info" }
      : vistaDistribucion === "error" && trazaActual?.estado === "error"
        ? { texto: trazaActual.mensaje, tono: "error" }
        : null) ??
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

  const filtrando = filtroActual.buffer !== null || filtroActual.texto.trim() !== "" || soloConInfo
  const muestraTabla = vista === "cargando" || (vista === "datos" && vistaDistribucion !== "error")
  // El detalle de los avisos de la traza: las tablas o, si se sabe, la que falló con el error de la base.
  const detalleDeTraza = (detalle: string | undefined) =>
    detalle ?? `tab_fiber.${TABLAS_TRAZA[tipo].trazas} / ${TABLAS_TRAZA[tipo].atributos}`

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

          {/* Pestaña, filtros y grilla. No se encoge: con poco alto (1366×657, el
              celular) se encogía hasta 2 px y las tarjetas se pisaban; ahora la
              tabla guarda su alto y la ventana se desplaza. */}
          <div className="flex shrink-0 flex-col">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div role="tablist" aria-label="Secciones del cable" className="flex shrink-0 items-end gap-1">
                {PESTANAS.map((p) => {
                  const activa = pestana === p.id
                  // Feeder: todos los hilos; distribución: los que tienen traza de distribución (ya leída).
                  const cuenta = vista !== "datos" ? null : p.id === "feeder" ? hilos.length : conTrazaDistribucion
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={activa}
                      onClick={() => setPestana(p.id)}
                      className={`rounded-t-lg border border-b-0 px-3.5 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                        activa
                          ? "border-border bg-card text-foreground"
                          : "border-transparent bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {p.nombre}
                      {cuenta !== null && (
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">{cuenta}</span>
                      )}
                    </button>
                  )
                })}
              </div>
              {vista === "datos" && (
                // Ocupa lo que dejan las pestañas y se acomoda a la derecha: con
                // los 12 buffers de un cable de 144 hilos eran tres renglones
                // (pestañas, buffers, buscador) y ahora son dos.
                <div className="mb-1.5 flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
                  {/* Todos los hilos («Cantidad de hilos») o solo los que tienen traza en esta pestaña («Conectados»). */}
                  <div role="group" aria-label="Qué hilos mostrar" className="mr-1 flex items-center gap-0.5 rounded-full bg-muted p-0.5 ring-1 ring-border">
                    {[
                      { conInfo: false, texto: "Cantidad de hilos", cuenta: hilos.length, titulo: "Todos los hilos del cable" },
                      {
                        conInfo: true,
                        texto: "Conectados",
                        cuenta: trazaLista ? conTraza : null,
                        titulo: trazaLista ? `Solo los hilos con traza ${pestanaActual.deLaTraza}` : "Esperando la traza de esta pestaña…",
                      },
                    ].map((o) => {
                      const activo = filtroActual.conInfo === o.conInfo
                      return (
                        <button
                          key={o.texto}
                          type="button"
                          onClick={() => cambiarFiltro({ conInfo: o.conInfo })}
                          aria-pressed={activo}
                          disabled={o.conInfo && !trazaLista}
                          title={o.titulo}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${
                            activo ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {o.texto}
                          {o.cuenta !== null && (
                            <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{o.cuenta}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
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
                      maxLength={60}
                      placeholder="Buscar hilo…"
                      className="h-7 w-40 rounded-full border border-input bg-card pl-7 pr-2.5 text-[11px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                </div>
              )}
            </div>

            <div
              role={muestraTabla ? "grid" : undefined}
              aria-label={enDistribucion ? "Sección distribución del cable" : "Hilos del cable"}
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
              } ${enDistribucion ? "rounded-tl-xl" : ""}`}
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
                  detalle={`tab_fiber.fn_get_json_hilos_cable${actual.detalle ? ` → ${actual.detalle}` : ""}`}
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

              {vistaDistribucion === "error" && trazaActual?.estado === "error" && (
                <EstadoVacio
                  icono={CircleAlert}
                  tono="error"
                  titulo="No se pudo leer la traza de distribución"
                  texto={trazaActual.mensaje}
                  detalle={detalleDeTraza(trazaActual.detalle)}
                >
                  <Boton icono={RefreshCw} onClick={reintentarTraza}>
                    Reintentar
                  </Boton>
                </EstadoVacio>
              )}

              {muestraTabla && enDistribucion && cable && (
                <TablaDistribucion
                  cargando={vista === "cargando"}
                  trazaCargando={trazaCargando}
                  campos={campos}
                  visibles={visibles}
                  filtroBuffer={filtroActual.buffer}
                  buffers={buffers}
                  porHilo={porHilo}
                  hiloElegido={hiloElegido}
                  onElegir={elegirHilo}
                  sinFilas={sinFilas}
                />
              )}

              {muestraTabla && !enDistribucion && (
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
                      {grupos.map((g, i) => (
                        <th
                          key={g.titulo}
                          colSpan={g.columnas.length}
                          className="sticky top-0 z-30 h-7 border-b border-r border-border bg-muted px-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                        >
                          {i > 0 && g.titulo}
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
                      {grupos.flatMap((g) =>
                        g.columnas.map((c, i) => (
                          <th
                            key={clave(g.titulo, c.clave)}
                            scope="col"
                            className={`sticky top-7 z-30 ${c.ancho} border-b border-border bg-muted px-2.5 py-2 text-left font-semibold text-foreground ${
                              i === g.columnas.length - 1 ? "border-r" : ""
                            }`}
                          >
                            {c.titulo}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody className="gismart-filas">
                    {vista === "cargando" &&
                      Array.from({ length: 9 }, (_, i) => (
                        <tr key={`hueso-${i}`} aria-hidden="true" className={i % 2 === 1 ? "bg-foreground/[0.035]" : ""}>
                          <td className={`${fija} left-0 z-10 w-8 min-w-8 max-w-8 border-b border-r border-border bg-card`} />
                          <td className={`${fija} left-8 z-10 w-20 min-w-20 max-w-20 border-b border-r-2 border-border bg-card px-2.5 py-1.5`}>
                            <Hueso redondo />
                          </td>
                          {grupos.flatMap((g) =>
                            g.columnas.map((c, j) => (
                              <td
                                key={clave(g.titulo, c.clave)}
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
                        <td colSpan={totalColumnas} className="p-0">
                          <div className="sticky left-0 flex w-[min(72rem,calc(100vw-5rem))] flex-col items-center gap-2 px-6 py-10 text-center text-xs text-muted-foreground">
                            <SearchX className="size-6 text-muted-foreground/60" aria-hidden="true" />
                            {sinFilas.texto}
                            <button
                              type="button"
                              onClick={sinFilas.onClick}
                              className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 font-semibold text-foreground ring-1 ring-border hover:bg-accent"
                            >
                              <X className="size-3" aria-hidden="true" />
                              {sinFilas.boton}
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
                        // pasar el ratón. En sRGB y con el mismo porcentaje, que
                        // es como se pinta la fila (su color con transparencia
                        // sobre la tarjeta). En oklch la mezcla daba rosado: el
                        // blanco de la tarjeta es `oklch(1 0 0)`, de tono 0
                        // (rojo), y el azul pasaba por el magenta para llegar.
                        const fondoFijo = elegido
                          ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]"
                          : `${i % 2 === 1 ? "bg-[color-mix(in_srgb,var(--foreground)_3.5%,var(--card))]" : "bg-card"} group-hover:bg-[color-mix(in_srgb,var(--accent)_70%,var(--card))]`
                        const buffer = buffers.find((b) => b.buffer === h.buffer)
                        const filas = filasDe(h)
                        return (
                          <Fragment key={h.id}>
                            {empiezaBuffer && (
                              <tr aria-hidden="true">
                                <td colSpan={totalColumnas} className="border-b border-border bg-muted/60 p-0">
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
                              {grupos.flatMap((g) =>
                                g.columnas.map((c, j) => (
                                  <td
                                    key={clave(g.titulo, c.clave)}
                                    className={`whitespace-nowrap border-b border-border px-2.5 py-1.5 tabular-nums text-foreground ${
                                      j === g.columnas.length - 1 ? "border-r" : ""
                                    }`}
                                  >
                                    {/* La traza, mientras llega, con su hueso. */}
                                    {c.deTraza && trazaCargando ? <Hueso ancho={j % 2 === 0 ? "w-12" : "w-8"} /> : c.valor(h, filas)}
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
            {vista === "datos" && (filtrando || trazaActual?.estado === "ok") && (enDistribucion ? vistaDistribucion === "datos" : true) && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
                <span>
                  {filtrando ? `Mostrando ${visibles.length} de ${hilos.length} hilos. ` : ""}
                  {trazaActual?.estado === "ok"
                    ? `${conTraza} de ${hilos.length} hilos tienen traza ${pestanaActual.deLaTraza}${soloConInfo ? "" : "; los demás quedan vacíos"}.${
                        enDosTrazas ? ` ${enDosTrazas} ${enDosTrazas === 1 ? "está" : "están"} en dos trazas: se ve un valor por renglón.` : ""
                      }`
                    : ""}
                </span>
              </p>
            )}
            {/* En la sección feeder, si la traza no se pudo leer: sus columnas
                quedan vacías y aquí se dice por qué (en distribución, el aviso
                ocupa la grilla). */}
            {errorDeTraza && (
              <div role="alert" className="mt-1.5 flex items-start gap-1.5 text-[11px] text-destructive">
                <CircleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  {errorDeTraza.mensaje} Las columnas de la traza quedan vacías.{" "}
                  <button
                    type="button"
                    onClick={reintentarTraza}
                    className="rounded font-semibold underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    Reintentar
                  </button>
                  <span className="mt-0.5 block break-all font-mono text-[10px] opacity-80">{detalleDeTraza(errorDeTraza.detalle)}</span>
                </span>
              </div>
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
                <Boton
                  icono={ArrowLeft}
                  onClick={() => recorrer("UPSTREAM")}
                  colorIcono="text-emerald-600"
                  titulo="Recorrido desde el hilo seleccionado hacia la OLT"
                >
                  Hacia la fuente
                </Boton>
                <Boton
                  icono={ArrowRight}
                  onClick={() => recorrer("DOWNSTREAM")}
                  colorIcono="text-emerald-600"
                  derecha
                  titulo="Recorrido desde el hilo seleccionado hacia el usuario"
                >
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
          cargando={(vista === "cargando" || trazaCargando) && !mensaje}
          accion={
            vista === "error"
              ? { texto: "Reintentar", onClick: reintentar }
              : vista === "datos" && trazaActual?.estado === "error"
                ? { texto: "Reintentar", onClick: reintentarTraza }
                : undefined
          }
        />
      </DialogContent>
    </Dialog>
  )
}

/**
 * La grilla de «Sección distribución»: los mismos hilos (con el mismo filtro y
 * la misma selección que la otra pestaña) con su traza de distribución, desde
 * el puerto de inicio. Tiene pocas columnas: no hace falta fijar ninguna.
 */
function TablaDistribucion({
  cargando,
  trazaCargando,
  campos,
  visibles,
  filtroBuffer,
  buffers,
  porHilo,
  hiloElegido,
  onElegir,
  sinFilas,
}: {
  /** Los hilos todavía no llegan. */
  cargando: boolean
  /** Los hilos llegaron y su traza todavía no: esas celdas muestran su hueso. */
  trazaCargando: boolean
  campos: CampoDeTraza[]
  visibles: HiloDeCable[]
  filtroBuffer: number | null
  buffers: { buffer: number; hilos: number }[]
  /** La traza de cada hilo, por su UUID en minúsculas. */
  porHilo: Map<string, FilaDeTraza[]>
  hiloElegido: HiloDeCable | null
  onElegir: (h: HiloDeCable) => void
  /** Qué decir si el filtro deja la grilla vacía, con el botón para salir de ahí. */
  sinFilas: SinFilas
}) {
  const columnas = [...COLUMNAS_HILO_DISTRIBUCION, ...campos.map(columnaDeTraza)]
  const total = 1 + columnas.length
  return (
    <table className="w-full min-w-max border-separate border-spacing-0 text-xs">
      <thead>
        <tr>
          <th className="sticky top-0 z-30 w-8 min-w-8 max-w-8 border-b border-r border-border bg-muted" aria-label="Fila seleccionada" />
          {columnas.map((c) => (
            <th
              key={c.clave}
              scope="col"
              className={`sticky top-0 z-30 ${c.ancho} border-b border-border bg-muted px-2.5 py-2 text-left font-semibold text-foreground`}
            >
              {c.titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="gismart-filas">
        {cargando &&
          Array.from({ length: 9 }, (_, i) => (
            <tr key={`hueso-${i}`} aria-hidden="true" className={i % 2 === 1 ? "bg-foreground/[0.035]" : ""}>
              <td className="w-8 min-w-8 max-w-8 border-b border-r border-border" />
              {columnas.map((c, j) => (
                <td key={c.clave} className="border-b border-border px-2.5 py-2.5">
                  {j === 1 ? <Hueso redondo /> : <Hueso ancho={j % 2 === 0 ? "w-14" : "w-10"} />}
                </td>
              ))}
            </tr>
          ))}

        {!cargando && visibles.length === 0 && (
          <tr>
            <td colSpan={total} className="p-0">
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-xs text-muted-foreground">
                <SearchX className="size-6 text-muted-foreground/60" aria-hidden="true" />
                {sinFilas.texto}
                <button
                  type="button"
                  onClick={sinFilas.onClick}
                  className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 font-semibold text-foreground ring-1 ring-border hover:bg-accent"
                >
                  <X className="size-3" aria-hidden="true" />
                  {sinFilas.boton}
                </button>
              </div>
            </td>
          </tr>
        )}

        {!cargando &&
          visibles.map((h, i) => {
            const elegido = hiloElegido?.id === h.id
            const colorBuffer = colorParaMostrar(h.colorBuffer, h.buffer)
            const empiezaBuffer = filtroBuffer === null && h.buffer !== null && (i === 0 || visibles[i - 1].buffer !== h.buffer)
            const fondo = elegido ? "bg-primary/12" : i % 2 === 1 ? "bg-foreground/[0.035]" : "bg-card"
            const buffer = buffers.find((b) => b.buffer === h.buffer)
            const filas = h.uuid ? porHilo.get(h.uuid.toLowerCase()) : undefined
            return (
              <Fragment key={h.id}>
                {empiezaBuffer && (
                  <tr aria-hidden="true">
                    <td colSpan={total} className="border-b border-border bg-muted/60 p-0">
                      <span className="flex w-fit items-center gap-2 px-3 py-1 text-[11px] font-semibold text-foreground">
                        {colorBuffer && <span className="size-2.5 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: colorBuffer }} />}
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
                  onClick={() => onElegir(h)}
                  className={`cursor-pointer ${fondo} ${elegido ? "" : "hover:bg-accent/70"}`}
                >
                  <td
                    className="w-8 min-w-8 max-w-8 border-b border-r border-border px-1 text-center"
                    style={colorBuffer ? { boxShadow: `inset 3px 0 0 ${colorBuffer}` } : undefined}
                  >
                    {elegido && <ChevronRight className="mx-auto size-3.5 text-primary" aria-hidden="true" />}
                  </td>
                  {columnas.map((c, j) => (
                    <td key={c.clave} className="whitespace-nowrap border-b border-border px-2.5 py-1 tabular-nums text-foreground">
                      {c.deTraza && trazaCargando ? <Hueso ancho={j % 2 === 0 ? "w-12" : "w-8"} /> : c.valor(h, filas)}
                    </td>
                  ))}
                </tr>
              </Fragment>
            )
          })}
      </tbody>
    </table>
  )
}
