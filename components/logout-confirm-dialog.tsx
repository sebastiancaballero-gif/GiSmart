"use client"

import { LogOut } from "lucide-react"
import { logout } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogoutConfirmDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <LogOut className="size-5" />
          </span>
          <div>
            <DialogTitle>¿Cerrar sesión?</DialogTitle>
            <DialogDescription>
              Vas a salir del sistema. Las mufas, la fibra y las zonas que hayas dibujado y no estén guardadas se perderán.
            </DialogDescription>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={logout}>
            <LogOut className="size-3.5" />
            Salir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
