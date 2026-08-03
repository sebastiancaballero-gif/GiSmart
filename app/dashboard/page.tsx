import { Search, MapPin } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { NetworkMap } from "@/components/network-map"
import { AuthGuard } from "@/components/auth-guard"
import { LogoutButton } from "@/components/logout-button"

export default function DashboardPage() {
  return (
    <AuthGuard>
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-5 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-foreground">Mapa de Red · Despliegue de Fibra</h1>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              Valle del Cauca, Colombia
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Buscar zona o dirección..."
                className="w-64 rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <LogoutButton />
          </div>
        </header>

        {/* Área principal: mapa a pantalla completa */}
        <main className="relative min-h-0 flex-1">
          <NetworkMap />
        </main>
      </div>
    </div>
    </AuthGuard>
  )
}
