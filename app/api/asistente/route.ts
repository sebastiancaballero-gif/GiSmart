import { NextResponse } from "next/server"
import { exigirSesion, sesionDeLaPeticion, vieneDeOtroSitio } from "@/lib/auth-server"
import { detalleSoloEnDesarrollo } from "@/lib/supabase-servidor"
import {
  ErrorDeGemini,
  MODELO_POR_DEFECTO,
  URL_POR_DEFECTO,
  preguntarAGemini,
} from "@/modulos/avanzado/asistente/servidor/gemini"
import {
  INSTRUCCIONES,
  herramientasDelAsistente,
  type AccionDelAsistente,
} from "@/modulos/avanzado/asistente/servidor/herramientas"
import { GET as leerTraceDeLaRuta } from "@/app/api/traces/[direccion]/[id]/route"

/**
 * El asistente de IA del módulo «Avanzado»: una pregunta en español sobre la
 * red y la respuesta de Gemini, que consulta la base con las herramientas de
 * modulos/avanzado/asistente/servidor/herramientas.ts (solo lectura).
 *
 * La clave de Gemini (GEMINI_API_KEY) vive solo aquí, en el servidor; el
 * modelo se cambia con GEMINI_MODEL sin tocar código.
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
  let cuerpo: { mensaje?: unknown; conversacion?: unknown; contexto?: { ficha?: unknown; lugar?: unknown } } = {}
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

  const acciones: AccionDelAsistente[] = []
  const herramientas = herramientasDelAsistente({
    acciones,
    // El trace, con la misma ruta (y la misma sesión) que usa la ventana del trace.
    leerTrace: async (id, direccion) => {
      const url = new URL(`/api/traces/${direccion === "UPSTREAM" ? "upstream" : "downstream"}/${id}`, request.url)
      const res = await leerTraceDeLaRuta(new Request(url, { headers: { cookie: request.headers.get("cookie") ?? "" } }), {
        params: Promise.resolve({ direccion: direccion === "UPSTREAM" ? "upstream" : "downstream", id }),
      })
      return (await res.json()) as Record<string, unknown>
    },
  })

  try {
    const r = await preguntarAGemini({
      config: {
        clave,
        modelo: process.env.GEMINI_MODEL?.trim() || MODELO_POR_DEFECTO,
        url: process.env.GEMINI_API_URL?.trim() || URL_POR_DEFECTO,
      },
      sistema: INSTRUCCIONES,
      herramientas,
      mensaje: contexto ? `${mensaje}\n\n[Contexto del mapa: ${contexto}]` : mensaje,
      previa: conversacion,
    })
    return NextResponse.json({ respuesta: r.texto, conversacion: r.conversacion, usadas: r.usadas, acciones })
  } catch (e) {
    if (e instanceof ErrorDeGemini) {
      console.error(`[asistente ${usuario}] ${e.message}${e.detalle ? ` · ${e.detalle}` : ""}`)
      return NextResponse.json({ message: e.message, ...detalleSoloEnDesarrollo(e.detalle ?? "") }, { status: e.estado })
    }
    console.error(`[asistente ${usuario}]`, e)
    return NextResponse.json(
      { message: "El asistente falló.", ...detalleSoloEnDesarrollo(e instanceof Error ? e.message : String(e)) },
      { status: 500 },
    )
  }
}
