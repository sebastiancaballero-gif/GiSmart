"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { DashboardRibbon } from "@/components/dashboard-ribbon"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { NetworkMap, type AccesoAlMapa, type MapaApi } from "@/components/network-map"
import { GestionHilosDialog } from "@/components/gestion-hilos-dialog"
import { RedesNodoDialog } from "@/components/redes-nodo-dialog"
import { ElementosAlimentadosDialog } from "@/components/elementos-alimentados-dialog"
import { VentanasDePlanta, type ManejadorDeVentanasDePlanta, type VentanaDePlanta } from "@/components/planta"
import type { ManejadorDeVentana } from "@/components/ventana-sig"
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
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; zoom?: number; etiqueta?: string; nonce: number } | null>(
    null,
  )
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

  // Ventanas de Red de fibra (Hilos, Redes/Nodo, GPON). Cada una lleva su
  // propio estado; el tablero solo las abre desde el ribbon y les da acceso al
  // mapa (`accesoAlMapa`, más abajo). Una ventana nueva es un ref más aquí.
  const hilosRef = useRef<ManejadorDeVentana>(null)
  const redesRef = useRef<ManejadorDeVentana>(null)
  const gponRef = useRef<ManejadorDeVentana>(null)
  // Las de planta interna y externa (Puertos OLT, Inventario, OLT-ODF…) van
  // juntas: el ribbon dice cuál abrir.
  const plantaRef = useRef<ManejadorDeVentanasDePlanta>(null)

  // Elegir un elemento en el buscador lo centra y abre su ficha. Si su capa
  // estaba oculta se muestra: si no, se enfocaría algo que no se ve. Lo mismo
  // con el filtro de categorías del panel: si lo deja fuera, se le suma su
  // categoría. Antes «Ubicar» en GPON iba hasta una cubierta de primer nivel
  // que no se veía porque el filtro mostraba solo las de segundo.
  const handleElegirElemento = useCallback((elemento: ElementoBuscable) => {
    const capa = ({ node: "nodes", fiber: "fibers", cabecera: "cabeceras", zone: "zones" } as const)[elemento.tipo]
    setVisible((prev) => ({ ...prev, [capa]: true }))
    const categoria = elemento.categoria
    if ((capa === "nodes" || capa === "fibers") && categoria) {
      setFilters((prev) =>
        prev[capa].length > 0 && !prev[capa].includes(categoria) ? { ...prev, [capa]: [...prev[capa], categoria] } : prev,
      )
    }
    mapaApiRef.current?.enfocarElemento(elemento.clave)
  }, [])

  // Las ventanas llevan el mapa a un elemento igual que el buscador.
  const ubicarElemento = useCallback(
    (clave: string) => {
      const elemento = indice.find((e) => e.clave === clave)
      if (!elemento) return false
      handleElegirElemento(elemento)
      return true
    },
    [indice, handleElegirElemento],
  )
  const accesoAlMapa = useMemo<AccesoAlMapa>(
    () => ({
      indice,
      api: mapaApiRef,
      ubicar: ubicarElemento,
      mostrarCapa: (capa) => setVisible((prev) => ({ ...prev, [capa]: true })),
    }),
    [indice, ubicarElemento],
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

  const handleNavigate = useCallback((target: { lon: number; lat: number; zoom?: number; etiqueta?: string }) => {
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
      onHilos: () => hilosRef.current?.abrir(),
      onRedesNodo: () => redesRef.current?.abrir(),
      onGpon: () => gponRef.current?.abrir(),
      onVentana: (ventana: VentanaDePlanta) => plantaRef.current?.abrir(ventana),
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
    [capaActiva, cambiarCapaActiva],
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
        {/* Entrada escalonada al llegar del login: arriba la cabecera y el
            ribbon, luego el panel de capas y el mapa (ver `gismart-baja` en
            globals.css). Antes todo aparecía de golpe. */}
        <div className="gismart-baja shrink-0">
          <DashboardHeader
            subtitle={location}
            onNavigate={handleNavigate}
            elementos={indice}
            onElegirElemento={handleElegirElemento}
            pedirFoco={pedirFocoBusqueda}
          />
        </div>
        <div className="gismart-baja shrink-0" style={{ "--retraso": "70ms" } as React.CSSProperties}>
          <DashboardRibbon actions={ribbonActions} activos={botonesActivos} />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="gismart-desde-izquierda flex shrink-0" style={{ "--retraso": "140ms" } as React.CSSProperties}>
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
          </div>
          <main
            id="map-panel"
            className="gismart-fundido relative flex-1 overflow-hidden"
            style={{ "--retraso": "100ms" } as React.CSSProperties}
          >
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
            <GestionHilosDialog ref={hilosRef} mapa={accesoAlMapa} />
            <RedesNodoDialog ref={redesRef} mapa={accesoAlMapa} />
            <ElementosAlimentadosDialog ref={gponRef} mapa={accesoAlMapa} />
            <VentanasDePlanta ref={plantaRef} mapa={accesoAlMapa} />
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}