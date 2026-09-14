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

const cables = await pedir(fiber, "cable_fibra_geojson")
const mufas = await pedir(fiber, "cubierta_empalme_geojson")
const cabeceras = await pedir(infra, "cabecera_central")

console.log(`\nRed: ${mufas.length} mufas, ${cables.length} cables, ${cabeceras.length} cabeceras\n`)

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
  medidos.push({ id: c.id, mapa: getLength(f.getGeometry()), base: Number(c.longitud_calc) })
}

const comparables = medidos.filter((m) => Number.isFinite(m.base) && m.base > 0)
if (comparables.length === 0) {
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
      console.log(`          id ${String(d.id).padStart(5)}  mapa ${d.mapa.toFixed(1)} m  base ${d.base.toFixed(1)} m  ${d.pct > 0 ? "+" : ""}${d.pct.toFixed(1)} %`)
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
if (aisladas.length) {
  aviso(`${aisladas.length} mufa(s) no son extremo de ningún cable: ${aisladas.slice(0, 10).map((m) => m.id).join(", ")}`)
}

// --- 3. geometrías sospechosas -------------------------------------------
console.log("\n3) GEOMETRÍAS\n")

const cortos = medidos.filter((m) => m.mapa < LARGO_MINIMO_M)
if (cortos.length) {
  aviso(`${cortos.length} cable(s) miden menos de ${LARGO_MINIMO_M} m: ${cortos.map((c) => c.id).join(", ")}`)
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

console.log(
  avisos.length === 0
    ? "\nSin avisos: los datos están consistentes.\n"
    : `\n${avisos.length} aviso(s). Ninguno impide usar el visor, pero conviene revisarlos con el ingeniero de red.\n`,
)
