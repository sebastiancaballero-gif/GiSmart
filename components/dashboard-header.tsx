"use client"

import { Search, LogOut, MapPin } from "lucide-react"
import { useRouter } from "next/navigation"
import { clearSession } from "@/lib/auth"

export function DashboardHeader({
  title = "Mapa de Red · Despliegue de Fibra",
  subtitle = "Valle del Cauca, Colombia",
}: {
  title?: string
  subtitle?: string
}) {
  const router = useRouter()

  function handleLogout() {
    clearSession()
    router.replace("/")
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div>
        <h1 className="text-base font-bold text-foreground">{title}</h1>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" />
          {subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar zona o dirección..."
            className="h-8 w-64 rounded-lg border border-input bg-background pl-9 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-accent"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  )
}