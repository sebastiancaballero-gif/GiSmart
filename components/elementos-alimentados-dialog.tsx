"use client"

import { useImperativeHandle, useMemo, useState, type Ref } from "react"
import {
  ArrowLeft,
  ArrowRight,
  List,
  MousePointerClick,
  Network,
  Route,
  Star,
  TableProperties,
  TextSearch,
  Wifi,
  ZoomIn,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  BarraDeEstado,
  BotonIcono,
  Campo,
  claseSelect,
  EncabezadoVentana,
  Grupo,
  Opciones,
  Rotulo,
  type ManejadorDeVentana,
  type Mensaje,
} from "@/components/ventana-sig"
import { nodosDeFibra, type NodoDeFibra } from "@/components/redes-nodo-dialog"
import type { AccesoAlMapa } from "@/components/network-map"
import { normalizar } from "@/lib/map/busqueda"

/**
 * «Elementos alimentados por fibra óptica» (ribbon: Red de fibra → GPON), como
 * la pantalla del SIG anterior.
 *
 * Nombres cambiados a pedido: «Arpones del nodo» → «Cod. Nivel 1 de la
 * cabecera», «Códigos de arpón» → «Cod. Nivel 1 totales», «Códigos arpón
 * (CEO)» → «Cod. Nivel 1», «Puertos de salida (Outs)» → «Puertos Nivel 2
 * (Out)» y «Hasta el arpón» → «Hasta Nivel 1». Se quitó por ahora la fila
 * «Recorrer sobre… cables de fibra / hilos».
 *
 * Lo que ya funciona con los datos del mapa: la lista de nodos (las cabeceras),
 * buscarlos por caracteres del nombre, elegirlos en el mapa, la lista de
 * cubiertas de primer nivel («Cod. Nivel 1 totales»), recorrerla con las
 * flechas y ubicar en el mapa el nodo o la cubierta. Lo demás (cubiertas de
 * una cabecera, puertos, NAP, recorridos) espera las funciones de la base y
 * lo dice al pulsarlo.
 */

/** Una cubierta de la lista «Cod. Nivel 1». */
export type CubiertaNivel1 = { clave: string; nombre: string }

const PENDIENTE = (nombre: string) => `«${nombre}» todavía no está disponible: falta la función en la base.`

/** Una fila con la etiqueta a la izquierda, como en la pantalla original. */
function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <span className="text-xs font-semibold text-muted-foreground">{etiqueta}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

/**
 * La ventana con su estado. El nodo y la cubierta de nivel 1 elegidos se
 * conservan aunque la ventana se cierre: el nodo también se elige con un click
 * en el mapa, con la ventana cerrada. El tablero solo la abre (ver
 * `ManejadorDeVentana`).
 */
export function ElementosAlimentadosDialog({ ref, mapa }: { ref?: Ref<ManejadorDeVentana>; mapa: AccesoAlMapa }) {
  const [abierta, setAbierta] = useState(false)
  const [claveNodo, setClaveNodo] = useState<string | null>(null)
  const [claveNivel1, setClaveNivel1] = useState<string | null>(null)
  useImperativeHandle(ref, () => ({ abrir: () => setAbierta(true) }), [])

  const nodos = useMemo(() => nodosDeFibra(mapa.indice), [mapa.indice])
  const nivel1 = useMemo<CubiertaNivel1[]>(
    () =>
      mapa.indice
        .filter((e) => e.tipo === "node" && e.categoria === "Primer nivel")
        .map((e) => ({ clave: e.clave, nombre: e.nombre })),
    [mapa.indice],
  )

  // El pin de la ventana: se cierra, se elige la cabecera con un click en el
  // mapa y se vuelve a abrir con ella. Con Esc vuelve con la que había.
  async function elegirNodoEnMapa() {
    setAbierta(false)
    const elegido =
      (await mapa.api.current?.elegirElemento("cabecera", "Haz click sobre el nodo (cabecera) que quieres consultar.")) ??
      null
    if (elegido) setClaveNodo(elegido.clave)
    setAbierta(true)
  }

  // «Ubicar»: se cierra la ventana y el mapa se centra en el elemento.
  function ubicar(clave: string) {
    if (mapa.ubicar(clave)) setAbierta(false)
  }

  return (
    <VentanaElementosAlimentados
      open={abierta}
      onOpenChange={setAbierta}
      nodos={nodos}
      nivel1={nivel1}
      claveNodo={claveNodo}
      onCambiarNodo={setClaveNodo}
      claveNivel1={claveNivel1}
      onCambiarNivel1={setClaveNivel1}
      onUbicar={ubicar}
      onElegirNodoEnMapa={elegirNodoEnMapa}
    />
  )
}

function VentanaElementosAlimentados({
  open,
  onOpenChange,
  nodos,
  nivel1,
  claveNodo,
  onCambiarNodo,
  claveNivel1,
  onCambiarNivel1,
  onUbicar,
  onElegirNodoEnMapa,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  /** Nodos de fibra (hoy, las cabeceras del mapa). */
  nodos: NodoDeFibra[]
  /** Todas las cubiertas de primer nivel del mapa. */
  nivel1: CubiertaNivel1[]
  claveNodo: string | null
  onCambiarNodo: (clave: string) => void
  claveNivel1: string | null
  onCambiarNivel1: (clave: string) => void
  /** Cierra la ventana y centra el mapa en ese elemento. */
  onUbicar: (clave: string) => void
  /** Cierra la ventana para elegir el nodo con un click en el mapa. */
  onElegirNodoEnMapa: () => void
}) {
  const [red, setRed] = useState<"existente" | "proyectada">("existente")
  const [busquedaPor, setBusquedaPor] = useState<"cabecera" | "totales">("totales")
  const [caracteres, setCaracteres] = useState("")
  const [coincidencias, setCoincidencias] = useState<NodoDeFibra[] | null>(null)
  const [conectividad, setConectividad] = useState<"existente" | "proyectada">("existente")
  const [trace, setTrace] = useState<"central" | "nivel1">("central")
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)

  // Sin elegir, el primero: casi siempre hay un solo nodo.
  const nodo = nodos.find((n) => n.clave === claveNodo) ?? nodos[0] ?? null

  // «Cod. Nivel 1 totales» son todas las de primer nivel; las «de la cabecera»
  // necesitan saber qué alimenta cada nodo, y eso todavía no está en la base.
  const lista = useMemo(
    () =>
      busquedaPor === "totales"
        ? [...nivel1].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }))
        : [],
    [busquedaPor, nivel1],
  )
  const posicion = lista.findIndex((c) => c.clave === claveNivel1)
  const cubierta = posicion >= 0 ? lista[posicion] : (lista[0] ?? null)
  const indice = cubierta ? lista.indexOf(cubierta) : -1

  function pendiente(nombre: string) {
    setMensaje({ texto: PENDIENTE(nombre), tono: "info" })
  }

  function buscarPorCaracteres() {
    const q = normalizar(caracteres)
    if (!q) {
      setMensaje({ texto: "Escribe parte del nombre del nodo para buscarlo.", tono: "aviso" })
      return
    }
    const encontrados = nodos.filter((n) => normalizar(n.nombre).includes(q))
    setCoincidencias(encontrados)
    if (encontrados.length === 0) {
      setMensaje({ texto: `Ningún nodo contiene «${caracteres.trim()}».`, tono: "aviso" })
    } else {
      onCambiarNodo(encontrados[0].clave)
      setMensaje({
        texto: `${encontrados.length === 1 ? "1 nodo coincide" : `${encontrados.length} nodos coinciden`} con «${caracteres.trim()}».`,
        tono: "info",
      })
    }
  }

  function moverNivel1(paso: number) {
    if (lista.length === 0) return
    const siguiente = lista[Math.min(lista.length - 1, Math.max(0, indice + paso))]
    onCambiarNivel1(siguiente.clave)
    setMensaje(null)
  }

  function cambiarBusqueda(valor: "cabecera" | "totales") {
    setBusquedaPor(valor)
    setMensaje(valor === "cabecera" ? { texto: PENDIENTE("Cod. Nivel 1 de la cabecera"), tono: "info" } : null)
  }

  const barra: Mensaje =
    mensaje ??
    (!nodo
      ? { texto: "No hay nodos de fibra cargados en el mapa.", tono: "aviso" }
      : cubierta
        ? { texto: `${nodo.nombre} · ${cubierta.nombre} (${indice + 1} de ${lista.length}).`, tono: "info" }
        : { texto: `Elige una cubierta de nivel 1 para ver sus puertos.`, tono: "info" })

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        onOpenChange(abierto)
        if (!abierto) setMensaje(null)
      }}
    >
      <DialogContent className="flex max-h-[94vh] w-[min(40rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
        <EncabezadoVentana
          icono={Wifi}
          titulo="Elementos alimentados por fibra óptica"
          descripcion={nodo ? `Nodo ${nodo.nombre}${cubierta ? ` · ${cubierta.nombre}` : ""}` : "Elige un nodo de fibra."}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/20 p-4">
          <Opciones
            etiqueta="Qué red consultar"
            valor={red}
            onChange={setRed}
            opciones={[
              { id: "existente", texto: "Nodos de la red existente" },
              { id: "proyectada", texto: "Nodos de la red proyectada", deshabilitada: true, titulo: "Todavía no disponible" },
            ]}
          />

          {/* Nodo origen */}
          <Grupo titulo="Nodo origen">
            <div className="flex flex-col gap-2.5">
              <Fila etiqueta="Código de contrato">
                <select disabled className={`${claseSelect} w-40`} title="Todavía no disponible" aria-label="Código de contrato">
                  <option>—</option>
                </select>
              </Fila>
              <Fila etiqueta="Búsqueda exacta">
                <select
                  aria-label="Nodo (búsqueda exacta)"
                  value={nodo?.clave ?? ""}
                  onChange={(e) => {
                    onCambiarNodo(e.target.value)
                    setMensaje(null)
                  }}
                  disabled={nodos.length === 0}
                  className={`${claseSelect} min-w-0 flex-1`}
                >
                  {nodos.length === 0 && <option value="">Sin nodos cargados</option>}
                  {nodos.map((n) => (
                    <option key={n.clave} value={n.clave}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
                <BotonIcono icono={MousePointerClick} etiqueta="Elegir el nodo en el mapa" color="text-emerald-600" onClick={onElegirNodoEnMapa} />
              </Fila>
              <Fila etiqueta="Caracteres del nombre">
                <input
                  type="search"
                  value={caracteres}
                  onChange={(e) => setCaracteres(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscarPorCaracteres()}
                  placeholder="Parte del nombre…"
                  aria-label="Caracteres del nombre"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                <BotonIcono icono={TextSearch} etiqueta="Buscar nodos que contengan esos caracteres" onClick={buscarPorCaracteres} />
              </Fila>
              <Fila etiqueta="Coincidencias">
                <select
                  aria-label="Coincidencias"
                  value={coincidencias?.some((c) => c.clave === nodo?.clave) ? nodo?.clave : ""}
                  onChange={(e) => e.target.value && onCambiarNodo(e.target.value)}
                  disabled={!coincidencias || coincidencias.length === 0}
                  className={`${claseSelect} min-w-0 flex-1`}
                >
                  <option value="">{coincidencias ? (coincidencias.length ? "Elige una coincidencia" : "Sin coincidencias") : "Busca por caracteres"}</option>
                  {coincidencias?.map((n) => (
                    <option key={n.clave} value={n.clave}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </Fila>

              {/* El nodo elegido, destacado como en la pantalla original. */}
              <div className="mt-1 flex items-center gap-2">
                <div
                  className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg px-3 text-sm font-bold ${
                    nodo
                      ? "bg-orange-100 text-orange-950 ring-1 ring-orange-200 dark:bg-orange-400/15 dark:text-orange-100 dark:ring-orange-400/25"
                      : "border border-dashed border-border italic text-muted-foreground"
                  }`}
                >
                  <span className="truncate">{nodo?.nombre ?? "Ningún nodo elegido"}</span>
                </div>
                <BotonIcono
                  icono={ZoomIn}
                  etiqueta="Ubicar el nodo en el mapa"
                  onClick={() => (nodo ? onUbicar(nodo.clave) : setMensaje({ texto: "Primero elige un nodo.", tono: "aviso" }))}
                />
                <BotonIcono icono={TableProperties} etiqueta="Datos del nodo" onClick={() => pendiente("Datos del nodo")} />
              </div>
            </div>
          </Grupo>

          {/* Equipos de la red GPON */}
          <Grupo titulo="Equipos de la red GPON">
            <div className="flex flex-col gap-2.5">
              <Fila etiqueta="Búsqueda por…">
                <Opciones
                  etiqueta="Búsqueda por"
                  valor={busquedaPor}
                  onChange={cambiarBusqueda}
                  opciones={[
                    { id: "cabecera", texto: "Cod. Nivel 1 de la cabecera" },
                    { id: "totales", texto: "Cod. Nivel 1 totales" },
                  ]}
                />
              </Fila>
              <Fila etiqueta="Cod. Nivel 1">
                <select
                  aria-label="Cod. Nivel 1"
                  value={cubierta?.clave ?? ""}
                  onChange={(e) => {
                    onCambiarNivel1(e.target.value)
                    setMensaje(null)
                  }}
                  disabled={lista.length === 0}
                  className={`${claseSelect} w-40 font-mono`}
                >
                  {lista.length === 0 && <option value="">{busquedaPor === "cabecera" ? "Pendiente" : "Sin cubiertas"}</option>}
                  {lista.map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {lista.length > 0 && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {indice + 1} de {lista.length}
                  </span>
                )}
              </Fila>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <BotonIcono
                  icono={ZoomIn}
                  etiqueta="Ubicar la cubierta en el mapa"
                  onClick={() => (cubierta ? onUbicar(cubierta.clave) : setMensaje({ texto: "Primero elige una cubierta.", tono: "aviso" }))}
                />
                <BotonIcono icono={ArrowLeft} etiqueta="Anterior" color="text-sky-600" onClick={() => moverNivel1(-1)} />
                <BotonIcono icono={ArrowRight} etiqueta="Siguiente" color="text-sky-600" onClick={() => moverNivel1(1)} />
                <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                <BotonIcono icono={List} etiqueta="Listado" onClick={() => pendiente("Listado")} />
                <BotonIcono icono={TableProperties} etiqueta="Datos de la cubierta" onClick={() => pendiente("Datos de la cubierta")} />
              </div>

              <div className="my-0.5 h-px bg-border" aria-hidden="true" />

              <Fila etiqueta="Puertos Nivel 2 (Out)">
                <select disabled aria-label="Puertos Nivel 2 (Out)" title="Todavía no disponible" className={`${claseSelect} w-24`}>
                  <option>—</option>
                </select>
                <span className="ml-auto flex items-center gap-2">
                  <Rotulo>NAP conectada</Rotulo>
                  <Campo etiqueta="NAP conectada" valor={null} guia="—" ancho="w-14" chico />
                </span>
              </Fila>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <BotonIcono icono={ZoomIn} etiqueta="Ubicar el puerto" onClick={() => pendiente("Ubicar el puerto")} />
                <BotonIcono icono={Star} etiqueta="Marcar" color="text-amber-500" onClick={() => pendiente("Marcar")} />
                <BotonIcono icono={ArrowLeft} etiqueta="Volver" color="text-sky-600" onClick={() => pendiente("Volver")} />
                <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                <BotonIcono icono={Route} etiqueta="Recorrer (trace)" color="text-rose-600" onClick={() => pendiente("Recorrer")} />
                <BotonIcono icono={Network} etiqueta="Elementos alimentados" color="text-emerald-600" onClick={() => pendiente("Elementos alimentados")} />
                <BotonIcono icono={TableProperties} etiqueta="Datos del puerto" onClick={() => pendiente("Datos del puerto")} />
              </div>
            </div>
          </Grupo>

          {/* Acciones sobre elemento seleccionado */}
          <Grupo titulo="Acciones sobre elemento seleccionado">
            <div className="flex flex-col gap-2.5">
              <Fila etiqueta="Recorrer conectividad…">
                <Opciones
                  etiqueta="Recorrer conectividad"
                  valor={conectividad}
                  onChange={setConectividad}
                  opciones={[
                    { id: "existente", texto: "Existente" },
                    { id: "proyectada", texto: "Proyectada" },
                  ]}
                />
              </Fila>
              <Fila etiqueta="Recorrido del trace">
                <Opciones
                  etiqueta="Recorrido del trace"
                  valor={trace}
                  onChange={setTrace}
                  opciones={[
                    { id: "central", texto: "Hasta la Central" },
                    { id: "nivel1", texto: "Hasta Nivel 1" },
                  ]}
                />
              </Fila>
            </div>
          </Grupo>
        </div>

        <BarraDeEstado mensaje={barra} />
      </DialogContent>
    </Dialog>
  )
}
