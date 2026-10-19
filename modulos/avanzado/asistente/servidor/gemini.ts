/**
 * Conversación con Gemini (Interactions API de Google) para el asistente del
 * módulo «Avanzado». Solo corre en el servidor: la clave nunca va al navegador.
 *
 * El ciclo: se manda la pregunta con las herramientas declaradas; si Gemini
 * pide llamar herramientas (pasos `function_call`), se ejecutan aquí y se le
 * devuelven los resultados (`function_result`) encadenando con
 * `previous_interaction_id`, hasta que responde con texto. El estado de la
 * conversación lo guarda Google (`store`, por defecto): la siguiente pregunta
 * solo manda el id de la última interacción.
 *
 * Documentación (octubre de 2026): https://ai.google.dev/api/interactions-api
 */

import type { EventoDelAsistente } from "../pasos"

export type DeclaracionDeHerramienta = {
  name: string
  description: string
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] }
}

/** Lo que devuelve una herramienta: datos para Gemini (se mandan como JSON). */
export type ResultadoDeHerramienta = unknown

export type Herramienta = DeclaracionDeHerramienta & {
  ejecutar: (argumentos: Record<string, unknown>) => Promise<ResultadoDeHerramienta>
}

/** Un paso de la interacción, tal como lo devuelve la API (solo lo que se usa). */
type Paso = {
  type?: string
  id?: string
  name?: string
  status?: string
  arguments?: Record<string, unknown>
  call_id?: string
  content?: { type?: string; text?: string }[]
}

type Interaccion = { id?: string; status?: string; steps?: Paso[]; error?: { message?: string } }

export class ErrorDeGemini extends Error {
  /** El estado HTTP que se le devuelve al navegador. */
  readonly estado: number
  /** Lo que dijo Google, para el registro (al navegador solo en desarrollo). */
  readonly detalle?: string
  /** El estado HTTP con que respondió Google (para decidir si reintentar). */
  readonly http?: number

  constructor(mensaje: string, estado: number, detalle?: string, http?: number) {
    super(mensaje)
    this.estado = estado
    this.detalle = detalle
    this.http = http
  }
}

export type ConfiguracionGemini = {
  clave: string
  modelo: string
  /**
   * Modelos que se prueban, en orden, si el principal está saturado o sin
   * cuota. Una conversación puede seguir con otro modelo sin perder lo dicho.
   */
  respaldo?: string[]
  /** La URL de `interactions` (cambia con la versión de la API). */
  url: string
  /** Para las pruebas: un `fetch` de mentira. */
  fetch?: typeof fetch
  /** Tope de espera por llamada. */
  esperaMs?: number
  /** Para las pruebas: la pausa antes de reintentar (por defecto, esperar de verdad). */
  pausa?: (ms: number) => Promise<void>
  /** Cada paso (una herramienta, un reintento, otro modelo), para mostrarlo en vivo. */
  onEvento?: (evento: EventoDelAsistente) => void
}

/**
 * Elegido el 15 de octubre de 2026 probando con la clave del proyecto: el 3.5
 * lite contestó bien las preguntas de prueba (también el trace de un hilo, de
 * dos consultas) en 3–8 s cada una, y nunca estuvo saturado. El 3.8 se
 * saturaba a ratos, llegó a tardar 44 s por llamada y su cuota gratuita se
 * acaba enseguida.
 */
export const MODELO_POR_DEFECTO = "gemini-3.5-flash-lite"
/** Otro liviano con su propia cuota, y el 3.8 por si los dos fallan. */
export const RESPALDO_POR_DEFECTO = ["gemini-3.1-flash-lite", "gemini-3.8-flash"]
export const URL_POR_DEFECTO = "https://generativelanguage.googleapis.com/v1beta/interactions"
/** Vueltas de herramientas por pregunta: más, y algo anda mal. */
export const MAX_VUELTAS = 8
/** Esperas antes de reintentar el mismo modelo cuando Google dice que está saturado. */
export const PAUSAS_MS = [1_500, 3_000]

/** Un error de Google que suele pasar solo: saturado (503) o interno (500). */
const pasajero = (http: number) => http === 503 || http === 500

async function crearInteraccion(config: ConfiguracionGemini, modelo: string, cuerpo: Record<string, unknown>): Promise<Interaccion> {
  const hacerFetch = config.fetch ?? fetch
  let res: Response
  try {
    res = await hacerFetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.clave },
      body: JSON.stringify({ ...cuerpo, model: modelo }),
      signal: AbortSignal.timeout(config.esperaMs ?? 45_000),
    })
  } catch (e) {
    const tiempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
    throw new ErrorDeGemini(
      tiempo ? "Gemini no respondió a tiempo." : "No se pudo conectar con Gemini.",
      504,
      e instanceof Error ? e.message : String(e),
    )
  }
  const texto = await res.text()
  let datos: Interaccion & { error?: { message?: string; status?: string } } = {}
  try {
    datos = texto ? JSON.parse(texto) : {}
  } catch {
    // Una respuesta que no es JSON se informa con su comienzo.
  }
  if (!res.ok) {
    const motivo = datos.error?.message ?? texto.slice(0, 300)
    const mensaje =
      res.status === 401 || res.status === 403
        ? "Gemini rechazó la clave (GEMINI_API_KEY): revisa que sea válida y tenga permiso para la API."
        : res.status === 404
          ? `Gemini no reconoce el modelo «${modelo}» o la dirección de la API (GEMINI_MODEL, GEMINI_API_URL).`
          : res.status === 429
            ? "Se agotó la cuota de Gemini por ahora. Intenta en unos minutos."
            : res.status === 503
              ? "Google tiene saturado Gemini en este momento. Intenta de nuevo en un minuto."
              : `Gemini respondió con un error (${res.status}).`
    throw new ErrorDeGemini(mensaje, res.status === 429 ? 429 : res.status === 503 ? 503 : 502, motivo, res.status)
  }
  return datos
}

/**
 * Crea la interacción con el primer modelo que responda: el mismo se reintenta
 * con pausas si está saturado; sin cuota (429) se pasa enseguida al siguiente.
 * Otros errores (clave, modelo inexistente) se informan tal cual.
 */
async function conRespaldo(
  config: ConfiguracionGemini,
  modelos: string[],
  cuerpo: Record<string, unknown>,
): Promise<{ interaccion: Interaccion; modelo: string }> {
  const pausa = config.pausa ?? ((ms: number) => new Promise<void>((listo) => setTimeout(listo, ms)))
  let ultimo: ErrorDeGemini | null = null
  for (const [i, modelo] of modelos.entries()) {
    if (i > 0) config.onEvento?.({ tipo: "respaldo", modelo })
    for (let intento = 0; ; intento++) {
      try {
        return { interaccion: await crearInteraccion(config, modelo, cuerpo), modelo }
      } catch (e) {
        if (!(e instanceof ErrorDeGemini) || !e.http || !(pasajero(e.http) || e.http === 429)) throw e
        ultimo = e
        if (e.http === 429 || intento >= PAUSAS_MS.length) break
        config.onEvento?.({ tipo: "reintento", modelo, esperaMs: PAUSAS_MS[intento] })
        await pausa(PAUSAS_MS[intento])
      }
    }
  }
  if (ultimo && modelos.length > 1) {
    throw new ErrorDeGemini(
      ultimo.http === 429
        ? `Se agotó la cuota de Gemini en todos los modelos (${modelos.join(", ")}). Intenta en unos minutos.`
        : `Google tiene saturado Gemini en este momento (probé ${modelos.join(", ")}). Intenta de nuevo en un minuto.`,
      ultimo.estado,
      ultimo.detalle,
      ultimo.http,
    )
  }
  throw ultimo ?? new ErrorDeGemini("Gemini no respondió.", 502)
}

/** Las llamadas a herramientas que esperan respuesta (las ya respondidas no). */
function llamadasPendientes(pasos: Paso[], respondidas: Set<string>): Paso[] {
  return pasos.filter((p) => p.type === "function_call" && p.id && !respondidas.has(p.id) && p.status !== "done")
}

/** El texto final: los `model_output` que vienen después del último paso del usuario o de una herramienta. */
function textoFinal(pasos: Paso[]): string {
  let desde = 0
  pasos.forEach((p, i) => {
    if (p.type === "user_input" || p.type === "function_result") desde = i + 1
  })
  return pasos
    .slice(desde)
    .filter((p) => p.type === "model_output")
    .flatMap((p) => p.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim()
}

export type RespuestaDelAsistente = {
  texto: string
  /** El id de la última interacción: la siguiente pregunta sigue desde ahí. */
  conversacion: string | null
  /** Las herramientas que usó, en orden (para mostrar qué consultó). */
  usadas: string[]
  /** El modelo que dio la respuesta. */
  modelo: string
  /** Si respondió un modelo de respaldo porque el principal no pudo. */
  respaldo: boolean
}

/**
 * Una pregunta, con sus vueltas de herramientas, hasta la respuesta en texto.
 * `previa` es el id de la conversación anterior, si sigue una.
 */
export async function preguntarAGemini({
  config,
  sistema,
  herramientas,
  mensaje,
  previa,
}: {
  config: ConfiguracionGemini
  sistema: string
  herramientas: Herramienta[]
  mensaje: string
  previa: string | null
}): Promise<RespuestaDelAsistente> {
  const tools = herramientas.map(({ name, description, parameters }) => ({ type: "function", name, description, parameters }))
  // Pensar poco: con el pensamiento por defecto el 3.8 gastaba cientos de
  // tokens en una pregunta simple y tardaba 13–44 s; con «low», 2 s.
  // Temperatura baja: respuestas de datos, no de redacción; con la de por
  // defecto se iba por las ramas y suponía cosas.
  const base = {
    system_instruction: sistema,
    tools,
    generation_config: { max_output_tokens: 1536, thinking_level: "low", temperature: 0.3 },
  }
  const usadas: string[] = []
  const respondidas = new Set<string>()
  // El modelo que responde sigue con las vueltas de herramientas; si se satura
  // a la mitad, se sigue con los de después en la lista.
  let modelos = [config.modelo, ...(config.respaldo ?? []).filter((m) => m && m !== config.modelo)]
  const crear = async (cuerpo: Record<string, unknown>) => {
    const r = await conRespaldo(config, modelos, cuerpo)
    modelos = modelos.slice(modelos.indexOf(r.modelo))
    return r.interaccion
  }

  let interaccion = await crear({ ...base, input: mensaje, ...(previa ? { previous_interaction_id: previa } : {}) })

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    if (interaccion.status === "failed") {
      throw new ErrorDeGemini("Gemini no pudo terminar la respuesta.", 502, interaccion.error?.message)
    }
    const pendientes = llamadasPendientes(interaccion.steps ?? [], respondidas)
    if (pendientes.length === 0) {
      const texto = textoFinal(interaccion.steps ?? [])
      return {
        texto: texto || "No tengo una respuesta para eso.",
        conversacion: interaccion.id ?? null,
        usadas,
        modelo: modelos[0],
        respaldo: modelos[0] !== config.modelo,
      }
    }
    const resultados = []
    for (const llamada of pendientes) {
      const nombre = llamada.name ?? ""
      usadas.push(nombre)
      respondidas.add(llamada.id as string)
      const herramienta = herramientas.find((h) => h.name === nombre)
      config.onEvento?.({ tipo: "herramienta", nombre, argumentos: llamada.arguments ?? {} })
      let resultado: ResultadoDeHerramienta
      try {
        resultado = herramienta
          ? await herramienta.ejecutar(llamada.arguments ?? {})
          : { error: `No existe la herramienta «${nombre}».` }
      } catch (e) {
        // El error va a Gemini como dato: que lo explique en su respuesta.
        resultado = { error: e instanceof Error ? e.message : String(e) }
      }
      resultados.push({
        type: "function_result",
        name: nombre,
        call_id: llamada.id,
        result: [{ type: "text", text: JSON.stringify(resultado) }],
      })
    }
    interaccion = await crear({ ...base, input: resultados, previous_interaction_id: interaccion.id })
  }
  throw new ErrorDeGemini("La pregunta necesitó demasiadas consultas; prueba a hacerla más concreta.", 502)
}
