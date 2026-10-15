"use client"

import { useImperativeHandle, useState, type Ref } from "react"
import type { AccesoAlMapa } from "@/components/network-map"
import { getUser } from "@/lib/auth"
import type { HerramientaAvanzada } from "./cinta"
import { VentanaMarcadores } from "./marcadores/ventana-marcadores"

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
 * al mapa y el nombre del lugar que se está viendo.
 */
export function ModuloAvanzado({
  ref,
  mapa,
  lugar,
}: {
  ref?: Ref<ManejadorDelModulo>
  mapa: AccesoAlMapa
  lugar: string
}) {
  const [marcadores, setMarcadores] = useState(false)
  const [usuario, setUsuario] = useState("")

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
        default:
          return "Esa herramienta todavía no está disponible."
      }
    },
  }))

  return (
    <VentanaMarcadores open={marcadores} onOpenChange={setMarcadores} usuario={usuario} lugar={lugar} mapa={mapa.api} />
  )
}
