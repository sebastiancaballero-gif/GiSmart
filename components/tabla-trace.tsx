"use client"

import { Building2, ChevronDown, FileSpreadsheet, MapPin, Split, TriangleAlert } from "lucide-react"
import { BolitaDeHilo } from "@/components/bolita-de-hilo"
import { Boton, Rotulo } from "@/components/ventana-sig"
import { colorParaMostrar } from "@/lib/map/hilos-cable"
import { FUNCION_CUB_COLORS, FUNCION_CUB_DEFAULT_COLOR, RESALTE_COLOR } from "@/lib/map/symbology"
import { COLUMNAS_TRACE } from "@/lib/map/trace-excel"
import type { DireccionTrace, ElementoDelRecorrido, TablaDelTrace } from "@/lib/map/trace"

/**
 * La tabla del trace, hacia arriba o hacia abajo, dentro de la ventana del
 * recorrido: las columnas que pidió el ingeniero, una fila por puerto e hilo,
 * la central (al final hacia arriba; al principio hacia abajo, si sale de
 * ella) y la suma de las longitudes. Solo esa información; lo demás es ayuda
 * para leerla:
 *
 * - un hilo se reconoce como en Gestión de hilos: su número en la bolita de su
 *   color (Código ubica) y su buffer con el color del buffer (Elemento ubica);
 * - las cubiertas, el color de su nivel, como en el mapa y la leyenda;
 * - el pin de una fila lleva el mapa a su cubierta o su cable y lo deja
 *   resaltado en fucsia; la fila queda marcada con el mismo fucsia;
 * - los códigos de elemento y contenedor son los UUID (se seleccionan enteros
 *   con un click para copiarlos); lo que se lee (hilo 56, cable 2103630, CO19)
 *   sale al pasar el mouse;
 * - si el recorrido se abre en dos, se elige la ruta; los avisos dicen lo que
 *   no cuadra en los datos, para corregirlo en la base;
 * - se pliega para ver más mapa (queda el resumen y el Excel).
 */

export const metros = (m: number) => m.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SENTIDO: Record<DireccionTrace, string> = { UPSTREAM: "hacia arriba", DOWNSTREAM: "hacia abajo" }

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

/** «Buffer 5» con la barrita del color del buffer, como en Gestión de hilos. */
function BufferDelHilo({ fila }: { fila: ElementoDelRecorrido }) {
  const numero = Number(fila.ubica?.match(/\d+$/)?.[0]) || null
  const color = colorParaMostrar(fila.colorBuffer ?? null, numero)
  return (
    <span className="flex items-center gap-1.5">
      {color && (
        <span
          className="h-3 w-1.5 shrink-0 rounded-sm ring-1 ring-foreground/20"
          style={{ backgroundColor: color }}
          title={fila.colorBuffer ?? undefined}
          aria-hidden="true"
        />
      )}
      {fila.ubica}
    </span>
  )
}

function Fila({
  fila,
  marcada,
  onUbicar,
}: {
  fila: ElementoDelRecorrido
  /** La fila del elemento resaltado en el mapa: lleva su mismo fucsia. */
  marcada: boolean
  onUbicar: () => void
}) {
  const esHilo = fila.tipo === "Hilo"
  const ubicable = Boolean(fila.idCubierta || fila.idCable)
  const verEnElMapa = fila.idCubierta ? `Ver ${fila.nombreContenedor ?? "la cubierta"} en el mapa` : `Ver el cable ${fila.nombreContenedor ?? ""} en el mapa`
  return (
    <tr
      aria-current={marcada || undefined}
      style={marcada ? { backgroundColor: `color-mix(in oklch, ${RESALTE_COLOR} 13%, transparent)` } : undefined}
      className={`transition-colors ${marcada ? "" : "even:bg-foreground/[0.035] hover:bg-accent/60"}`}
    >
      <td
        className={`${CELDA} font-semibold text-foreground`}
        style={marcada ? { boxShadow: `inset 3px 0 0 ${RESALTE_COLOR}` } : undefined}
      >
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
        <Uuid valor={fila.codigo} nombre={esHilo ? `Hilo ${fila.nombre ?? "?"}` : fila.nombre} />
      </td>
      <td className={`${CELDA} text-muted-foreground`}>{esHilo && fila.ubica ? <BufferDelHilo fila={fila} /> : (fila.ubica ?? "")}</td>
      <td className={`${CELDA} tabular-nums`}>
        {/* El número del hilo, en la bolita de su color, como en Gestión de hilos. */}
        {esHilo && fila.codigoUbica ? (
          <BolitaDeHilo
            chica
            numero={fila.codigoUbica}
            color={fila.colorHilo ?? null}
            titulo={`Hilo ${fila.codigoUbica}${fila.colorHilo ? ` · ${fila.colorHilo}` : ""}`}
          />
        ) : (
          (fila.codigoUbica ?? "")
        )}
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
              aria-label={verEnElMapa}
              title={marcada ? `${verEnElMapa} (resaltado en fucsia)` : verEnElMapa}
              style={marcada ? { backgroundColor: RESALTE_COLOR } : undefined}
              className={`flex size-5 shrink-0 items-center justify-center rounded outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                marcada ? "text-white" : "text-primary hover:bg-primary/10"
              }`}
            >
              <MapPin className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      </td>
    </tr>
  )
}

export function TablaTrace({
  direccion,
  tabla,
  ruta,
  onRuta,
  onExportar,
  onUbicar,
  ubicada,
  abierta,
  onAlternar,
}: {
  direccion: DireccionTrace
  tabla: TablaDelTrace
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
  const haciaArriba = direccion === "UPSTREAM"
  // Hacia arriba se llega a la OLT (y su central); hacia abajo la caché termina
  // en la entrada del divisor de la cubierta siguiente.
  const llegada = !actual
    ? null
    : actual.llega
      ? haciaArriba
        ? `Llega a la OLT${actual.final ? ` · ${actual.final}` : ""}`
        : `Llega al ${actual.final ?? "divisor"}`
      : haciaArriba
        ? "No llega a la OLT"
        : "No llega a un divisor"

  return (
    <section aria-label={`Trace ${SENTIDO[direccion]}`} className="flex flex-col gap-1.5">
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
          <Rotulo>Trace {SENTIDO[direccion]}</Rotulo>
        </button>
        {actual && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
            {elementos} {elementos === 1 ? "elemento" : "elementos"}
          </span>
        )}
        {actual && llegada && (
          <span
            className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
              actual.llega
                ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            }`}
          >
            {llegada}
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
          aria-label={`Tabla del trace ${SENTIDO[direccion]}`}
          tabIndex={0}
          className="max-h-[min(13rem,28vh)] overflow-auto rounded-xl border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-[11px]">
            <caption className="sr-only">
              Elementos del recorrido {SENTIDO[direccion]}
              {varias ? `, ruta ${ruta + 1} de ${tabla.rutas.length}` : ""}, con la suma de las longitudes al final.
            </caption>
            <thead>
              <tr>
                {COLUMNAS_TRACE.map((c) => (
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
