"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Search, LogOut, MapPin, Sun, Moon, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { LogoutConfirmDialog } from "@/components/logout-confirm-dialog"
import { getCurrentTheme, toggleTheme } from "@/lib/theme"

type SearchResult = { label: string; lat: number; lon: number }

export function DashboardHeader({
  title = "Mapa de Red · Despliegue de Fibra",
  subtitle = "Valle del Cauca, Colombia",
  backHref,
  onNavigate,
}: {
  title?: string
  subtitle?: string
  /** Si se pasa, muestra un botón para volver a esa ruta (p. ej. "/dashboard"). */
  backHref?: string
  /** Se llama al elegir un resultado del buscador, para centrar el mapa allí. */
  onNavigate?: (target: { lon: number; lat: number }) => void
}) {
  const router = useRouter()
  const [logoutOpen, setLogoutOpen] = useState(false)
  // El tema real lo aplica el script del layout antes del primer pintado; aquí
  // solo se sincroniza el icono después de montar, para no romper la hidratación.
  const [isDark, setIsDark] = useState(false)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [openResults, setOpenResults] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsDark(getCurrentTheme() === "dark")
  }, [])

  // Busca mientras se escribe, con retardo para no consultar en cada tecla.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 3) {
      setResults([])
      setSearchError(null)
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`)
        const data = await res.json()
        if (cancelled) return
        const found = (data?.results ?? []) as SearchResult[]
        setResults(found)
        setSearchError(found.length === 0 ? "Sin resultados." : null)
        setOpenResults(true)
      } catch {
        if (!cancelled) setSearchError("No se pudo buscar. Revisa la conexión.")
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 450)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query])

  // Cierra la lista al hacer click fuera del buscador.
  useEffect(() => {
    if (!openResults) return
    function alHacerClickFuera(evt: MouseEvent) {
      if (!searchBoxRef.current?.contains(evt.target as Node)) setOpenResults(false)
    }
    document.addEventListener("mousedown", alHacerClickFuera)
    return () => document.removeEventListener("mousedown", alHacerClickFuera)
  }, [openResults])

  function elegirResultado(result: SearchResult) {
    onNavigate?.({ lon: result.lon, lat: result.lat })
    setOpenResults(false)
    setQuery(result.label.split(",")[0] ?? "")
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-3">
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
        <div>
          <h1 className="text-base font-bold text-foreground">{title}</h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div ref={searchBoxRef} className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpenResults(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) elegirResultado(results[0])
              if (e.key === "Escape") setOpenResults(false)
            }}
            placeholder="Buscar municipio o zona..."
            aria-label="Buscar municipio o zona"
            className="h-9 w-56 bg-background pl-9 pr-9 lg:w-64"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}

          {openResults && (results.length > 0 || searchError) && (
            <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              {searchError && results.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-muted-foreground">{searchError}</p>
              ) : (
                <ul>
                  {results.map((r, i) => (
                    <li key={`${r.lat}-${r.lon}-${i}`}>
                      <button
                        type="button"
                        onClick={() => elegirResultado(r)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-foreground outline-none transition hover:bg-accent focus-visible:bg-accent"
                      >
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        <span className="line-clamp-2">{r.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsDark(toggleTheme() === "dark")}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

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