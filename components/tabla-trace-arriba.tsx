"use client"

import { Building2, ChevronDown, FileSpreadsheet, MapPin, Split, TriangleAlert } from "lucide-react"
import { Boton, Rotulo } from "@/components/ventana-sig"
import { colorParaMostrar } from "@/lib/map/hilos-cable"
import { FUNCION_CUB_COLORS, FUNCION_CUB_DEFAULT_COLOR } from "@/lib/map/symbology"
import { COLUMNAS_TRACE_ARRIBA } from "@/lib/map/trace-excel"
import type { ElementoDelRecorrido, TablaHaciaArriba } from "@/lib/map/trace"

/**
 * La tabla del trace hacia arriba, dentro de la ventana del recorrido: las
 * columnas que pidió el ingeniero, una fila por puerto e hilo, la central al
 * final y la suma de las longitudes. Solo esa información; lo demás es ayuda
 * para leerla:
 *
 * - los hilos y los buffers llevan su color, como en Gestión de hilos;
 * - las cubiertas, el color de su nivel, como en el mapa y la leyenda;
 * - el código de una cubierta o de un cable lleva el mapa hasta él;
 * - los códigos de elemento y contenedor son los UUID (se seleccionan enteros
 *   con un click para copiarlos); lo que se lee (hilo 56, cable 2103630, CO19)
 *   sale al pasar el mouse;
 * - si el recorrido se abre en dos, se elige la ruta; los avisos dicen lo que
 *   no cuadra en los datos, para corregirlo en la base;
 * - se pliega para ver más mapa (queda el resumen y el Excel).
 */

export const metros = (m: number) => m.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Una muestra de color redonda; el borde hace visible el blanco. */
function Muestra({ color, nombre }: { color: string | null; nombre?: string | null }) {
  if (!color) return null
  return (
    <span
      className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/25"
      style={{ backgroundColor: color }}
      title={nombre ?? undefined}
      aria-hidden="true"
    />
  )
}

const CELDA = "whitespace-nowrap border-b border-border px-2 py-1"

/** Un UUID entero, en monoespaciada; un click lo selecciona todo para copiarlo. */
function Uuid({ valor, nombre }: { valor: string | null; nombre?: string | null }) {
  if (!valor) return <span className="text-muted-foreground">—</span>
  return (
    <span title={nombre ? `${nombre} · ${valor}` : valor} className="select-all font-mono text-[10.5px] tracking-tight">
      {valor}
    </span>
  )
}

function Fila({
  fila,
  marcada,
  onUbicar,
}: {
  fila: ElementoDelRecorrido
  marcada: boolean
  onUbicar: () => void
}) {
  const esHilo = fila.tipo === "Hilo"
  const ubicable = Boolean(fila.idCubierta || fila.idCable)
  return (
    <tr
      aria-current={marcada || undefined}
      className={`transition-colors ${marcada ? "bg-primary/10" : "even:bg-foreground/[0.035] hover:bg-accent/60"}`}
    >
      <td className={`${CELDA} font-semibold text-foreground`}>
        {fila.tipo === "Central" ? (
          <span className="flex items-center gap-1">
            <Building2 className="size-3 text-emerald-600" aria-hidden="true" />
            Central
          </span>
        ) : (
          fila.tipo
        )}
      </td>
      <td className={CELDA}>
        <span className="flex items-center gap-1.5">
          {esHilo && (
            <Muestra
              color={colorParaMostrar(fila.colorHilo ?? null, Number(fila.nombre) || null)}
              nombre={`Hilo ${fila.nombre ?? ""}${fila.colorHilo ? ` (${fila.colorHilo})` : ""}`}
            />
          )}
          <Uuid valor={fila.codigo} nombre={fila.tipo === "Hilo" ? `Hilo ${fila.nombre ?? "?"}` : fila.nombre} />
        </span>
      </td>
      <td className={`${CELDA} text-muted-foreground`}>{fila.ubica ?? ""}</td>
      <td className={`${CELDA} tabular-nums`}>
        <span className="flex items-center gap-1.5">
          {esHilo && fila.codigoUbica && (
            <Muestra color={colorParaMostrar(fila.colorBuffer ?? null, Number(fila.codigoUbica) || null)} nombre={fila.colorBuffer} />
          )}
          {fila.codigoUbica ?? ""}
        </span>
      </td>
      <td className={`${CELDA} text-right tabular-nums`}>{fila.longitudM !== null ? metros(fila.longitudM) : ""}</td>
      <td className={`${CELDA} text-muted-foreground`}>
        <span className="flex items-center gap-1.5">
          {fila.idCubierta !== undefined && (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: (fila.funcionCubierta && FUNCION_CUB_COLORS[fila.funcionCubierta]) || FUNCION_CUB_DEFAULT_COLOR }}
              aria-hidden="true"
            />
          )}
          {fila.contenedor ?? ""}
        </span>
      </td>
      <td className={CELDA}>
        <span className="flex items-center gap-1">
          <Uuid
            valor={fila.codigoContenedor}
            nombre={fila.nombreContenedor ? `${fila.contenedor === "Cable" ? "Cable " : ""}${fila.nombreContenedor}` : null}
          />
          {ubicable && fila.codigoContenedor && (
            <button
              type="button"
              onClick={onUbicar}
              aria-label={fila.idCubierta ? `Ver ${fila.nombreContenedor ?? "la cubierta"} en el mapa` : `Ver el cable ${fila.nombreContenedor ?? ""} en el mapa`}
              title={fila.idCubierta ? `Ver ${fila.nombreContenedor ?? "la cubierta"} en el mapa` : `Ver el cable ${fila.nombreContenedor ?? ""} en el mapa`}
              className="flex size-5 shrink-0 items-center justify-center rounded text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <MapPin className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      </td>
    </tr>
  )
}

export function TablaTraceArriba({
  tabla,
  ruta,
  onRuta,
  onExportar,
  onUbicar,
  ubicada,
  abierta,
  onAlternar,
}: {
  tabla: TablaHaciaArriba
  /** La ruta que se muestra (índice en `tabla.rutas`). */
  ruta: number
  onRuta: (indice: number) => void
  onExportar: () => void
  /** Lleva el mapa a la cubierta o al cable de esa fila. */
  onUbicar: (fila: ElementoDelRecorrido, indice: number) => void
  /** La fila que se ubicó por última vez, para marcarla. */
  ubicada: number | null
  /** Plegada solo queda la línea de arriba: el resumen y el Excel. */
  abierta: boolean
  onAlternar: () => void
}) {
  const actual = tabla.rutas[ruta] ?? tabla.rutas[0]
  const varias = tabla.rutas.length > 1
  const elementos = actual ? actual.filas.filter((f) => f.tipo !== "Central").length : 0
  const central = actual?.filas.find((f) => f.tipo === "Central")?.nombre

  return (
    <section aria-label="Trace hacia arriba" className="flex flex-col gap-1.5">
      {/* En el celular baja de línea entera; cada texto no se parte. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 whitespace-nowrap">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          title={abierta ? "Plegar la tabla para ver más mapa" : "Ver la tabla"}
          className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none ${abierta ? "" : "-rotate-90"}`}
            aria-hidden="true"
          />
          <Rotulo>Trace hacia arriba</Rotulo>
        </button>
        {actual && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
            {elementos} {elementos === 1 ? "elemento" : "elementos"}
          </span>
        )}
        {actual && (
          <span
            className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
              actual.llegaALaOlt
                ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            }`}
          >
            {actual.llegaALaOlt ? `Llega a la OLT${central ? ` · ${central}` : ""}` : "No llega a la OLT"}
          </span>
        )}
        {/* Plegada, los avisos no se ven: al menos se sabe que hay. */}
        {!abierta && tabla.avisos.length > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-3" aria-hidden="true" />
            {tabla.avisos.length} {tabla.avisos.length === 1 ? "aviso" : "avisos"}
          </span>
        )}
        {actual && actual.filas.length > 0 && (
          <span className="ml-auto">
            <Boton icono={FileSpreadsheet} onClick={onExportar} colorIcono="text-emerald-600">
              Exportar a Excel
            </Boton>
          </span>
        )}
      </div>

      {/* Un hilo fusionado con dos: una ruta por camino, con su suma. */}
      {abierta && varias && (
        <div role="group" aria-label="Rutas del recorrido" className="flex flex-wrap gap-1">
          {tabla.rutas.map((r, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === ruta}
              onClick={() => onRuta(i)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold tabular-nums outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                i === ruta
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Ruta {i + 1} · {metros(r.sumaM)} m
            </button>
          ))}
        </div>
      )}

      {abierta && tabla.avisos.length > 0 && (
        <div
          role="note"
          className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:text-amber-200"
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
          {tabla.avisos.length === 1 ? (
            <p>{tabla.avisos[0]}</p>
          ) : (
            <ul className="flex list-disc flex-col gap-1 pl-3.5">
              {tabla.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {abierta && actual?.divisores.map((d) => (
        <p key={d} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Split className="size-3.5 shrink-0 rotate-90 text-primary" aria-hidden="true" />
          <span>
            Pasa por el <span className="font-semibold text-foreground">{d}</span>
          </span>
        </p>
      ))}

      {!abierta ? null : !actual || actual.filas.length === 0 ? (
        <p className="rounded-lg bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
          Los pasos de la caché no encadenan desde el origen: no hay filas que mostrar.
        </p>
      ) : (
        <div
          role="region"
          aria-label="Tabla del trace hacia arriba"
          tabIndex={0}
          className="max-h-[min(13rem,28vh)] overflow-auto rounded-xl border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-[11px]">
            <caption className="sr-only">
              Elementos del recorrido hacia arriba{varias ? `, ruta ${ruta + 1} de ${tabla.rutas.length}` : ""}, con la suma de las
              longitudes al final.
            </caption>
            <thead>
              <tr>
                {COLUMNAS_TRACE_ARRIBA.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className={`sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-1.5 font-semibold text-foreground ${
                      c.startsWith("Longitud") ? "text-right" : "text-left"
                    }`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actual.filas.map((f, i) => (
                <Fila key={`${ruta}-${i}`} fila={f} marcada={ubicada === i} onUbicar={() => onUbicar(f, i)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-foreground">
                <td colSpan={3} className="sticky bottom-0 bg-muted px-2 py-1.5" />
                <th scope="row" className="sticky bottom-0 bg-muted px-2 py-1.5 text-left">
                  Suma
                </th>
                <td className="sticky bottom-0 bg-muted px-2 py-1.5 text-right tabular-nums">{metros(actual.sumaM)}</td>
                <td colSpan={2} className="sticky bottom-0 bg-muted px-2 py-1.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
