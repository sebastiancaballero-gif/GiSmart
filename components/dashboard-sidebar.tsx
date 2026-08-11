"use client"

import { useState } from "react"
import {
  Map as MapIcon,
  Eye,
  EyeOff,
  Ruler,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  AlertTriangle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"

type LayerDef = {
  id: string
  label: string
  color: string
  count: number
  visible: boolean
}

type DashboardSidebarProps = {
  layers: LayerDef[]
  onToggleLayer: (id: string) => void
  onClearAll: () => void
  totalKm: number
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function DashboardSidebar({
  layers,
  onToggleLayer,
  onClearAll,
  totalKm,
  collapsed = false,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleConfirmClear() {
    onClearAll()
    setConfirmOpen(false)
  }

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-r border-border bg-card py-3">
        <button
          onClick={onToggleCollapse}
          className="mb-3 rounded-lg p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          title="Expandir panel de capas"
          aria-label="Expandir panel de capas"
        >
          <ChevronRight className="size-5" />
        </button>
        {layers.map((l) => (
          <button
            key={l.id}
            onClick={() => onToggleLayer(l.id)}
            title={l.label}
            aria-label={l.label}
            aria-pressed={l.visible}
            className={`mb-1.5 rounded-lg p-1.5 outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${l.visible ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"}`}
          >
            <span
              className="block size-4 rounded-full ring-2 ring-white"
              style={{ backgroundColor: l.color }}
            />
          </button>
        ))}
      </aside>
    )
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <MapIcon className="size-[18px]" />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-foreground">GiSmart</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              SIG · Red FTTH
            </p>
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          title="Contraer panel"
          aria-label="Contraer panel"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {/* Capas */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Layers className="size-4 text-primary" />
          Capas de red
        </div>

        <div className="space-y-1">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-accent"
            >
              <span
                className="size-3.5 shrink-0 rounded-full ring-2 ring-white shadow-sm"
                style={{ backgroundColor: layer.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {layer.label}
              </span>
              <Badge variant="secondary" className="tabular-nums">
                {layer.count}
              </Badge>
              <button
                onClick={() => onToggleLayer(layer.id)}
                className="rounded-md p-1 text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                title={layer.visible ? "Ocultar" : "Mostrar"}
                aria-label={layer.visible ? `Ocultar ${layer.label}` : `Mostrar ${layer.label}`}
              >
                {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-3 rounded-lg bg-secondary px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-secondary-foreground">
            <Ruler className="size-3.5 text-primary" />
            <span>Fibra total</span>
            <span className="ml-auto font-bold tabular-nums text-primary">
              {totalKm.toFixed(2)} km
            </span>
          </div>
        </div>

        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 py-2 text-xs font-semibold text-destructive outline-none transition hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Trash2 className="size-3.5" />
          Limpiar todo
        </button>
      </div>

      {/* Footer info */}
      <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
        <p>Sistema de Información Geográfica</p>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <DialogTitle>¿Limpiar todas las capas?</DialogTitle>
              <DialogDescription>
                Se eliminarán todas las mufas, la fibra trazada y las zonas de cobertura del mapa. Esta acción no se puede deshacer.
              </DialogDescription>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmClear}>
              <Trash2 className="size-3.5" />
              Limpiar todo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}