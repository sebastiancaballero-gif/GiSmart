/**
 * Informe de calidad de los datos de la red.
 *
 *   pnpm run datos
 *
 * Contrasta lo que el mapa calcula contra lo que guarda la base y revisa que la
 * red sea consistente. Está pensado para correrlo cada vez que entren datos
 * nuevos: los problemas de datos no los ve el compilador ni las pruebas, pero
 * llegan igual al ingeniero de red que trabaja con el visor.
 *
 * Qué revisa, y por qué cada cosa importa:
 *
 *   1. Longitudes. El mapa no lee `longitud_calc`: mide la geometría. Si las
 *      dos se separan, o la geometría está mal digitalizada o la columna quedó
 *      desactualizada, y el panel estaría anunciando kilómetros que no son.
 *   2. Topología. `id_elem_from`/`id_elem_to` dicen qué une cada cable. Un
 *      extremo que apunte a una mufa inexistente rompe cualquier recorrido de
 *      la red que se construya sobre esos campos.
 *   3. Geometrías sospechosas: cables de pocos metros, mufas superpuestas,
 *      coordenadas fuera del país.
 *   4. Hilos. «Ver conexiones» depende de la cadena cubierta → conexiones →
 *      hilos → cables. Un eslabón roto deja el botón en gris aunque la
 *      conectividad esté cargada.
 *   5. Conectividad. Pide a la función el JSON de cada mufa y cuenta en
 *      cuántas saldría «Ver conexiones» activo.
 *
 * Necesita `.env.local` con las claves de Supabase. No modifica nada.
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { getLength } from "ol/sphere.js"
import GeoJSON from "ol/format/GeoJSON.js"

const env = readFileSync(".env.local", "utf8")
const leer = (k) => env.split(/\r?\n/).find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim()
const fiber = createClient(leer("SUPABASE_URL"), leer("SUPABASE_SECRET_KEY"), { db: { schema: "geo_fiber" } })
const infra = createClient(leer("SUPABASE_URL"), leer("SUPABASE_SECRET_KEY"), { db: { schema: "geo_infra" } })

/** Umbral a partir del cual una diferencia de longitud se considera rara. */
const TOLERANCIA_PCT = 5
/** Por debajo de esto, un cable probablemente esté a medio digitalizar. */
const LARGO_MINIMO_M = 5

const avisos = []
const aviso = (texto) => {
  avisos.push(texto)
  console.log(`   AVISO  ${texto}`)
}

async function pedir(cliente, relacion) {
  const { data, error } = await cliente.from(relacion).select("*")
  if (error) {
    console.log(`   (no se pudo leer ${relacion}: ${error.message})`)
    return []
  }
  return data ?? []
}

/**
 * Lee una capa como la sirve la aplicación: por su vista `*_geojson` y, si la
 * vista no existe, por la tabla pidiendo `application/geo+json` (el mismo
 * respaldo que usa lib/supabase-geojson.ts). Devuelve filas con `geom` en
 * GeoJSON, que es lo que espera el resto del informe.
 */
async function pedirCapa(cliente, esquema, vista, tabla) {
  const { data, error } = await cliente.from(vista).select("*")
  if (!error) return data ?? []

  const clave = leer("SUPABASE_SECRET_KEY")
  const res = await fetch(`${leer("SUPABASE_URL")}/rest/v1/${tabla}?select=*`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Accept-Profile": esquema, Accept: "application/geo+json" },
  })
  if (!res.ok) {
    console.log(`   (no se pudo leer ${esquema}.${vista} ni ${esquema}.${tabla}: HTTP ${res.status})`)
    return []
  }
  const fc = await res.json()
  return (fc.features ?? []).map((f) => ({ ...f.properties, geom: f.geometry }))
}

const cables = await pedirCapa(fiber, "geo_fiber", "cable_fibra_geojson", "cable_fibra")
const mufas = await pedirCapa(fiber, "geo_fiber", "cubierta_empalme_geojson", "cubierta_empalme")
const cabeceras = await pedir(infra, "cabecera_central")

console.log(`\nRed: ${mufas.length} mufas, ${cables.length} cables, ${cabeceras.length} cabeceras\n`)
if (!cables.length) {
  aviso("geo_fiber.cable_fibra no tiene filas: el mapa no dibuja tendido y la conectividad de las mufas sale vacía")
  console.log()
}

// --- 1. longitudes -------------------------------------------------------
console.log("1) LONGITUD: lo que mide el mapa contra lo que dice la base\n")

const formato = new GeoJSON()
const medidos = []
for (const c of cables) {
  if (!c.geom) continue
  // Mismas proyecciones que usa el mapa al cargar la capa.
  const f = formato.readFeature(
    { type: "Feature", geometry: c.geom, properties: {} },
    { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" },
  )
  // El código se lee mejor que el UUID en los listados del informe.
  medidos.push({ id: c.id, nombre: c.codigo ?? c.id, mapa: getLength(f.getGeometry()), base: Number(c.longitud_calc) })
}

const comparables = medidos.filter((m) => Number.isFinite(m.base) && m.base > 0)
if (!cables.length) {
  console.log("   sin cables que medir")
} else if (comparables.length === 0) {
  aviso("ningún cable trae `longitud_calc`: no hay contra qué comparar")
} else {
  const desvios = comparables.map((m) => ({ ...m, pct: ((m.mapa - m.base) / m.base) * 100 }))
  const absolutos = desvios.map((d) => Math.abs(d.pct)).sort((a, b) => a - b)
  const mediana = absolutos[Math.floor(absolutos.length / 2)]
  const fuera = desvios.filter((d) => Math.abs(d.pct) > TOLERANCIA_PCT)

  console.log(`   diferencia mediana : ${mediana.toFixed(2)} %`)
  console.log(`   dentro del 1 %     : ${absolutos.filter((x) => x <= 1).length} de ${absolutos.length}`)
  console.log(`   total del mapa     : ${(medidos.reduce((s, m) => s + m.mapa, 0) / 1000).toFixed(2)} km`)
  console.log(`   suma longitud_calc : ${(comparables.reduce((s, m) => s + m.base, 0) / 1000).toFixed(2)} km`)

  if (fuera.length) {
    aviso(`${fuera.length} cable(s) se apartan más del ${TOLERANCIA_PCT} %:`)
    for (const d of fuera.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 10)) {
      console.log(`          ${String(d.nombre).padEnd(12)}  mapa ${d.mapa.toFixed(1)} m  base ${d.base.toFixed(1)} m  ${d.pct > 0 ? "+" : ""}${d.pct.toFixed(1)} %`)
    }
  }
}

const copiadas = cables.filter((c) => String(c.longitud_medida) === String(c.longitud_calc)).length
if (cables.length && copiadas === cables.length) {
  aviso("`longitud_medida` es idéntica a `longitud_calc` en todos los cables: no es una medición aparte")
}

// --- 2. topología --------------------------------------------------------
console.log("\n2) TOPOLOGÍA: a qué apuntan los extremos de cada cable\n")

const idsMufa = new Set(mufas.map((m) => String(m.id)))
const idsCabecera = new Set(cabeceras.map((c) => String(c.id)))
const porTipo = new Map()
const colgados = []
let sinId = 0

for (const c of cables) {
  for (const lado of ["from", "to"]) {
    const tipo = String(c[`tip_elem_${lado}`] ?? "(vacío)").toUpperCase()
    const id = c[`id_elem_${lado}`]
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1)
    if (id == null) {
      sinId++
      continue
    }
    const existe = tipo.startsWith("CUB") ? idsMufa.has(String(id)) : tipo.startsWith("CABE") ? idsCabecera.has(String(id)) : true
    if (!existe) colgados.push({ cable: c.id, lado, tipo, id })
  }
}

console.log(`   extremos por tipo : ${[...porTipo].map(([k, v]) => `${k}=${v}`).join(", ")}`)
if (sinId) aviso(`${sinId} extremo(s) sin identificador de elemento`)
if (colgados.length) {
  aviso(`${colgados.length} extremo(s) apuntan a un elemento que no existe:`)
  for (const d of colgados.slice(0, 10)) {
    console.log(`          cable ${d.cable}, extremo ${d.lado} -> ${d.tipo} id ${d.id}`)
  }
}
if (!sinId && !colgados.length) console.log("   todos los extremos resuelven")

const mencionadas = new Set()
for (const c of cables) for (const l of ["from", "to"]) if (c[`id_elem_${l}`] != null) mencionadas.add(String(c[`id_elem_${l}`]))
const aisladas = mufas.filter((m) => !mencionadas.has(String(m.id)))
// Sin cables, o sin ningún extremo cargado, no hay topología que revisar:
// avisar de 185 mufas «aisladas» sería ruido. Esos casos ya se avisan aparte.
if (cables.length && mencionadas.size && aisladas.length) {
  aviso(`${aisladas.length} mufa(s) no son extremo de ningún cable: ${aisladas.slice(0, 10).map((m) => m.id).join(", ")}`)
}

// Sentido de la señal. La función de conectividad marca un cable como
// «Entrada» si termina en la mufa (id_elem_to) y «Salida» si empieza en ella,
// o sea, por cómo se dibujó. El sentido real es otro: la señal sale de la
// cabecera, así que en cada mufa entra el cable que viene del lado de la
// cabecera. Se recorre la red desde ella para saber cuál es.
//
// Esto se cuenta, no se avisa. El jefe de red aclaró (22 de septiembre de
// 2026) que una mufa puede terminar sola y sigue siendo normal, y que estar o
// no unida a la cabecera no la hace incorrecta: puede pertenecer a un tramo
// que todavía no se ha cargado. Lo único que sí es un problema es el sentido
// al revés, porque la conectividad marca entradas donde hay salidas.
if (cables.length && mencionadas.size && cabeceras.length) {
  const vecinos = new Map()
  const unir = (a, b) => vecinos.set(a, [...(vecinos.get(a) ?? []), b])
  for (const c of cables) {
    if (c.id_elem_from == null || c.id_elem_to == null) continue
    unir(String(c.id_elem_from), String(c.id_elem_to))
    unir(String(c.id_elem_to), String(c.id_elem_from))
  }
  const saltos = new Map(cabeceras.map((c) => [String(c.id), 0]))
  const cola = [...saltos.keys()]
  while (cola.length) {
    const nodo = cola.shift()
    for (const otro of vecinos.get(nodo) ?? []) {
      if (!saltos.has(otro)) {
        saltos.set(otro, saltos.get(nodo) + 1)
        cola.push(otro)
      }
    }
  }

  const alReves = cables.filter((c) => saltos.get(String(c.id_elem_from)) > saltos.get(String(c.id_elem_to)))
  if (alReves.length) {
    aviso(
      `${alReves.length} de ${cables.length} cable(s) están dibujados al revés (de la punta hacia la cabecera): ` +
        `la conectividad los marca como entrada cuando son salida, y al revés`,
    )
  }

  let sueltas = 0
  let terminales = 0
  for (const m of mufas) {
    const id = String(m.id)
    if (!mencionadas.has(id)) continue
    if (saltos.get(id) === undefined) {
      sueltas++
      continue
    }
    if ((vecinos.get(id) ?? []).length === 1) terminales++
  }
  console.log(`   mufas que terminan solas (un solo cable): ${terminales}`)
  console.log(`   mufas que no llegan a la cabecera por cables: ${sueltas}`)
  if (!alReves.length) console.log("   el sentido de todos los cables sale de la cabecera")
}

// --- 3. geometrías sospechosas -------------------------------------------
console.log("\n3) GEOMETRÍAS\n")

const cortos = medidos.filter((m) => m.mapa < LARGO_MINIMO_M)
if (cortos.length) {
  aviso(`${cortos.length} cable(s) miden menos de ${LARGO_MINIMO_M} m: ${cortos.map((c) => c.nombre).join(", ")}`)
} else {
  console.log(`   ningún cable por debajo de ${LARGO_MINIMO_M} m`)
}

const posiciones = new Map()
for (const m of mufas) {
  const k = JSON.stringify(m.geom?.coordinates)
  posiciones.set(k, (posiciones.get(k) ?? 0) + 1)
}
const superpuestas = [...posiciones.values()].filter((n) => n > 1).length
if (superpuestas) aviso(`${superpuestas} posición(es) con más de una mufa encima`)
else console.log("   ninguna mufa superpuesta con otra")

// Colombia continental, con margen.
let fuera = 0
for (const capa of [cables, mufas]) {
  for (const e of capa) {
    const planas = JSON.stringify(e.geom?.coordinates ?? []).match(/-?\d+\.?\d*/g)?.map(Number) ?? []
    for (let i = 0; i + 1 < planas.length; i += 2) {
      if (planas[i] < -82 || planas[i] > -66 || planas[i + 1] < -5 || planas[i + 1] > 14) {
        fuera++
        break
      }
    }
  }
}
if (fuera) aviso(`${fuera} elemento(s) con coordenadas fuera de Colombia`)
else console.log("   todas las coordenadas caen dentro de Colombia")

// --- 4. hilos --------------------------------------------------------------
// «Ver conexiones» depende de una cadena: cubierta → conectividad_fina →
// hilo_cable → cable_fibra. Si un eslabón falta, la función devuelve cables
// vacíos y el botón sale en gris aunque la conectividad esté cargada.
console.log("\n4) HILOS: la cadena de la que depende «Ver conexiones»\n")

const tab = createClient(leer("SUPABASE_URL"), leer("SUPABASE_SECRET_KEY"), { db: { schema: "tab_fiber" } })
async function todas(cliente, tabla, columnas) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await cliente.from(tabla).select(columnas).range(desde, desde + 999)
    if (error) {
      console.log(`   (no se pudo leer ${tabla}: ${error.message})`)
      return filas
    }
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}

const hilos = await todas(tab, "hilo_cable", "id, id_cable")
const conexiones = await todas(tab, "conectividad_fina", "id_ubicacion, id_hilo_origen, id_hilo_destino")
console.log(`   ${hilos.length} hilos, ${conexiones.length} conexiones`)

if (hilos.length && cables.length) {
  const idsCable = new Set(cables.map((c) => String(c.id)))
  const hilosPorCable = new Map()
  for (const h of hilos) hilosPorCable.set(String(h.id_cable), (hilosPorCable.get(String(h.id_cable)) ?? 0) + 1)

  const huerfanos = hilos.filter((h) => !idsCable.has(String(h.id_cable))).length
  if (huerfanos) aviso(`${huerfanos} hilo(s) apuntan a un cable que no existe en cable_fibra`)

  const sinHilos = cables.filter((c) => !hilosPorCable.has(String(c.id))).length
  if (sinHilos) aviso(`${sinHilos} cable(s) no tienen ningún hilo en hilo_cable`)

  const descuadrados = cables.filter((c) => hilosPorCable.has(String(c.id)) && hilosPorCable.get(String(c.id)) !== Number(c.cant_hilo))
  if (descuadrados.length) {
    aviso(`${descuadrados.length} cable(s) con un número de hilos distinto de su cant_hilo`)
    for (const c of descuadrados.slice(0, 5)) {
      console.log(`          ${c.codigo ?? c.id}: cant_hilo ${c.cant_hilo}, hilos ${hilosPorCable.get(String(c.id))}`)
    }
  }
  if (!huerfanos && !sinHilos && !descuadrados.length) console.log("   cada hilo tiene su cable y cada cable sus hilos")
}

const buffersEnCero = cables.filter((c) => Number(c.cant_buff) === 0 && Number(c.cant_hilo) > 0).length
if (buffersEnCero) aviso(`${buffersEnCero} cable(s) con cant_buff = 0 aunque declaran hilos en cant_hilo`)

if (conexiones.length && hilos.length) {
  const idsHilo = new Set(hilos.map((h) => String(h.id)))
  const rotas = conexiones.filter(
    (c) => (c.id_hilo_origen && !idsHilo.has(String(c.id_hilo_origen))) || (c.id_hilo_destino && !idsHilo.has(String(c.id_hilo_destino))),
  ).length
  if (rotas) aviso(`${rotas} conexión(es) apuntan a un hilo que no existe`)
}

// Esto no necesita los hilos: basta con las mufas. Al recargar las mufas con
// UUID nuevos, las conexiones siguieron apuntando a los viejos y ninguna
// cubierta encontraba las suyas.
if (conexiones.length && mufas.length) {
  const idsMufaSet = new Set(mufas.map((m) => String(m.id)))
  const enCubiertaInexistente = conexiones.filter((c) => !idsMufaSet.has(String(c.id_ubicacion))).length
  if (enCubiertaInexistente) {
    aviso(`${enCubiertaInexistente} de ${conexiones.length} conexión(es) están en una cubierta que no existe (¿mufas recargadas con UUID nuevos?)`)
  }
}

// --- 5. conectividad -------------------------------------------------------
// La prueba final: lo que devuelve la función para cada mufa, con la misma
// regla que usa el panel para decidir si «Ver conexiones» va activo.
console.log("\n5) CONECTIVIDAD: lo que verá cada mufa en «Ver conexiones»\n")

if (!mufas.length) {
  console.log("   sin mufas que consultar")
} else {
  const publico = createClient(leer("SUPABASE_URL"), leer("SUPABASE_SECRET_KEY"))
  const resultado = { activo: 0, gris: 0, error: 0 }
  let primerError = null
  const ejemplos = []
  // De ocho en ocho: consultarlas una por una tardaba más de medio minuto.
  for (let i = 0; i < mufas.length; i += 8) {
    await Promise.all(
      mufas.slice(i, i + 8).map(async (m) => {
        const { data, error } = await publico.rpc("get_json_conectividad_cubierta", { p_cubierta_id: m.id })
        if (error) {
          resultado.error++
          primerError ??= `${error.code} ${error.message}`
        } else if (Array.isArray(data?.cables) && data.cables.length > 0) {
          resultado.activo++
          if (ejemplos.length < 5) ejemplos.push(`${m.etiqueta ?? m.id} (${data.cables.length} cables)`)
        } else {
          resultado.gris++
        }
      }),
    )
  }
  console.log(`   botón activo  : ${resultado.activo}${ejemplos.length ? "  ej. " + ejemplos.join(", ") : ""}`)
  console.log(`   botón en gris : ${resultado.gris}`)
  if (resultado.error) aviso(`${resultado.error} mufa(s) dieron error al pedir la conectividad: ${primerError}`)
  if (conexiones.length && resultado.activo === 0) {
    aviso("hay conexiones cargadas pero ninguna mufa devuelve cables: revisar la cadena del punto 4 o la función")
  }
}

console.log(
  avisos.length === 0
    ? "\nSin avisos: los datos están consistentes.\n"
    : `\n${avisos.length} aviso(s). Ninguno impide usar el visor, pero conviene revisarlos con el ingeniero de red.\n`,
)
