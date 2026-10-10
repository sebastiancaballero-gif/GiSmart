"use client"

import { useEffect, useState } from "react"
import { Minimize, ChevronUp, Clock } from "lucide-react"
import { RIBBON_TABS, type RibbonItem } from "@/components/dashboard-ribbon-data"
import type { VentanaDePlanta } from "@/components/planta"
import { LogoutConfirmDialog } from "@/components/logout-confirm-dialog"
import { Tooltip } from "@/components/ui/tooltip"

export type RibbonActions = {
  onRefresh?: () => void
  onFitToData?: () => void
  onIdentify?: () => void
  onMeasure?: () => void
  /** Devuelven por qué no se pudo, si falta activar la capa. */
  onDraw?: () => string | void
  onDelete?: () => string | void
  onEditGeometry?: () => void
  /**
   * «Activar capa»: activa o desactiva la capa sobre la que se edita. Devuelve
   * lo que hay que decirle al usuario.
   */
  onActivarCapa?: () => string | void
  /** «Búsqueda»: lleva al buscador de arriba. */
  onBuscar?: () => void
  /** «Hilos» (Red de fibra): abre la gestión de hilos del cable. */
  onHilos?: () => void
  /** «Redes/Nodo» (Red de fibra): abre la consulta de redes por nodo. */
  onRedesNodo?: () => void
  /** «GPON» (Red de fibra): abre «Elementos alimentados por fibra óptica». */
  onGpon?: () => void
  /** Planta interna y externa (Red de fibra): abre la ventana del botón. */
  onVentana?: (ventana: VentanaDePlanta) => void
  /** «Trace» (Red de fibra): abre «Recorrido del trace». */
  onTrace?: () => void
  /** Consulta de conectividad de una cubierta (Consultas → Red). */
  onConnectivity?: () => void
  /** Pinta los cables de entrada y salida de una mufa (Consultas → Red). */
  onSentido?: () => void
  /** Consulta de un cable (Consultas → Red). */
  onCable?: () => void
}

export function DashboardRibbon({
  actions,
  activos = [],
}: {
  actions?: RibbonActions
  /** Botones cuya herramienta está activa en el mapa: se ven encendidos. */
  activos?: string[]
} = {}) {
  const [activeTab, setActiveTab] = useState("inicio")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  // La barra de herramientas ocupa casi 100 px de alto; poder plegarla
  // devuelve ese espacio al mapa, que es lo que de verdad se mira.
  const [colapsado, setColapsado] = useState(false)
  const currentTab = RIBBON_TABS.find((t) => t.id === activeTab) ?? RIBBON_TABS[0]

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColapsado(localStorage.getItem("gismart_ribbon_colapsado") === "1")
  }, [])

  function alternarColapso(valor: boolean) {
    setColapsado(valor)
    try {
      localStorage.setItem("gismart_ribbon_colapsado", valor ? "1" : "0")
    } catch {
      // Si el navegador bloquea el almacenamiento, el ribbon simplemente no
      // recuerda el estado entre sesiones.
    }
  }

  function alPulsarPestana(id: string) {
    // Volver a pulsar la pestaña activa pliega o despliega, como en Office.
    if (id === activeTab) {
      alternarColapso(!colapsado)
      return
    }
    setActiveTab(id)
    alternarColapso(false)
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // El aviso de "en desarrollo" se borra solo para no quedar pegado en pantalla.
  useEffect(() => {
    if (!aviso) return
    const timeout = setTimeout(() => setAviso(null), 2600)
    return () => clearTimeout(timeout)
  }, [aviso])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      const mapPanel = document.getElementById("map-panel") ?? document.documentElement
      // Si el navegador no lo deja (políticas, un iframe), se dice en vez de no hacer nada.
      mapPanel.requestFullscreen().catch(() => setAviso("El navegador no dejó poner el mapa en pantalla completa."))
    }
  }

  // Qué hace cada botón lo dice su `accion` en dashboard-ribbon-data.ts. El
  // que no tiene es parte de la maqueta del SIG anterior y lo avisa.
  function handleItemClick(item: RibbonItem) {
    const avisar = (mensaje: string | void) => {
      if (mensaje) setAviso(mensaje)
    }
    switch (item.accion) {
      case "salir":
        setLogoutOpen(true)
        return
      case "pantallaCompleta":
        toggleFullscreen()
        return
      case "actualizar":
        actions?.onRefresh?.()
        setAviso("Recargando datos de red…")
        return
      case "encuadrar":
        actions?.onFitToData?.()
        return
      case "gpon":
        actions?.onGpon?.()
        return
      case "redesNodo":
        actions?.onRedesNodo?.()
        return
      case "hilos":
        actions?.onHilos?.()
        return
      case "ventana":
        if (item.ventana) actions?.onVentana?.(item.ventana)
        return
      case "trace":
        actions?.onTrace?.()
        return
      case "buscar":
        actions?.onBuscar?.()
        setAviso("Escribe el nombre de una cubierta, un cable, una dirección o una coordenada.")
        return
      case "aCoordenada":
        actions?.onBuscar?.()
        setAviso("Escribe la coordenada como latitud, longitud: por ejemplo 4.5333, -76.0883.")
        return
      case "activarCapa":
        avisar(actions?.onActivarCapa?.())
        return
      case "identificar":
        actions?.onIdentify?.()
        setAviso("Haz click sobre un elemento del mapa para ver su información.")
        return
      case "medir":
        actions?.onMeasure?.()
        return
      case "crear":
        avisar(actions?.onDraw?.())
        return
      case "borrar":
        avisar(actions?.onDelete?.())
        return
      // Flujo acordado con Aurelio: cambia el cursor, el usuario elige un
      // elemento y, si es una cubierta, se abre su conectividad en consulta.
      case "conectividad":
        actions?.onConnectivity?.()
        return
      case "sentido":
        actions?.onSentido?.()
        return
      case "cable":
        actions?.onCable?.()
        return
      case "editar":
        actions?.onEditGeometry?.()
        return
      case undefined:
        setAviso(`«${item.label}» todavía no está disponible: falta su función.`)
        return
    }
  }

  // Pestañas con el teclado: flechas para pasar de una a otra, Inicio y Fin.
  function teclaEnPestanas(e: React.KeyboardEvent<HTMLButtonElement>) {
    const actual = RIBBON_TABS.findIndex((t) => t.id === activeTab)
    const n = RIBBON_TABS.length
    const destino =
      e.key === "ArrowRight"
        ? (actual + 1) % n
        : e.key === "ArrowLeft"
          ? (actual - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null
    if (destino === null) return
    e.preventDefault()
    setActiveTab(RIBBON_TABS[destino].id)
    alternarColapso(false)
    document.getElementById(`ribbon-pestana-${RIBBON_TABS[destino].id}`)?.focus()
  }

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* Pestañas */}
      {/* En pantallas angostas las diez pestañas no caben: se desplazan a lo
          ancho en vez de quedar cortadas. */}
      <div
        role="tablist"
        aria-label="Secciones"
        className="flex items-end overflow-x-auto border-b border-border bg-gradient-to-b from-card to-muted/30 px-1 pt-1 [scrollbar-width:none]"
      >
        {RIBBON_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            // Sin etiqueta cuando la pestaña no está activa: su nombre ya se lee
            // en el propio botón y repetirlo al pasar el ratón solo estorba.
            // Activa sí aporta, porque entonces el click pliega o despliega.
            <Tooltip
              key={tab.id}
              side="bottom"
              label={isActive ? (colapsado ? "Desplegar la barra" : "Plegar la barra") : undefined}
            >
            <button
              id={`ribbon-pestana-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls="ribbon-herramientas"
              tabIndex={isActive ? 0 : -1}
              onKeyDown={teclaEnPestanas}
              onClick={() => alPulsarPestana(tab.id)}
              className={`
                relative shrink-0 whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-semibold outline-none transition-all
                focus-visible:ring-2 focus-visible:ring-ring/50
                ${isActive
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }
              `}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-1 right-1 h-[3px] rounded-full bg-primary" />
              )}
            </button>
            </Tooltip>
          )
        })}

        <Tooltip label={colapsado ? "Desplegar la barra de herramientas" : "Plegar la barra de herramientas"} side="bottom">
        <button
          type="button"
          onClick={() => alternarColapso(!colapsado)}
          aria-expanded={!colapsado}
          aria-label={colapsado ? "Desplegar la barra de herramientas" : "Plegar la barra de herramientas"}
          className="sticky right-1 mb-1 ml-auto mr-1 flex size-7 shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground shadow-[-10px_0_8px_-2px_var(--card)] outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronUp className={`size-4 transition-transform ${colapsado ? "rotate-180" : ""}`} />
        </button>
        </Tooltip>
      </div>

      {/* Toolbar. Al plegarla o desplegarla la altura se anima (filas de
          0fr a 1fr) en vez de saltar, y el mapa de abajo se acomoda con ella.
          Plegada queda `inert`: no se ve ni recibe el foco. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          colapsado ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden" inert={colapsado}>
          <div
            key={activeTab}
            id="ribbon-herramientas"
            role="tabpanel"
            aria-labelledby={`ribbon-pestana-${activeTab}`}
            className="flex h-[92px] items-stretch overflow-x-auto bg-card px-2 animate-gismart-fade-in"
          >
            {currentTab.groups.map((group, gi) => (
              <div key={gi} className="flex items-stretch">
                <div className="flex flex-col justify-center px-1.5 py-1.5">
                  <div className="flex items-center gap-0.5">
                    {group.items.map((item, ii) => {
                      const isExtension = item.label === "Extensión"
                      const Icon = isExtension && isFullscreen ? Minimize : item.icon
                      const isPrimary = item.variant === "primary" || (isExtension && isFullscreen)
                      const isDestructive = item.variant === "destructive"
                      // Encendido mientras su herramienta está activa: antes solo lo
                      // decía la barra de estado, abajo del mapa.
                      const isActivo = activos.includes(item.label)
                      // Sin acción: todavía no tiene su función.
                      const proximamente = !item.accion

                      return (
                        <Tooltip
                          key={ii}
                          label={
                            isExtension && isFullscreen
                              ? "Salir de pantalla completa"
                              : proximamente
                                ? `${item.label} · Próximamente`
                                : (item.tooltip ?? item.label)
                          }
                          side="bottom"
                        >
                        <button
                          onClick={() => handleItemClick(item)}
                          disabled={item.disabled}
                          aria-label={
                            isExtension && isFullscreen
                              ? "Salir de pantalla completa"
                              : proximamente
                                ? `${item.label} (próximamente)`
                                : item.label
                          }
                          aria-disabled={proximamente ? true : undefined}
                          aria-pressed={isExtension ? isFullscreen : isActivo ? true : undefined}
                          // Todos del mismo alto y con el icono arriba: con alturas
                          // distintas (texto de uno o dos renglones) cada grupo se
                          // centraba a su manera, y los iconos y los nombres de los
                          // grupos quedaban a distinta altura a lo largo del ribbon.
                          className={`
                            group relative flex h-[54px] flex-col items-center justify-start gap-0.5 rounded-md px-1.5 pb-1 pt-2 outline-none transition
                            focus-visible:ring-2 focus-visible:ring-ring/50
                            ${proximamente
                              ? "text-muted-foreground/60 hover:bg-accent/60 hover:text-muted-foreground"
                              : isActivo
                              ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40 hover:bg-primary/20"
                              : isPrimary
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : isDestructive
                                ? "text-destructive hover:bg-destructive/10"
                                : "text-foreground hover:bg-accent"
                            }
                            ${item.disabled ? "opacity-40 cursor-not-allowed" : ""}
                            min-w-[58px]
                          `}
                        >
                          {/* El reloj marca lo que todavía no está, sin depender
                              solo del color apagado. */}
                          {proximamente && (
                            <Clock className="absolute right-1 top-1 size-2.5 text-muted-foreground/70" aria-hidden="true" />
                          )}
                          <Icon className="size-[18px] shrink-0" />
                          {/* Hasta dos líneas: con una sola, «Conectividad fina» o
                              «Entradas y salidas» salían cortadas con puntos suspensivos.
                              Se parte en los espacios y después de «/» (un espacio
                              invisible: si no, «Puertos/equipo» se cortaba en
                              «Puertos/equi»), pero no en el guion: «ODF-ODF» quedaba en
                              «ODF-» y «ODF». `min-w-min`: una palabra más larga que el
                              máximo, como «Enrutamiento», ensancha el botón. */}
                          <span className="line-clamp-2 min-w-min max-w-[62px] text-center text-[10px] font-medium leading-[1.15]">
                            {item.label.replaceAll("/", "/\u200b").replaceAll("-", "\u2011")}
                          </span>
                        </button>
                        </Tooltip>
                      )
                    })}
                  </div>
                  <span className="mt-1 text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                </div>
                {gi < currentTab.groups.length - 1 && (
                  <div className="my-2 w-px bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Por encima de la barra de estado del mapa: más abajo le tapaba las
          coordenadas y el nombre de la herramienta. */}
      {aviso && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-16 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-gismart-fade-in rounded-lg bg-foreground/90 px-4 py-2 text-center text-xs font-medium text-background shadow-lg"
        >
          {aviso}
        </div>
      )}

      <LogoutConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </div>
  )
}