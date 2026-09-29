"use client"

import { useImperativeHandle, useMemo, useState, type Ref } from "react"
import {
  ArrowLeft,
  Calculator,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Layers,
  MapPinned,
  Network,
  Router,
  Server,
  TableProperties,
  TriangleAlert,
  ZoomIn,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  BarraDeEstado,
  Boton,
  BotonIcono,
  Campo,
  claseSelect,
  EncabezadoVentana,
  EstadoVacio,
  Opciones,
  Rotulo,
  type ManejadorDeVentana,
  type Mensaje,
} from "@/components/ventana-sig"
import type { AccesoAlMapa } from "@/components/network-map"
import type { ElementoBuscable } from "@/lib/map/busqueda"

/**
 * «Consulta de redes por nodo de fibra óptica» (ribbon: Red de fibra →
 * Redes/Nodo), como la pantalla del SIG anterior.
 *
 * Cambios pedidos respecto a la original: «Cargar equipos» pasa a «Cargar
 * cubiertas», la pestaña «CEOs» a «Primer nivel» y «Cub. Emp» a «Nivel 2». Se
 * quitaron por ahora «Cargar cables», el grupo «Cargar equipos por…»
 * (conectividad de cables / de hilos), el botón «HFC» y las pestañas
 * «Abonados» y «Nodos HFC».
 *
 * Por ahora es solo la vista: la lista de nodos sale de las cabeceras cargadas
 * en el mapa y «Ubicar en el mapa» funciona; lo demás espera las funciones de
 * la base y lo dice al pulsarlo. Las columnas de cada pestaña son provisionales
 * y se ajustan a lo que devuelvan esas funciones.
 */

/** Un nodo de fibra (SDS) que se puede consultar: hoy, las cabeceras del mapa. */
export type NodoDeFibra = { clave: string; nombre: string; detalle: string }

/** Los nodos de fibra del índice del mapa: por ahora, las cabeceras cargadas. */
export function nodosDeFibra(indice: ElementoBuscable[]): NodoDeFibra[] {
  return indice.filter((e) => e.tipo === "cabecera").map((e) => ({ clave: e.clave, nombre: e.nombre, detalle: e.detalle }))
}

type PestanaId = "salientes" | "entrantes" | "primer-nivel" | "nivel-2"

const PESTANAS: { id: PestanaId; titulo: string; queMuestra: string; columnas: { titulo: string; ancho: string }[] }[] = [
  {
    id: "salientes",
    titulo: "Cables salientes",
    queMuestra: "los cables que salen del nodo",
    columnas: [
      { titulo: "Identificador", ancho: "min-w-32" },
      { titulo: "Código", ancho: "min-w-24" },
      { titulo: "Hilos", ancho: "min-w-16" },
      { titulo: "Tipo de cable", ancho: "min-w-28" },
      { titulo: "Hacia", ancho: "min-w-32" },
      { titulo: "Longitud (m)", ancho: "min-w-24" },
    ],
  },
  {
    id: "entrantes",
    titulo: "Cables entrantes",
    queMuestra: "los cables que llegan al nodo",
    columnas: [
      { titulo: "Identificador", ancho: "min-w-32" },
      { titulo: "Código", ancho: "min-w-24" },
      { titulo: "Hilos", ancho: "min-w-16" },
      { titulo: "Tipo de cable", ancho: "min-w-28" },
      { titulo: "Desde", ancho: "min-w-32" },
      { titulo: "Longitud (m)", ancho: "min-w-24" },
    ],
  },
  {
    id: "primer-nivel",
    titulo: "Primer nivel",
    queMuestra: "las cubiertas de primer nivel",
    columnas: [
      { titulo: "Identificador", ancho: "min-w-32" },
      { titulo: "Cubierta", ancho: "min-w-28" },
      { titulo: "Tipo", ancho: "min-w-24" },
      { titulo: "Dirección", ancho: "min-w-44" },
      { titulo: "Cables", ancho: "min-w-16" },
      { titulo: "Estado", ancho: "min-w-24" },
    ],
  },
  {
    id: "nivel-2",
    titulo: "Nivel 2",
    queMuestra: "las cubiertas de nivel 2",
    columnas: [
      { titulo: "Identificador", ancho: "min-w-32" },
      { titulo: "Cubierta", ancho: "min-w-28" },
      { titulo: "Tipo", ancho: "min-w-24" },
      { titulo: "Dirección", ancho: "min-w-44" },
      { titulo: "Cables", ancho: "min-w-16" },
      { titulo: "Estado", ancho: "min-w-24" },
    ],
  },
]

/** Una fila de una pestaña, en el orden de sus columnas. Hoy no llegan filas. */
type Fila = { id: string; valores: (string | number | null)[] }

const PENDIENTE = (nombre: string) => `«${nombre}» todavía no está disponible: falta la función en la base.`

/** La ventana con su estado. El tablero solo la abre (ver `ManejadorDeVentana`). */
export function RedesNodoDialog({ ref, mapa }: { ref?: Ref<ManejadorDeVentana>; mapa: AccesoAlMapa }) {
  const [abierta, setAbierta] = useState(false)
  useImperativeHandle(ref, () => ({ abrir: () => setAbierta(true) }), [])
  const nodos = useMemo(() => nodosDeFibra(mapa.indice), [mapa.indice])

  // «Ubicar en el mapa»: se cierra la ventana y el mapa se centra en el nodo.
  function ubicarNodo(clave: string) {
    if (mapa.ubicar(clave)) setAbierta(false)
  }

  return <VentanaRedesNodo open={abierta} onOpenChange={setAbierta} nodos={nodos} onUbicarNodo={ubicarNodo} />
}

function VentanaRedesNodo({
  open,
  onOpenChange,
  nodos,
  onUbicarNodo,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  /** Nodos de fibra que se pueden consultar (hoy, las cabeceras del mapa). */
  nodos: NodoDeFibra[]
  /** «Ubicar en el mapa»: cierra la ventana y centra el mapa en el nodo. */
  onUbicarNodo: (clave: string) => void
}) {
  const [red, setRed] = useState<"existente" | "proyectada">("existente")
  const [claveNodo, setClaveNodo] = useState<string | null>(null)
  const [lineas, setLineas] = useState<"todas" | "seleccionada">("seleccionada")
  const [pestana, setPestana] = useState<PestanaId>("salientes")
  // El nodo para el que se pidió «Cargar cubiertas».
  const [consultado, setConsultado] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)

  // Sin elegir, el primero: casi siempre hay un solo nodo.
  const nodo = nodos.find((n) => n.clave === claveNodo) ?? nodos[0] ?? null
  const actual = PESTANAS.find((p) => p.id === pestana) ?? PESTANAS[0]
  // Hoy ninguna pestaña trae filas: llegan cuando existan las funciones.
  // Mientras tanto la base no respondió nada, y el contador de cada pestaña
  // muestra «—» en vez de un 0 que se leería como «este nodo no tiene cables».
  const filas: Fila[] = []
  const conRespuesta = false
  const consultadoEste = nodo !== null && consultado === nodo.clave

  function pendiente(nombre: string) {
    setMensaje({ texto: PENDIENTE(nombre), tono: "info" })
  }

  function cargarCubiertas() {
    if (!nodo) {
      setMensaje({ texto: "Primero elige un nodo de fibra.", tono: "aviso" })
      return
    }
    setConsultado(nodo.clave)
    pendiente("Cargar cubiertas")
  }

  function exportar() {
    if (filas.length === 0) {
      setMensaje({ texto: `No hay datos para exportar en «${actual.titulo}».`, tono: "aviso" })
      return
    }
    pendiente("Exportar a Excel")
  }

  const barra: Mensaje =
    mensaje ??
    (!nodo
      ? { texto: "No hay nodos de fibra cargados en el mapa.", tono: "aviso" }
      : consultadoEste
        ? { texto: `Consulta de ${nodo.nombre} pendiente: falta la función en la base.`, tono: "info" }
        : { texto: `Elige el nodo y pulsa «Cargar cubiertas» para ver su red.`, tono: "info" })

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        onOpenChange(abierto)
        if (!abierto) setMensaje(null)
      }}
    >
      <DialogContent className="flex max-h-[94vh] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
        <EncabezadoVentana
          icono={Server}
          titulo="Consulta de redes por nodo de fibra óptica"
          descripcion={nodo ? `Nodo ${nodo.nombre} · red existente` : "Elige un nodo de fibra para consultar su red."}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/20 p-4">
          {/* Qué red y qué nodo */}
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
            <Opciones
              etiqueta="Qué red consultar"
              valor={red}
              onChange={setRed}
              opciones={[
                { id: "existente", texto: "Nodos de la red existente" },
                { id: "proyectada", texto: "Nodos de la red proyectada", deshabilitada: true, titulo: "Todavía no disponible" },
              ]}
            />

            <div className="mt-3.5 grid gap-x-4 gap-y-3 md:grid-cols-[auto_1fr]">
              <label className="flex flex-col gap-1">
                <Rotulo>Código de contrato</Rotulo>
                <select disabled className={`${claseSelect} w-40`} title="Todavía no disponible" aria-label="Código de contrato">
                  <option>—</option>
                </select>
              </label>

              <div className="flex flex-col gap-1">
                <Rotulo>Nodo de fibra (SDS)</Rotulo>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Nodo de fibra (SDS)"
                    value={nodo?.clave ?? ""}
                    onChange={(e) => {
                      setClaveNodo(e.target.value)
                      setMensaje(null)
                    }}
                    disabled={nodos.length === 0}
                    className={`${claseSelect} min-w-56 flex-1`}
                  >
                    {nodos.length === 0 && <option value="">Sin nodos cargados</option>}
                    {nodos.map((n) => (
                      <option key={n.clave} value={n.clave}>
                        {n.nombre}
                      </option>
                    ))}
                  </select>
                  <BotonIcono icono={TableProperties} etiqueta="Datos del nodo" onClick={() => pendiente("Datos del nodo")} />
                  <BotonIcono
                    icono={MapPinned}
                    etiqueta="Ubicar el nodo en el mapa"
                    onClick={() => (nodo ? onUbicarNodo(nodo.clave) : setMensaje({ texto: "Primero elige un nodo de fibra.", tono: "aviso" }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-2 md:col-span-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Rotulo>Nodo elegido</Rotulo>
                  <Campo
                    etiqueta="Nodo elegido"
                    valor={nodo ? `${nodo.nombre} · ${nodo.detalle}` : null}
                    guia="Ningún nodo elegido"
                    ancho="w-full"
                    mono={false}
                  />
                </div>
                <Boton icono={Download} principal onClick={cargarCubiertas} deshabilitado={!nodo}>
                  Cargar cubiertas
                </Boton>
              </div>
            </div>
          </div>

          {/* Equipos finales */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-sm">
            <span className="text-xs font-bold text-foreground">Equipos finales de red para…</span>
            <Opciones
              etiqueta="Líneas"
              valor={lineas}
              onChange={setLineas}
              opciones={[
                { id: "todas", texto: "Todas las líneas" },
                { id: "seleccionada", texto: "Línea seleccionada" },
              ]}
            />
            <span className="flex-1" />
            <Boton icono={Router} onClick={() => pendiente("Equipos finales GPON")}>
              GPON
            </Boton>
            <Boton icono={Router} onClick={() => pendiente("Equipos finales METH")}>
              METH
            </Boton>
          </div>

          {/* Pestañas y grilla. `shrink-0`: en pantallas bajas la grilla se
              aplastaba a unos pocos píxeles; así conserva su alto y lo que
              desplaza es la ventana. */}
          <div className="flex shrink-0 flex-col">
            <div role="tablist" aria-label="Red del nodo" className="flex flex-wrap gap-1 border-b border-border">
              {PESTANAS.map((p) => {
                const activa = p.id === pestana
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={activa}
                    onClick={() => setPestana(p.id)}
                    className={`-mb-px flex items-center gap-1.5 rounded-t-lg border px-3.5 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 ${
                      activa
                        ? "border-border border-t-2 border-t-primary border-b-card bg-card text-primary shadow-[0_-2px_6px_-4px_rgb(15_23_42/0.25)]"
                        : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground"
                    }`}
                  >
                    {p.titulo}
                    <span
                      className={`rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums ${
                        activa ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {consultadoEste && conRespuesta ? filas.length : "—"}
                    </span>
                  </button>
                )
              })}
            </div>

            <div
              role="tabpanel"
              aria-label={actual.titulo}
              className="flex h-[min(20rem,40vh)] flex-col overflow-auto rounded-b-xl border border-t-0 border-border bg-card shadow-sm"
            >
              <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 w-8 min-w-8 border-b border-r border-border bg-muted" aria-label="Fila seleccionada" />
                    {actual.columnas.map((c) => (
                      <th
                        key={c.titulo}
                        scope="col"
                        className={`sticky top-0 z-20 ${c.ancho} border-b border-r border-border bg-muted px-2.5 py-2 text-left font-semibold text-foreground`}
                      >
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id} className="hover:bg-accent/60">
                      <td className="sticky left-0 z-10 w-8 border-b border-r border-border bg-card px-1 text-center">
                        <ChevronRight className="mx-auto size-3.5 text-transparent" aria-hidden="true" />
                      </td>
                      {f.valores.map((v, i) => (
                        <td key={i} className="whitespace-nowrap border-b border-r border-border px-2.5 py-1.5 tabular-nums text-foreground">
                          {v ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Sin filas: un aviso bajo los encabezados, en vez de la grilla en blanco. */}
              {filas.length === 0 && (
                <div className="min-h-0 flex-1">
                  {!nodo ? (
                    <EstadoVacio
                      icono={TriangleAlert}
                      tono="aviso"
                      titulo="No hay nodos de fibra cargados"
                      texto="La lista de nodos sale de las cabeceras del mapa. Si la capa de cabeceras no cargó, actualiza el mapa."
                    />
                  ) : consultadoEste ? (
                    <EstadoVacio
                      icono={Clock}
                      titulo="Consulta pendiente"
                      texto={`La base todavía no tiene la función para traer la red de ${nodo.nombre}. En cuanto esté, aquí aparecen ${actual.queMuestra}.`}
                    />
                  ) : (
                    <EstadoVacio
                      icono={Network}
                      titulo={`${actual.titulo} de ${nodo.nombre}`}
                      texto={`Pulsa «Cargar cubiertas» para ver ${actual.queMuestra}.`}
                    >
                      <Boton icono={Download} principal onClick={cargarCubiertas}>
                        Cargar cubiertas
                      </Boton>
                    </EstadoVacio>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Herramientas de la grilla */}
          <div className="flex flex-wrap items-center gap-2">
            <BotonIcono
              icono={ZoomIn}
              etiqueta="Acercar el mapa a la fila elegida"
              onClick={() =>
                filas.length === 0 ? setMensaje({ texto: "Primero elige una fila de la tabla.", tono: "aviso" }) : pendiente("Acercar a la fila")
              }
            />
            <BotonIcono icono={ArrowLeft} etiqueta="Volver" color="text-emerald-600" onClick={() => pendiente("Volver")} />
            <BotonIcono icono={Calculator} etiqueta="Totales" onClick={() => pendiente("Totales")} />
            <span className="flex-1" />
            <Boton icono={FileSpreadsheet} colorIcono="text-emerald-600" onClick={exportar}>
              Exportar a Excel
            </Boton>
          </div>
        </div>

        {/* Barra de estado con el avance, como la del SIG anterior */}
        <BarraDeEstado mensaje={barra}>
          <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <Layers className="size-3.5" aria-hidden="true" />
            Avance
            <span
              role="progressbar"
              aria-label="Avance"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={0}
              className="h-2 w-40 overflow-hidden rounded-full bg-muted ring-1 ring-border"
            >
              <span className="block h-full w-0 rounded-full bg-primary transition-[width]" />
            </span>
          </span>
        </BarraDeEstado>
      </DialogContent>
    </Dialog>
  )
}
