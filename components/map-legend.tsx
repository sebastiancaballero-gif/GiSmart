"use client"

import { useState } from "react"
import { ChevronDown, Eye, EyeOff } from "lucide-react"

import {
  CABLE_CONSULTADO_COLOR,
  EXTREMO_COLORS,
  FUNCION_CUB_COLORS,
  FUNCION_CUB_DEFAULT_COLOR,
  RESALTE,
  SENTIDO_COLORS,
  TIPO_RED_NOMBRES,
  TRACE_COLOR,
  TRACE_PUNTO_COLOR,
  colorForTipoRed,
} from "@/lib/map/symbology"
import { CabeceraSymbol, FiberSymbol, MufaSymbol } from "@/components/map-symbols"

/**
 * Leyenda plegable del mapa, abajo a la derecha.
 *
 * Usa los mismos símbolos que se dibujan sobre el mapa (los de `map-symbols`,
 * simbología SIGETP), no unos parecidos: si se dibujaran aparte, leyenda y mapa
 * podrían dejar de coincidir sin que nadie lo note.
 *
 * Se pliega porque en pantallas chicas tapaba una esquina útil del mapa. Como
 * abierto o cerrado no le importa a nadie más, ese estado se queda aquí.
 *
 * `sentido` y `extremos` agregan los colores de «Entradas y salidas» y de
 * «Cable» mientras esas herramientas están activas: son los únicos momentos en
 * que aparecen en el mapa. `trace`, lo mismo con el recorrido del trace mientras
 * está pintado, y `resalte`, con el elemento ubicado desde su tabla.
 *
 * Los tipos de cable son botones: un click oculta (o vuelve a mostrar) en el
 * mapa los cables de ese tipo (`tiposOcultos`, `onAlternarTipo`).
 */
export function MapLegend({
  sentido = false,
  extremos = false,
  trace = false,
  resalte = false,
  tiposOcultos = [],
  onAlternarTipo,
  nivelesOcultos = [],
  onAlternarNivel,
}: {
  sentido?: boolean
  extremos?: boolean
  trace?: boolean
  resalte?: boolean
  /** Tipos de red ocultos en el mapa («DISTRIBUTION»…). */
  tiposOcultos?: string[]
  onAlternarTipo?: (tipo: string) => void
  /** Niveles de cubierta ocultos en el mapa («Segundo nivel»…). */
  nivelesOcultos?: string[]
  onAlternarNivel?: (nivel: string) => void
}) {
  // En el celular empieza plegada: abierta ocupaba media pantalla y tapaba la
  // escala y la barra de estado. El mapa solo se dibuja en el navegador (el
  // tablero espera a confirmar la sesión), así que aquí ya hay `window`.
  const [abierta, setAbierta] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 639px)").matches,
  )

  // `gismart-leyenda`: se aparta mientras el panel del elemento la tapa (ver
  // globals.css). En el celular va encima de la barra de estado, que ahí ocupa
  // casi todo el ancho y quedaba debajo de la leyenda. Con el mapa bajo (la
  // tabla de atributos abierta debajo) no sube más allá del zoom: se desplaza.
  return (
    <div data-tapa-mapa className="gismart-leyenda absolute bottom-3 right-3 z-10 flex max-h-[calc(100%-7.5rem)] flex-col overflow-hidden rounded-lg bg-card/90 text-xs font-medium text-foreground shadow-md ring-1 ring-border backdrop-blur max-sm:bottom-14">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ChevronDown className={`size-3 transition-transform ${abierta ? "" : "-rotate-90"}`} />
        Leyenda
      </button>

      {abierta && (
        <div className="gismart-desplegar flex min-h-0 flex-col gap-1 overflow-y-auto border-t border-border px-2.5 pb-2 pt-1.5">
          <span className="flex items-center gap-2">
            <CabeceraSymbol size={14} />
            Cabecera central
          </span>

          {/* Los niveles de cubierta y los tipos de cable: con un click se ocultan
              o se muestran en el mapa (si quien usa la leyenda lo permite). */}
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cubiertas de empalme
          </span>
          {[...Object.entries(FUNCION_CUB_COLORS), ["Otro / sin dato", FUNCION_CUB_DEFAULT_COLOR] as const].map(([nivel, color]) => (
            <FilaQueFiltra
              key={nivel}
              simbolo={<MufaSymbol color={color} />}
              nombre={nivel}
              oculto={nivelesOcultos.includes(nivel)}
              queSeOculta={`las cubiertas de ${nivel === "Otro / sin dato" ? "nivel sin dato" : nivel.toLowerCase()}`}
              onAlternar={onAlternarNivel ? () => onAlternarNivel(nivel) : undefined}
            />
          ))}

          {/* Un renglón por tipo de red, con el color del mapa (ver fiberStyle). */}
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Fibra óptica
          </span>
          {Object.entries(TIPO_RED_NOMBRES).map(([tipo, nombre]) => (
            <FilaQueFiltra
              key={tipo}
              simbolo={<FiberSymbol color={colorForTipoRed(tipo)} size={14} />}
              nombre={nombre}
              oculto={tiposOcultos.includes(tipo)}
              queSeOculta={`los cables de ${nombre.toLowerCase()}`}
              onAlternar={onAlternarTipo ? () => onAlternarTipo(tipo) : undefined}
            />
          ))}
          <span className="text-[10px] leading-tight text-muted-foreground">
            El grosor refleja la cantidad de hilos
            <br />
            De cerca, las flechas: sentido de la señal
          </span>

          {sentido && (
            <>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cables de la cubierta
              </span>
              <span className="flex items-center gap-2">
                <FiberSymbol color={SENTIDO_COLORS.entrada} width={4} size={14} />
                Entrada
              </span>
              <span className="flex items-center gap-2">
                <FiberSymbol color={SENTIDO_COLORS.salida} width={4} size={14} />
                Salida
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                Según la función de cables de la base
              </span>
            </>
          )}

          {extremos && (
            <>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cable consultado
              </span>
              <span className="flex items-center gap-2">
                <FiberSymbol color={CABLE_CONSULTADO_COLOR} width={4} size={14} />
                Cable
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="size-3.5 shrink-0 rounded-full border-[3px]"
                  style={{ borderColor: EXTREMO_COLORS.entrada }}
                  aria-hidden="true"
                />
                Entrada (cubierta padre)
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="size-3.5 shrink-0 rounded-full border-[3px]"
                  style={{ borderColor: EXTREMO_COLORS.salida }}
                  aria-hidden="true"
                />
                Salida (cubierta hija)
              </span>
            </>
          )}

          {/* Los mismos colores del estilo del trace (ver traceStyle). */}
          {trace && (
            <>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recorrido del trace
              </span>
              <span className="flex items-center gap-2">
                <FiberSymbol color={TRACE_COLOR} width={4} size={14} />
                <span>
                  Recorrido
                  <span className="block text-[10px] font-normal leading-tight text-muted-foreground">La raya corre en su sentido</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="size-3.5 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(15_23_42/0.25)]"
                  style={{ backgroundColor: TRACE_PUNTO_COLOR }}
                  aria-hidden="true"
                />
                Cubierta del recorrido
              </span>
              {resalte && (
                <span className="flex items-center gap-2">
                  <FiberSymbol color={RESALTE.color} borde={RESALTE.borde} width={3.5} size={14} />
                  Ubicado desde la tabla
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Un renglón de la leyenda que oculta o muestra en el mapa lo que representa.
 * Oculto, se ve atenuado y tachado, con el ojo cerrado; al pasar el mouse
 * aparece el ojo, que es lo que dice que se puede pulsar. Sin `onAlternar` es
 * un renglón común.
 */
function FilaQueFiltra({
  simbolo,
  nombre,
  oculto,
  queSeOculta,
  onAlternar,
}: {
  simbolo: React.ReactNode
  nombre: string
  oculto: boolean
  /** «los cables de distribución», para el globo de ayuda. */
  queSeOculta: string
  onAlternar?: () => void
}) {
  if (!onAlternar) {
    return (
      <span className="flex items-center gap-2">
        {simbolo}
        {nombre}
      </span>
    )
  }
  const Ojo = oculto ? EyeOff : Eye
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={!oculto}
      title={oculto ? `Mostrar ${queSeOculta}` : `Ocultar ${queSeOculta}`}
      className="group -mx-1 flex items-center gap-2 rounded-md px-1 py-px text-left outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className={`flex items-center gap-2 transition ${oculto ? "opacity-40" : ""}`}>
        {simbolo}
        <span className={oculto ? "line-through" : ""}>{nombre}</span>
      </span>
      <Ojo
        className={`ml-auto size-3 shrink-0 text-muted-foreground transition ${oculto ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
        aria-hidden="true"
      />
    </button>
  )
}
