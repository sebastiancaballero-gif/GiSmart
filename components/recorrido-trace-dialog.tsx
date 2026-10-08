"use client"

import { useImperativeHandle, useRef, useState, type Ref } from "react"
import { Activity, ArrowDown, ArrowUp, Loader2, Ruler } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { BarraDeEstado, EncabezadoVentana, Rotulo, type ManejadorDeVentana, type Mensaje } from "@/components/ventana-sig"
import type { AccesoAlMapa } from "@/components/network-map"
import { obtenerTrace, type DireccionTrace, type PasoDeTrace } from "@/lib/map/trace"

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
 */

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

type Resumen = { direccion: DireccionTrace; pasos: number; atenuacionDb: number | null; largoM: number | null }

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

export function RecorridoTraceDialog({ ref, mapa }: { ref?: Ref<ManejadorDeVentana>; mapa: AccesoAlMapa }) {
  const [abierta, setAbierta] = useState(false)
  const [origen, setOrigen] = useState("")
  const [cargando, setCargando] = useState<DireccionTrace | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  // Si se pide otro recorrido (o se cierra) antes de que llegue el anterior,
  // la respuesta vieja se descarta.
  const consultaRef = useRef(0)
  const ventanaRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(
    ref,
    () => ({
      abrir: () => {
        // Una elección en el mapa que siguiera esperando ya no vale.
        mapa.api.current?.abandonarEleccion()
        setAbierta(true)
      },
    }),
    [mapa.api],
  )

  /** El nombre del equipo donde ocurre un paso: la cubierta del mapa, o OLT / ODF. */
  function nombreDe(contenedor: PasoDeTrace["contenedor"]) {
    if (contenedor.tipo !== "CUB") return contenedor.tipo ?? "un equipo"
    const id = contenedor.id
    const enMapa = id ? mapa.indice.find((e) => e.tipo === "node" && e.alias?.includes(id)) : undefined
    return enMapa?.nombre || "una cubierta fuera del mapa"
  }

  async function recorrer(direccion: DireccionTrace) {
    const id = limpiarUuid(origen)
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

    // La geometría del recorrido entero si la caché la trae; si no, la de cada
    // paso (si llegara), y los cables de sus hilos.
    const geometrias = r.geometria ? [r.geometria] : r.pasos.flatMap((p) => (p.geometria ? [p.geometria] : []))
    const pintado = api.pintarRecorrido({
      cables: r.cables,
      geometrias,
      despejarDesde: ventanaRef.current?.getBoundingClientRect().top,
    })
    const hayLinea = pintado.pintados > 0 || geometrias.length > 0
    setResumen({
      direccion,
      pasos: r.pasos.length,
      atenuacionDb: r.atenuacionTotal,
      largoM: hayLinea ? pintado.largoM : null,
    })

    const calculado = textoDeFecha(r.calculadoEn)
    const recorrido = `${r.pasos.length} ${r.pasos.length === 1 ? "paso" : "pasos"} ${SENTIDO[direccion]}, de ${nombreDe(r.pasos[0].contenedor)} a ${nombreDe(r.pasos[r.pasos.length - 1].contenedor)}${calculado ? ` (calculado el ${calculado})` : ""}`
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

  function quitarDelMapa() {
    consultaRef.current++
    setCargando(null)
    mapa.api.current?.limpiarRecorrido()
    setResumen(null)
    setMensaje(null)
  }

  const barra: Mensaje =
    mensaje ??
    (cargando
      ? { texto: `Calculando el recorrido ${SENTIDO[cargando]}…`, tono: "info" }
      : { texto: "Pega el UUID de origen y elige hacia dónde recorrer.", tono: "info" })

  return (
    <Dialog
      open={abierta}
      onOpenChange={(abierto) => {
        setAbierta(abierto)
        if (!abierto) {
          // Lo que estuviera en camino ya no se pinta: la ventana se cerró.
          consultaRef.current++
          setCargando(null)
          setMensaje(null)
        }
      }}
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
        className="left-1/2 top-auto bottom-28 flex xl:bottom-5 w-[min(23rem,calc(100vw-1.5rem))] max-w-none -translate-x-1/2 translate-y-0 flex-col overflow-hidden p-0 shadow-2xl data-[starting-style]:translate-y-2"
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
        <div className="flex flex-col gap-3 bg-muted/20 p-4">
          <label className="flex flex-col gap-1">
            <Rotulo>Origen · UUID de un puerto o de un hilo</Rotulo>
            <input
              type="text"
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              placeholder="01a0f9bf-be88-7b80-9c77-2219b25fb611"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={mensaje?.tono === "aviso" && !UUID.test(limpiarUuid(origen)) ? true : undefined}
              className="h-8 w-full rounded-lg border border-input bg-card px-2.5 font-mono text-[11.5px] text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/30 aria-invalid:border-amber-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <BotonDeSentido
              sentido="arriba"
              detalle="Hacia la OLT"
              cargando={cargando === "UPSTREAM"}
              deshabilitado={cargando !== null}
              onClick={() => void recorrer("UPSTREAM")}
            />
            <BotonDeSentido
              sentido="abajo"
              detalle="Hacia el usuario"
              cargando={cargando === "DOWNSTREAM"}
              deshabilitado={cargando !== null}
              onClick={() => void recorrer("DOWNSTREAM")}
            />
          </div>

          {/* El resultado, con el mismo aire que «Fibra total» en el panel. */}
          <div className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary/12 to-primary/5 px-3 py-2 ring-1 ring-primary/15">
            <Ruler className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Longitud</span>
            <output aria-label="Longitud del recorrido" className="ml-auto flex items-baseline gap-2 tabular-nums">
              {resumen ? (
                <>
                  <span className="text-[11px] text-muted-foreground">
                    {resumen.atenuacionDb !== null && `${resumen.atenuacionDb.toLocaleString("es-CO", { minimumFractionDigits: 2 })} dB · `}
                    {resumen.pasos} {resumen.pasos === 1 ? "paso" : "pasos"}
                  </span>
                  <span className="text-lg font-bold leading-none tracking-tight text-foreground">
                    {resumen.largoM !== null ? textoDeLargo(resumen.largoM) : "—"}
                  </span>
                </>
              ) : (
                <span className="text-lg font-bold leading-none tracking-tight text-muted-foreground/50">—</span>
              )}
            </output>
          </div>
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
