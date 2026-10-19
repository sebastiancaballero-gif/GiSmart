import { NextResponse } from "next/server"
import { exigirSesion, sesionDeLaPeticion, vieneDeOtroSitio } from "@/lib/auth-server"
import { detalleSoloEnDesarrollo } from "@/lib/supabase-servidor"
import {
  ErrorDeGemini,
  MODELO_POR_DEFECTO,
  RESPALDO_POR_DEFECTO,
  URL_POR_DEFECTO,
  preguntarAGemini,
} from "@/modulos/avanzado/asistente/servidor/gemini"
import {
  INSTRUCCIONES,
  herramientasDelAsistente,
  largoDeLineaM,
  type AccionDelAsistente,
} from "@/modulos/avanzado/asistente/servidor/herramientas"
import { separarSugerencias } from "@/modulos/avanzado/asistente/sugerencias"
import { describirPaso } from "@/modulos/avanzado/asistente/pasos"
import { GET as leerTraceDeLaRuta } from "@/app/api/traces/[direccion]/[id]/route"
import { GET as geocodificarEnLaRuta } from "@/app/api/geocode/route"
import { GET as leerCubiertasDeLaRuta } from "@/app/api/mufas/route"
import { GET as leerCablesDeLaRuta } from "@/app/api/fiber-cables/route"

/**
 * El asistente de IA del módulo «Avanzado»: una pregunta en español sobre la
 * red y la respuesta de Gemini, que consulta la base con las herramientas de
 * modulos/avanzado/asistente/servidor/herramientas.ts (solo lectura).
 *
 * La clave de Gemini (GEMINI_API_KEY) vive solo aquí, en el servidor; el
 * modelo se cambia con GEMINI_MODEL sin tocar código.
 *
 * Con `progreso: true` la respuesta llega por partes (una línea JSON por
 * evento): cada paso que da el asistente («Leyendo la ficha de CO19») y al
 * final la respuesta. Así el panel muestra lo que está haciendo en vez de
 * esperar a ciegas. Detrás de un proxy que guarde la respuesta entera (IIS
 * con buffer) los pasos llegan juntos al final y el panel funciona igual.
 */

const MAX_BYTES = 8_000
const MAX_MENSAJE = 2_000
/** Preguntas por usuario y hora: cada una cuesta cuota de Gemini. */
const POR_HORA = 40
const usos = new Map<string, number[]>()

function dentroDelLimite(usuario: string, ahora = Date.now()): boolean {
  const recientes = (usos.get(usuario) ?? []).filter((t) => ahora - t < 3_600_000)
  if (recientes.length >= POR_HORA) {
    usos.set(usuario, recientes)
    return false
  }
  recientes.push(ahora)
  usos.set(usuario, recientes)
  // Que el registro no crezca sin techo.
  if (usos.size > 500) usos.delete(usos.keys().next().value as string)
  return true
}

type Punto = { type?: string; coordinates?: unknown }
type CapaGeoJson = { features?: { geometry?: Punto | null; properties?: Record<string, unknown> | null }[]; message?: string }

export async function POST(request: Request) {
  if (vieneDeOtroSitio(request)) return NextResponse.json({ message: "Solicitud no permitida." }, { status: 403 })
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion
  const usuario = sesionDeLaPeticion(request)?.sub ?? "?"

  const clave = process.env.GEMINI_API_KEY?.trim()
  if (!clave) {
    return NextResponse.json(
      { codigo: "sin-clave", message: "El asistente no está configurado: falta GEMINI_API_KEY en el servidor (.env.local)." },
      { status: 503 },
    )
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return NextResponse.json({ message: "La pregunta es demasiado larga." }, { status: 413 })
  }
  const crudo = await request.text().catch(() => "")
  if (crudo.length > MAX_BYTES) return NextResponse.json({ message: "La pregunta es demasiado larga." }, { status: 413 })
  let cuerpo: { mensaje?: unknown; conversacion?: unknown; progreso?: unknown; contexto?: { ficha?: unknown; lugar?: unknown } } = {}
  try {
    cuerpo = JSON.parse(crudo)
  } catch {
    return NextResponse.json({ message: "La petición no es JSON." }, { status: 400 })
  }
  const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : ""
  if (!mensaje) return NextResponse.json({ message: "Escribe una pregunta." }, { status: 400 })
  if (mensaje.length > MAX_MENSAJE) {
    return NextResponse.json({ message: `La pregunta pasa de ${MAX_MENSAJE} caracteres.` }, { status: 413 })
  }
  const conversacion =
    typeof cuerpo.conversacion === "string" && /^[\w.:-]{1,200}$/.test(cuerpo.conversacion) ? cuerpo.conversacion : null
  const conProgreso = cuerpo.progreso === true

  if (!dentroDelLimite(usuario)) {
    return NextResponse.json(
      { message: `Llegaste a ${POR_HORA} preguntas en la última hora. Espera un poco para seguir.` },
      { status: 429 },
    )
  }

  // Lo que el usuario está viendo, para que «esta cubierta» tenga sentido.
  const ficha = typeof cuerpo.contexto?.ficha === "string" ? cuerpo.contexto.ficha.slice(0, 80) : null
  const lugar = typeof cuerpo.contexto?.lugar === "string" ? cuerpo.contexto.lugar.slice(0, 120) : null
  const contexto = [ficha ? `ficha abierta: ${ficha}` : null, lugar ? `el mapa está en: ${lugar}` : null].filter(Boolean).join("; ")

  // Las rutas que usa el asistente se llaman directamente, con la misma sesión.
  const cookie = request.headers.get("cookie") ?? ""
  const conSesion = (ruta: URL) => new Request(ruta, { headers: { cookie } })

  const acciones: AccionDelAsistente[] = []
  const herramientas = herramientasDelAsistente({
    acciones,
    // El trace, con la misma ruta que usa la ventana del trace.
    leerTrace: async (id, direccion) => {
      const sentido = direccion === "UPSTREAM" ? "upstream" : "downstream"
      const res = await leerTraceDeLaRuta(conSesion(new URL(`/api/traces/${sentido}/${id}`, request.url)), {
        params: Promise.resolve({ direccion: sentido, id }),
      })
      return (await res.json()) as Record<string, unknown>
    },
    // Las direcciones, con la misma búsqueda (y la misma caché) que el buscador.
    geocodificar: async (texto, cerca) => {
      const url = new URL("/api/geocode", request.url)
      url.searchParams.set("q", texto.slice(0, 120))
      if (cerca) {
        url.searchParams.set("lon", cerca.lon.toFixed(5))
        url.searchParams.set("lat", cerca.lat.toFixed(5))
      }
      const res = await geocodificarEnLaRuta(conSesion(url))
      const datos = (await res.json().catch(() => null)) as { results?: { label: string; lat: number; lon: number }[]; message?: string } | null
      if (!res.ok) throw new Error(datos?.message ?? `La búsqueda de direcciones respondió ${res.status}.`)
      return (datos?.results ?? []).map((r) => ({ etiqueta: r.label, lat: r.lat, lon: r.lon }))
    },
    // Las cubiertas con su punto: la misma capa que carga el mapa.
    leerCubiertas: async () => {
      const res = await leerCubiertasDeLaRuta(conSesion(new URL("/api/mufas", request.url)))
      const datos = (await res.json().catch(() => null)) as CapaGeoJson | null
      if (!res.ok) throw new Error(datos?.message ?? `La capa de cubiertas respondió ${res.status}.`)
      return (datos?.features ?? []).flatMap((f) => {
        const c = f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates) ? (f.geometry.coordinates as number[]) : null
        if (!c || typeof c[0] !== "number" || typeof c[1] !== "number") return []
        const p = f.properties ?? {}
        return [{ etiqueta: typeof p.etiqueta === "string" ? p.etiqueta : null, nivel: typeof p.funcion_cub === "string" ? p.funcion_cub : null, lon: c[0], lat: c[1] }]
      })
    },
    // Los cables con el largo de su trazado: la misma capa (y la misma medida) que el mapa.
    leerCables: async () => {
      const res = await leerCablesDeLaRuta(conSesion(new URL("/api/fiber-cables", request.url)))
      const datos = (await res.json().catch(() => null)) as CapaGeoJson | null
      if (!res.ok) throw new Error(datos?.message ?? `La capa de cables respondió ${res.status}.`)
      return (datos?.features ?? []).map((f) => {
        const hilos = f.properties?.cant_hilo
        return { hilos: typeof hilos === "number" && hilos > 0 ? hilos : null, largoM: largoDeLineaM(f.geometry) }
      })
    },
  })

  // Con progreso, cada paso sale apenas pasa; `avisar` se conecta al abrir el flujo.
  let avisar: ((linea: Record<string, unknown>) => void) | null = null

  async function responder() {
    const r = await preguntarAGemini({
      config: {
        clave: clave as string,
        modelo: process.env.GEMINI_MODEL?.trim() || MODELO_POR_DEFECTO,
        // Separados por comas; vacío («GEMINI_MODELOS_RESPALDO=») apaga el respaldo.
        respaldo:
          process.env.GEMINI_MODELOS_RESPALDO !== undefined
            ? process.env.GEMINI_MODELOS_RESPALDO.split(",").map((m) => m.trim()).filter(Boolean)
            : RESPALDO_POR_DEFECTO,
        url: process.env.GEMINI_API_URL?.trim() || URL_POR_DEFECTO,
        onEvento: (evento) => avisar?.({ tipo: "paso", texto: describirPaso(evento) }),
      },
      sistema: INSTRUCCIONES,
      herramientas,
      mensaje: contexto ? `${mensaje}\n\n[Contexto del mapa: ${contexto}]` : mensaje,
      previa: conversacion,
    })
    // La última línea («Sugerencias: …») va aparte: el panel la muestra como botones.
    const { texto, sugerencias } = separarSugerencias(r.texto)
    return {
      respuesta: texto || r.texto,
      sugerencias,
      conversacion: r.conversacion,
      usadas: r.usadas,
      acciones,
      modelo: r.modelo,
      respaldo: r.respaldo,
    }
  }

  function comoError(e: unknown): { estado: number; cuerpo: Record<string, unknown> } {
    if (e instanceof ErrorDeGemini) {
      console.error(`[asistente ${usuario}] ${e.message}${e.detalle ? ` · ${e.detalle}` : ""}`)
      return { estado: e.estado, cuerpo: { message: e.message, ...detalleSoloEnDesarrollo(e.detalle ?? "") } }
    }
    console.error(`[asistente ${usuario}]`, e)
    return { estado: 500, cuerpo: { message: "El asistente falló.", ...detalleSoloEnDesarrollo(e instanceof Error ? e.message : String(e)) } }
  }

  if (!conProgreso) {
    try {
      return NextResponse.json(await responder())
    } catch (e) {
      const { estado, cuerpo: error } = comoError(e)
      return NextResponse.json(error, { status: estado })
    }
  }

  const codificador = new TextEncoder()
  const flujo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      avisar = (linea) => {
        try {
          controlador.enqueue(codificador.encode(`${JSON.stringify(linea)}\n`))
        } catch {
          // El panel se cerró: lo que falta ya no tiene a quién llegar.
        }
      }
      try {
        avisar({ tipo: "fin", ...(await responder()) })
      } catch (e) {
        const { estado, cuerpo: error } = comoError(e)
        avisar({ tipo: "error", estado, ...error })
      } finally {
        avisar = null
        try {
          controlador.close()
        } catch {
          // Ya estaba cerrado.
        }
      }
    },
  })
  return new Response(flujo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Que nadie en el camino (la compresión de Next, un proxy) junte las líneas.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
