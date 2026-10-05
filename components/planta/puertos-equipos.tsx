"use client"

import { useState } from "react"
import { BarChart3, Save, SkipForward } from "lucide-react"
import { BotonIcono, Campo, Grilla, Grupo, Pestanas, type Columna } from "@/components/ventana-sig"
import { MarcoDePlanta, SeleccionDeEquipo, useVentana, VacioPendiente, type PropsDeVentana } from "@/components/planta/piezas"

/**
 * «Gestión de puertos de equipos» (ribbon: Red de fibra → Puertos OLT), como
 * la del SIG anterior: los puertos de las OLT y de los ODF de un elemento, en
 * dos pestañas, y abajo la potencia real y la nota del puerto elegido.
 *
 * Solo la vista. Las columnas de la pestaña ODF no se veían en la captura del
 * SIG anterior; se tomaron las de la OLT sin tarjeta, y se ajustan a lo que
 * devuelva la función de la base.
 */

type PestanaId = "olt" | "odf"

const COLUMNAS: Record<PestanaId, Columna[]> = {
  olt: [
    { titulo: "Rack OLT", ancho: "min-w-32" },
    { titulo: "OLT", ancho: "min-w-20" },
    { titulo: "Tarjeta", ancho: "min-w-16" },
    { titulo: "Puerto", ancho: "min-w-16" },
    { titulo: "Estado de uso", ancho: "min-w-28" },
    { titulo: "Destino de conexión", ancho: "min-w-44" },
  ],
  odf: [
    { titulo: "Rack ODF", ancho: "min-w-32" },
    { titulo: "ODF", ancho: "min-w-20" },
    { titulo: "Puerto", ancho: "min-w-16" },
    { titulo: "Estado de uso", ancho: "min-w-28" },
    { titulo: "Destino de conexión", ancho: "min-w-44" },
  ],
}

export function VentanaPuertosDeEquipos({ open, onOpenChange }: PropsDeVentana) {
  const [pestana, setPestana] = useState<PestanaId>("olt")
  const v = useVentana(onOpenChange, "Elige el elemento con el pin para ver los puertos de sus OLT y sus ODF.")
  const equipo = pestana === "olt" ? "OLT" : "ODF"

  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={BarChart3}
      titulo="Gestión de puertos de equipos"
      descripcion="Puertos de las OLT y los ODF de un elemento, con su estado de uso."
      barra={v.barra}
    >
      <SeleccionDeEquipo
        campos={["Puertos del elemento"]}
        elegir="Elegir el elemento"
        onElegir={() => v.pendiente("Elegir el elemento")}
        onExportar={() => v.avisar("No hay datos para exportar.")}
      >
        <BotonIcono pendiente icono={SkipForward} etiqueta="Cargar los puertos" onClick={() => v.pendiente("Cargar los puertos")} />
      </SeleccionDeEquipo>

      <Pestanas
        etiqueta="Equipos del elemento"
        valor={pestana}
        onChange={setPestana}
        pestanas={[
          { id: "olt", titulo: "OLT" },
          { id: "odf", titulo: "ODF" },
        ]}
      >
        <Grilla
          marco={false}
          etiqueta={`Puertos de ${equipo}`}
          columnas={COLUMNAS[pestana]}
          vacio={<VacioPendiente como="Al elegir el elemento" queMuestra={`los puertos de sus ${equipo} con su estado de uso`} />}
        />
      </Pestanas>

      {/* Apagado hasta elegir un puerto de la grilla, como en el SIG anterior. */}
      <Grupo titulo="Datos del puerto">
        <div className="flex flex-wrap items-end gap-3" title="Elige primero un puerto de la tabla">
          <div className="grid min-w-0 flex-1 gap-x-5 gap-y-2 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Potencia real (dBm)</span>
              <Campo etiqueta="Potencia real (dBm)" valor={null} guia="—" ancho="w-28" chico />
              <input
                disabled
                aria-label="Nueva potencia real (dBm)"
                placeholder="Nuevo valor"
                className="h-8 w-28 rounded-lg border border-input bg-card px-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:bg-muted/50"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Nota del usuario</span>
              <Campo etiqueta="Nota del usuario" valor={null} guia="—" ancho="w-full" chico mono={false} />
              <input
                disabled
                aria-label="Nueva nota del usuario"
                placeholder="Nuevo valor"
                className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:bg-muted/50"
              />
            </div>
          </div>
          <BotonIcono pendiente icono={Save} etiqueta="Guardar los cambios del puerto" onClick={() => v.pendiente("Guardar los cambios del puerto")} />
        </div>
      </Grupo>
    </MarcoDePlanta>
  )
}
