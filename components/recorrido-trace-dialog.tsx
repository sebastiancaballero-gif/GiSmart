"use client"

import { useImperativeHandle, useRef, useState, type Ref } from "react"
import { Activity, ArrowDown, ArrowLeft, ArrowUp, Cable, ChevronDown, Loader2, MapPin, Ruler } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { BarraDeEstado, EncabezadoVentana, Rotulo, type ManejadorDeVentana, type Mensaje } from "@/components/ventana-sig"
import type { AccesoAlMapa } from "@/components/network-map"
import { TablaTraceArriba } from "@/components/tabla-trace-arriba"
import { crearXlsx, descargarArchivo } from "@/lib/excel"
import {
  obtenerTrace,
  type DireccionTrace,
  type ElementoDelRecorrido,
  type PasoDeTrace,
  type TablaHaciaArriba,
} from "@/lib/map/trace"
import { hojaDelTraceHaciaArriba, origenDeLaRuta } from "@/lib/map/trace-excel"

/**
 * «Recorrido del trace» (ribbon: Red de fibra → Trace). Se pega el UUID de un
 * puerto o de un hilo y se recorre hacia arriba (hacia la OLT) o hacia abajo
 * (hacia el usuario). El recorrido sale ya calculado de la tabla de caché
 * `tab_fiber.element_connection` (ver lib/map/trace.ts), se pinta en el mapa
 * y la ventana dice su largo, la atenuación, los pasos y cuándo se calculó.
 *
 * No oscurece el fondo ni bloquea el mapa (`modal` en falso): lo que se
 * pinta tiene que verse, y un click en el mapa no la cierra. Esc sí. Al
 * cerrarla el recorrido sigue pintado; se quita con «Quitar del mapa».
 *
 * «Gestión de hilos» la abre con `recorrer` para el hilo seleccionado en su
 * tabla (sus botones «Hacia la fuente» y «Hacia abajo»). La ventana muestra
 * ese hilo y, al cerrarla, se vuelve a Gestión de hilos.
 */

/** De dónde viene el origen cuando lo elige otra ventana. */
export type OrigenElegido = {
  /** Qué es: «Hilo 13 del cable 2100555». */
  etiqueta: string
  /** El color del hilo, para su muestra. */
  color?: string | null
  /** Al cerrar la ventana se vuelve ahí (p. ej. a Gestión de hilos). */
  volver?: () => void
}

/** Lo que el tablero puede hacer con la ventana: abrirla, o abrirla ya recorriendo desde un origen. */
export type ManejadorDelTrace = ManejadorDeVentana & {
  /** Abre la ventana con ese origen y recorre en ese sentido. */
  recorrer: (id: string, direccion: DireccionTrace, desde?: OrigenElegido) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lo pegado puede venir de una consulta SQL: `'01a0…'::uuid`, con comillas o espacios. */
function limpiarUuid(valor: string): string {
  return valor
    .trim()
    .replace(/::uuid$/i, "")
    .replace(/^['"]+|['"]+$/g, "")
    .trim()
}

const SENTIDO: Record<DireccionTrace, string> = { UPSTREAM: "hacia arriba", DOWNSTREAM: "hacia abajo" }

type Resumen = {
  direccion: DireccionTrace
  idOrigen: string
  /** Los pasos de todo el camino: el recorrido pedido y los que lo continúan pasando un divisor. */
  pasos: number
  atenuacionDb: number | null
  largoM: number | null
  calculadoEn: string | null
  /** Si el camino pasa por dentro de un divisor: su pérdida no está en la atenuación de la caché. */
  cruzaDivisor: boolean
  /** Los pasos tal como vienen de la caché, para la lista de la ventana. */
  lista: PasoDeTrace[]
  /** La tabla del trace hacia arriba (`null` hacia abajo). */
  tabla: TablaHaciaArriba | null
  errorTabla: { mensaje: string; detalle?: string } | null
}

/** «Hilo 55 del cable 2102262» → «hilo-55-del-cable-2102262», para el nombre del archivo. */
const paraArchivo = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/** Cómo se lee el tipo de conexión de un paso. */
const CONEXION: Record<string, string> = { PATCHCORD: "Patchcord", PIGTAIL: "Pigtail", FUSION: "Fusión" }

/** `PUERTO` → «puerto», `HILO` → «hilo». */
const minuscula = (texto: string | null) => (texto ? texto.toLowerCase() : "—")

/** «8 oct, 8:48 a. m.»: cuándo se calculó el recorrido guardado en la caché. */
function textoDeFecha(iso: string | null) {
  if (!iso) return null
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime())
    ? null
    : fecha.toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

function textoDeLargo(m: number) {
  return m >= 1000 ? `${(m / 1000).toLocaleString("es-CO", { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`
}

export function RecorridoTraceDialog({ ref, mapa }: { ref?: Ref<ManejadorDelTrace>; mapa: AccesoAlMapa }) {
  const [abierta, setAbierta] = useState(false)
  const [origen, setOrigen] = useState("")
  /** El origen, cuando llega elegido desde otra ventana (Gestión de hilos). */
  const [desde, setDesde] = useState<OrigenElegido | null>(null)
  const [cargando, setCargando] = useState<DireccionTrace | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [verPasos, setVerPasos] = useState(false)
  /** La ruta de la tabla que se ve, cuando el recorrido se abre en varias. */
  const [ruta, setRuta] = useState(0)
  /** La fila de la tabla que se ubicó en el mapa, para marcarla. */
  const [ubicada, setUbicada] = useState<number | null>(null)
  /** La tabla se pliega para ver más mapa. */
  const [verTabla, setVerTabla] = useState(true)
  // Si se pide otro recorrido (o se cierra) antes de que llegue el anterior,
  // la respuesta vieja se descarta.
  const consultaRef = useRef(0)
  const ventanaRef = useRef<HTMLDivElement>(null)

  /** La cubierta del mapa donde ocurre un paso, si está cargada. */
  function cubiertaDe(contenedor: PasoDeTrace["contenedor"]) {
    const id = contenedor.id
    return contenedor.tipo === "CUB" && id ? mapa.indice.find((e) => e.tipo === "node" && e.alias?.includes(id)) : undefined
  }

  /** El nombre del equipo donde ocurre un paso: la cubierta del mapa, o OLT / ODF. */
  function nombreDe(contenedor: PasoDeTrace["contenedor"]) {
    if (contenedor.tipo !== "CUB") return contenedor.tipo ?? "un equipo"
    return cubiertaDe(contenedor)?.nombre || "una cubierta fuera del mapa"
  }

  async function recorrer(pegado: string, direccion: DireccionTrace) {
    const id = limpiarUuid(pegado)
    if (!UUID.test(id)) {
      setMensaje({ texto: "Pega el UUID de un puerto o de un hilo: 36 caracteres con guiones.", tono: "aviso" })
      return
    }
    const api = mapa.api.current
    if (!api) {
      setMensaje({ texto: "El mapa todavía no está listo. Espera a que cargue y vuelve a intentarlo.", tono: "aviso" })
      return
    }
    const consulta = ++consultaRef.current
    setOrigen(id)
    setCargando(direccion)
    setMensaje(null)
    const r = await obtenerTrace(id, direccion)
    if (consulta !== consultaRef.current) return
    setCargando(null)

    if (r.estado === "error") {
      setMensaje({
        texto: r.mensaje,
        tono: "error",
        detalle: `tab_fiber.element_connection${r.detalle ? ` → ${r.detalle}` : ""}`,
      })
      return
    }
    if (!r.encontrado || r.pasos.length === 0) {
      api.limpiarRecorrido()
      setResumen(null)
      setMensaje({
        texto: r.encontrado
          ? `El recorrido calculado ${SENTIDO[direccion]} desde ese origen no tiene pasos.`
          : `No hay un recorrido ${SENTIDO[direccion]} calculado para ese origen: el UUID no existe o no tiene conectividad en ese sentido.`,
        tono: "aviso",
      })
      return
    }

    // Hacia arriba el camino puede seguir en otros recorridos de la caché (al
    // pasar un divisor): se pinta y se cuenta todo. De cada uno, su geometría
    // entera si la caché la trae; si no, la de cada paso (si llegara), y los
    // cables de sus hilos.
    const recorridos = [{ pasos: r.pasos, geometria: r.geometria }, ...r.tramos]
    const todos = recorridos.flatMap((x) => x.pasos)
    const geometrias = recorridos.flatMap((x) =>
      x.geometria ? [x.geometria] : x.pasos.flatMap((p) => (p.geometria ? [p.geometria] : [])),
    )
    const cubiertas = [
      ...new Set(todos.flatMap((p) => (p.contenedor.tipo === "CUB" && p.contenedor.id ? [p.contenedor.id] : []))),
    ]
    const totalPasos = r.totalPasos + r.tramos.reduce((suma, x) => suma + x.totalPasos, 0)
    const atenuaciones = [r.atenuacionTotal, ...r.tramos.map((x) => x.atenuacionTotal)]
    const atenuacionDb = atenuaciones.every((a) => a !== null)
      ? Math.round(atenuaciones.reduce((suma: number, a) => suma + (a ?? 0), 0) * 100) / 100
      : null
    const pintado = api.pintarRecorrido({
      cables: r.cables,
      geometrias,
      cubiertas,
      despejarDesde: ventanaRef.current?.getBoundingClientRect().top,
    })
    setVerPasos(false)
    setRuta(0)
    setUbicada(null)
    setVerTabla(true)
    const hayLinea = pintado.pintados > 0 || geometrias.length > 0
    setResumen({
      direccion,
      idOrigen: id,
      pasos: totalPasos,
      atenuacionDb,
      largoM: hayLinea ? pintado.largoM : null,
      calculadoEn: r.calculadoEn,
      cruzaDivisor: r.tramos.length > 0,
      lista: r.pasos,
      tabla: direccion === "UPSTREAM" ? r.tabla : null,
      errorTabla: direccion === "UPSTREAM" ? r.errorTabla : null,
    })
    // Con la tabla la ventana crece: se vuelve a encuadrar cuando ya tiene su
    // tamaño, para que no tape el recorrido.
    window.setTimeout(() => api.encuadrarRecorrido(ventanaRef.current?.getBoundingClientRect().top), 120)

    const calculado = textoDeFecha(r.calculadoEn)
    const recorrido = `${totalPasos} ${totalPasos === 1 ? "paso" : "pasos"} ${SENTIDO[direccion]}, de ${nombreDe(todos[0].contenedor)} a ${nombreDe(todos[todos.length - 1].contenedor)}${calculado ? ` (calculado el ${calculado})` : ""}`
    if (!hayLinea) {
      setMensaje({
        texto: `${recorrido}, pero ninguno de sus cables está en el mapa: no hay línea que pintar.`,
        tono: "aviso",
      })
    } else if (pintado.faltan.length > 0) {
      setMensaje({
        texto: `${recorrido}. ${pintado.faltan.length} de ${r.cables.length} cables del recorrido no están en el mapa y no se pintaron.`,
        tono: "aviso",
      })
    } else {
      setMensaje({ texto: `${recorrido}.`, tono: "info" })
    }
  }

  /** «Exportar a Excel»: la ruta que se ve de la tabla del trace hacia arriba, con su contexto y la suma. */
  function exportarExcel() {
    const tabla = resumen?.tabla
    const elegida = tabla?.rutas[ruta]
    if (!resumen || !tabla || !elegida || elegida.filas.length === 0) return
    const ahora = new Date()
    const fecha = (d: Date) =>
      d.toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    const calculado = resumen.calculadoEn ? new Date(resumen.calculadoEn) : null
    const datos = crearXlsx(
      hojaDelTraceHaciaArriba({
        ruta: elegida,
        origen: desde?.etiqueta ?? null,
        idOrigen: resumen.idOrigen,
        numeroDeRuta: ruta + 1,
        totalDeRutas: tabla.rutas.length,
        pasos: resumen.pasos,
        atenuacionDb: resumen.atenuacionDb,
        calculadoEn: calculado && !Number.isNaN(calculado.getTime()) ? fecha(calculado) : null,
        exportadoEn: fecha(ahora),
        avisos: tabla.avisos,
      }),
      ahora,
    )
    const dia = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`
    const nombre = paraArchivo(desde?.etiqueta ?? origenDeLaRuta(elegida) ?? resumen.idOrigen.slice(0, 8))
    descargarArchivo(datos, `trace-hacia-arriba-${nombre}${tabla.rutas.length > 1 ? `-ruta-${ruta + 1}` : ""}-${dia}.xlsx`)
  }

  /** Lleva el mapa a la cubierta o al cable de una fila de la tabla, en el espacio que deja libre la ventana. */
  function ubicar(fila: ElementoDelRecorrido, indice: number) {
    const api = mapa.api.current
    const ventana = ventanaRef.current?.getBoundingClientRect()
    const esta = fila.idCubierta
      ? api?.mostrarCubierta(fila.idCubierta, ventana)
      : fila.idCable
        ? api?.mostrarCable(fila.idCable, ventana)
        : false
    if (esta) {
      setUbicada(indice)
      return
    }
    setMensaje({
      texto: fila.idCubierta
        ? `La cubierta ${fila.nombreContenedor ?? fila.codigoContenedor ?? ""} no está cargada en el mapa.`
        : `El cable ${fila.nombreContenedor ?? fila.codigoContenedor ?? ""} no está cargado en el mapa.`,
      tono: "aviso",
    })
  }

  /** Pliega o abre la tabla; la ventana cambia de alto, así que se vuelve a encuadrar. */
  function alternarTabla() {
    setVerTabla((v) => !v)
    window.setTimeout(() => mapa.api.current?.encuadrarRecorrido(ventanaRef.current?.getBoundingClientRect().top), 80)
  }

  function quitarDelMapa() {
    consultaRef.current++
    setCargando(null)
    mapa.api.current?.limpiarRecorrido()
    setResumen(null)
    setVerPasos(false)
    setMensaje(null)
  }

  /**
   * Cierra la ventana (la equis, Esc o «Volver a los hilos»). Si el origen se
   * eligió en otra ventana, se vuelve a ella; el recorrido sigue pintado.
   */
  function cerrar() {
    // Lo que estuviera en camino ya no se pinta: la ventana se cerró.
    consultaRef.current++
    setCargando(null)
    setMensaje(null)
    setAbierta(false)
    const volver = desde?.volver
    setDesde(null)
    // Después de cerrar esta, para que la otra tome el foco.
    if (volver) window.setTimeout(volver, 0)
  }

  // Sin lista de dependencias: `recorrer` usa la función de este render.
  useImperativeHandle(ref, () => ({
    abrir: () => {
      // Una elección en el mapa que siguiera esperando ya no vale.
      mapa.api.current?.abandonarEleccion()
      setDesde(null)
      setAbierta(true)
    },
    recorrer: (id, direccion, elegido) => {
      mapa.api.current?.abandonarEleccion()
      setOrigen(id)
      setDesde(elegido ?? null)
      setAbierta(true)
      // Un momento después de abrir: el encuadre necesita la ventana ya
      // dibujada para dejarle libre su espacio.
      window.setTimeout(() => void recorrer(id, direccion), 80)
    },
  }))

  const largoVisible = resumen?.tabla?.rutas[ruta]?.sumaM ?? resumen?.largoM ?? null
  const ancha = Boolean(resumen?.tabla || resumen?.errorTabla)

  const barra: Mensaje =
    mensaje ??
    (cargando
      ? { texto: `Calculando el recorrido ${SENTIDO[cargando]}…`, tono: "info" }
      : resumen
        ? { texto: "Recorrido pintado en el mapa. Puedes cambiar el sentido o pegar otro origen.", tono: "info" }
        : { texto: "Pega el UUID de origen y elige hacia dónde recorrer.", tono: "info" })

  return (
    <Dialog
      open={abierta}
      onOpenChange={(abierto) => (abierto ? setAbierta(true) : cerrar())}
      modal={false}
      disablePointerDismissal
    >
      {/* Abajo y al centro, sobre el mapa: ahí no tapa la barra de
          herramientas, el panel del elemento ni la leyenda. En pantallas
          anchas baja hasta el borde (la barra de estado y la leyenda quedan a
          los lados) y le deja más mapa al recorrido. */}
      <DialogContent
        ref={ventanaRef}
        sinFondo
        className={`left-1/2 top-auto bottom-28 flex xl:bottom-5 ${
          ancha ? "w-[min(60rem,calc(100vw-1.5rem))]" : "w-[min(23rem,calc(100vw-1.5rem))]"
        } max-h-[calc(100dvh-8rem)] max-w-none -translate-x-1/2 translate-y-0 flex-col overflow-hidden p-0 shadow-2xl data-[starting-style]:translate-y-2`}
      >
        <EncabezadoVentana
          icono={Activity}
          titulo="Recorrido del trace"
          descripcion={
            resumen
              ? `${resumen.pasos} ${resumen.pasos === 1 ? "paso" : "pasos"} ${SENTIDO[resumen.direccion]}, pintado en el mapa.`
              : "Desde un puerto o un hilo; se pinta en el mapa."
          }
        />
        {/* Con la tabla puede no caber en pantallas bajas: se desplaza por dentro. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-muted/20 p-4">
          {/* El hilo que se eligió en Gestión de hilos, a la vista, y cómo volver. */}
          {desde && (
            <div data-origen-elegido className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
              {desde.color ? (
                <span
                  className="size-3 shrink-0 rounded-full ring-1 ring-foreground/20"
                  style={{ backgroundColor: desde.color }}
                  aria-hidden="true"
                />
              ) : (
                <Cable className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{desde.etiqueta}</span>
              {desde.volver && (
                <button
                  type="button"
                  onClick={cerrar}
                  className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <ArrowLeft className="size-3" aria-hidden="true" />
                  Volver a los hilos
                </button>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <Rotulo>{desde ? "Origen · UUID del hilo elegido" : "Origen · UUID de un puerto o de un hilo"}</Rotulo>
            {/* Con el hilo elegido en Gestión de hilos, el origen es ese hilo:
                se ve (y se puede copiar) pero no se cambia aquí. */}
            <input
              type="text"
              value={origen}
              readOnly={desde !== null}
              onChange={(e) => setOrigen(e.target.value)}
              placeholder="01a0f9bf-be88-7b80-9c77-2219b25fb611"
              title={desde ? "El origen es el hilo elegido en Gestión de hilos" : undefined}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!desde && mensaje?.tono === "aviso" && !UUID.test(limpiarUuid(origen)) ? true : undefined}
              className={`h-8 w-full rounded-lg border border-input px-2.5 font-mono text-[11.5px] outline-none transition placeholder:text-muted-foreground/50 ${
                desde
                  ? "cursor-not-allowed bg-muted/70 text-muted-foreground"
                  : "bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/30 aria-invalid:border-amber-500"
              }`}
            />
          </label>

          {/* Con la tabla la ventana es ancha: sentido y longitud van en una
              fila, para que la ventana tape menos mapa. */}
          <div className={ancha ? "flex flex-col gap-3 sm:grid sm:grid-cols-[2fr_1.3fr] sm:gap-2" : "flex flex-col gap-3"}>
            <div className="grid grid-cols-2 gap-2">
              <BotonDeSentido
                sentido="arriba"
                detalle="Hacia la OLT"
                cargando={cargando === "UPSTREAM"}
                deshabilitado={cargando !== null}
                onClick={() => void recorrer(origen, "UPSTREAM")}
              />
              <BotonDeSentido
                sentido="abajo"
                detalle="Hacia el usuario"
                cargando={cargando === "DOWNSTREAM"}
                deshabilitado={cargando !== null}
                onClick={() => void recorrer(origen, "DOWNSTREAM")}
              />
            </div>

            {/* El resultado, con el mismo aire que «Fibra total» en el panel. */}
            <div className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary/12 to-primary/5 px-3 py-2 ring-1 ring-primary/15">
              <Ruler className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${ancha ? "sm:sr-only" : ""}`}
              >
                Longitud
              </span>
              <output
                aria-label="Longitud del recorrido"
                className="ml-auto flex flex-wrap items-baseline justify-end gap-x-2 text-right tabular-nums"
              >
                {resumen ? (
                  <>
                    <span className="text-[11px] text-muted-foreground">
                      {resumen.atenuacionDb !== null && (
                        <span
                          title={resumen.cruzaDivisor ? "La atenuación de la caché no incluye la pérdida del divisor" : undefined}
                        >
                          {resumen.atenuacionDb.toLocaleString("es-CO", { minimumFractionDigits: 2 })} dB
                          {resumen.cruzaDivisor && " sin el divisor"}
                          {" · "}
                        </span>
                      )}
                      {resumen.pasos} {resumen.pasos === 1 ? "paso" : "pasos"}
                    </span>
                    <span className="text-lg font-bold leading-none tracking-tight text-foreground">
                      {/* Con la tabla, el largo es su suma: la ventana dice un solo número. */}
                      {largoVisible !== null ? textoDeLargo(largoVisible) : "—"}
                    </span>
                  </>
                ) : (
                  <span className="text-lg font-bold leading-none tracking-tight text-muted-foreground/50">—</span>
                )}
              </output>
            </div>
          </div>

          {/* Hacia arriba, la tabla que pidió el ingeniero (ver TablaTraceArriba). */}
          {resumen?.direccion === "UPSTREAM" && resumen.errorTabla && (
            <p role="alert" className="rounded-lg bg-destructive/8 px-2.5 py-2 text-[11px] text-destructive">
              {resumen.errorTabla.mensaje}
              {resumen.errorTabla.detalle && (
                <span className="mt-0.5 block break-words font-mono text-[10px] opacity-80">{resumen.errorTabla.detalle}</span>
              )}
            </p>
          )}
          {resumen?.direccion === "UPSTREAM" && resumen.tabla && (
            <TablaTraceArriba
              tabla={resumen.tabla}
              ruta={ruta}
              onRuta={(i) => {
                setRuta(i)
                setUbicada(null)
              }}
              onExportar={exportarExcel}
              onUbicar={ubicar}
              ubicada={ubicada}
              abierta={verTabla}
              onAlternar={alternarTabla}
            />
          )}

          {/* Los pasos que guarda la caché, como pide el ingeniero que se
              muestren. Una cubierta del mapa se puede pulsar: el mapa la lleva
              al espacio que deja libre la ventana y la destella. Hacia arriba
              ya está la tabla, así que la lista no se repite. */}
          {resumen && !resumen.tabla && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setVerPasos((v) => !v)}
                aria-expanded={verPasos}
                className="flex items-center gap-1.5 self-start rounded-md px-1 text-[11px] font-semibold text-primary outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ChevronDown className={`size-3.5 transition-transform ${verPasos ? "" : "-rotate-90"}`} aria-hidden="true" />
                {verPasos ? "Ocultar los pasos" : `Ver los ${resumen.pasos} ${resumen.pasos === 1 ? "paso" : "pasos"}`}
              </button>
              {verPasos && (
                <ol className="max-h-[min(13rem,30vh)] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card text-[11px] shadow-sm animate-in fade-in duration-200 motion-reduce:animate-none">
                  {resumen.lista.map((p, i) => {
                    const cubierta = cubiertaDe(p.contenedor)
                    const contenido = (
                      <>
                        <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-muted-foreground">{p.paso}</span>
                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span className="flex items-center gap-1 truncate font-semibold text-foreground">
                            {cubierta && <MapPin className="size-3 shrink-0 text-primary" aria-hidden="true" />}
                            {nombreDe(p.contenedor)}
                          </span>
                          <span className="truncate text-[10px] text-muted-foreground">
                            {(p.conexion && CONEXION[p.conexion]) ?? p.conexion ?? "Conexión"} · {minuscula(p.origen.tipo)} → {minuscula(p.destino.tipo)}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {p.atenuacionAcumulada !== null ? `${p.atenuacionAcumulada.toLocaleString("es-CO", { minimumFractionDigits: 2 })} dB` : "—"}
                        </span>
                      </>
                    )
                    return (
                      <li key={`${p.paso}-${i}`}>
                        {cubierta ? (
                          <button
                            type="button"
                            onClick={() =>
                              p.contenedor.id &&
                              mapa.api.current?.mostrarCubierta(p.contenedor.id, ventanaRef.current?.getBoundingClientRect())
                            }
                            title={`Ver ${cubierta.nombre} en el mapa`}
                            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left outline-none transition hover:bg-accent focus-visible:bg-accent"
                          >
                            {contenido}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 px-2.5 py-1.5">{contenido}</div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
        <BarraDeEstado
          mensaje={barra}
          cargando={cargando !== null && !mensaje}
          accion={resumen ? { texto: "Quitar del mapa", onClick: quitarDelMapa } : undefined}
        />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Uno de los dos sentidos: un botón con su flecha, que se asoma hacia ese lado
 * al pasar el mouse. Mientras se calcula, la flecha gira como reloj de espera.
 */
function BotonDeSentido({
  sentido,
  detalle,
  cargando,
  deshabilitado,
  onClick,
}: {
  sentido: "arriba" | "abajo"
  detalle: string
  cargando: boolean
  deshabilitado: boolean
  onClick: () => void
}) {
  const Flecha = sentido === "arriba" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-busy={cargando || undefined}
      className="group flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left shadow-sm outline-none transition hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card motion-reduce:transition-none"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 transition-colors group-hover:ring-primary/40">
        {cargando ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Flecha
            className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${
              sentido === "arriba" ? "group-hover:-translate-y-px" : "group-hover:translate-y-px"
            }`}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-xs font-semibold text-foreground">{sentido === "arriba" ? "Hacia arriba" : "Hacia abajo"}</span>
        <span className="text-[10px] text-muted-foreground">{detalle}</span>
      </span>
    </button>
  )
}
