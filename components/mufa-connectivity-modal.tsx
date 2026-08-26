"use client"

import dynamic from "next/dynamic"
import { Loader2, X } from "lucide-react"

import type { MufaCampoJSON } from "@/lib/schematic/mufa-field-data"
import { Dialog, DialogContent } from "@/components/ui/dialog"

// JointJS depende del DOM al cargarse, por lo que el esquema se importa sólo
// en el cliente (igual que en app/dashboard/mufa/page.tsx).
const MufaSchematic = dynamic(
  () => import("@/components/mufa-schematic").then((mod) => mod.MufaSchematic),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">Cargando esquema de la mufa...</p>
        </div>
      </div>
    ),
  },
)

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  schema: MufaCampoJSON | null
}

export function MufaConnectivityModal({ open, onOpenChange, schema }: Props) {
  if (!schema) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent large showClose={false} className="p-0">
        <div className="flex size-full flex-col">
          <div className="flex shrink-0 items-center justify-end border-b border-border px-3 py-1.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Cerrar y volver al mapa"
            >
              <X className="size-4" />
              Cerrar
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <MufaSchematic datos={schema} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
