"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Eraser, FileSpreadsheet, Filter, Focus, MapPin, Search, Table2, X } from "lucide-react"
import type { ElementoDelMapa, MapaApi } from "@/components/network-map"
import { Tooltip } from "@/components/ui/tooltip"
import { crearXlsx, descargarArchivo } from "@/lib/excel"
import {
  NOMBRE_DE_CAPA_TABLA,
  columnasDe,
  compararCeldas,
  filaCoincide,
  nombresPorId,
  textoDeCelda,
  valorDeCelda,
  type CapaDeTabla,
} from "./columnas"
import { hojaDeLaTabla } from "./excel-tabla"

const CAPAS: CapaDeTabla[] = ["node", "fiber", "cabecera"]

/** Alto inicial y límites de la tabla, en píxeles. */
export const ALTO_TABLA = { inicial: 260, minimo: 150 }

/**
 * Tabla de atributos acoplada debajo del mapa (como en RustGIS o ArcGIS): el
 * mapa se achica y los dos se ven a la vez. Una fila elegida se resalta en el
 * mapa; con Ctrl se suman filas y con Mayús un tramo. Doble click (o el pin)
 * lleva el mapa al elemento y abre su ficha.
 */
export function TablaAtributos({
  mapa,
  capa,
  onCapa,
  seleccion,
  onSeleccion,
  consulta,
  onQuitarConsulta,
  onConsultar,
  onCerrar,
  alto,
  onAlto,
}: {
  mapa: { current: MapaApi | null }
  capa: CapaDeTabla
  onCapa: (capa: CapaDeTabla) => void
  /** Claves seleccionadas (las de la capa actual). */
  seleccion: Set<string>
  onSeleccion: (claves: Set<string>) => void
  /** La consulta que armó la selección, en palabras, si la hay. */
  consulta: string | null
  onQuitarConsulta: () => void
  onConsultar: () => void
  onCerrar: () => void
  alto: number
  onAlto: (alto: number) => void
}) {
  const [elementos, setElementos] = useState<ElementoDelMapa[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [soloEnVista, setSoloEnVista] = useState(false)
  const [soloSeleccionadas, setSoloSeleccionadas] = useState(false)
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(null)
  const anclaRef = useRef<string | null>(null)
  const raizRef = useRef<HTMLElement>(null)

  // Los datos del mapa, y otra vez cada vez que cambia lo que se ve (para
  // «Solo lo que se ve») o se recargan las capas.
  useEffect(() => {
    const api = mapa.current
    if (!api) return
    let pendiente: ReturnType<typeof setTimeout> | null = null
    const cargar = () => setElementos(api.elementosDelMapa({ conPropiedades: true }).elementos)
    cargar()
    const dejar = api.alCambiarLaVista(() => {
      if (pendiente) clearTimeout(pendiente)
      pendiente = setTimeout(cargar, 250)
    })
    return () => {
      dejar()
      if (pendiente) clearTimeout(pendiente)
    }
  }, [mapa])

  const nombres = useMemo(() => nombresPorId(elementos), [elementos])
  const columnas = useMemo(() => columnasDe(capa, elementos, nombres), [capa, elementos, nombres])
  const cuantasPorCapa = useMemo(() => {
    const cuenta: Record<CapaDeTabla, number> = { node: 0, fiber: 0, cabecera: 0 }
    for (const e of elementos) if (e.tipo in cuenta) cuenta[e.tipo as CapaDeTabla]++
    return cuenta
  }, [elementos])

  const filas = useMemo(() => {
    const lista = elementos.filter(
      (e) =>
        e.tipo === capa &&
        (!soloEnVista || e.enVista) &&
        (!soloSeleccionadas || seleccion.has(e.clave)) &&
        filaCoincide(e, columnas, nombres, busqueda),
    )
    if (orden) {
      lista.sort((a, b) => {
        const r = compararCeldas(valorDeCelda(a, orden.clave, nombres), valorDeCelda(b, orden.clave, nombres))
        return orden.asc ? r : -r
      })
    }
    return lista
  }, [elementos, capa, soloEnVista, soloSeleccionadas, seleccion, columnas, nombres, busqueda, orden])

  const seleccionadasEnCapa = useMemo(
    () => elementos.filter((e) => e.tipo === capa && seleccion.has(e.clave)).length,
    [elementos, capa, seleccion],
  )
  const todasMarcadas = filas.length > 0 && filas.every((f) => seleccion.has(f.clave))

  function alPulsarFila(e: React.MouseEvent, clave: string) {
    if (e.shiftKey && anclaRef.current) {
      const desde = filas.findIndex((f) => f.clave === anclaRef.current)
      const hasta = filas.findIndex((f) => f.clave === clave)
      if (desde >= 0 && hasta >= 0) {
        const [a, b] = desde < hasta ? [desde, hasta] : [hasta, desde]
        onSeleccion(new Set([...seleccion, ...filas.slice(a, b + 1).map((f) => f.clave)]))
        return
      }
    }
    anclaRef.current = clave
    if (e.ctrlKey || e.metaKey) {
      const nueva = new Set(seleccion)
      if (nueva.has(clave)) nueva.delete(clave)
      else nueva.add(clave)
      onSeleccion(nueva)
    } else {
      onSeleccion(new Set([clave]))
    }
  }

  function alternar(clave: string) {
    anclaRef.current = clave
    const nueva = new Set(seleccion)
    if (nueva.has(clave)) nueva.delete(clave)
    else nueva.add(clave)
    onSeleccion(nueva)
  }

  function exportar() {
    const contexto = [
      soloSeleccionadas ? "Solo lo seleccionado" : null,
      soloEnVista ? "Solo lo que se veía en pantalla" : null,
      busqueda.trim() ? `Búsqueda: «${busqueda.trim()}»` : null,
      consulta ? `Consulta: ${consulta}` : null,
      `Exportado el ${new Date().toLocaleString("es-CO")}`,
    ]
      .filter(Boolean)
      .join(" · ")
    const datos = crearXlsx(hojaDeLaTabla({ capa, columnas, filas, nombres, contexto }))
    const dia = new Date().toISOString().slice(0, 10)
    descargarArchivo(datos, `tabla-${NOMBRE_DE_CAPA_TABLA[capa].toLowerCase()}-${dia}.xlsx`)
  }

  // Arrastrar el borde de arriba cambia el alto de la tabla.
  function empezarArrastre(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const y0 = e.clientY
    const alto0 = alto
    const maximo = (raizRef.current?.parentElement?.getBoundingClientRect().height ?? 800) * 0.7
    const mover = (ev: PointerEvent) => onAlto(Math.round(Math.min(maximo, Math.max(ALTO_TABLA.minimo, alto0 - (ev.clientY - y0)))))
    const soltar = () => {
      window.removeEventListener("pointermove", mover)
      window.removeEventListener("pointerup", soltar)
    }
    window.addEventListener("pointermove", mover)
    window.addEventListener("pointerup", soltar)
  }

  const botonIcono =
    "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"

  return (
    <section
      ref={raizRef}
      aria-label={`Tabla de atributos de ${NOMBRE_DE_CAPA_TABLA[capa]}`}
      className="relative flex shrink-0 flex-col border-t border-border bg-card"
      style={{ height: alto }}
    >
      {/* Borde para cambiar el alto */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Cambiar el alto de la tabla"
        onPointerDown={empezarArrastre}
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize hover:bg-primary/20"
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <Table2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="Capa">
          {CAPAS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === capa}
              onClick={() => {
                onCapa(c)
                setOrden(null)
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                c === capa ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {NOMBRE_DE_CAPA_TABLA[c]} <span className="font-normal opacity-70">{cuantasPorCapa[c]}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en la tabla…"
            aria-label="Buscar en la tabla"
            maxLength={80}
            className="h-7 w-48 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-foreground">
          <input type="checkbox" checked={soloEnVista} onChange={(e) => setSoloEnVista(e.target.checked)} className="accent-primary" />
          Solo lo que se ve
        </label>
        <label className="flex items-center gap-1.5 text-xs text-foreground">
          <input
            type="checkbox"
            checked={soloSeleccionadas}
            onChange={(e) => setSoloSeleccionadas(e.target.checked)}
            className="accent-primary"
          />
          Solo seleccionadas
        </label>

        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip label="Seleccionar por atributos" side="top">
            <button type="button" onClick={onConsultar} aria-label="Seleccionar por atributos" className={botonIcono}>
              <Filter className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="Llevar el mapa a lo seleccionado" side="top">
            <button
              type="button"
              disabled={seleccionadasEnCapa === 0}
              onClick={() => mapa.current?.resaltarElementos([...seleccion], { encuadrar: true })}
              aria-label="Llevar el mapa a lo seleccionado"
              className={botonIcono}
            >
              <Focus className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="Quitar la selección" side="top">
            <button
              type="button"
              disabled={seleccion.size === 0}
              onClick={() => {
                onSeleccion(new Set())
                onQuitarConsulta()
              }}
              aria-label="Quitar la selección"
              className={botonIcono}
            >
              <Eraser className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="Exportar lo que se ve en la tabla a Excel" side="top">
            <button type="button" disabled={filas.length === 0} onClick={exportar} aria-label="Exportar a Excel" className={botonIcono}>
              <FileSpreadsheet className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="Cerrar la tabla" side="top">
            <button type="button" onClick={onCerrar} aria-label="Cerrar la tabla" className={botonIcono}>
              <X className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-[2] w-8 border-b border-border bg-muted px-2 py-1.5">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todas las filas que se ven"
                  checked={todasMarcadas}
                  onChange={() =>
                    onSeleccion(
                      todasMarcadas
                        ? new Set([...seleccion].filter((c) => !filas.some((f) => f.clave === c)))
                        : new Set([...seleccion, ...filas.map((f) => f.clave)]),
                    )
                  }
                  className="accent-primary"
                />
              </th>
              <th className="w-8 border-b border-border px-1 py-1.5" aria-label="Ver en el mapa" />
              {columnas.map((c) => (
                <th
                  key={c.clave}
                  className={`border-b border-border px-2.5 py-1.5 font-semibold text-muted-foreground ${c.numerica ? "text-right" : "text-left"}`}
                  aria-sort={orden?.clave === c.clave ? (orden.asc ? "ascending" : "descending") : undefined}
                >
                  <button
                    type="button"
                    onClick={() => setOrden((o) => (o?.clave === c.clave ? (o.asc ? { clave: c.clave, asc: false } : null) : { clave: c.clave, asc: true }))}
                    className="inline-flex items-center gap-1 whitespace-nowrap outline-none hover:text-foreground focus-visible:underline"
                  >
                    {c.titulo}
                    {orden?.clave === c.clave &&
                      (orden.asc ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((e) => {
              const marcada = seleccion.has(e.clave)
              return (
                <tr
                  key={e.clave}
                  aria-selected={marcada}
                  onClick={(ev) => alPulsarFila(ev, e.clave)}
                  onDoubleClick={() => mapa.current?.enfocarElemento(e.clave)}
                  className={`cursor-pointer select-none ${marcada ? "bg-amber-400/25 hover:bg-amber-400/35" : "odd:bg-muted/25 hover:bg-accent"}`}
                >
                  <td className={`sticky left-0 border-b border-border px-2 py-1 ${marcada ? "bg-amber-100 dark:bg-amber-950" : "bg-card"}`}>
                    <input
                      type="checkbox"
                      checked={marcada}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={() => alternar(e.clave)}
                      aria-label={`Seleccionar ${e.nombre}`}
                      className="accent-primary"
                    />
                  </td>
                  <td className="border-b border-border px-1 py-1">
                    <Tooltip label="Ver en el mapa y abrir su ficha" side="top">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          mapa.current?.enfocarElemento(e.clave)
                        }}
                        aria-label={`Ver ${e.nombre} en el mapa`}
                        className="flex size-6 items-center justify-center rounded text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <MapPin className="size-3.5" />
                      </button>
                    </Tooltip>
                  </td>
                  {columnas.map((c) => {
                    const valor = valorDeCelda(e, c.clave, nombres)
                    return (
                      <td
                        key={c.clave}
                        className={`max-w-64 truncate whitespace-nowrap border-b border-border px-2.5 py-1 ${
                          c.numerica ? "text-right tabular-nums" : ""
                        } ${c.clave === "__nombre" ? "font-semibold text-foreground" : "text-foreground/90"}`}
                        title={textoDeCelda(valor)}
                      >
                        {textoDeCelda(valor) || <span className="text-muted-foreground/60">—</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        {filas.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {elementos.length === 0 ? "Cargando los datos del mapa…" : "Ninguna fila coincide con los filtros de la tabla."}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3 py-1 text-[11px] text-muted-foreground" role="status">
        <span className="tabular-nums">
          {filas.length} {filas.length === 1 ? "fila" : "filas"} · {seleccionadasEnCapa}{" "}
          {seleccionadasEnCapa === 1 ? "seleccionada" : "seleccionadas"}
        </span>
        {consulta && (
          <span className="flex min-w-0 items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-900 dark:text-amber-200">
            <Filter className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">Consulta: {consulta}</span>
            <button type="button" onClick={onQuitarConsulta} aria-label="Quitar la consulta" className="shrink-0 rounded hover:bg-amber-400/30">
              <X className="size-3" />
            </button>
          </span>
        )}
        <span className="ml-auto hidden md:inline">Ctrl + click suma filas · Mayús + click, un tramo · doble click abre su ficha</span>
      </div>
    </section>
  )
}
