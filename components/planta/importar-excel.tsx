"use client"

import { useState } from "react"
import { FileDown, FileUp, FolderOpen, Grid3x3, Highlighter, ListChecks, Pin, ZoomIn } from "lucide-react"
import { BarraDeAvance, Boton, BotonIcono, Campo, Grilla, Opciones, Pestanas, Rotulo, type Columna } from "@/components/ventana-sig"
import { MarcoDePlanta, useVentana, type PropsDeVentana } from "@/components/planta/piezas"

/**
 * «Cargue y grabación de datos de un archivo Excel de conectividades» (ribbon:
 * Red de fibra → Cross conn.), como la del SIG anterior: se elige el elemento y
 * el archivo, el tipo de conectividad que trae (empalme, OLT-ODF, ODF-ODF u
 * ODF-cable), se valida y se importa. La pestaña «Archivo» muestra lo leído y
 * «Errores» lo que no pasó la validación.
 *
 * Solo la vista. En el SIG anterior la grilla del archivo tomaba las columnas
 * del propio Excel («Column1», «Column2»…); aquí van las letras de la hoja
 * hasta que haya archivo. «Cubiertas de empalme» venía apagada y sigue así.
 */

type Tipo = "cubiertas" | "empalme" | "olt-odf" | "odf-odf" | "odf-cab"
type PestanaId = "archivo" | "errores"

const COLUMNAS: Record<PestanaId, Columna[]> = {
  archivo: [
    { titulo: "Fila", ancho: "min-w-14" },
    { titulo: "A", ancho: "min-w-32" },
    { titulo: "B", ancho: "min-w-32" },
    { titulo: "C", ancho: "min-w-32" },
    { titulo: "D", ancho: "min-w-32" },
  ],
  errores: [
    { titulo: "Fila", ancho: "min-w-14" },
    { titulo: "Columna", ancho: "min-w-24" },
    { titulo: "Error", ancho: "min-w-72" },
  ],
}

export function VentanaImportarExcel({ open, onOpenChange }: PropsDeVentana) {
  const [tipo, setTipo] = useState<Tipo>("empalme")
  const [alcance, setAlcance] = useState<"seleccionado" | "todos">("seleccionado")
  const [pestana, setPestana] = useState<PestanaId>("archivo")
  const v = useVentana(onOpenChange, "Elige el elemento con el pin y el archivo de Excel con las conectividades.")

  return (
    <MarcoDePlanta
      open={open}
      onOpenChange={v.cerrar}
      icono={Grid3x3}
      titulo="Cargue y grabación de datos de un archivo Excel de conectividades"
      descripcion="Importa desde Excel la conectividad de un elemento: empalmes, OLT-ODF, ODF-ODF u ODF-cable."
      ancho="62rem"
      barra={v.barra}
      pie={<BarraDeAvance />}
    >
      {/* Elemento y archivo */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
          <BotonIcono pendiente icono={Pin} etiqueta="Elegir el elemento" onClick={() => v.pendiente("Elegir el elemento")} />
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Rotulo>Elemento</Rotulo>
            <Campo etiqueta="Elemento" valor={null} guia="Sin elegir" ancho="w-full" mono={false} />
          </div>
          <div className="flex min-w-36 flex-col gap-1 sm:w-56">
            <Rotulo>Tipo de elemento</Rotulo>
            <Campo etiqueta="Tipo de elemento" valor={null} guia="—" ancho="w-full" mono={false} />
          </div>
          <span className="hidden flex-1 lg:block" />
          <Boton pendiente icono={Highlighter} onClick={() => v.pendiente("Resaltar")}>
            Resaltar
          </Boton>
          <Boton pendiente icono={ZoomIn} onClick={() => v.pendiente("Zoom")}>
            Zoom
          </Boton>
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
          <BotonIcono pendiente icono={FolderOpen} etiqueta="Abrir el archivo de Excel" onClick={() => v.pendiente("Abrir el archivo de Excel")} />
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Rotulo>Archivo</Rotulo>
            <Campo etiqueta="Archivo" valor={null} guia="Ningún archivo elegido" ancho="w-full" mono={false} />
          </div>
          <div className="flex min-w-36 flex-col gap-1 sm:w-56">
            <Rotulo>Hoja</Rotulo>
            <Campo etiqueta="Hoja" valor={null} guia="—" ancho="w-full" mono={false} />
          </div>
        </div>
      </div>

      {/* Qué se importa y qué hacer con el archivo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-sm">
        <span className="text-xs font-bold text-foreground">Importar Excel…</span>
        <Opciones
          etiqueta="Qué conectividad trae el archivo"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            { id: "cubiertas", texto: "Cubiertas de empalme", deshabilitada: true, titulo: "Todavía no disponible" },
            { id: "empalme", texto: "Empalme" },
            { id: "olt-odf", texto: "OLT-ODF" },
            { id: "odf-odf", texto: "ODF-ODF" },
            { id: "odf-cab", texto: "ODF-CAB" },
          ]}
        />
        {/* Los tres van juntos: si no caben al lado de las opciones, bajan en
            grupo y a la derecha, en vez de quedar «Exportar» solo abajo. */}
        <div className="ml-auto flex flex-wrap gap-2">
          <Boton pendiente icono={ListChecks} onClick={() => v.pendiente("Validar")}>
            Validar
          </Boton>
          <Boton pendiente icono={FileUp} onClick={() => v.pendiente("Importar")}>
            Importar
          </Boton>
          <Boton pendiente icono={FileDown} colorIcono="text-emerald-600" onClick={() => v.pendiente("Exportar")}>
            Exportar
          </Boton>
        </div>
      </div>

      {/* A la izquierda, los elementos del archivo; a la derecha, lo leído y los errores. */}
      <div className="grid gap-3 md:grid-cols-[16rem_1fr]">
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground">Elementos del archivo</div>
          <div className="min-h-32 flex-1" role="list" aria-label="Elementos del archivo" />
          <div className="border-t border-border px-2.5 py-2">
            <Opciones
              etiqueta="Sobre qué elementos"
              valor={alcance}
              onChange={setAlcance}
              opciones={[
                { id: "seleccionado", texto: "Seleccionado" },
                { id: "todos", texto: "Todos" },
              ]}
            />
          </div>
        </div>

        <Pestanas
          etiqueta="Contenido del archivo"
          valor={pestana}
          onChange={setPestana}
          pestanas={[
            { id: "archivo", titulo: "Archivo" },
            { id: "errores", titulo: "Errores" },
          ]}
        >
          <Grilla
            marco={false}
            etiqueta={pestana === "archivo" ? "Contenido del archivo" : "Errores de validación"}
            columnas={COLUMNAS[pestana]}
            alto="h-[min(18rem,32vh)]"
          />
        </Pestanas>
      </div>
    </MarcoDePlanta>
  )
}
