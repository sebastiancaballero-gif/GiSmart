import { NextResponse } from "next/server"
import { exigirSesion } from "@/lib/auth-server"
import { direccionDeUrl, geometria, hilosDelRecorrido, normalizarPasos, numero } from "@/lib/map/trace"
import { UUID, clienteSupabase, detalleSoloEnDesarrollo, faltaConfiguracion } from "@/lib/supabase-servidor"

/** Lo que se le dice a quien usa el mapa cuando la tabla de caché no se puede leer. */
function mensajeDeCache(codigo: string | undefined): string {
  switch (codigo) {
    case "42501":
      return "La base no permite leer la caché del trace: falta un permiso sobre tab_fiber.element_connection."
    case "42P01":
    case "PGRST205":
      return "La tabla de caché del trace (tab_fiber.element_connection) no existe en la base."
    case "42703":
      return "La tabla de caché del trace cambió de columnas. Hay que actualizar la consulta."
    default:
      return "No se pudo leer el recorrido en la caché del trace."
  }
}

/**
 * Recorrido del trace desde un puerto o un hilo, como lo planteó el ingeniero:
 * `GET /api/traces/downstream/{id}` (hacia el usuario) o
 * `GET /api/traces/upstream/{id}` (hacia la OLT).
 *
 * No calcula nada: lee el recorrido ya calculado en la tabla de caché
 * `tab_fiber.element_connection` (ver lib/map/trace.ts), así no se llama la
 * función del trace cada vez. Devuelve la geometría del recorrido en `geomPath`
 * (la columna `geom_path`, GeoJSON en EPSG:4326), los pasos, el total de pasos,
 * la atenuación total y cuándo se calculó.
 *
 * Mientras `geom_path` llegue vacía devuelve además los cables del recorrido:
 * el cable de cada hilo según `tab_fiber.hilo_cable`, que el mapa resalta.
 */
export async function GET(request: Request, { params }: { params: Promise<{ direccion: string; id: string }> }) {
  const sinSesion = exigirSesion(request)
  if (sinSesion) return sinSesion

  const { direccion: enUrl, id: crudo } = await params
  const direccion = direccionDeUrl(enUrl)
  if (!direccion) {
    return NextResponse.json({ message: "La dirección del trace tiene que ser downstream o upstream." }, { status: 400 })
  }
  let id = ""
  try {
    id = decodeURIComponent(crudo).trim()
  } catch {
    // Un % suelto en la URL: no es un UUID.
  }
  if (!UUID.test(id)) {
    return NextResponse.json({ message: "El origen tiene que ser el UUID de un puerto o de un hilo." }, { status: 400 })
  }

  const cliente = clienteSupabase("tab_fiber")
  if (!cliente) return faltaConfiguracion()

  try {
    // Una fila por origen y sentido; si algún día hubiera dos, vale la más reciente.
    const { data: filas, error } = await cliente
      .from("element_connection")
      .select("id_destino, total_pasos, atenuacion_total_db, path_secuencia, geom_path, fecha_calculo")
      .eq("id_origen", id)
      .eq("direccion", direccion)
      .order("fecha_calculo", { ascending: false })
      .limit(1)
    if (error) {
      console.error(`[element_connection ${id} ${direccion}] ${error.code} ${error.message}`)
      return NextResponse.json(
        {
          message: mensajeDeCache(error.code),
          ...detalleSoloEnDesarrollo(`element_connection → ${error.code}: ${error.message}`),
        },
        { status: 502 },
      )
    }

    const fila = filas?.[0]
    if (!fila) {
      return NextResponse.json({
        encontrado: false,
        geomPath: null,
        pasos: [],
        totalPasos: 0,
        cables: [],
        atenuacionTotal: null,
        calculadoEn: null,
      })
    }

    const pasos = normalizarPasos(fila.path_secuencia)
    const geomPath = geometria(fila.geom_path)
    const cables: string[] = []
    // Sin la geometría de la tabla, se pinta con los cables de los hilos.
    const hilos = geomPath ? [] : hilosDelRecorrido(pasos)
    if (hilos.length > 0) {
      const { data: hilosCable, error: errorHilos } = await cliente.from("hilo_cable").select("id, id_cable").in("id", hilos)
      if (errorHilos) {
        console.error(`[trace ${id}] hilo_cable: ${errorHilos.code} ${errorHilos.message}`)
        return NextResponse.json(
          {
            message: "Se encontró el recorrido, pero no se pudieron leer los cables de sus hilos para pintarlo.",
            ...detalleSoloEnDesarrollo(`hilo_cable → ${errorHilos.code}: ${errorHilos.message}`),
          },
          { status: 502 },
        )
      }
      const cablePorHilo = new Map((hilosCable ?? []).map((f) => [f.id as string, f.id_cable as string | null]))
      for (const hilo of hilos) {
        const cable = cablePorHilo.get(hilo)
        if (typeof cable === "string" && !cables.includes(cable)) cables.push(cable)
      }
    }

    return NextResponse.json({
      encontrado: true,
      geomPath,
      pasos,
      totalPasos: numero(fila.total_pasos) ?? new Set(pasos.map((p) => p.paso)).size,
      cables,
      atenuacionTotal: numero(fila.atenuacion_total_db),
      calculadoEn: typeof fila.fecha_calculo === "string" ? fila.fecha_calculo : null,
    })
  } catch (e) {
    return NextResponse.json(
      {
        message: "No se pudo conectar con Supabase para leer el recorrido.",
        ...detalleSoloEnDesarrollo(e instanceof Error ? e.message : String(e)),
      },
      { status: 502 },
    )
  }
}
