import type { MufaCampoJSON } from "./mufa-field-data"

/**
 * Cubierta de primer nivel como el plano de referencia: un cable de entrada
 * de 24 hilos, dos divisores 1x8 y dos cables de salida de 12. Sirve para
 * comprobar que `can_div_inst` dibuja los divisores y enruta por sus puertos.
 */

const COLORES = [
  "Azul",
  "Naranja",
  "Verde",
  "Café",
  "Gris",
  "Blanco",
  "Rojo",
  "Negro",
  "Amarillo",
  "Violeta",
  "Rosa",
  "Aguamarina",
] as const

function hilos(prefijo: string, desde: number, cantidad: number) {
  return Array.from({ length: cantidad }, (_, indice) => ({
    hilo_id: `${prefijo}-h${desde + indice}`,
    numero: desde + indice,
    color: COLORES[(desde + indice - 1) % COLORES.length],
  }))
}

function puertos(divisor: string) {
  return [
    { puerto_id: `${divisor}-e1`, numero: 1, nombre: "E1", direccion: "E" },
    ...Array.from({ length: 8 }, (_, indice) => ({
      puerto_id: `${divisor}-s${indice + 1}`,
      numero: indice + 1,
      nombre: `S${indice + 1}`,
      direccion: "S",
    })),
  ]
}

function salidasDe(divisor: string, cable: string, prefijoHilo: string) {
  return Array.from({ length: 8 }, (_, indice) => ({
    Conectividad: `${divisor}-out-${indice + 1}`,
    "Tipo empalme": "Divisor",
    atenuacion: 10.4,
    origen: { puerto_id: `${divisor}-s${indice + 1}`, splitter_id: divisor },
    destino: { cable_id: cable, hilo_id: `${prefijoHilo}-h${indice + 1}` },
  }))
}

export const MUFA_DIVISORES_MOCKUP: MufaCampoJSON = {
  mufa_id: "nivel-1",
  tipo: "Cubierta de empalme Nivel 1",
  estado: "Operativa",
  can_band_inst: 0,
  can_div_inst: 2,
  cables: [
    {
      cable_id: "entrada",
      codigo: "F-C-0167653",
      sentido: "Entrada",
      Buffers: [
        { Buffer_id: 1, color: "Azul", hilos: hilos("en", 1, 12) },
        { Buffer_id: 2, color: "Naranja", hilos: hilos("en", 13, 12) },
      ],
    },
    {
      cable_id: "salida-a",
      codigo: "F-C-0167655",
      sentido: "Salida",
      Buffers: [{ Buffer_id: 1, color: "Azul", hilos: hilos("sa", 1, 12) }],
    },
    {
      cable_id: "salida-b",
      codigo: "F-C-0167667",
      sentido: "Salida",
      Buffers: [{ Buffer_id: 1, color: "Azul", hilos: hilos("sb", 1, 12) }],
    },
  ],
  Splitters: [
    { splitter_id: "d1", num_divisor: 1, cod_divisor: "D-1", modelo_divisor: "1x8", puertos: puertos("d1") },
    { splitter_id: "d2", num_divisor: 2, cod_divisor: "D-2", modelo_divisor: "1x8", puertos: puertos("d2") },
  ],
  Conectividades: [
    {
      Conectividad: "d1-in",
      "Tipo empalme": "Divisor",
      atenuacion: 0.2,
      origen: { cable_id: "entrada", hilo_id: "en-h1" },
      destino: { puerto_id: "d1-e1", splitter_id: "d1" },
    },
    ...salidasDe("d1", "salida-a", "sa"),
    {
      Conectividad: "d2-in",
      "Tipo empalme": "Divisor",
      atenuacion: 0.2,
      origen: { cable_id: "entrada", hilo_id: "en-h13" },
      destino: { puerto_id: "d2-e1", splitter_id: "d2" },
    },
    ...salidasDe("d2", "salida-b", "sb"),
  ],
}
