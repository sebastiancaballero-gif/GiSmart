"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * Etiqueta emergente sobre un control.
 *
 * Sustituye al atributo `title` del navegador, que la interfaz usaba en 29
 * sitios. Ese tiene tres problemas para una aplicación como esta: tarda cerca
 * de un segundo en salir, se pinta con el estilo del sistema operativo (un
 * recuadro claro que desentona con el tema oscuro) y **no existe en pantallas
 * táctiles**, donde media barra de herramientas queda sin explicación.
 *
 * Se apoya en Base UI, que ya venía instalado con los componentes de shadcn:
 * de sus más de cuarenta primitivas el proyecto solo envolvía seis. No hace
 * falta ninguna librería nueva.
 */
function TooltipProvider({
  delay = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  // 300 ms: lo justo para no saltar al pasar el ratón de largo. Una vez que
  // uno se abre, los siguientes salen al instante (`closeDelay`), que es lo
  // que hace cómodo recorrer una barra de ocho herramientas.
  return <TooltipPrimitive.Provider delay={delay} closeDelay={100} {...props} />
}

/**
 * Envuelve un control y le pone su etiqueta.
 *
 * `render` monta el disparador sobre el hijo en vez de añadir otro elemento,
 * así el botón conserva sus clases y su comportamiento.
 */
function Tooltip({
  children,
  label,
  side = "right",
}: {
  children: React.ReactElement<Record<string, unknown>>
  /** Texto de la etiqueta. Si viene vacío, no se envuelve nada. */
  label?: string
  side?: "top" | "right" | "bottom" | "left"
}) {
  if (!label) return children

  // El retardo se configura en `TooltipProvider`, que va en el layout: en esta
  // versión de Base UI la raíz no lo acepta.
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={8}>
          <TooltipPrimitive.Popup
            className={cn(
              "z-50 max-w-56 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md",
              "transition-[opacity,transform] duration-150",
              "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
              "data-[starting-style]:scale-95 data-[ending-style]:scale-95",
            )}
          >
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider }
