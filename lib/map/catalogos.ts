import { fetchConSesion } from "@/lib/auth"

/**
 * Los catálogos de la base para leer los códigos de las fichas (ver
 * `GET /api/catalogos`): tipos de elemento, fabricantes y tecnologías.
 */
export type Catalogos = {
  tiposElemento: Record<string, string>
  fabricantes: Record<string, string>
  tecnologias: Record<string, string>
}

export type ResultadoCatalogos = { estado: "ok"; catalogos: Catalogos } | { estado: "error"; mensaje: string; detalle?: string }

/** Qué catálogo traduce cada campo de las fichas. */
export const CATALOGO_DEL_CAMPO: Record<string, keyof Catalogos> = {
  cod_fabricante: "fabricantes",
  tip_elem_from: "tiposElemento",
  tip_elem_to: "tiposElemento",
  tipo_origen_red: "tiposElemento",
  tipo_tecnologia: "tecnologias",
}

/** El nombre de un código según su catálogo, o `null` si no está. */
export function nombreDelCodigo(catalogos: Catalogos | null, campo: string, codigo: unknown): string | null {
  const catalogo = CATALOGO_DEL_CAMPO[campo]
  if (!catalogos || !catalogo || typeof codigo !== "string") return null
  return catalogos[catalogo][codigo] ?? null
}

/** Lee lo que responde la ruta. */
export function clasificarRespuestaCatalogos(status: number, cuerpo: unknown): ResultadoCatalogos {
  const objeto = (cuerpo ?? {}) as Partial<Catalogos> & { message?: unknown; detalle?: unknown }
  if (status < 200 || status >= 300) {
    return {
      estado: "error",
      mensaje: typeof objeto.message === "string" ? objeto.message : `No se pudieron leer los catálogos (HTTP ${status}).`,
      ...(typeof objeto.detalle === "string" ? { detalle: objeto.detalle } : {}),
    }
  }
  const mapa = (v: unknown): Record<string, string> =>
    v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"))
      : {}
  return {
    estado: "ok",
    catalogos: { tiposElemento: mapa(objeto.tiposElemento), fabricantes: mapa(objeto.fabricantes), tecnologias: mapa(objeto.tecnologias) },
  }
}

// Una sola lectura por sesión del navegador; si falla, la siguiente vuelve a intentar.
let enCamino: Promise<ResultadoCatalogos> | null = null

/** Los catálogos, pedidos una vez. Nunca lanza: un fallo vuelve como `estado: "error"`. */
export function leerCatalogos(): Promise<ResultadoCatalogos> {
  if (!enCamino) {
    enCamino = fetchConSesion("/api/catalogos", { signal: AbortSignal.timeout(15_000) })
      .then(async (res) => clasificarRespuestaCatalogos(res.status, await res.json().catch(() => null)))
      .catch(() => ({ estado: "error" as const, mensaje: "Error de red al leer los catálogos." }))
      .then((r) => {
        if (r.estado === "error") enCamino = null
        return r
      })
  }
  return enCamino
}
