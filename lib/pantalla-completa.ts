"use client"

import { useSyncExternalStore } from "react"

function suscribir(aviso: () => void) {
  document.addEventListener("fullscreenchange", aviso)
  return () => document.removeEventListener("fullscreenchange", aviso)
}

/**
 * Dónde abrir las ventanas y etiquetas (portales): en el elemento que esté en
 * pantalla completa, o donde siempre (`undefined`: el `body`).
 *
 * Con el mapa en pantalla completa («Extensión» del ribbon) el navegador solo
 * muestra ese elemento. Las ventanas se abrían en el `body`, detrás, y no se
 * veían: «Atajos de teclado» quedaba abierta sin verse y, como es modal, el
 * mapa parecía trabado.
 */
export function useContenedorDePortal(): HTMLElement | undefined {
  return useSyncExternalStore(
    suscribir,
    () => (document.fullscreenElement as HTMLElement | null) ?? undefined,
    () => undefined,
  )
}
