"use client"

import type { CSSProperties } from "react"
import { Cable, ChevronDown, FileSpreadsheet, MapPin, Plug, Server, Split, TriangleAlert } from "lucide-react"
import { BolitaDeHilo } from "@/components/bolita-de-hilo"
import { CabeceraSymbol, FiberSymbol, MufaSymbol } from "@/components/map-symbols"
import { Boton, Rotulo } from "@/components/ventana-sig"
import { colorParaMostrar } from "@/lib/map/hilos-cable"
import { LAYER_COLORS } from "@/lib/network-colors"
import { FUNCION_CUB_COLORS, FUNCION_CUB_DEFAULT_COLOR, RESALTE } from "@/lib/map/symbology"
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
 *   color (Número) y su buffer con el color del buffer (Elemento ubica);
 * - las cubiertas, el color de su nivel, como en el mapa y la leyenda;
 * - el pin de una fila lleva el mapa a su cubierta o su cable y lo deja
 *   resaltado en ámbar; la fila queda marcada con el mismo ámbar;
 * - los identificadores de elemento y de contenedor son los UUID, en gris para que se lea
 *   primero lo demás (se seleccionan enteros con un click para copiarlos); lo
 *   que se lee va a la vista: el puerto (E1) junto a su tipo, y el cable
 *   (2102262), la cubierta (CO19) o el equipo junto a su contenedor, con el
 *   mismo símbolo del mapa y la leyenda;
 * - la primera columna queda fija al desplazar la tabla de lado (en el celular);
 * - si el recorrido se abre en dos, se elige la ruta; los avisos dicen lo que
 *   no cuadra en los datos, para corregirlo en la base;
 * - se pliega para ver más mapa (queda el resumen y el Excel).
 */

export const metros = (m: number) => m.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SENTIDO: Record<DireccionTrace, string> = { UPSTREAM: "hacia arriba", DOWNSTREAM: "hacia abajo" }

const CELDA = "whitespace-nowrap border-b border-border px-2 py-1"

/**
 * El fondo de una fila, opaco: la primera columna queda fija al desplazar la
 * tabla de lado y no debe dejar ver lo que pasa por debajo.
 */
function fondoDeFila(indice: number, marcada: boolean) {
  // En sRGB: en oklch, mezclar el ámbar con el fondo oscuro giraba el tono hacia el verde.
  if (marcada) return `color-mix(in srgb, ${RESALTE.color} 25%, var(--card))`
  return indice % 2 === 1 ? "color-mix(in oklch, var(--foreground) 3.5%, var(--card))" : "var(--card)"
}

/** Un UUID entero, en monoespaciada y gris (se lee primero lo demás); un click lo selecciona todo para copiarlo. */
function Uuid({ valor, nombre }: { valor: string | null; nombre?: string | null }) {
  if (!valor) return <span className="text-muted-foreground/50">—</span>
  return (
    <span
      title={nombre ? `${nombre} · ${valor}` : valor}
      className="select-all font-mono text-[10px] tracking-tight text-muted-foreground transition-colors group-hover:text-foreground"
    >
      {valor}
    </span>
  )
}

/** El ícono de cada tipo de fila: el de «Hilos» del ribbon, un conector, la cabecera como en el mapa. */
function IconoDeTipo({ tipo }: { tipo: ElementoDelRecorrido["tipo"] }) {
  if (tipo === "Central") return <CabeceraSymbol size={13} />
  const Icono = tipo === "Hilo" ? Cable : Plug
  return <Icono className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
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

/** El número de dónde está un puerto (divisor, bandeja, tarjeta), en una pastilla neutra junto a las bolitas de los hilos. */
function PastillaDeUbica({ valor }: { valor: string }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[10px] font-bold tabular-nums text-foreground ring-1 ring-border">
      {valor}
    </span>
  )
}

/** El contenedor con su símbolo del mapa y lo que se lee de él: «Cable 2102262», «Cub nivel 1 CO19», «ODF 1». */
function Contenedor({ fila }: { fila: ElementoDelRecorrido }) {
  if (!fila.contenedor) return null
  const simbolo =
    fila.idCubierta !== undefined ? (
      <MufaSymbol size={13} color={(fila.funcionCubierta && FUNCION_CUB_COLORS[fila.funcionCubierta]) || FUNCION_CUB_DEFAULT_COLOR} />
    ) : fila.contenedor === "Cable" ? (
      <FiberSymbol size={13} color={LAYER_COLORS.fiber} width={3} />
    ) : (
      <Server className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    )
  return (
    <span className="flex items-center gap-1.5">
      {simbolo}
      <span className="text-muted-foreground">{fila.contenedor}</span>
      {fila.nombreContenedor && <span className="font-semibold text-foreground">{fila.nombreContenedor}</span>}
    </span>
  )
}

function Fila({
  fila,
  indice,
  marcada,
  onUbicar,
}: {
  fila: ElementoDelRecorrido
  indice: number
  /** La fila del elemento resaltado en el mapa: lleva su mismo ámbar. */
  marcada: boolean
  onUbicar: () => void
}) {
  const esHilo = fila.tipo === "Hilo"
  const ubicable = Boolean(fila.idCubierta || fila.idCable)
  const verEnElMapa = fila.idCubierta ? `Ver ${fila.nombreContenedor ?? "la cubierta"} en el mapa` : `Ver el cable ${fila.nombreContenedor ?? ""} en el mapa`
  return (
    <tr
      aria-current={marcada || undefined}
      style={{ "--fondo": fondoDeFila(indice, marcada) } as CSSProperties}
      className={`group bg-[var(--fondo)] transition-colors ${marcada ? "" : "hover:bg-[color-mix(in_oklch,var(--accent)_70%,var(--card))]"}`}
    >
      <td
        className={`${CELDA} sticky left-0 z-[1] border-r bg-inherit`}
        style={marcada ? { boxShadow: `inset 3px 0 0 ${RESALTE.fuerte}` } : undefined}
      >
        <span className="flex items-center gap-1.5" title={fila.tipo === "Central" && fila.nombre ? `Central ${fila.nombre}` : undefined}>
          <IconoDeTipo tipo={fila.tipo} />
          <span className="font-semibold text-foreground">{fila.tipo}</span>
          {/* El puerto por su nombre (el número del hilo va en Número; el nombre de la central, al pasar el mouse). */}
          {fila.tipo === "Puerto" && fila.nombre && <span className="text-muted-foreground">{fila.nombre}</span>}
        </span>
      </td>
      <td className={CELDA}>
        <Uuid valor={fila.codigo} nombre={esHilo ? `Hilo ${fila.nombre ?? "?"}` : fila.nombre} />
      </td>
      <td className={CELDA}>
        {/* El número del hilo, en la bolita de su color, como en Gestión de hilos. */}
        {esHilo && fila.codigoUbica ? (
          <BolitaDeHilo
            chica
            numero={fila.codigoUbica}
            color={fila.colorHilo ?? null}
            titulo={`Hilo ${fila.codigoUbica}${fila.colorHilo ? ` · ${fila.colorHilo}` : ""}`}
          />
        ) : fila.codigoUbica ? (
          <PastillaDeUbica valor={fila.codigoUbica} />
        ) : null}
      </td>
      <td className={`${CELDA} text-muted-foreground`}>{esHilo && fila.ubica ? <BufferDelHilo fila={fila} /> : (fila.ubica ?? "")}</td>
      <td className={`${CELDA} text-right font-medium tabular-nums text-foreground`}>{fila.longitudM !== null ? metros(fila.longitudM) : ""}</td>
      <td className={CELDA}>
        <Contenedor fila={fila} />
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
              title={marcada ? `${verEnElMapa} (resaltado en ámbar)` : verEnElMapa}
              style={marcada ? { backgroundColor: RESALTE.fuerte, color: RESALTE.sobreFuerte } : undefined}
              className={`flex size-5 shrink-0 items-center justify-center rounded outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                marcada ? "" : "text-primary hover:bg-primary/10"
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
  const central = actual?.filas.find((f) => f.tipo === "Central")?.nombre ?? null
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
        {/* Hacia abajo, la central de donde sale (hacia arriba ya va en «Llega a la OLT · …»). */}
        {actual && !haciaArriba && central && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">Sale de {central}</span>
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
          // Con muchos avisos la tabla quedaba fuera de la vista: se desplazan por dentro.
          className="flex max-h-24 gap-2 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/8 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:text-amber-200"
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
                {COLUMNAS_TRACE.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className={`sticky top-0 whitespace-nowrap border-b border-border bg-muted px-2 py-1.5 text-[10.5px] font-semibold text-muted-foreground ${
                      i === 0 ? "left-0 z-20 border-r" : "z-10"
                    } ${c.startsWith("Longitud") ? "text-right" : "text-left"}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="gismart-filas">
              {actual.filas.map((f, i) => (
                <Fila key={`${ruta}-${i}`} fila={f} indice={i} marcada={ubicada === i} onUbicar={() => onUbicar(f, i)} />
              ))}
            </tbody>
            <tfoot>
              {/* «Suma» va en la primera columna, fija como ella: al desplazar de
                  lado no se pierde. La fila queda por encima de las celdas fijas
                  del cuerpo, que antes asomaban sobre ella («Hilo» bajo «Suma»). */}
              <tr className="[&>*]:sticky [&>*]:bottom-0 [&>*]:whitespace-nowrap [&>*]:bg-muted [&>*]:px-2 [&>*]:py-1.5 [&>*]:shadow-[inset_0_1px_0_var(--border)]">
                <th scope="row" className="left-0 z-[3] border-r text-left text-[10.5px] font-semibold text-muted-foreground">
                  Suma
                </th>
                <td colSpan={3} className="z-[2]" />
                <td className="z-[2] text-right text-xs font-bold tabular-nums text-foreground">{metros(actual.sumaM)} m</td>
                <td colSpan={2} className="z-[2]" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
