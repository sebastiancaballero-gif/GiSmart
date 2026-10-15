"use client"

import { useEffect, useImperativeHandle, useState, type Ref } from "react"
import type { AccesoAlMapa } from "@/components/network-map"
import { getUser } from "@/lib/auth"
import type { HerramientaAvanzada } from "./cinta"
import { VentanaMarcadores } from "./marcadores/ventana-marcadores"
import { PanelResumen } from "./resumen/panel-resumen"

/** Lo que el tablero le pide al módulo: abrir una de sus herramientas. */
export type ManejadorDelModulo = {
  /** Abre la herramienta; devuelve qué decirle al usuario si no se pudo. */
  abrir: (herramienta: HerramientaAvanzada) => string | void
}

/** El usuario conectado, para guardar lo de cada quien por separado. */
function usuarioActual(): string {
  const u = getUser() as { usuario?: unknown } | null
  return typeof u?.usuario === "string" ? u.usuario : ""
}

/**
 * El módulo «Avanzado» (ver modulos/avanzado/cinta.ts): sus ventanas y
 * paneles viven aquí, con su propio estado. Del tablero solo recibe el acceso
 * al mapa y el nombre del lugar que se está viendo, y le cuenta qué paneles
 * tiene abiertos para que la cinta los muestre encendidos.
 */
export function ModuloAvanzado({
  ref,
  mapa,
  lugar,
  onActivos,
}: {
  ref?: Ref<ManejadorDelModulo>
  mapa: AccesoAlMapa
  lugar: string
  /** Las etiquetas de los botones cuyos paneles están abiertos. */
  onActivos?: (etiquetas: string[]) => void
}) {
  const [marcadores, setMarcadores] = useState(false)
  const [usuario, setUsuario] = useState("")
  const [resumen, setResumen] = useState(false)

  useImperativeHandle(ref, () => ({
    abrir(herramienta) {
      switch (herramienta) {
        case "marcadores":
          setUsuario(usuarioActual())
          setMarcadores(true)
          return
        case "atajos":
          mapa.api.current?.abrirAtajos()
          return
        // Los paneles que acompañan al mapa se abren y se cierran con su botón.
        case "resumen":
          setResumen((abierto) => !abierto)
          return
        default:
          return "Esa herramienta todavía no está disponible."
      }
    },
  }))

  useEffect(() => {
    onActivos?.(resumen ? ["Resumen"] : [])
  }, [resumen, onActivos])

  return (
    <>
      <VentanaMarcadores open={marcadores} onOpenChange={setMarcadores} usuario={usuario} lugar={lugar} mapa={mapa.api} />
      {resumen && <PanelResumen mapa={mapa.api} onCerrar={() => setResumen(false)} />}
    </>
  )
}
