"use client"

import { useState } from "react"
import { Bookmark, BookmarkPlus, Check, MapPin, Pencil, Trash2, X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { BarraDeEstado, Boton, EncabezadoVentana, EstadoVacio, type Mensaje } from "@/components/ventana-sig"
import { Tooltip } from "@/components/ui/tooltip"
import { MAX_NOMBRE } from "@/lib/texto"
import type { MapaApi } from "@/components/network-map"
import { guardarMarcadores, leerMarcadores, MAX_MARCADORES, nuevoMarcador, type Marcador } from "./marcadores"

const fecha = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

/**
 * Ventana de marcadores: guardar la vista actual con un nombre y volver a
 * cualquiera con un click. Abierta, lee los del usuario; cada cambio se guarda
 * en el momento.
 */
export function VentanaMarcadores({
  open,
  onOpenChange,
  usuario,
  lugar,
  mapa,
}: {
  open: boolean
  onOpenChange: (abierta: boolean) => void
  /** De quién son: cada usuario tiene los suyos. */
  usuario: string
  /** Dónde está el mapa («La Unión, Valle del Cauca…»): el nombre que se propone. */
  lugar: string
  mapa: { current: MapaApi | null }
}) {
  const [marcadores, setMarcadores] = useState<Marcador[]>([])
  const [nombre, setNombre] = useState("")
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje>({
    texto: "Los marcadores se guardan en este navegador, para tu usuario.",
    tono: "info",
  })

  // Al abrir se leen de nuevo: otra pestaña pudo haberlos cambiado.
  const [abiertaAntes, setAbiertaAntes] = useState(false)
  if (open !== abiertaAntes) {
    setAbiertaAntes(open)
    if (open) {
      setMarcadores(leerMarcadores(usuario))
      setNombre(lugar.split(",")[0]?.trim() ?? "")
      setEditando(null)
    }
  }

  function cambiar(lista: Marcador[], hecho: string) {
    setMarcadores(lista)
    setMensaje(
      guardarMarcadores(usuario, lista)
        ? { texto: hecho, tono: "info" }
        : {
            texto: `${hecho} Pero el navegador no deja guardar: se perderá al recargar.`,
            tono: "aviso",
          },
    )
  }

  function guardarVistaActual() {
    const vista = mapa.current?.vistaActual()
    if (!vista) {
      setMensaje({ texto: "El mapa todavía no está listo.", tono: "aviso" })
      return
    }
    if (marcadores.length >= MAX_MARCADORES) {
      setMensaje({ texto: `Ya hay ${MAX_MARCADORES} marcadores: borra alguno para guardar otro.`, tono: "aviso" })
      return
    }
    const marcador = nuevoMarcador(nombre, vista)
    cambiar([marcador, ...marcadores], `Guardado «${marcador.nombre}».`)
    setNombre("")
  }

  function ir(m: Marcador) {
    mapa.current?.irAVista(m)
    onOpenChange(false)
  }

  function terminarRenombrar() {
    if (!editando) return
    const limpio = editando.nombre.trim()
    if (!limpio) {
      setEditando(null)
      return
    }
    cambiar(
      marcadores.map((m) => (m.id === editando.id ? { ...m, nombre: limpio } : m)),
      `Renombrado a «${limpio}».`,
    )
    setEditando(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(34rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
        <EncabezadoVentana
          icono={Bookmark}
          titulo="Marcadores"
          descripcion={`${marcadores.length} ${marcadores.length === 1 ? "vista guardada" : "vistas guardadas"} · un click lleva el mapa a ella`}
        />

        <form
          className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            guardarVistaActual()
          }}
        >
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={MAX_NOMBRE}
            placeholder="Nombre de la vista (por ejemplo, HUB La Unión)"
            aria-label="Nombre de la vista"
            className="h-8 min-w-48 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Boton icono={BookmarkPlus} principal onClick={guardarVistaActual}>
            Guardar la vista actual
          </Boton>
        </form>

        <div className="min-h-40 flex-1 overflow-y-auto">
          {marcadores.length === 0 ? (
            <EstadoVacio
              icono={Bookmark}
              titulo="Todavía no hay marcadores"
              texto="Lleva el mapa a un sector que visites seguido, ponle nombre y guárdalo. Después vuelves a él con un click."
            />
          ) : (
            <ul className="divide-y divide-border">
              {marcadores.map((m) => (
                <li key={m.id} className="group flex items-center gap-2 px-5 py-2 hover:bg-accent/50">
                  <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {editando?.id === m.id ? (
                    <input
                      autoFocus
                      value={editando.nombre}
                      maxLength={MAX_NOMBRE}
                      onChange={(e) => setEditando({ id: m.id, nombre: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") terminarRenombrar()
                        if (e.key === "Escape") {
                          e.stopPropagation()
                          setEditando(null)
                        }
                      }}
                      aria-label={`Nuevo nombre de «${m.nombre}»`}
                      className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => ir(m)}
                      className="flex min-w-0 flex-1 flex-col text-left outline-none focus-visible:underline"
                    >
                      <span className="truncate text-xs font-semibold text-foreground">{m.nombre}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {m.centro[1].toFixed(5)}, {m.centro[0].toFixed(5)} · zoom {Math.round(m.zoom * 10) / 10}
                        {fecha(m.creado) && ` · ${fecha(m.creado)}`}
                      </span>
                    </button>
                  )}
                  {editando?.id === m.id ? (
                    <>
                      <Tooltip label="Guardar el nombre" side="top">
                        <button type="button" onClick={terminarRenombrar} aria-label="Guardar el nombre" className={claseIcono}>
                          <Check className="size-4" />
                        </button>
                      </Tooltip>
                      <Tooltip label="Cancelar" side="top">
                        <button type="button" onClick={() => setEditando(null)} aria-label="Cancelar" className={claseIcono}>
                          <X className="size-4" />
                        </button>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      <Tooltip label="Renombrar" side="top">
                        <button
                          type="button"
                          onClick={() => setEditando({ id: m.id, nombre: m.nombre })}
                          aria-label={`Renombrar «${m.nombre}»`}
                          className={claseIcono}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </Tooltip>
                      <Tooltip label="Borrar" side="top">
                        <button
                          type="button"
                          onClick={() => cambiar(marcadores.filter((x) => x.id !== m.id), `Borrado «${m.nombre}».`)}
                          aria-label={`Borrar «${m.nombre}»`}
                          className={`${claseIcono} hover:text-destructive`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <BarraDeEstado mensaje={mensaje} />
      </DialogContent>
    </Dialog>
  )
}

const claseIcono =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
