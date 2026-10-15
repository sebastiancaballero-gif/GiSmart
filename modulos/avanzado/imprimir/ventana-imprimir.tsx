"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Loader2, Printer } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { BarraDeEstado, Boton, EncabezadoVentana, Rotulo, type Mensaje } from "@/components/ventana-sig"
import type { MapaApi } from "@/components/network-map"
import { componerLamina, type OpcionesDeLamina } from "./componer"

type Captura = { lienzo: HTMLCanvasElement; metrosPorPixel: number }

const hoy = () => new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })

/**
 * «Imprimir»: el mapa tal como se ve, con título, leyenda, escala, norte y
 * fecha, para descargarlo como imagen o mandarlo a la impresora (donde
 * también se guarda como PDF). Lo que se ve en el mapa es lo que sale: el
 * trace, la selección o el círculo de cercanía, si están.
 */
export function VentanaImprimir({
  open,
  onOpenChange,
  mapa,
  lugar,
}: {
  open: boolean
  onOpenChange: (abierta: boolean) => void
  mapa: { current: MapaApi | null }
  lugar: string
}) {
  const [captura, setCaptura] = useState<Captura | null>(null)
  const [opciones, setOpciones] = useState<OpcionesDeLamina>({
    titulo: "Red de fibra óptica",
    subtitulo: lugar,
    leyenda: true,
    escalaYNorte: true,
    fecha: hoy(),
  })
  const [mensaje, setMensaje] = useState<Mensaje>({ texto: "Sale lo que se ve en el mapa ahora.", tono: "info" })

  // Al abrir se toma el mapa una vez; las opciones solo rearman la lámina.
  const [abiertaAntes, setAbiertaAntes] = useState(false)
  if (open !== abiertaAntes) {
    setAbiertaAntes(open)
    if (open) {
      setCaptura(null)
      setOpciones((o) => ({ ...o, subtitulo: lugar, fecha: o.fecha === null ? null : hoy() }))
    }
  }

  useEffect(() => {
    if (!open) return
    let vigente = true
    mapa.current
      ?.capturarMapa()
      .then((c) => {
        if (!vigente) return
        if (c) setCaptura(c)
        else setMensaje({ texto: "No se pudo tomar la imagen del mapa.", tono: "error" })
      })
      .catch((e: unknown) =>
        setMensaje({
          texto: "No se pudo tomar la imagen del mapa.",
          tono: "error",
          detalle: e instanceof Error ? e.message : String(e),
        }),
      )
    return () => {
      vigente = false
    }
  }, [open, mapa])

  const escala = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1

  // La lámina sale de la captura y las opciones; se rearma al cambiar cualquiera.
  const lamina = useMemo((): { vista: string | null; error: Mensaje | null } => {
    if (!captura) return { vista: null, error: null }
    try {
      return { vista: componerLamina(captura, opciones, escala).toDataURL("image/png"), error: null }
    } catch (e) {
      // Un lienzo «contaminado» (teselas de otro sitio sin permiso) no se puede leer.
      return {
        vista: null,
        error: {
          texto: "El mapa base no deja exportar su imagen; prueba con otro proveedor de teselas.",
          tono: "error",
          detalle: e instanceof Error ? e.message : String(e),
        },
      }
    }
  }, [captura, opciones, escala])
  const vista = lamina.vista

  const nombreDeArchivo = () => `mapa-${(opciones.titulo || "red").toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, "-").replace(/^-|-$/g, "")}-${new Date().toISOString().slice(0, 10)}.png`

  function descargar() {
    if (!vista) return
    const a = document.createElement("a")
    a.href = vista
    a.download = nombreDeArchivo()
    a.click()
    setMensaje({ texto: `Descargada «${a.download}».`, tono: "info" })
  }

  function imprimir() {
    if (!vista) return
    const ventana = window.open("", "_blank")
    if (!ventana) {
      setMensaje({ texto: "El navegador bloqueó la ventana de impresión: permite las ventanas emergentes de GISmart.", tono: "aviso" })
      return
    }
    const titulo = (opciones.titulo || "Mapa").replace(/[<>&"]/g, "")
    ventana.document.write(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title>` +
        `<style>@page{size:landscape;margin:10mm}html,body{margin:0}img{display:block;width:100%;height:auto}</style></head>` +
        `<body><img src="${vista}" alt="${titulo}"></body></html>`,
    )
    ventana.document.close()
    const img = ventana.document.querySelector("img")
    const lanzar = () => {
      ventana.focus()
      ventana.print()
    }
    if (img && !img.complete) img.addEventListener("load", lanzar, { once: true })
    else lanzar()
    setMensaje({ texto: "En la ventana de impresión se elige la impresora o «Guardar como PDF».", tono: "info" })
  }

  const casilla = (clave: "leyenda" | "escalaYNorte", texto: string) => (
    <label className="flex items-center gap-1.5 text-xs text-foreground">
      <input
        type="checkbox"
        checked={opciones[clave]}
        onChange={(e) => setOpciones((o) => ({ ...o, [clave]: e.target.checked }))}
        className="accent-primary"
      />
      {texto}
    </label>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(58rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
        <EncabezadoVentana icono={Printer} titulo="Imprimir o exportar el mapa" descripcion="Con título, leyenda, escala, norte y fecha" />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <Rotulo>Título</Rotulo>
              <input
                value={opciones.titulo}
                onChange={(e) => setOpciones((o) => ({ ...o, titulo: e.target.value }))}
                maxLength={80}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <Rotulo>Subtítulo</Rotulo>
              <input
                value={opciones.subtitulo}
                onChange={(e) => setOpciones((o) => ({ ...o, subtitulo: e.target.value }))}
                maxLength={120}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {casilla("leyenda", "Leyenda")}
            {casilla("escalaYNorte", "Escala y norte")}
            <label className="flex items-center gap-1.5 text-xs text-foreground">
              <input
                type="checkbox"
                checked={opciones.fecha !== null}
                onChange={(e) => setOpciones((o) => ({ ...o, fecha: e.target.checked ? hoy() : null }))}
                className="accent-primary"
              />
              Fecha
            </label>
          </div>

          <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-muted/40 p-2">
            {vista ? (
              // eslint-disable-next-line @next/next/no-img-element -- es una imagen generada en el navegador (data URL)
              <img src={vista} alt="Vista previa de la lámina" className="max-h-[48vh] w-auto rounded shadow-md" />
            ) : (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Tomando la imagen del mapa…
              </span>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Boton icono={Download} deshabilitado={!vista} onClick={descargar}>
              Descargar imagen (PNG)
            </Boton>
            <Boton icono={Printer} principal deshabilitado={!vista} onClick={imprimir}>
              Imprimir o guardar en PDF
            </Boton>
          </div>
        </div>

        <BarraDeEstado mensaje={lamina.error ?? mensaje} />
      </DialogContent>
    </Dialog>
  )
}
