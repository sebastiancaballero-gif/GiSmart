import type { EmpalmeEnDivisor, HiloCampoParseado, MufaCampoParseada } from "./mufa-field-data"

/**
 * Recorrido completo de cada fibra por la cubierta, para el panel de empalmes
 * y su PDF. El lienzo dibuja un divisor como dos tramos sueltos (hilo →
 * entrada, salida → hilo); aquí se juntan: cada salida del divisor se lee con
 * el hilo que entra a ese mismo divisor.
 */

export type PuntaRuta = {
  cable: string
  buffer: number
  hilo: number
  color: { nombre: string; hex: string }
}

type RutaBase = {
  clave: string
  /** dB de la ruta; por un divisor, la suma de la entrada y la salida. */
  atenuacion: number
  tipoEmpalme: string
}

export type RutaDirecta = RutaBase & { tipo: "directa"; origen: PuntaRuta; destino: PuntaRuta }

export type RutaBandeja = RutaBase & {
  tipo: "bandeja"
  bandeja: number
  slot: number
  origen: PuntaRuta
  destino: PuntaRuta
}

export type RutaDivisor = RutaBase & {
  tipo: "divisor"
  divisor: number
  /** `null` cuando ningún hilo llega a la entrada del divisor. */
  puertoEntrada: number | null
  /** `null` cuando ninguna salida del divisor tiene hilo. */
  puertoSalida: number | null
  origen: PuntaRuta | null
  destino: PuntaRuta | null
}

export type RutaEmpalme = RutaDirecta | RutaBandeja | RutaDivisor

/** Un renglón de la tarjeta: Origen, Divisor o Destino. */
export type TramoRuta = { etiqueta: string; texto: string; color: string | null }

function punta(hilo: HiloCampoParseado): PuntaRuta {
  return {
    cable: hilo.cableCodigo,
    buffer: hilo.buffer,
    hilo: hilo.numero,
    color: { nombre: hilo.color.name, hex: hilo.color.hex },
  }
}

function sumarDb(...valores: number[]): number {
  return Math.round(valores.reduce((total, valor) => total + valor, 0) * 1000) / 1000
}

function rutasDeDivisor(divisorId: string, numero: number, tramos: EmpalmeEnDivisor[]): RutaDivisor[] {
  const porPuerto = (a: EmpalmeEnDivisor, b: EmpalmeEnDivisor) => a.numeroPuerto - b.numeroPuerto
  const entradas = tramos.filter((tramo) => tramo.lado === "entrada").sort(porPuerto)
  const salidas = tramos.filter((tramo) => tramo.lado === "salida").sort(porPuerto)
  const entrada = entradas[0] ?? null

  if (salidas.length === 0) {
    return entradas.map((tramo) => ({
      tipo: "divisor",
      clave: `${divisorId}-${tramo.puertoId}`,
      divisor: numero,
      puertoEntrada: tramo.numeroPuerto,
      puertoSalida: null,
      origen: punta(tramo.hilo),
      destino: null,
      atenuacion: tramo.atenuacion,
      tipoEmpalme: tramo.tipoEmpalme,
    }))
  }

  return salidas.map((salida) => ({
    tipo: "divisor",
    clave: `${divisorId}-${salida.puertoId}`,
    divisor: numero,
    puertoEntrada: entrada?.numeroPuerto ?? null,
    puertoSalida: salida.numeroPuerto,
    origen: entrada ? punta(entrada.hilo) : null,
    destino: punta(salida.hilo),
    atenuacion: sumarDb(entrada?.atenuacion ?? 0, salida.atenuacion),
    tipoEmpalme: salida.tipoEmpalme,
  }))
}

/** Rutas de la cubierta: primero por divisor, luego por bandeja, luego directas. */
export function listarRutasEmpalme(mufa: MufaCampoParseada): RutaEmpalme[] {
  const porDivisor = new Map<string, { numero: number; tramos: EmpalmeEnDivisor[] }>()
  const bandejas: RutaBandeja[] = []
  const directas: RutaDirecta[] = []

  for (const empalme of mufa.empalmes) {
    if (empalme.via === "divisor") {
      const grupo = porDivisor.get(empalme.divisorId) ?? { numero: empalme.numeroDivisor, tramos: [] }
      grupo.tramos.push(empalme)
      porDivisor.set(empalme.divisorId, grupo)
    } else if (empalme.via === "bandeja") {
      bandejas.push({
        tipo: "bandeja",
        clave: `${empalme.bandejaId}-${empalme.slot}`,
        bandeja: empalme.numeroBandeja,
        slot: empalme.slot,
        origen: punta(empalme.origen),
        destino: punta(empalme.destino),
        atenuacion: empalme.atenuacion,
        tipoEmpalme: empalme.tipoEmpalme,
      })
    } else {
      directas.push({
        tipo: "directa",
        clave: `directo-${empalme.numero}`,
        origen: punta(empalme.origen),
        destino: punta(empalme.destino),
        atenuacion: empalme.atenuacion,
        tipoEmpalme: empalme.tipoEmpalme,
      })
    }
  }

  const divisores = [...porDivisor.entries()]
    .sort(([, a], [, b]) => a.numero - b.numero)
    .flatMap(([id, grupo]) => rutasDeDivisor(id, grupo.numero, grupo.tramos))
  bandejas.sort((a, b) => a.bandeja - b.bandeja || a.slot - b.slot)

  return [...divisores, ...bandejas, ...directas]
}

export function textoPunta(punta: PuntaRuta): string {
  return `${punta.cable} · Buffer ${punta.buffer} · Hilo ${punta.hilo} (${punta.color.nombre})`
}

export function tituloRuta(ruta: RutaEmpalme): string {
  if (ruta.tipo === "divisor") return `Divisor ${ruta.divisor}`
  if (ruta.tipo === "bandeja") return `Bandeja ${ruta.bandeja} · Slot ${ruta.slot} (Sin divisor)`
  return "Conexión Directa (Sin divisor)"
}

/** Renglones de la tarjeta, en orden: Origen, [Divisor], Destino. */
export function tramosDeRuta(ruta: RutaEmpalme): TramoRuta[] {
  const origen: TramoRuta = ruta.origen
    ? { etiqueta: "Origen", texto: textoPunta(ruta.origen), color: ruta.origen.color.hex }
    : { etiqueta: "Origen", texto: "Ningún hilo llega a la entrada del divisor", color: null }
  const destino: TramoRuta = ruta.destino
    ? { etiqueta: "Destino", texto: textoPunta(ruta.destino), color: ruta.destino.color.hex }
    : { etiqueta: "Destino", texto: "Ninguna salida del divisor tiene hilo", color: null }

  if (ruta.tipo !== "divisor") return [origen, destino]

  const entrada = ruta.puertoEntrada === null ? "—" : `Entrada ${ruta.puertoEntrada}`
  const salida = ruta.puertoSalida === null ? "—" : `Salida ${ruta.puertoSalida}`
  return [
    origen,
    {
      etiqueta: "Divisor",
      texto: `Divisor ${ruta.divisor} — Entra por: ${entrada} → Sale por: ${salida}`,
      color: null,
    },
    destino,
  ]
}
