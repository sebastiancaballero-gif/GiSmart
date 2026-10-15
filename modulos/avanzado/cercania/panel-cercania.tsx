"use client"

import { useEffect, useMemo, useState } from "react"
import { Box, Building2, Crosshair, MousePointerClick, Radius, Spline, Table2, X } from "lucide-react"
import type { ElementoDelMapa, MapaApi } from "@/components/network-map"
import { LAYER_COLORS } from "@/lib/network-colors"
import { textoDeCoordenada } from "@/lib/map/busqueda"
import type { CapaDeTabla } from "../tabla/columnas"
import { cercanos, textoDeDistancia, type Cercano } from "./cercania"
import { COLOR_CERCANIA } from "./estilo"

const RADIOS = [100, 300, 500, 1000]
/** Más de esto no es «cercanía»: con 5 km entra media red. */
const RADIO_MAXIMO = 5000

type Origen = { punto: [number, number]; nombre: string }

function Grupo({
  icono: Icono,
  color,
  titulo,
  lista,
  onVer,
  onTabla,
}: {
  icono: typeof Box
  color: string
  titulo: string
  lista: Cercano[]
  onVer: (clave: string) => void
  onTabla?: () => void
}) {
  if (lista.length === 0) return null
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icono className="size-3.5" style={{ color }} aria-hidden="true" />
        {titulo} <span className="tabular-nums text-foreground">{lista.length}</span>
        {onTabla && (
          <button
            type="button"
            onClick={onTabla}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 normal-case tracking-normal text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Table2 className="size-3" aria-hidden="true" />
            En la tabla
          </button>
        )}
      </div>
      <ul className="max-h-40 overflow-y-auto py-1">
        {lista.map(({ elemento, distanciaM }) => (
          <li key={elemento.clave}>
            <button
              type="button"
              onClick={() => onVer(elemento.clave)}
              className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{elemento.nombre}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{textoDeDistancia(distanciaM)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * «Cercanía» (área de influencia): lo que hay a cierta distancia de un punto
 * del mapa o de la cubierta de la ficha, con el círculo dibujado. Sirve, por
 * ejemplo, para ver qué cubiertas quedan a menos de 300 m de un cliente nuevo.
 */
export function PanelCercania({
  mapa,
  onCerrar,
  onSeleccionarEnTabla,
  espacioAbajo = 0,
}: {
  mapa: { current: MapaApi | null }
  onCerrar: () => void
  /** Lleva un grupo del resultado a la tabla de atributos, seleccionado. */
  onSeleccionarEnTabla: (capa: CapaDeTabla, claves: string[], descripcion: string) => void
  espacioAbajo?: number
}) {
  const [radio, setRadio] = useState(300)
  const [origen, setOrigen] = useState<Origen | null>(null)
  const [eligiendo, setEligiendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [elementos, setElementos] = useState<ElementoDelMapa[]>([])

  // Los datos del mapa, otra vez si se filtra o se recargan las capas.
  useEffect(() => {
    const api = mapa.current
    if (!api) return
    const cargar = () => setElementos(api.elementosDelMapa().elementos)
    cargar()
    return api.alCambiarLaVista(cargar)
  }, [mapa])

  const radioValido = Number.isFinite(radio) && radio > 0 && radio <= RADIO_MAXIMO
  const resultado = useMemo(
    () => (origen && radioValido ? cercanos(elementos, origen.punto, radio) : null),
    [origen, radioValido, elementos, radio],
  )

  // El círculo en el mapa sigue al punto y al radio; al cerrar se quita.
  useEffect(() => {
    mapa.current?.pintarCercania(origen && radioValido ? { centro: origen.punto, radioM: radio } : null)
  }, [mapa, origen, radio, radioValido])
  useEffect(() => () => mapa.current?.pintarCercania(null), [mapa])

  async function elegirEnElMapa() {
    const api = mapa.current
    if (!api) return
    setEligiendo(true)
    setAviso(null)
    const r = await api.elegirPunto("Haz click en el punto desde donde medir la cercanía.")
    setEligiendo(false)
    if (r.estado === "elegido") usarOrigen({ punto: r.valor, nombre: textoDeCoordenada({ lon: r.valor[0], lat: r.valor[1] }) })
  }

  /** Un punto nuevo: el mapa muestra el círculo entero (al cambiar solo el radio, no se mueve). */
  function usarOrigen(nuevo: Origen) {
    setOrigen(nuevo)
    if (radioValido) mapa.current?.pintarCercania({ centro: nuevo.punto, radioM: radio }, { encuadrar: true })
  }

  function desdeLaFicha() {
    const ficha = mapa.current?.puntoDeLaFicha()
    if (!ficha) {
      setAviso("Abre primero la ficha de una cubierta o una cabecera (Identificar y click sobre ella).")
      return
    }
    setAviso(null)
    usarOrigen(ficha)
  }

  const descripcion = origen ? `A ${textoDeDistancia(radio)} o menos de ${origen.nombre}` : ""
  const total = resultado ? resultado.cubiertas.length + resultado.cables.length + resultado.cabeceras.length : 0

  return (
    <aside
      data-tapa-mapa
      aria-label="Cercanía"
      style={{ maxHeight: `calc(100% - 13.5rem - ${espacioAbajo}px)` }}
      className="absolute left-[4.5rem] top-[6.5rem] z-20 flex w-80 flex-col overflow-hidden rounded-xl bg-card/95 shadow-xl ring-1 ring-border backdrop-blur gismart-panel"
    >
      <div className="flex items-start gap-2 border-b border-border px-3.5 py-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ color: COLOR_CERCANIA, backgroundColor: "rgba(13,148,136,0.12)" }}>
          <Radius className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Cercanía</h2>
          <p className="text-[11px] text-muted-foreground">Lo que está a cierta distancia de un punto</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar cercanía"
          className="-mr-1 rounded-md p-1 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            A
            <input
              type="number"
              min={1}
              max={RADIO_MAXIMO}
              step={50}
              value={Number.isFinite(radio) ? radio : ""}
              onChange={(e) => setRadio(e.target.valueAsNumber)}
              aria-label="Distancia en metros"
              className="h-7 w-20 rounded-md border border-border bg-background px-2 text-right text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            m o menos
          </label>
          {RADIOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadio(r)}
              aria-pressed={radio === r}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                radio === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {textoDeDistancia(r)}
            </button>
          ))}
        </div>
        {!radioValido && <p className="text-[11px] text-destructive">La distancia va de 1 m a {textoDeDistancia(RADIO_MAXIMO)}.</p>}

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={elegirEnElMapa}
            disabled={eligiendo}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            <MousePointerClick className="size-3.5 text-primary" aria-hidden="true" />
            {eligiendo ? "Haz click en el mapa…" : "Elegir en el mapa"}
          </button>
          <button
            type="button"
            onClick={desdeLaFicha}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Crosshair className="size-3.5 text-primary" aria-hidden="true" />
            Desde la ficha
          </button>
        </div>
        {aviso && <p className="text-[11px] text-amber-700 dark:text-amber-400">{aviso}</p>}

        {origen && resultado && (
          <>
            <p className="text-xs text-foreground" aria-live="polite">
              <strong className="tabular-nums">{total}</strong> {total === 1 ? "elemento" : "elementos"} a{" "}
              {textoDeDistancia(radio)} o menos de <span className="font-semibold">{origen.nombre}</span>
            </p>
            <Grupo
              icono={Box}
              color={LAYER_COLORS.node}
              titulo="Cubiertas"
              lista={resultado.cubiertas}
              onVer={(c) => mapa.current?.enfocarElemento(c)}
              onTabla={() => onSeleccionarEnTabla("node", resultado.cubiertas.map((c) => c.elemento.clave), descripcion)}
            />
            <Grupo
              icono={Spline}
              color={LAYER_COLORS.fiber}
              titulo="Cables"
              lista={resultado.cables}
              onVer={(c) => mapa.current?.enfocarElemento(c)}
              onTabla={() => onSeleccionarEnTabla("fiber", resultado.cables.map((c) => c.elemento.clave), descripcion)}
            />
            <Grupo
              icono={Building2}
              color={LAYER_COLORS.cabecera}
              titulo="Cabeceras"
              lista={resultado.cabeceras}
              onVer={(c) => mapa.current?.enfocarElemento(c)}
            />
            {total === 0 && <p className="text-[11px] text-muted-foreground">Nada de la red a esa distancia. Prueba con una mayor.</p>}
          </>
        )}
        {!origen && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Elige el punto en el mapa (por ejemplo, la casa de un cliente nuevo) o usa la cubierta que tengas abierta en la ficha.
          </p>
        )}
      </div>
    </aside>
  )
}
