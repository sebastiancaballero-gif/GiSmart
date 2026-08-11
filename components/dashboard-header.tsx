"use client"

import { useState } from "react"
import { Search, LogOut, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { LogoutConfirmDialog } from "@/components/logout-confirm-dialog"

export function DashboardHeader({
  title = "Mapa de Red · Despliegue de Fibra",
  subtitle = "Valle del Cauca, Colombia",
}: {
  title?: string
  subtitle?: string
}) {
  const [logoutOpen, setLogoutOpen] = useState(false)

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
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar zona o dirección..."
            className="h-9 w-56 bg-background pl-9 pr-4 lg:w-64"
          />
        </div>

        <button
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