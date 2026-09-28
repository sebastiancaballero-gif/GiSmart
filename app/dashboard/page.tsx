"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { DashboardRibbon } from "@/components/dashboard-ribbon"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { NetworkMap, type CableElegido, type MapaApi } from "@/components/network-map"
import { GestionHilosDialog } from "@/components/gestion-hilos-dialog"
import { RedesNodoDialog, type NodoDeFibra } from "@/components/redes-nodo-dialog"
import { ElementosAlimentadosDialog, type CubiertaNivel1 } from "@/components/elementos-alimentados-dialog"
import { AuthGuard } from "@/components/auth-guard"
import type { MapTool } from "@/lib/map/herramientas"
import type { ElementoBuscable } from "@/lib/map/busqueda"
import {
  DIBUJO_DE_CAPA,
  NOMBRE_DE_CAPA,
  esCapaEditable,
  motivoHerramientaBloqueada,
  type CapaEditable,
} from "@/lib/map/capa-activa"
import type { NetworkStats } from "@/lib/map/capas"
import { LAYER_COLORS } from "@/lib/network-colors"
import { fetchConSesion } from "@/lib/auth"

/** Por debajo de este ancho el panel de capas va plegado. */
const PANTALLA_ANGOSTA = "(max-width: 1023px)"

export default function DashboardPage() {
  const [visible, setVisible] = useState({ nodes: true, fibers: true, zones: true, cabeceras: true })
  const [counts, setCounts] = useState({ nodes: 0, fibers: 0, zones: 0, cabeceras: 0 })
  const [totalKm, setTotalKm] = useState(0)
  // Lo que queda a la vista con el filtro por categoria puesto: sin esto, el
  // panel anunciaba los kilometros de toda la red mientras el mapa mostraba
  // solo una parte.
  const [enPantalla, setEnPantalla] = useState({ nodes: 0, fibers: 0, km: 0 })
  // En pantallas angostas (tablet, portátil pequeño) el panel de capas empieza
  // plegado y se pliega solo al achicar la ventana: abierto se comía un cuarto
  // del mapa. Se puede abrir igual con su botón.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia(PANTALLA_ANGOSTA).matches,
  )
  useEffect(() => {
    const consulta = window.matchMedia(PANTALLA_ANGOSTA)
    const alCambiar = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarCollapsed(true)
    }
    consulta.addEventListener("change", alCambiar)
    return () => consulta.removeEventListener("change", alCambiar)
  }, [])
  const [center, setCenter] = useState<{ lon: number; lat: number } | null>(null)
  const [location, setLocation] = useState("Ubicando…")
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; nonce: number } | null>(null)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [fitTo, setFitTo] = useState<{ capa: "todo" | "nodes" | "fibers" | "cabeceras" | "zones"; nonce: number } | null>(null)
  const [tool, setTool] = useState<MapTool>("pan")
  const [loadingData, setLoadingData] = useState(true)
  const [breakdown, setBreakdown] = useState<NetworkStats["breakdown"]>({ nodes: [], fibers: [] })
  // Categorías marcadas en el desglose. Vacío = sin filtro, se ve todo.
  const [filters, setFilters] = useState<{ nodes: string[]; fibers: string[] }>({
    nodes: [],
    fibers: [],
  })
  // Capa activa: editar, mover y crear solo trabajan sobre ella. Se activa con
  // «Activar capa» o pulsándola en el panel (ver lib/map/capa-activa.ts).
  const [capaActiva, setCapaActiva] = useState<CapaEditable | null>(null)
  // Sube para que el panel señale dónde elegir la capa.
  const [pedirCapa, setPedirCapa] = useState(0)
  // Buscador de elementos: el mapa publica qué tiene cargado y expone cómo
  // enfocar uno; el botón «Búsqueda» del ribbon lleva el foco al buscador.
  const [indice, setIndice] = useState<ElementoBuscable[]>([])
  const mapaApiRef = useRef<MapaApi | null>(null)
  const [pedirFocoBusqueda, setPedirFocoBusqueda] = useState(0)

  // «Gestión de hilos» (Red de fibra → Hilos). Si hay un cable seleccionado en
  // el mapa se abre con ese; si no, se elige con el botón de selección.
  const [hilosAbierto, setHilosAbierto] = useState(false)
  const [cableHilos, setCableHilos] = useState<CableElegido | null>(null)

  const abrirHilos = useCallback(() => {
    const seleccionado = mapaApiRef.current?.cableSeleccionado()
    if (seleccionado) setCableHilos(seleccionado)
    setHilosAbierto(true)
  }, [])

  // El botón de selección de la ventana: se cierra, se elige el cable en el
  // mapa y se vuelve a abrir con él. Con Esc se vuelve con el que había.
  const elegirCableParaHilos = useCallback(async () => {
    setHilosAbierto(false)
    setTool("pan")
    const cable = (await mapaApiRef.current?.elegirCable()) ?? null
    if (cable) setCableHilos(cable)
    setHilosAbierto(true)
  }, [])

  // «Consulta de redes por nodo» (Red de fibra → Redes/Nodo). Los nodos de
  // fibra son, por ahora, las cabeceras cargadas en el mapa.
  const [redesAbierto, setRedesAbierto] = useState(false)
  const nodosDeFibra = useMemo<NodoDeFibra[]>(
    () =>
      indice
        .filter((e) => e.tipo === "cabecera")
        .map((e) => ({ clave: e.clave, nombre: e.nombre, detalle: e.detalle })),
    [indice],
  )

  // «Ubicar en el mapa»: se cierra la ventana y el mapa se centra en el nodo.
  const ubicarNodo = useCallback((clave: string) => {
    setRedesAbierto(false)
    setVisible((prev) => ({ ...prev, cabeceras: true }))
    mapaApiRef.current?.enfocarElemento(clave)
  }, [])

  // «Elementos alimentados por fibra óptica» (Red de fibra → GPON). El nodo y
  // la cubierta de nivel 1 elegidos viven aquí porque se pueden elegir con un
  // click en el mapa, con la ventana cerrada.
  const [gponAbierto, setGponAbierto] = useState(false)
  const [claveNodoGpon, setClaveNodoGpon] = useState<string | null>(null)
  const [claveNivel1Gpon, setClaveNivel1Gpon] = useState<string | null>(null)
  const cubiertasNivel1 = useMemo<CubiertaNivel1[]>(
    () =>
      indice
        .filter((e) => e.tipo === "node" && e.categoria === "Primer nivel")
        .map((e) => ({ clave: e.clave, nombre: e.nombre })),
    [indice],
  )

  // El pin de la ventana: se cierra, se elige la cabecera con un click en el
  // mapa y se vuelve a abrir con ella. Con Esc vuelve con la que había.
  const elegirNodoGponEnMapa = useCallback(async () => {
    setGponAbierto(false)
    setTool("pan")
    const elegido = (await mapaApiRef.current?.elegirElemento("cabecera", "Haz click sobre el nodo (cabecera) que quieres consultar.")) ?? null
    if (elegido) setClaveNodoGpon(elegido.clave)
    setGponAbierto(true)
  }, [])

  // Elegir un elemento en el buscador lo centra y abre su ficha. Si su capa
  // estaba oculta se muestra: si no, se enfocaría algo que no se ve.
  const handleElegirElemento = useCallback((elemento: ElementoBuscable) => {
    const capa = ({ node: "nodes", fiber: "fibers", cabecera: "cabeceras", zone: "zones" } as const)[elemento.tipo]
    setVisible((prev) => ({ ...prev, [capa]: true }))
    mapaApiRef.current?.enfocarElemento(elemento.clave)
  }, [])

  const ubicarDesdeGpon = useCallback(
    (clave: string) => {
      const elemento = indice.find((e) => e.clave === clave)
      if (!elemento) return
      setGponAbierto(false)
      handleElegirElemento(elemento)
    },
    [indice, handleElegirElemento],
  )

  const claveDeCapa = (layerId: string): "nodes" | "fibers" | null =>
    layerId === "nodes" ? "nodes" : layerId === "fibers" ? "fibers" : null

  const handleToggleItem = useCallback((layerId: string, item: string) => {
    const clave = claveDeCapa(layerId)
    if (!clave) return
    setFilters((prev) => {
      const actuales = prev[clave]
      return {
        ...prev,
        [clave]: actuales.includes(item)
          ? actuales.filter((x) => x !== item)
          : [...actuales, item],
      }
    })
  }, [])

  // Encuadra el mapa sobre una capa concreta desde el panel lateral.
  const handleZoomLayer = useCallback((layerId: string) => {
    const capa = layerId as "nodes" | "fibers" | "cabeceras" | "zones"
    setFitTo({ capa, nonce: Date.now() })
  }, [])

  const handleClearItems = useCallback((layerId: string) => {
    const clave = claveDeCapa(layerId)
    if (!clave) return
    setFilters((prev) => ({ ...prev, [clave]: [] }))
  }, [])

  // Cambia la capa activa. Si la herramienta en uso deja de servir con la
  // nueva (dibujar cubiertas con «Zonas» activa, eliminar sin capa), vuelve a
  // «Mover mapa».
  const cambiarCapaActiva = useCallback(
    (nueva: CapaEditable | null) => {
      setCapaActiva(nueva)
      if (motivoHerramientaBloqueada(tool, nueva)) setTool("pan")
    },
    [tool],
  )

  // Pulsar una capa la activa (y la muestra, si estaba oculta: no se puede
  // editar lo que no se ve); pulsarla otra vez la desactiva.
  const handleSelectCapa = useCallback(
    (id: string) => {
      if (!esCapaEditable(id)) return
      cambiarCapaActiva(capaActiva === id ? null : id)
      setVisible((prev) => ({ ...prev, [id]: true }))
    },
    [capaActiva, cambiarCapaActiva],
  )

  const handleNavigate = useCallback((target: { lon: number; lat: number }) => {
    setFlyTo({ ...target, nonce: Date.now() })
  }, [])

  const ribbonActions = useMemo(
    () => ({
      onRefresh: () => setReloadTrigger((v) => v + 1),
      onFitToData: () => setFitTo({ capa: "todo", nonce: Date.now() }),
      onIdentify: () => setTool("edit"),
      onMeasure: () => setTool("measure-length"),
      // «Crear» dibuja en la capa activa; sin ella, el mapa dice qué activar.
      onDraw: () => {
        const herramienta = (capaActiva && DIBUJO_DE_CAPA[capaActiva]) || "node"
        const motivo = motivoHerramientaBloqueada(herramienta, capaActiva)
        if (motivo) return motivo
        setTool(herramienta)
      },
      onDelete: () => {
        const motivo = motivoHerramientaBloqueada("delete", capaActiva)
        if (motivo) return motivo
        setTool("delete")
      },
      onEditGeometry: () => setTool("edit"),
      onConnectivity: () => setTool("conectividad"),
      onSentido: () => setTool("sentido"),
      onCable: () => setTool("cable"),
      onBuscar: () => setPedirFocoBusqueda((n) => n + 1),
      onHilos: abrirHilos,
      onRedesNodo: () => setRedesAbierto(true),
      onGpon: () => setGponAbierto(true),
      onActivarCapa: () => {
        if (capaActiva) {
          cambiarCapaActiva(null)
          return `Capa «${NOMBRE_DE_CAPA[capaActiva]}» desactivada. El mapa queda solo para consultar.`
        }
        setSidebarCollapsed(false)
        setPedirCapa((n) => n + 1)
        return "Elige en «Capas de red» la capa que vas a activar."
      },
    }),
    [capaActiva, cambiarCapaActiva, abrirHilos],
  )

  // Botón del ribbon que corresponde a la herramienta activa, para que se vea
  // encendido mientras se usa.
  const botonesActivos = useMemo(() => {
    const porHerramienta: Partial<Record<MapTool, string[]>> = {
      conectividad: ["Conectividad fina"],
      sentido: ["Entradas y salidas"],
      cable: ["Cable"],
      "measure-length": ["Mediciones"],
      "measure-area": ["Mediciones"],
    }
    const botones = porHerramienta[tool] ?? []
    return capaActiva ? [...botones, "Activar capa"] : botones
  }, [tool, capaActiva])

  const handleCenterChange = useCallback((next: { lon: number; lat: number }) => {
    // Se redondea a ~100 m: evita relanzar la consulta por microdesplazamientos
    // y hace que sectores cercanos compartan la misma respuesta cacheada.
    setCenter({
      lon: Math.round(next.lon * 1000) / 1000,
      lat: Math.round(next.lat * 1000) / 1000,
    })
  }, [])

  // Resuelve el nombre del lugar que se está viendo. El retardo evita consultar
  // el servicio mientras el usuario sigue navegando.
  useEffect(() => {
    if (!center) return
    let cancelled = false

    const timeout = setTimeout(async () => {
      try {
        const res = await fetchConSesion(`/api/reverse-geocode?lon=${center.lon}&lat=${center.lat}`)
        if (cancelled) return
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          // Se conserva la última ubicación conocida; un aviso en pantalla por
          // cada movimiento del mapa sería ruido, así que queda en la consola.
          if (res.status !== 404) console.warn(`[ubicación] ${data?.message ?? `HTTP ${res.status}`}`)
          return
        }
        if (!cancelled && data?.label) setLocation(data.label as string)
      } catch (e) {
        // Si falla, se conserva la última ubicación conocida.
        console.warn("[ubicación] no se pudo consultar:", e)
      }
    }, 700)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [center])

  const handleToggleLayer = useCallback(
    (id: string) => {
      if (!esCapaEditable(id)) return
      // Ocultar la capa activa la desactiva: no se edita lo que no se ve.
      if (visible[id] && capaActiva === id) cambiarCapaActiva(null)
      setVisible((prev) => ({ ...prev, [id]: !prev[id] }))
    },
    [visible, capaActiva, cambiarCapaActiva],
  )

  const handleStatsChange = useCallback((stats: NetworkStats) => {
    setCounts(stats.counts)
    setTotalKm(stats.totalKm)
    setEnPantalla(stats.enPantalla)
    setBreakdown(stats.breakdown)
  }, [])

  const layers = [
    { id: "cabeceras", label: "Cabeceras", color: LAYER_COLORS.cabecera, count: counts.cabeceras, visible: visible.cabeceras, symbol: "cabecera" as const },
    { id: "nodes", label: "Cubiertas", color: LAYER_COLORS.node, count: counts.nodes, visible: visible.nodes, items: breakdown.nodes, activeItems: filters.nodes, symbol: "mufa" as const },
    { id: "fibers", label: "Tendido de fibra", color: LAYER_COLORS.fiber, count: counts.fibers, visible: visible.fibers, items: breakdown.fibers, activeItems: filters.fibers, symbol: "fibra" as const },
    { id: "zones", label: "Zonas", color: LAYER_COLORS.zone, count: counts.zones, visible: visible.zones, symbol: "zona" as const },
  ]

  return (
    <AuthGuard>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
        <DashboardHeader
          subtitle={location}
          onNavigate={handleNavigate}
          elementos={indice}
          onElegirElemento={handleElegirElemento}
          pedirFoco={pedirFocoBusqueda}
        />
        <DashboardRibbon actions={ribbonActions} activos={botonesActivos} />
        <div className="flex flex-1 overflow-hidden">
          <DashboardSidebar
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onToggleItem={handleToggleItem}
            onClearItems={handleClearItems}
            onZoomLayer={handleZoomLayer}
            totalKm={totalKm}
            enPantalla={enPantalla}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            loading={loadingData}
            capaActiva={capaActiva}
            onSelectCapa={handleSelectCapa}
            pedirCapa={pedirCapa}
          />
          <main id="map-panel" className="relative flex-1 overflow-hidden">
            <NetworkMap
              visible={visible}
              onStatsChange={handleStatsChange}
              onCenterChange={handleCenterChange}
              flyTo={flyTo}
              reloadTrigger={reloadTrigger}
              fitTo={fitTo}
              tool={tool}
              onToolChange={setTool}
              onLoadingChange={setLoadingData}
              filters={filters}
              capaActiva={capaActiva}
              onIndiceChange={setIndice}
              apiRef={mapaApiRef}
            />
            <GestionHilosDialog
              open={hilosAbierto}
              onOpenChange={setHilosAbierto}
              cable={cableHilos}
              onElegirCable={elegirCableParaHilos}
            />
            <RedesNodoDialog
              open={redesAbierto}
              onOpenChange={setRedesAbierto}
              nodos={nodosDeFibra}
              onUbicarNodo={ubicarNodo}
            />
            <ElementosAlimentadosDialog
              open={gponAbierto}
              onOpenChange={setGponAbierto}
              nodos={nodosDeFibra}
              nivel1={cubiertasNivel1}
              claveNodo={claveNodoGpon}
              onCambiarNodo={setClaveNodoGpon}
              claveNivel1={claveNivel1Gpon}
              onCambiarNivel1={setClaveNivel1Gpon}
              onUbicar={ubicarDesdeGpon}
              onElegirNodoEnMapa={elegirNodoGponEnMapa}
            />
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}