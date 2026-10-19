"use client"

import { Layers, Moon, RotateCcw, X } from "lucide-react"
import {
  APARIENCIA_INICIAL,
  CAPAS_CON_OPACIDAD,
  ESTILOS_DE_FONDO,
  OPACIDAD_MINIMA,
  opacidadValida,
  teselaDeMuestra,
  type Apariencia,
} from "./apariencia"

/**
 * Avanzado › Mapa base: cómo se ve el fondo (según el tema, calles, gris,
 * oscuro o sin fondo) y la transparencia de cada capa. Los cambios se ven al
 * instante en el mapa y quedan guardados para el usuario (apariencia.ts).
 *
 * Va a la izquierda, junto a las herramientas, en el mismo lugar que Resumen
 * y Cercanía (uno a la vez).
 */
export function PanelApariencia({
  apariencia,
  onCambiar,
  onCerrar,
  espacioAbajo = 0,
}: {
  apariencia: Apariencia
  onCambiar: (apariencia: Apariencia) => void
  onCerrar: () => void
  espacioAbajo?: number
}) {
  const tesela = teselaDeMuestra()
  const elegido = ESTILOS_DE_FONDO.find((e) => e.id === apariencia.fondo) ?? ESTILOS_DE_FONDO[0]
  const cambiado =
    apariencia.fondo !== APARIENCIA_INICIAL.fondo ||
    CAPAS_CON_OPACIDAD.some(({ id }) => apariencia.opacidades[id] !== APARIENCIA_INICIAL.opacidades[id])

  return (
    <aside
      data-tapa-mapa
      aria-label="Mapa base y transparencia"
      // El mismo alto que Resumen: no tapa la escala ni la barra de estado; si no cabe, se desplaza.
      style={{ maxHeight: `calc(100% - 13.5rem - ${espacioAbajo}px)` }}
      className="absolute left-[4.5rem] top-[6.5rem] z-20 flex w-72 flex-col overflow-hidden rounded-xl bg-card/95 shadow-xl ring-1 ring-border backdrop-blur gismart-desde-izquierda"
    >
      <div className="flex items-start gap-2 border-b border-border px-3.5 py-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Layers className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Mapa base</h2>
          <p className="text-[11px] text-muted-foreground">Se guarda para tu usuario en este equipo</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar mapa base"
          className="-mr-1 rounded-md p-1 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <section aria-label="Estilo del mapa base" className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Estilo del mapa base">
            {ESTILOS_DE_FONDO.map((e) => {
              const activo = e.id === apariencia.fondo
              return (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => onCambiar({ ...apariencia, fondo: e.id })}
                  title={e.descripcion}
                  className={`group flex flex-col gap-1 rounded-lg p-1 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    activo ? "bg-primary/10 ring-2 ring-primary" : "ring-1 ring-border hover:ring-primary/40"
                  }`}
                >
                  <span className="relative block h-11 overflow-hidden rounded-md bg-muted">
                    {e.id === "ninguno" ? (
                      <span className="absolute inset-0 rounded-md border border-dashed border-border bg-background" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- una tesela del mapa como muestra, no una imagen de la app
                      <img src={tesela} alt="" className="size-full object-cover" style={{ filter: e.muestra }} loading="lazy" />
                    )}
                    {e.id === "tema" && (
                      <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm">
                        <Moon className="size-2.5" aria-hidden="true" />
                      </span>
                    )}
                    {/* Una línea de fibra de ejemplo, para ver cómo resalta la red sobre cada fondo. */}
                    <span className="absolute left-1 right-1 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#2563eb]" aria-hidden="true" />
                  </span>
                  <span className={`truncate px-0.5 text-[10.5px] font-medium ${activo ? "text-primary" : "text-foreground"}`}>{e.nombre}</span>
                </button>
              )
            })}
          </div>
          <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">{elegido.descripcion}.</p>
        </section>

        <section aria-label="Transparencia de las capas" className="space-y-2.5">
          <h3 className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transparencia</h3>
          {CAPAS_CON_OPACIDAD.map(({ id, nombre }) => {
            const transparencia = Math.round((1 - apariencia.opacidades[id]) * 100)
            return (
              <label key={id} className="block space-y-1 px-0.5">
                <span className="flex items-center justify-between text-xs text-foreground">
                  {nombre}
                  <span className="tabular-nums text-muted-foreground">{transparencia} %</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.round((1 - OPACIDAD_MINIMA) * 100)}
                  step={5}
                  value={transparencia}
                  onChange={(ev) =>
                    onCambiar({
                      ...apariencia,
                      opacidades: { ...apariencia.opacidades, [id]: opacidadValida(1 - Number(ev.target.value) / 100) },
                    })
                  }
                  aria-label={`Transparencia de ${nombre}`}
                  className="w-full accent-primary"
                />
              </label>
            )
          })}
        </section>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="text-[10.5px] text-muted-foreground">Imprimir usa el fondo de calles.</span>
        <button
          type="button"
          onClick={() => onCambiar({ ...APARIENCIA_INICIAL, minimapa: apariencia.minimapa })}
          disabled={!cambiado}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          Restablecer
        </button>
      </div>
    </aside>
  )
}
