"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />
}

function DialogBackdrop({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[ending-style]:ease-in",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showClose = true,
  large = false,
  sinFondo = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup> & {
  showClose?: boolean
  large?: boolean
  /**
   * Sin el fondo oscuro: para ventanas que acompañan al mapa (con `modal` en
   * falso en la raíz) y tienen que dejar ver lo que se pinta en él.
   */
  sinFondo?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      {!sinFondo && <DialogBackdrop />}
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Entra subiendo un poco y con una curva que frena al final, como las
          // tarjetas del login; sale más rápido, para no hacer esperar a quien
          // ya terminó. Antes entraba y salía igual, con solo un leve zoom.
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card shadow-xl ring-1 ring-border",
          "transition-[opacity,scale,translate] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          "data-[starting-style]:translate-y-[calc(-50%_+_10px)] data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
          "data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-120 data-[ending-style]:ease-in",
          // Los pequeños (confirmar, ayuda, ficha de información) llevan
          // arriba la franja de la marca, como el login y las ventanas con
          // `EncabezadoVentana`, que pintan la suya en el mismo lugar. Va de
          // fondo para que la recorte la esquina redondeada.
          large
            ? "h-[70vh] w-[70vw] min-h-[460px] min-w-[560px] overflow-hidden"
            : "w-full max-w-sm bg-[linear-gradient(90deg,#2a9bc4,#6fc5df,#2f6d9e)] bg-[length:100%_4px] bg-no-repeat p-6",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("mt-1.5 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Dialog, DialogContent, DialogTitle, DialogDescription }
