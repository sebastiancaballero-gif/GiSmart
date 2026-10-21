import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import { clienteSupabase, detalleSoloEnDesarrollo, faltaConfiguracion } from "@/lib/supabase-servidor"

/**
 * Los catálogos de la base que traducen los códigos de las fichas: tipos de
 * elemento (`CUB_N2` → «Cubierta de nivel 2 (NAP)»), fabricantes (`CORN` →
 * «CORNING») y tecnologías del hilo (`DARK` → «Fibra oscura»). Cambian muy de
 * vez en cuando: se guardan 10 minutos.
 */

const VIGENCIA_MS = 10 * 60_000

type Catalogos = {
  tiposElemento: Record<string, string>
  fabricantes: Record<string, string>
  tecnologias: Record<string, string>
}

let guardado: { valor: Catalogos; hasta: number } | null = null

async function leer(tabla: string, codigo: string, nombre: string): Promise<Record<string, string>> {
  const cliente = clienteSupabase("geo_fiber")
  if (!cliente) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY no están configurados.")
  const { data, error } = await cliente.from(tabla).select(`${codigo}, ${nombre}`)
  if (error) throw new Error(`geo_fiber.${tabla} → ${error.code}: ${error.message}`)
  const mapa: Record<string, string> = {}
  for (const fila of (data ?? []) as unknown as Record<string, unknown>[]) {
    const c = fila[codigo]
    const n = fila[nombre]
    if (typeof c === "string" && typeof n === "string" && n.trim()) mapa[c] = n.trim()
  }
  return mapa
}

export async function GET(request: Request) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion
  if (!clienteSupabase("geo_fiber")) return faltaConfiguracion()

  if (guardado && guardado.hasta > Date.now()) return NextResponse.json(guardado.valor)
  try {
    const [tiposElemento, fabricantes, tecnologias] = await Promise.all([
      leer("cat_tipos_elem", "tipo_elem", "descripcion"),
      leer("cat_cods_fabricante", "cod_fab", "nombre"),
      leer("cat_tipo_tecnologia_hilo", "tipo_tec", "descripcion"),
    ])
    const valor = { tiposElemento, fabricantes, tecnologias }
    guardado = { valor, hasta: Date.now() + VIGENCIA_MS }
    return NextResponse.json(valor)
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error(`[catalogos] ${detalle}`)
    return NextResponse.json(
      { message: "No se pudieron leer los catálogos de la base.", ...detalleSoloEnDesarrollo(detalle) },
      { status: 502 },
    )
  }
}
