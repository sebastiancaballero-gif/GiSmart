"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Box,
  Building2,
  Crosshair,
  Hexagon,
  Loader2,
  LogOut,
  MapPin,
  Moon,
  Search,
  Spline,
  Sun,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { LogoutConfirmDialog } from "@/components/logout-confirm-dialog"
import { getCurrentTheme, toggleTheme } from "@/lib/theme"
import { fetchConSesion, getUser } from "@/lib/auth"
import {
  buscarElementos,
  leerCoordenada,
  textoDeCoordenada,
  type Coordenada,
  type ElementoBuscable,
  type TipoBuscable,
} from "@/lib/map/busqueda"
import { LAYER_COLORS } from "@/lib/network-colors"
import { Tooltip } from "@/components/ui/tooltip"

type SearchResult = { label: string; lat: number; lon: number }

/** Lo que se puede elegir en la lista: una coordenada, un elemento de la red o una dirección. */
type Opcion =
  | { tipo: "coordenada"; coordenada: Coordenada }
  | { tipo: "elemento"; elemento: ElementoBuscable }
  | { tipo: "direccion"; resultado: SearchResult }

const ICONO_DE_TIPO: Record<TipoBuscable, { icono: typeof Box; color: string }> = {
  node: { icono: Box, color: LAYER_COLORS.node },
  fiber: { icono: Spline, color: LAYER_COLORS.fiber },
  cabecera: { icono: Building2, color: LAYER_COLORS.cabecera },
  zone: { icono: Hexagon, color: LAYER_COLORS.zone },
}

/** Iniciales para el avatar: «Sebastián Caballero» → «SC», «dario» → «DA». */
function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase()
  return nombre.trim().slice(0, 2).toUpperCase()
}

export function DashboardHeader({
  title = "Mapa de Red · Despliegue de Fibra",
  subtitle = "Valle del Cauca, Colombia",
  backHref,
  onNavigate,
  elementos,
  onElegirElemento,
  pedirFoco = 0,
}: {
  title?: string
  subtitle?: string
  /** Si se pasa, muestra un botón para volver a esa ruta (p. ej. "/dashboard"). */
  backHref?: string
  /**
   * Se llama al elegir una dirección o una coordenada, para centrar el mapa
   * allí y marcar el punto con `etiqueta`.
   */
  onNavigate?: (target: { lon: number; lat: number; zoom?: number; etiqueta?: string }) => void
  /** Elementos de la red por los que también se puede buscar (ver lib/map/busqueda.ts). */
  elementos?: ElementoBuscable[]
  /** Se llama al elegir un elemento de la red en el buscador. */
  onElegirElemento?: (elemento: ElementoBuscable) => void
  /** Al cambiar, el buscador toma el foco (botón «Búsqueda» del ribbon). */
  pedirFoco?: number
}) {
  const router = useRouter()
  const [logoutOpen, setLogoutOpen] = useState(false)
  // El tema real lo aplica el script del layout antes del primer pintado; aquí
  // solo se sincroniza el icono después de montar, para no romper la hidratación.
  const [isDark, setIsDark] = useState(false)
  // Quién está conectado. Vive en el navegador (lo guarda el login), así que
  // se lee después de montar, igual que el tema.
  const [nombreUsuario, setNombreUsuario] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [openResults, setOpenResults] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  // Opción resaltada con las flechas; Enter elige esa.
  const [activa, setActiva] = useState(0)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // En pantallas angostas el buscador no cabe en la cabecera: se abre encima
  // del contenido con el botón de la lupa. Antes, en un celular no había forma
  // de buscar.
  const [buscadorMovil, setBuscadorMovil] = useState(false)
  // El botón «Búsqueda» del ribbon también lo abre. Se compara con el pedido
  // anterior durante el render (el patrón de React para ajustar estado cuando
  // cambia una prop), así el campo ya está a la vista cuando toma el foco.
  const [pedidoAtendido, setPedidoAtendido] = useState(pedirFoco)
  if (pedirFoco !== pedidoAtendido) {
    setPedidoAtendido(pedirFoco)
    setBuscadorMovil(true)
  }

  useEffect(() => {
    // El tema ya lo aplicó el script del layout sobre <html>; acá solo se lee
    // para saber qué icono mostrar, y el tema elegido solo existe en el
    // navegador, así que no hay forma de saberlo antes de montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(getCurrentTheme() === "dark")
    const usuario = getUser() as { nombre?: unknown; usuario?: unknown } | null
    const nombre = typeof usuario?.nombre === "string" ? usuario.nombre : typeof usuario?.usuario === "string" ? usuario.usuario : null
    setNombreUsuario(nombre && nombre.trim() ? nombre.trim() : null)
  }, [])

  // Busca direcciones mientras se escribe, con retardo para no consultar en
  // cada tecla. Todo el trabajo ocurre dentro del temporizador, incluido
  // limpiar los resultados: así teclear no provoca renders extra en cada
  // pulsación.
  useEffect(() => {
    let cancelled = false

    const timeout = setTimeout(async () => {
      const term = query.trim()
      // Una coordenada no se le pregunta a Nominatim: ya se sabe dónde es.
      if (term.length < 3 || leerCoordenada(term)) {
        setResults([])
        setSearchError(null)
        setSearching(false)
        return
      }

      setSearching(true)
      try {
        const res = await fetchConSesion(`/api/geocode?q=${encodeURIComponent(term)}`)
        const data = await res.json().catch(() => null)
        if (cancelled) return
        // Antes un fallo del servicio se leía como «Sin resultados.».
        if (!res.ok) {
          setResults([])
          setSearchError(`No se pudo buscar direcciones: ${data?.message ?? `el servidor respondió ${res.status}`}`)
          return
        }
        const found = (data?.results ?? []) as SearchResult[]
        setResults(found)
        setSearchError(found.length === 0 ? "Sin resultados." : null)
      } catch {
        if (!cancelled) setSearchError("No se pudo buscar direcciones. Revisa la conexión.")
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 450)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query])

  // Elementos de la red: se filtran aquí mismo, sin esperar ni preguntar a
  // nadie, así que aparecen desde la primera letra («3/4», «CO01»).
  const enLaRed = useMemo(() => buscarElementos(elementos ?? [], query), [elementos, query])
  const coordenada = useMemo(() => leerCoordenada(query), [query])

  const opciones: Opcion[] = useMemo(
    () => [
      ...(coordenada ? [{ tipo: "coordenada" as const, coordenada }] : []),
      ...enLaRed.map((elemento) => ({ tipo: "elemento" as const, elemento })),
      ...results.map((resultado) => ({ tipo: "direccion" as const, resultado })),
    ],
    [coordenada, enLaRed, results],
  )
  // Con elementos de la red a la vista, «Sin resultados» de direcciones sobra.
  const mensaje = !coordenada && enLaRed.length === 0 && results.length === 0 ? searchError : null
  const listaAbierta = openResults && query.trim() !== "" && (opciones.length > 0 || mensaje !== null)

  // Cierra la lista (y el buscador en pantallas angostas) al hacer click fuera.
  useEffect(() => {
    if (!openResults && !buscadorMovil) return
    function alHacerClickFuera(evt: MouseEvent) {
      if (searchBoxRef.current?.contains(evt.target as Node)) return
      setOpenResults(false)
      setBuscadorMovil(false)
    }
    document.addEventListener("mousedown", alHacerClickFuera)
    return () => document.removeEventListener("mousedown", alHacerClickFuera)
  }, [openResults, buscadorMovil])

  // Ctrl+K (o ⌘K) lleva al buscador desde cualquier parte del tablero.
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setBuscadorMovil(true)
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener("keydown", alPulsar)
    return () => window.removeEventListener("keydown", alPulsar)
  }, [])

  // El botón «Búsqueda» del ribbon también lo enfoca.
  useEffect(() => {
    if (!pedirFoco) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [pedirFoco])

  // Al abrirse en una pantalla angosta, el campo toma el foco solo. Solo al
  // abrirse: al cerrarse (después de elegir) no debe volver a enfocarse.
  useEffect(() => {
    if (buscadorMovil) inputRef.current?.focus()
  }, [buscadorMovil])

  function elegir(opcion: Opcion) {
    if (opcion.tipo === "elemento") {
      onElegirElemento?.(opcion.elemento)
      setQuery(opcion.elemento.nombre)
    } else if (opcion.tipo === "coordenada") {
      const texto = textoDeCoordenada(opcion.coordenada)
      // Una coordenada es un punto preciso: se acerca más que a una dirección.
      onNavigate?.({ ...opcion.coordenada, zoom: 18, etiqueta: texto })
      setQuery(texto)
    } else {
      const nombre = opcion.resultado.label.split(",")[0] ?? ""
      onNavigate?.({ lon: opcion.resultado.lon, lat: opcion.resultado.lat, etiqueta: nombre })
      setQuery(nombre)
    }
    setOpenResults(false)
    setBuscadorMovil(false)
    inputRef.current?.blur()
  }

  const idOpcion = (i: number) => `buscador-opcion-${i}`

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Volver al mapa"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Volver al mapa</span>
          </button>
        )}
        {/* `min-w-0` + `truncate`: el subtítulo lo escribe Nominatim según
            dónde esté el mapa, y nombres como "Corregimiento de San Antonio,
            La Unión, Valle del Cauca, Colombia" empujaban el buscador y los
            botones de la derecha. El texto completo queda en el `title`. */}
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-foreground">{title}</h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground" title={subtitle}>
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{subtitle}</span>
          </p>
        </div>
      </div>

      {/* `shrink-0`: el buscador y las acciones no ceden espacio al título. */}
      <div className="flex shrink-0 items-center gap-3">
        <div
          ref={searchBoxRef}
          className={`${
            buscadorMovil
              ? "fixed inset-x-3 top-16 z-50 block rounded-xl bg-card p-2 shadow-xl ring-1 ring-border animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none"
              : "hidden"
          } md:relative md:inset-auto md:top-auto md:z-auto md:block md:animate-none md:rounded-none md:bg-transparent md:p-0 md:shadow-none md:ring-0`}
        >
          <div className="relative flex items-center gap-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiva(0)
              setOpenResults(true)
            }}
            onFocus={() => setOpenResults(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && opciones.length > 0) {
                e.preventDefault()
                setOpenResults(true)
                setActiva((i) => (i + 1) % opciones.length)
              } else if (e.key === "ArrowUp" && opciones.length > 0) {
                e.preventDefault()
                setActiva((i) => (i - 1 + opciones.length) % opciones.length)
              } else if (e.key === "Enter" && opciones[activa]) {
                elegir(opciones[activa])
              } else if (e.key === "Escape") {
                setOpenResults(false)
                setBuscadorMovil(false)
              }
            }}
            placeholder="Buscar cubierta, cable, dirección o coordenada…"
            aria-label="Buscar cubierta, cable, dirección o coordenada"
            role="combobox"
            aria-expanded={listaAbierta}
            aria-controls="buscador-lista"
            aria-autocomplete="list"
            aria-activedescendant={listaAbierta && opciones[activa] ? idOpcion(activa) : undefined}
            // `text-ellipsis`: el texto de ayuda no cabe entero y se cortaba a
            // media letra detrás de «Ctrl K»; así termina en «…».
            className="h-9 w-full min-w-0 flex-1 bg-background pl-9 pr-14 text-ellipsis md:w-64 lg:w-80"
          />
          {searching ? (
            <Loader2 className="absolute right-12 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground md:right-3" />
          ) : (
            query === "" && (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-px font-sans text-[10px] font-medium text-muted-foreground md:block">
                Ctrl K
              </kbd>
            )
          )}
          {/* Solo en pantallas angostas: cerrar el buscador flotante. */}
          <button
            type="button"
            onClick={() => {
              setOpenResults(false)
              setBuscadorMovil(false)
            }}
            aria-label="Cerrar la búsqueda"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
          >
            <X className="size-4" />
          </button>
          </div>

          {listaAbierta && (
            <div className="absolute right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none md:w-96">
              <ul id="buscador-lista" role="listbox" aria-label="Resultados de la búsqueda" className="max-h-96 overflow-y-auto py-1">
                {opciones.map((opcion, i) => {
                  const primeraDireccion = opcion.tipo === "direccion" && (i === 0 || opciones[i - 1].tipo !== "direccion")
                  const primerElemento = opcion.tipo === "elemento" && (i === 0 || opciones[i - 1].tipo !== "elemento")
                  const clave =
                    opcion.tipo === "elemento"
                      ? opcion.elemento.clave
                      : opcion.tipo === "coordenada"
                        ? "coordenada"
                        : `${opcion.resultado.lat}-${opcion.resultado.lon}-${i}`
                  return (
                    <li key={clave}>
                      {opcion.tipo === "coordenada" && (
                        <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Coordenada
                        </p>
                      )}
                      {primerElemento && (
                        <p
                          className={`px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${
                            i > 0 ? "mt-1 border-t border-border pt-2" : ""
                          }`}
                        >
                          En la red
                        </p>
                      )}
                      {primeraDireccion && (
                        <p
                          className={`px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${
                            i > 0 ? "mt-1 border-t border-border pt-2" : ""
                          }`}
                        >
                          Direcciones
                        </p>
                      )}
                      <button
                        id={idOpcion(i)}
                        type="button"
                        role="option"
                        aria-selected={i === activa}
                        tabIndex={-1}
                        onMouseEnter={() => setActiva(i)}
                        onClick={() => elegir(opcion)}
                        className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs text-foreground outline-none transition ${
                          i === activa ? "bg-accent" : ""
                        }`}
                      >
                        {opcion.tipo === "coordenada" ? (
                          <>
                            <Crosshair className="mt-0.5 size-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-semibold">Ir a {textoDeCoordenada(opcion.coordenada)}</span>
                              <span className="truncate text-[11px] text-muted-foreground">Latitud, longitud · se marca en el mapa</span>
                            </span>
                          </>
                        ) : opcion.tipo === "elemento" ? (
                          (() => {
                            const { icono: Icono, color } = ICONO_DE_TIPO[opcion.elemento.tipo]
                            return (
                              <>
                                <Icono className="mt-0.5 size-3.5 shrink-0" style={{ color }} aria-hidden="true" />
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate font-semibold">{opcion.elemento.nombre}</span>
                                  <span className="truncate text-[11px] text-muted-foreground">{opcion.elemento.detalle}</span>
                                </span>
                              </>
                            )
                          })()
                        ) : (
                          <>
                            <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                            <span className="line-clamp-2">{opcion.resultado.label}</span>
                          </>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {mensaje && <p className="px-3 py-2.5 text-xs text-muted-foreground">{mensaje}</p>}
              {searching && opciones.length > 0 && (
                <p className="flex items-center gap-1.5 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Buscando direcciones…
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setBuscadorMovil(true)}
          aria-label="Buscar"
          aria-expanded={buscadorMovil}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
        >
          <Search className="size-4" />
        </button>

        <Tooltip label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} side="bottom">
          <button
            type="button"
            onClick={() => setIsDark(toggleTheme() === "dark")}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </Tooltip>

        {nombreUsuario && (
          <div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex" title={`Conectado como ${nombreUsuario}`}>
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold tracking-wide text-primary-foreground shadow-sm"
            >
              {iniciales(nombreUsuario)}
            </span>
            <span className="hidden max-w-[10rem] flex-col leading-tight lg:flex">
              <span className="truncate text-sm font-semibold text-foreground">{nombreUsuario}</span>
              <span className="text-[11px] text-muted-foreground">Sesión activa</span>
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>

      <LogoutConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </header>
  )
}
