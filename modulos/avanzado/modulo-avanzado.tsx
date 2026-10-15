"use client"

import { useEffect, useImperativeHandle, useState, type Ref } from "react"
import type { AccesoAlMapa } from "@/components/network-map"
import { getUser } from "@/lib/auth"
import type { HerramientaAvanzada } from "./cinta"
import { VentanaMarcadores } from "./marcadores/ventana-marcadores"
import { PanelResumen } from "./resumen/panel-resumen"
import { ALTO_TABLA, TablaAtributos } from "./tabla/tabla-atributos"
import type { CapaDeTabla } from "./tabla/columnas"
import { VentanaConsulta, type ResultadoDeConsulta } from "./consulta/ventana-consulta"
import { combinarSeleccion } from "./consulta/consulta"
import { PanelCercania } from "./cercania/panel-cercania"
import { VentanaImprimir } from "./imprimir/ventana-imprimir"

/** Lo que el tablero le pide al módulo: abrir una de sus herramientas. */
export type ManejadorDelModulo = {
  /** Abre la herramienta; devuelve qué decirle al usuario si no se pudo. */
  abrir: (herramienta: HerramientaAvanzada) => string | void
}

/** El usuario conectado, para guardar lo de cada quien por separado. */
function usuarioActual(): string {
  const u = getUser() as { usuario?: unknown } | null
  return typeof u?.usuario === "string" ? u.usuario : ""
}

/**
 * El módulo «Avanzado» (ver modulos/avanzado/cinta.ts): sus ventanas y
 * paneles viven aquí, con su propio estado. Del tablero solo recibe el acceso
 * al mapa y el nombre del lugar que se está viendo, y le cuenta qué paneles
 * tiene abiertos para que la cinta los muestre encendidos.
 *
 * Va como hijo directo del panel del mapa, que es una columna: la tabla de
 * atributos ocupa su lugar debajo del mapa y el mapa se achica.
 */
export function ModuloAvanzado({
  ref,
  mapa,
  lugar,
  onActivos,
}: {
  ref?: Ref<ManejadorDelModulo>
  mapa: AccesoAlMapa
  lugar: string
  /** Las etiquetas de los botones cuyos paneles están abiertos. */
  onActivos?: (etiquetas: string[]) => void
}) {
  const [marcadores, setMarcadores] = useState(false)
  const [usuario, setUsuario] = useState("")
  const [resumen, setResumen] = useState(false)
  // Tabla y consulta comparten la selección: lo que una marca, la otra lo ve.
  const [tabla, setTabla] = useState(false)
  const [altoTabla, setAltoTabla] = useState(ALTO_TABLA.inicial)
  const [capaTabla, setCapaTabla] = useState<CapaDeTabla>("node")
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set())
  const [consulta, setConsulta] = useState<string | null>(null)
  const [ventanaConsulta, setVentanaConsulta] = useState(false)
  // Resumen y Cercanía usan el mismo lugar junto a las herramientas: uno a la vez.
  const [cercania, setCercania] = useState(false)
  const [imprimir, setImprimir] = useState(false)

  useImperativeHandle(ref, () => ({
    abrir(herramienta) {
      switch (herramienta) {
        case "marcadores":
          setUsuario(usuarioActual())
          setMarcadores(true)
          return
        case "atajos":
          mapa.api.current?.abrirAtajos()
          return
        // Los paneles que acompañan al mapa se abren y se cierran con su botón.
        case "resumen":
          setResumen((abierto) => !abierto)
          setCercania(false)
          return
        case "cercania":
          setCercania((abierto) => !abierto)
          setResumen(false)
          return
        case "imprimir":
          setImprimir(true)
          return
        case "tabla":
          // Alto inicial según la pantalla: en una de 657 px la tabla de 260
          // dejaba el mapa en 207.
          if (!tabla) setAltoTabla(Math.round(Math.min(300, Math.max(ALTO_TABLA.minimo, window.innerHeight * 0.32))))
          setTabla((abierta) => !abierta)
          return
        case "consulta":
          setVentanaConsulta(true)
          return
        default:
          return "Esa herramienta todavía no está disponible."
      }
    },
  }))

  useEffect(() => {
    onActivos?.([...(resumen ? ["Resumen"] : []), ...(tabla ? ["Tabla"] : []), ...(cercania ? ["Cercanía"] : [])])
  }, [resumen, tabla, cercania, onActivos])

  // Lo seleccionado se ve en el mapa, en ámbar. Cerrar la tabla lo suelta.
  useEffect(() => {
    mapa.api.current?.resaltarElementos([...seleccion])
  }, [seleccion, mapa.api])

  function cerrarTabla() {
    setTabla(false)
    setSeleccion(new Set())
    setConsulta(null)
  }

  function aplicarConsulta(r: ResultadoDeConsulta) {
    // La selección es de una capa: con otra capa, sumar o quitar parten de cero.
    const actual = r.consulta.capa === capaTabla ? seleccion : new Set<string>()
    const nueva = combinarSeleccion(actual, r.claves, r.modo)
    setCapaTabla(r.consulta.capa)
    setSeleccion(nueva)
    setConsulta(r.descripcion)
    setTabla(true)
    if (nueva.size > 0) mapa.api.current?.resaltarElementos([...nueva], { encuadrar: true })
  }

  return (
    <>
      <VentanaMarcadores open={marcadores} onOpenChange={setMarcadores} usuario={usuario} lugar={lugar} mapa={mapa.api} />
      <VentanaConsulta
        open={ventanaConsulta}
        onOpenChange={setVentanaConsulta}
        mapa={mapa.api}
        capaInicial={capaTabla}
        haySeleccion={seleccion.size > 0}
        onAplicar={aplicarConsulta}
      />
      <VentanaImprimir open={imprimir} onOpenChange={setImprimir} mapa={mapa.api} lugar={lugar} />
      {resumen && <PanelResumen mapa={mapa.api} onCerrar={() => setResumen(false)} espacioAbajo={tabla ? altoTabla : 0} />}
      {cercania && (
        <PanelCercania
          mapa={mapa.api}
          onCerrar={() => setCercania(false)}
          espacioAbajo={tabla ? altoTabla : 0}
          onSeleccionarEnTabla={(capa, claves, descripcion) => {
            setCapaTabla(capa)
            setSeleccion(new Set(claves))
            setConsulta(descripcion)
            setTabla(true)
          }}
        />
      )}
      {tabla && (
        <TablaAtributos
          mapa={mapa.api}
          capa={capaTabla}
          onCapa={(c) => {
            setCapaTabla(c)
            setSeleccion(new Set())
            setConsulta(null)
          }}
          seleccion={seleccion}
          onSeleccion={(claves) => {
            setSeleccion(claves)
            // Elegir a mano deja de ser el resultado de la consulta.
            setConsulta(null)
          }}
          consulta={consulta}
          onQuitarConsulta={() => setConsulta(null)}
          onConsultar={() => setVentanaConsulta(true)}
          onCerrar={cerrarTabla}
          alto={altoTabla}
          onAlto={setAltoTabla}
        />
      )}
    </>
  )
}
