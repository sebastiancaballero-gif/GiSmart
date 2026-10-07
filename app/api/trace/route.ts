import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import { DIRECCIONES_TRACE, hilosDelRecorrido, normalizarPasos, type DireccionTrace } from "@/lib/map/trace"
import {
  UUID,
  clienteSupabase,
  detalleSoloEnDesarrollo,
  faltaConfiguracion,
  mensajeDeFuncion,
} from "@/lib/supabase-servidor"

/**
 * Recorrido del trace desde un puerto o un hilo, hacia arriba (`UPSTREAM`,
 * hacia la OLT) o hacia abajo (`DOWNSTREAM`, hacia el usuario), con la función
 * `tab_fiber.fn_trace_conectividad_fina` (ver lib/map/trace.ts).
 *
 * Es POST y no GET porque la función deja cada ejecución en
 * `tab_fiber.log_trace_conectividad`. `p_usuario_id` va en nulo: la función lo
 * pide como UUID y los usuarios de `usuario_app` solo tienen nombre.
 *
 * Además de los pasos devuelve los cables del recorrido: el cable de cada hilo
 * según `tab_fiber.hilo_cable`. Con ellos se pinta la línea mientras la
 * función no mande la geometría de cada paso (`geojson_path` llega vacío).
 */
export async function POST(request: Request) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const cuerpo = (await request.json().catch(() => null)) as { id?: unknown; direccion?: unknown } | null
  const id = typeof cuerpo?.id === "string" ? cuerpo.id.trim() : ""
  if (!UUID.test(id)) {
    return NextResponse.json({ message: "El origen tiene que ser el UUID de un puerto o de un hilo." }, { status: 400 })
  }
  const direccion = cuerpo?.direccion
  if (!DIRECCIONES_TRACE.includes(direccion as DireccionTrace)) {
    return NextResponse.json({ message: "La dirección del trace tiene que ser UPSTREAM o DOWNSTREAM." }, { status: 400 })
  }

  const cliente = clienteSupabase("tab_fiber")
  if (!cliente) return faltaConfiguracion()

  try {
    const { data, error } = await cliente.rpc("fn_trace_conectividad_fina", {
      p_id_origen: id,
      p_direccion: direccion,
      p_usuario_id: null,
    })
    if (error) {
      console.error(`[fn_trace_conectividad_fina ${id} ${direccion}] ${error.code} ${error.message}`)
      return NextResponse.json(
        {
          message: mensajeDeFuncion(error.code, {
            nombre: "trace",
            esquemaPermiso: "tab_fiber",
            porDefecto: "La base no pudo calcular el recorrido.",
          }),
          ...detalleSoloEnDesarrollo(`${error.code}: ${error.message}`),
        },
        { status: 502 },
      )
    }

    const pasos = normalizarPasos(data)
    const hilos = hilosDelRecorrido(pasos)
    const cables: string[] = []
    if (hilos.length > 0) {
      const { data: filas, error: errorHilos } = await cliente.from("hilo_cable").select("id, id_cable").in("id", hilos)
      if (errorHilos) {
        console.error(`[trace ${id}] hilo_cable: ${errorHilos.code} ${errorHilos.message}`)
        return NextResponse.json(
          {
            message: "Se calculó el recorrido, pero no se pudieron leer los cables de sus hilos para pintarlo.",
            ...detalleSoloEnDesarrollo(`hilo_cable → ${errorHilos.code}: ${errorHilos.message}`),
          },
          { status: 502 },
        )
      }
      const cablePorHilo = new Map((filas ?? []).map((f) => [f.id as string, f.id_cable as string | null]))
      for (const hilo of hilos) {
        const cable = cablePorHilo.get(hilo)
        if (typeof cable === "string" && !cables.includes(cable)) cables.push(cable)
      }
    }

    return NextResponse.json({ pasos, cables })
  } catch (e) {
    return NextResponse.json(
      {
        message: "No se pudo conectar con Supabase para calcular el recorrido.",
        ...detalleSoloEnDesarrollo(e instanceof Error ? e.message : String(e)),
      },
      { status: 502 },
    )
  }
}
