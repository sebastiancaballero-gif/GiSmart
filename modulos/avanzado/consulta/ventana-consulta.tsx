"use client"

import { useId, useMemo, useState } from "react"
import { Filter, Plus, Trash2, X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { BarraDeEstado, Boton, EncabezadoVentana, Opciones, Rotulo, claseSelect } from "@/components/ventana-sig"
import type { ElementoDelMapa, MapaApi } from "@/components/network-map"
import { NOMBRE_DE_CAPA_TABLA, columnasDe, nombresPorId, textoDeCelda, valorDeCelda, type CapaDeTabla } from "../tabla/columnas"
import {
  OPERADORES,
  condicionCompleta,
  describirConsulta,
  evaluarConsulta,
  type Condicion,
  type Consulta,
  type ModoDeSeleccion,
} from "./consulta"

const MODOS: { id: ModoDeSeleccion; texto: string }[] = [
  { id: "nueva", texto: "Nueva selección" },
  { id: "agregar", texto: "Sumar a la selección" },
  { id: "quitar", texto: "Quitar de la selección" },
  { id: "dentro", texto: "Seleccionar dentro de la selección" },
]

export type ResultadoDeConsulta = { consulta: Consulta; descripcion: string; claves: string[]; modo: ModoDeSeleccion }

/**
 * «Seleccionar por atributos»: se arman condiciones de campo, operador y
 * valor y la ventana dice cuántos coinciden antes de aplicar. Al aplicar, lo
 * que coincide queda seleccionado (resaltado en el mapa y marcado en la tabla).
 */
export function VentanaConsulta({
  open,
  onOpenChange,
  mapa,
  capaInicial,
  haySeleccion,
  onAplicar,
}: {
  open: boolean
  onOpenChange: (abierta: boolean) => void
  mapa: { current: MapaApi | null }
  capaInicial: CapaDeTabla
  /** Si ya hay algo seleccionado: solo entonces tienen sentido sumar, quitar o filtrar dentro. */
  haySeleccion: boolean
  onAplicar: (resultado: ResultadoDeConsulta) => void
}) {
  const id = useId()
  const [elementos, setElementos] = useState<ElementoDelMapa[]>([])
  const [capa, setCapa] = useState<CapaDeTabla>(capaInicial)
  const [union, setUnion] = useState<"y" | "o">("y")
  const [modo, setModo] = useState<ModoDeSeleccion>("nueva")
  const [condiciones, setCondiciones] = useState<Condicion[]>([])

  // Al abrir: los datos de ese momento y la capa de la tabla.
  const [abiertaAntes, setAbiertaAntes] = useState(false)
  if (open !== abiertaAntes) {
    setAbiertaAntes(open)
    if (open) {
      setElementos(mapa.current?.elementosDelMapa({ conPropiedades: true }).elementos ?? [])
      setCapa(capaInicial)
      setModo("nueva")
    }
  }

  const nombres = useMemo(() => nombresPorId(elementos), [elementos])
  const columnas = useMemo(() => columnasDe(capa, elementos, nombres), [capa, elementos, nombres])
  // Una condición lista para escribir: el primer campo después del nombre.
  const condicionNueva = (): Condicion => ({ campo: columnas[1]?.clave ?? columnas[0]?.clave ?? "", operador: "igual", valor: "" })
  const lista = condiciones.length > 0 ? condiciones : columnas.length > 0 ? [condicionNueva()] : []

  const consulta: Consulta = { capa, union, condiciones: lista }
  // Unos cientos de elementos: se recalcula en cada cambio sin costo apreciable.
  const resultado = evaluarConsulta(elementos, consulta, nombres)
  const total = elementos.filter((e) => e.tipo === capa).length
  const completas = lista.filter(condicionCompleta).length

  /** Valores que ya tiene el campo, para sugerirlos al escribir. */
  const sugerencias = (campo: string) =>
    [...new Set(elementos.filter((e) => e.tipo === capa).map((e) => textoDeCelda(valorDeCelda(e, campo, nombres))).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
      .slice(0, 60)

  function cambiar(i: number, cambio: Partial<Condicion>) {
    setCondiciones(lista.map((c, j) => (j === i ? { ...c, ...cambio } : c)))
  }

  function aplicar() {
    onAplicar({ consulta, descripcion: describirConsulta(consulta, columnas), claves: resultado, modo })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(46rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
        <EncabezadoVentana
          icono={Filter}
          titulo="Seleccionar por atributos"
          descripcion="Condiciones sobre los datos de una capa; lo que coincide queda seleccionado en el mapa y en la tabla"
        />

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <Rotulo>Capa</Rotulo>
              <Opciones
                valor={capa}
                etiqueta="Capa"
                opciones={(["node", "fiber", "cabecera"] as CapaDeTabla[]).map((c) => ({ id: c, texto: NOMBRE_DE_CAPA_TABLA[c] }))}
                onChange={(c) => {
                  setCapa(c)
                  setCondiciones([])
                }}
              />
            </div>
            <label className="flex flex-col gap-1">
              <Rotulo>Qué hacer con lo que coincide</Rotulo>
              <select value={modo} onChange={(e) => setModo(e.target.value as ModoDeSeleccion)} className={claseSelect}>
                {MODOS.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.id !== "nueva" && !haySeleccion}>
                    {m.texto}
                  </option>
                ))}
              </select>
            </label>
            {lista.length > 1 && (
              <div className="flex flex-col gap-1">
                <Rotulo>Que se cumplan</Rotulo>
                <Opciones
                  valor={union}
                  etiqueta="Que se cumplan"
                  opciones={[
                    { id: "y", texto: "Todas" },
                    { id: "o", texto: "Alguna" },
                  ]}
                  onChange={setUnion}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
            {lista.map((c, i) => {
              const operador = OPERADORES.find((o) => o.id === c.operador)
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="w-6 shrink-0 text-right text-[11px] font-semibold text-muted-foreground">
                    {i === 0 ? "" : union === "y" ? "y" : "o"}
                  </span>
                  <select
                    value={c.campo}
                    onChange={(e) => cambiar(i, { campo: e.target.value, valor: "" })}
                    aria-label={`Campo de la condición ${i + 1}`}
                    className={`${claseSelect} w-52`}
                  >
                    {columnas.map((col) => (
                      <option key={col.clave} value={col.clave}>
                        {col.titulo}
                      </option>
                    ))}
                  </select>
                  <select
                    value={c.operador}
                    onChange={(e) => cambiar(i, { operador: e.target.value as Condicion["operador"] })}
                    aria-label={`Operador de la condición ${i + 1}`}
                    className={`${claseSelect} w-44`}
                  >
                    {OPERADORES.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.texto}
                      </option>
                    ))}
                  </select>
                  {operador?.conValor && (
                    <>
                      <input
                        value={c.valor}
                        onChange={(e) => cambiar(i, { valor: e.target.value })}
                        list={`${id}-valores-${i}`}
                        maxLength={120}
                        placeholder="Valor"
                        aria-label={`Valor de la condición ${i + 1}`}
                        className="h-8 min-w-32 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      />
                      <datalist id={`${id}-valores-${i}`}>
                        {sugerencias(c.campo).map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>
                    </>
                  )}
                  {lista.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCondiciones(lista.filter((_, j) => j !== i))}
                      aria-label={`Quitar la condición ${i + 1}`}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
            <div>
              <Boton icono={Plus} onClick={() => setCondiciones([...lista, condicionNueva()])}>
                Agregar condición
              </Boton>
            </div>
          </div>

          <p className="text-xs text-foreground" aria-live="polite">
            {completas === 0 ? (
              <span className="text-muted-foreground">Escribe al menos una condición completa.</span>
            ) : (
              <>
                Coinciden <strong className="tabular-nums">{resultado.length}</strong> de {total}{" "}
                {NOMBRE_DE_CAPA_TABLA[capa].toLowerCase()}: <span className="text-muted-foreground">{describirConsulta(consulta, columnas)}</span>
              </>
            )}
          </p>

          <div className="flex justify-end gap-2">
            <Boton icono={X} onClick={() => onOpenChange(false)}>
              Cancelar
            </Boton>
            <Boton icono={Filter} principal deshabilitado={completas === 0} onClick={aplicar}>
              Aplicar
            </Boton>
          </div>
        </div>

        <BarraDeEstado mensaje={{ texto: "Se busca en lo que el mapa tiene cargado; no consulta la base.", tono: "info" }} />
      </DialogContent>
    </Dialog>
  )
}
