"use client"

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react"
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
import { PanelAsistente } from "./asistente/panel-asistente"
import type { AccionDelAsistente } from "./asistente/acciones"
import { normalizar } from "@/lib/map/busqueda"
import { PanelApariencia } from "./vista/panel-apariencia"
import { APARIENCIA_INICIAL, CAPAS_CON_OPACIDAD, guardarApariencia, leerApariencia, type Apariencia } from "./vista/apariencia"
import { copiarMapa } from "./vista/copiar-mapa"

/** Lo que el tablero le pide al módulo: abrir una de sus herramientas. */
export type ManejadorDelModulo = {
  /** Abre la herramienta; devuelve qué decirle al usuario si no se pudo. */
  abrir: (herramienta: HerramientaAvanzada) => string | void
  /** Abre el asistente y le hace esa pregunta (desde el buscador, Ctrl+K). */
  preguntar: (texto: string) => void
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
  onRecorrerTrace,
}: {
  ref?: Ref<ManejadorDelModulo>
  mapa: AccesoAlMapa
  lugar: string
  /** Las etiquetas de los botones cuyos paneles están abiertos. */
  onActivos?: (etiquetas: string[]) => void
  /** Abre la ventana del trace con ese recorrido (lo pide el asistente). */
  onRecorrerTrace?: (idOrigen: string, direccion: "UPSTREAM" | "DOWNSTREAM", etiqueta: string | null) => void
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
  // El asistente queda abierto (con su conversación) hasta que se cierra.
  const [asistente, setAsistente] = useState(false)
  // Una pregunta que llega del buscador; el panel la envía al abrirse y la suelta.
  const [pedido, setPedido] = useState<{ texto: string; n: number } | null>(null)
  // Siempre creciente: el panel recuerda el último que atendió.
  const pedidosRef = useRef(0)
  // Si el asistente marcó un punto con su círculo, al cerrarlo se quita.
  const [circulo, setCirculo] = useState(false)
  // Mapa base y transparencia (en el lugar de Resumen y Cercanía) y el minimapa:
  // lo elegido se recuerda por usuario (vista/apariencia.ts).
  const [panelFondo, setPanelFondo] = useState(false)
  const [apariencia, setApariencia] = useState<Apariencia>(() =>
    typeof window === "undefined" ? APARIENCIA_INICIAL : leerApariencia(usuarioActual()),
  )
  // Mientras se espera el recuadro para acercar.
  const [recuadro, setRecuadro] = useState(false)
  // Un aviso corto abajo (Copiar mapa, Anterior sin historial…), como el de la cinta.
  const [aviso, setAviso] = useState<string | null>(null)
  const avisoRef = useRef(0)

  function avisar(texto: string) {
    setAviso(texto)
    window.clearTimeout(avisoRef.current)
    avisoRef.current = window.setTimeout(() => setAviso(null), 3_500)
  }

  function cambiarApariencia(nueva: Apariencia) {
    setApariencia(nueva)
    guardarApariencia(usuarioActual(), nueva)
  }

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
          setPanelFondo(false)
          return
        case "cercania":
          setCercania((abierto) => !abierto)
          setResumen(false)
          setPanelFondo(false)
          return
        case "fondo":
          setPanelFondo((abierto) => !abierto)
          setResumen(false)
          setCercania(false)
          return
        case "minimapa":
          cambiarApariencia({ ...apariencia, minimapa: !apariencia.minimapa })
          return
        case "anterior":
          if (!mapa.api.current?.vistaAnterior()) return "No hay una vista anterior."
          return
        case "siguiente":
          if (!mapa.api.current?.vistaSiguiente()) return "No hay una vista siguiente."
          return
        case "recuadro": {
          const api = mapa.api.current
          if (!api) return "El mapa todavía no está listo."
          setRecuadro(true)
          void api.acercarConRecuadro("Arrastra un recuadro sobre la zona a la que quieres acercarte.").finally(() => setRecuadro(false))
          return
        }
        case "copiar": {
          const api = mapa.api.current
          if (!api) return "El mapa todavía no está listo."
          avisar("Copiando el mapa…")
          copiarMapa(api, { lugar, conFondo: apariencia.fondo !== "ninguno" })
            .then((r) =>
              avisar(
                (r.como === "copiado"
                  ? "Mapa copiado: pégalo en WhatsApp o en un correo con Ctrl+V."
                  : "El navegador no dejó copiar la imagen: se descargó como PNG.") +
                  (r.incompleta ? " El mapa base no terminó de cargar: pueden faltar partes del fondo." : ""),
              ),
            )
            .catch((e: unknown) => avisar(`No se pudo copiar el mapa: ${e instanceof Error ? e.message : String(e)}`))
          return
        }
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
        case "asistente":
          setAsistente((abierto) => !abierto)
          setPedido(null)
          return
        default:
          return "Esa herramienta todavía no está disponible."
      }
    },
    preguntar(texto) {
      setAsistente(true)
      pedidosRef.current += 1
      setPedido({ texto, n: pedidosRef.current })
    },
  }))

  // Ctrl+I («IA») abre o cierra el asistente desde cualquier parte del tablero.
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "i") {
        e.preventDefault()
        setAsistente((abierto) => !abierto)
        setPedido(null)
      }
    }
    window.addEventListener("keydown", alPulsar)
    return () => window.removeEventListener("keydown", alPulsar)
  }, [])

  /**
   * La clave del elemento del mapa que se llama así, para que los nombres de
   * las respuestas lleven al mapa. Solo si hay uno: con dos «N1» no hay a
   * cuál llevar.
   */
  const buscarNombre = useMemo(() => {
    const porNombre = new Map<string, string | null>()
    for (const e of mapa.indice) {
      if (e.tipo === "zone") continue
      for (const n of [e.nombre, ...(e.alias ?? [])]) {
        const k = normalizar(n)
        if (k.length < 2) continue
        porNombre.set(k, porNombre.has(k) && porNombre.get(k) !== e.clave ? null : e.clave)
      }
    }
    return (nombre: string) => porNombre.get(normalizar(nombre)) ?? null
  }, [mapa.indice])

  const soltarPedido = useCallback(() => setPedido(null), [])

  function cerrarAsistente() {
    setAsistente(false)
    setPedido(null)
    // El círculo es del asistente; si Cercanía está abierta, el suyo se queda.
    if (circulo && !cercania) mapa.api.current?.pintarCercania(null)
    setCirculo(false)
  }

  useEffect(() => {
    onActivos?.([
      ...(resumen ? ["Resumen"] : []),
      ...(tabla ? ["Tabla"] : []),
      ...(cercania ? ["Cercanía"] : []),
      ...(asistente ? ["Asistente IA"] : []),
      ...(panelFondo ? ["Mapa base"] : []),
      ...(apariencia.minimapa ? ["Minimapa"] : []),
      ...(recuadro ? ["Recuadro"] : []),
    ])
  }, [resumen, tabla, cercania, asistente, panelFondo, apariencia.minimapa, recuadro, onActivos])

  // El aspecto elegido se aplica al mapa al empezar y en cada cambio. El mapa
  // publica su API apenas se monta: si todavía no está, se reintenta un rato.
  useEffect(() => {
    let intentos = 0
    let temporizador = 0
    const aplicar = () => {
      const api = mapa.api.current
      if (!api) {
        if (intentos++ < 40) temporizador = window.setTimeout(aplicar, 250)
        return
      }
      api.ponerFondo(apariencia.fondo)
      for (const { id } of CAPAS_CON_OPACIDAD) api.ponerOpacidad(id, apariencia.opacidades[id])
      api.ponerMinimapa(apariencia.minimapa)
    }
    aplicar()
    return () => window.clearTimeout(temporizador)
  }, [apariencia, mapa.api])

  // Lo seleccionado se ve en el mapa, en ámbar. Cerrar la tabla lo suelta.
  useEffect(() => {
    mapa.api.current?.resaltarElementos([...seleccion])
  }, [seleccion, mapa.api])

  /**
   * Resalta y encuadra. Si la tabla se está abriendo, el mapa se achica en el
   * siguiente cuadro: se encuadra después, o lo elegido queda bajo la tabla.
   */
  function encuadrar(claves: string[]) {
    const api = mapa.api.current
    if (!api) return
    if (tabla) {
      api.resaltarElementos(claves, { encuadrar: true })
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => mapa.api.current?.resaltarElementos(claves, { encuadrar: true })))
  }

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
    if (nueva.size > 0) encuadrar([...nueva])
  }

  /** Lo que el asistente pidió hacer en el mapa. Devuelve lo que no se pudo, para decirlo. */
  function aplicarAcciones(acciones: AccionDelAsistente[]): string[] {
    const avisos: string[] = []
    const TIPO = { cubierta: "node", cable: "fiber", cabecera: "cabecera" } as const
    const buscar = (capa: keyof typeof TIPO, nombre: string) => {
      const n = normalizar(nombre)
      return mapa.indice.find(
        (e) => e.tipo === TIPO[capa] && (normalizar(e.nombre) === n || (e.alias ?? []).some((a) => normalizar(a) === n)),
      )
    }
    for (const accion of acciones) {
      if (accion.tipo === "mostrar") {
        const elemento = buscar(accion.capa, accion.nombre)
        if (elemento) mapa.ubicar(elemento.clave)
        else avisos.push(`No encontré ${accion.capa} «${accion.nombre}» en el mapa.`)
      } else if (accion.tipo === "seleccionar") {
        const nivel = accion.nivel ? normalizar(accion.nivel) : ""
        const encontrados = nivel
          ? mapa.indice
              .filter((e) => e.tipo === "node" && normalizar(e.categoria ?? "").includes(nivel))
              .map((e) => ({ n: e.nombre, e }))
          : accion.nombres.map((n) => ({ n, e: buscar(accion.capa, n) }))
        const claves = encontrados.flatMap((x) => (x.e ? [x.e.clave] : []))
        const faltan = encontrados.filter((x) => !x.e).map((x) => x.n)
        if (nivel && claves.length === 0) avisos.push(`No hay cubiertas de «${accion.nivel}» en el mapa.`)
        if (claves.length > 0) {
          setCapaTabla(accion.capa === "cable" ? "fiber" : "node")
          setSeleccion(new Set(claves))
          setConsulta("Elegidos por el asistente")
          setTabla(true)
          encuadrar(claves)
        }
        if (faltan.length > 0) {
          avisos.push(`No están en el mapa: ${faltan.slice(0, 6).join(", ")}${faltan.length > 6 ? ` y ${faltan.length - 6} más` : ""}.`)
        }
      } else if (accion.tipo === "trace") {
        onRecorrerTrace?.(accion.idOrigen, accion.direccion, accion.etiqueta)
      } else if (accion.tipo === "cercania") {
        mapa.api.current?.pintarCercania({ centro: [accion.lon, accion.lat], radioM: accion.radioM }, { encuadrar: true })
        setCirculo(true)
      }
    }
    return avisos
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
      {panelFondo && (
        <PanelApariencia
          apariencia={apariencia}
          onCambiar={cambiarApariencia}
          onCerrar={() => setPanelFondo(false)}
          espacioAbajo={tabla ? altoTabla : 0}
        />
      )}
      {aviso && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-16 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-gismart-fade-in rounded-lg bg-foreground/90 px-4 py-2 text-center text-xs font-medium text-background shadow-lg"
        >
          {aviso}
        </div>
      )}
      {asistente && (
        <PanelAsistente
          ficha={() => mapa.api.current?.puntoDeLaFicha()?.nombre ?? null}
          lugar={lugar}
          onAcciones={aplicarAcciones}
          onCerrar={cerrarAsistente}
          buscarNombre={buscarNombre}
          onUbicar={mapa.ubicar}
          pedido={pedido}
          onPedidoAtendido={soltarPedido}
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
