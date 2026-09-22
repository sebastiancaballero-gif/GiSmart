"use client"

import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * Pregunta de confirmación antes de una acción: «¿seguro que quieres…?».
 *
 * Cerrarlo de cualquier forma que no sea el botón de confirmar (Cancelar, la
 * equis, Esc o un click fuera) cuenta como cancelar. Así quien lo usa solo
 * tiene que atender dos salidas, y no hay forma de cerrarlo que deje la acción
 * a medias.
 *
 * Tiene el mismo aspecto que el de cerrar sesión: icono en un círculo, título,
 * explicación y los botones abajo a la derecha.
 */
export function ConfirmDialog({
  open,
  titulo,
  descripcion,
  textoConfirmar,
  icono: Icono,
  onConfirmar,
  onCancelar,
}: {
  open: boolean
  titulo: string
  descripcion: React.ReactNode
  textoConfirmar: string
  icono: LucideIcon
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onCancelar()}>
      <DialogContent>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icono className="size-5" />
          </span>
          <div>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {/* Cancelar va primero y es lo que recibe el foco al abrir: un Enter
              distraído no debe confirmar una acción que se está preguntando. */}
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirmar}>
            <Icono className="size-3.5" />
            {textoConfirmar}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
