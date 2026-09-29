"use client"

import { useState } from "react"
import type LineString from "ol/geom/LineString"
import Point from "ol/geom/Point"
import { toLonLat } from "ol/proj"
import { getLength } from "ol/sphere"
import {
  Box,
  Building2,
  Check,
  Copy,
  Crosshair,
  Hexagon,
  Info,
  MapPin,
  Navigation,
  Network,
  Pencil,
  Spline,
  Trash2,
  Waypoints,
  X,
} from "lucide-react"
import { textoDeCoordenada } from "@/lib/map/busqueda"
import { copiarTexto } from "@/lib/portapapeles"
import { LAYER_COLORS } from "@/lib/network-colors"
import { TYPE_LABELS, colorForFuncionCub, type FeatureType } from "@/lib/map/symbology"
import { CAPA_DE_TIPO, NOMBRE_DE_CAPA } from "@/lib/map/capa-activa"
import type { EstadoConectividad } from "@/lib/map/conectividad"
import type { SelectedFeature } from "@/components/mapa/herramientas"

const TYPE_ICONS: Record<FeatureType, typeof Box> = {
  node: Box,
  fiber: Spline,
  zone: Hexagon,
  cabecera: Building2,
}

type PanelSeleccionProps = {
  seleccionado: SelectedFeature
  /** El nombre tal como se está escribiendo. */
  nombre: string
  onCambiarNombre: (valor: string) => void
  /** Si es de la capa activa: solo entonces se renombra o se quita. */
  editable: boolean
  /** Última conectividad consultada de la cubierta con «Conectividad fina», si la hay. */
  conectividad: EstadoConectividad | undefined
  /** `false` si la cubierta se dibujó en el mapa y no existe en la base. */
  enBase: boolean
  onCerrar: () => void
  onGestionarEsquema: () => void
  onVerConexiones: () => void
  onCentrar: () => void
  onInformacion: () => void
  onQuitar: () => void
}

/**
 * Panel del elemento seleccionado. Arriba qué es y sus datos clave; en el
 * medio sus acciones, las propias del tipo primero; abajo, apartado, quitarlo
 * del mapa. Antes eran seis botones iguales uno bajo otro y nada decía cuál
 * era el importante.
 */
export function PanelSeleccion({
  seleccionado,
  nombre,
  onCambiarNombre,
  editable,
  conectividad,
  enBase,
  onCerrar,
  onGestionarEsquema,
  onVerConexiones,
  onCentrar,
  onInformacion,
  onQuitar,
}: PanelSeleccionProps) {
  const { feature, type } = seleccionado

  /**
   * Estado de «Ver conexiones» para la mufa elegida:
   *
   * - `sin-consultar`: todavía no se consultó con «Conectividad fina».
   * - `disponible`: consultada y con cables; el esquemático la puede dibujar.
   * - `sin-conectividad`: consultada, pero la base respondió sin cables.
   * - `no-dibujable`: consultada y con cables, pero el esquemático la rechaza.
   * - `no-en-base`: mufa dibujada a mano, sin UUID que consultar.
   * - `error`: la consulta falló (red, permisos).
   */
  const estadoConexiones =
    type !== "node" ? null : !enBase ? "no-en-base" : (conectividad?.estado ?? "sin-consultar")
  // «Gestionar esquema» sigue la misma regla que «Ver conexiones»: solo con
  // conectividad. Sin cables, la función devuelve igual los divisores de la
  // cubierta (su equipo físico) con cables y conectividades vacíos, y eso se
  // leía como si la mufa ya tuviera un esquema cuando no lo tiene.
  const hayEsquema = conectividad?.estado === "disponible"

  /** Por qué «Ver conexiones» está en gris, para escribirlo debajo del botón. */
  const motivoSinConexiones = ((): string | null => {
    if (estadoConexiones === "sin-consultar") {
      return "Sin conectividad consultada. Usa el botón «Conectividad fina» (menú Consultas)."
    }
    if (estadoConexiones === "no-en-base") return "Esta cubierta se dibujó en el mapa y no existe en la base."
    switch (conectividad?.estado) {
      case "sin-conectividad":
        return "La base todavía no tiene cables registrados para esta cubierta."
      case "no-dibujable":
        return `Tiene conectividad, pero el esquema no se puede dibujar: ${conectividad.motivo}.`
      case "error":
        return `${conectividad.mensaje} Vuelve a consultarla con «Conectividad fina».`
      default:
        return null
    }
  })()

  // Lo que se ve de un vistazo, según el tipo de elemento.
  const datos: { etiqueta: string; valor: string; color?: string }[] = []
  if (type === "node") {
    const nivel = feature.get("funcion_cub") as string | undefined
    if (nivel) datos.push({ etiqueta: "Nivel", valor: nivel, color: colorForFuncionCub(nivel) })
  }
  if (type === "fiber") {
    const largoKm = getLength(feature.getGeometry() as LineString) / 1000
    datos.push({ etiqueta: "Longitud", valor: `${largoKm.toFixed(2)} km` })
    const hilos = feature.get("cant_hilo")
    if (typeof hilos === "number" && hilos > 0) datos.push({ etiqueta: "Hilos", valor: String(hilos) })
  }

  // Coordenadas de una cubierta o una cabecera: quien va a campo las copia al
  // GPS o abre la ruta en el celular. Un cable o una zona no tienen un punto.
  const geometria = feature.getGeometry()
  const coordenada =
    geometria instanceof Point
      ? (([lon, lat]) => ({ lat, lon }))(toLonLat(geometria.getCoordinates()))
      : null
  const [copiado, setCopiado] = useState<boolean | null>(null)

  async function copiarCoordenada() {
    if (!coordenada) return
    const ok = await copiarTexto(textoDeCoordenada(coordenada))
    setCopiado(ok)
    setTimeout(() => setCopiado(null), 1500)
  }

  const Icon = TYPE_ICONS[type]
  const color = LAYER_COLORS[type]

  // En pantallas angostas el panel va abajo y a todo el ancho, como una hoja:
  // arriba a la derecha tapaba la barra de herramientas del mapa.
  return (
    <div className="absolute right-3 top-20 z-20 w-72 overflow-hidden rounded-xl bg-card/95 shadow-xl ring-1 ring-border backdrop-blur animate-gismart-fade-in max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:max-h-[60%] max-sm:w-auto max-sm:overflow-y-auto">
      <div className="border-b border-border px-3.5 pb-3 pt-3">
        <div className="flex items-center justify-between">
          <span
            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color, backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)` }}
          >
            <Icon className="size-3" aria-hidden="true" />
            {TYPE_LABELS[type]}
          </span>
          <button
            type="button"
            onClick={onCerrar}
            className="-mr-1 rounded-md p-1 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Cerrar panel"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* El nombre es el título del panel, y se puede editar ahí mismo. */}
        <label htmlFor="feature-nombre" className="sr-only">
          Nombre
        </label>
        <div className="group relative mt-2">
          <input
            id="feature-nombre"
            type="text"
            value={nombre}
            onChange={(e) => onCambiarNombre(e.target.value)}
            readOnly={!editable}
            className={
              editable
                ? "w-full rounded-md border border-transparent bg-transparent py-1 pl-1.5 pr-7 text-base font-bold tracking-tight text-foreground outline-none transition hover:border-border focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/25"
                : "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-base font-bold tracking-tight text-foreground outline-none"
            }
          />
          {editable && (
            <Pencil
              className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground opacity-60 transition group-hover:opacity-100"
              aria-hidden="true"
            />
          )}
        </div>

        {datos.length > 0 && (
          <dl className="mt-1.5 flex flex-wrap gap-1.5 px-1.5">
            {datos.map((d) => (
              <div key={d.etiqueta} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px]">
                {d.color && <span className="size-2 rounded-full" style={{ backgroundColor: d.color }} aria-hidden="true" />}
                <dt className="text-muted-foreground">{d.etiqueta}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{d.valor}</dd>
              </div>
            ))}
          </dl>
        )}

        {coordenada && (
          <div className="mt-2 flex items-center gap-1 px-1.5 text-[11px]">
            <MapPin className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate tabular-nums text-muted-foreground" title="Latitud, longitud">
              {textoDeCoordenada(coordenada)}
            </span>
            <button
              type="button"
              onClick={() => void copiarCoordenada()}
              aria-label="Copiar las coordenadas"
              title={copiado === null ? "Copiar las coordenadas" : copiado ? "Copiadas" : "No se pudieron copiar"}
              className={`flex size-6 shrink-0 items-center justify-center rounded-md outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 ${
                copiado === null
                  ? "text-muted-foreground hover:text-foreground"
                  : copiado
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
              }`}
            >
              {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
            {/* Abre la ruta en Google Maps (en el celular, en su aplicación). */}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${coordenada.lat.toFixed(6)},${coordenada.lon.toFixed(6)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Cómo llegar (abre Google Maps)"
              title="Cómo llegar (abre Google Maps)"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Navigation className="size-3.5" aria-hidden="true" />
            </a>
            <span role="status" className="sr-only">
              {copiado === null ? "" : copiado ? "Coordenadas copiadas" : "No se pudieron copiar las coordenadas"}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        {type === "node" && (
          <>
            {/* Los dos botones solo se activan después de consultar la mufa
                con «Conectividad fina»: elegirla no pregunta a la base. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onGestionarEsquema}
                disabled={!hayEsquema}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-2 text-xs font-semibold text-primary-foreground shadow-sm outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
              >
                <Waypoints className="size-3.5 shrink-0" />
                Gestionar esquema
              </button>
              {/* En gris hasta consultar, y también cuando la consulta no
                  trajo cables: así no se abre un diagrama que va a fallar. */}
              <button
                type="button"
                onClick={onVerConexiones}
                disabled={estadoConexiones !== "disponible"}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-2 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted"
              >
                <Network className="size-3.5 shrink-0" />
                {estadoConexiones === "sin-conectividad" ? "Sin conectividad" : "Ver conexiones"}
              </button>
            </div>

            {/* Por qué están en gris. Un botón deshabilitado no muestra
                etiqueta emergente, así que la razón va escrita debajo. */}
            {motivoSinConexiones !== null && (
              <p
                role="status"
                className={`flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-snug ${
                  estadoConexiones === "error" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                }`}
              >
                <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
                <span>{motivoSinConexiones}</span>
              </p>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          {/* Tras filtrar o buscar, lo seleccionado puede quedar fuera de la
              vista: esto lo trae al centro sin tener que buscarlo. */}
          <button
            type="button"
            onClick={onCentrar}
            className={`flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-2 text-xs font-medium text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 ${
              type === "zone" ? "col-span-2" : ""
            }`}
          >
            <Crosshair className="size-3.5 shrink-0" />
            Centrar
          </button>
          {(type === "node" || type === "fiber" || type === "cabecera") && (
            <button
              type="button"
              onClick={onInformacion}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-2 text-xs font-medium text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Info className="size-3.5 shrink-0" />
              Información
            </button>
          )}
        </div>
      </div>

      {/* Aparte y discreto: es la única acción que cambia el mapa. Solo quita
          el elemento del mapa; la base de datos no se toca. */}
      {editable ? (
        <div className="border-t border-border px-2 py-1.5">
          <button
            type="button"
            onClick={onQuitar}
            title="Se quita solo del mapa; no se borra de la base de datos."
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-destructive outline-none transition hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Trash2 className="size-3.5" />
            Quitar del mapa
          </button>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 border-t border-border px-3.5 py-2 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
          <span>
            Solo consulta. Para moverlo, renombrarlo o quitarlo, activa la capa «{NOMBRE_DE_CAPA[CAPA_DE_TIPO[type]]}».
          </span>
        </p>
      )}
    </div>
  )
}
