import type { ElementoRedJSON, PuntoJSON } from "./network-data"

/**
 * Datos de prueba, uno por tipo de elemento soportado. Imitan la respuesta que
 * entregaría el backend: el lienzo se dibuja leyendo únicamente estas
 * constantes.
 */

/** Puntos consecutivos sin color explícito: se deduce de su número (TIA-598-D). */
function puntosNumerados(cantidad: number, etiqueta?: (numero: number) => string): PuntoJSON[] {
  return Array.from({ length: cantidad }, (_, indice) => {
    const numero = indice + 1
    return etiqueta ? { numero, etiqueta: etiqueta(numero) } : { numero }
  })
}

/**
 * Mufa de paso: 1 cable de entrada de 24 hilos (2 buffers de 12) y 2 cables de
 * salida de 12 hilos. Los hilos se declaran uno por uno con su color para
 * documentar la secuencia de colores completa.
 */
export const MUFA_MOCKUP: ElementoRedJSON = {
  id: "MUFA-001",
  nombre: "MUFA-001",
  tipo: "mufa",
  ubicacion: "Cali · Valle del Cauca",
  terminaciones: [
    {
      id: "cable-entrada",
      etiqueta: "F-C-0167653",
      rol: "entrada",
      tipo: "cable",
      grupos: [
        {
          numero: 1,
          color: "Azul",
          puntos: [
            { numero: 1, color: "Azul", etiqueta: "HIL-0167653-01-01" },
            { numero: 2, color: "Naranja", etiqueta: "HIL-0167653-01-02" },
            { numero: 3, color: "Verde" },
            { numero: 4, color: "Café" },
            { numero: 5, color: "Gris" },
            { numero: 6, color: "Blanco" },
            { numero: 7, color: "Rojo" },
            { numero: 8, color: "Negro" },
            { numero: 9, color: "Amarillo" },
            { numero: 10, color: "Violeta" },
            { numero: 11, color: "Rosa" },
            { numero: 12, color: "Aguamarina" },
          ],
        },
        {
          numero: 2,
          color: "Naranja",
          puntos: [
            { numero: 1, color: "Azul" },
            { numero: 2, color: "Naranja" },
            { numero: 3, color: "Verde" },
            { numero: 4, color: "Café" },
            { numero: 5, color: "Gris" },
            { numero: 6, color: "Blanco" },
            { numero: 7, color: "Rojo" },
            { numero: 8, color: "Negro" },
            { numero: 9, color: "Amarillo" },
            { numero: 10, color: "Violeta" },
            { numero: 11, color: "Rosa" },
            { numero: 12, color: "Aguamarina" },
          ],
        },
      ],
    },
    {
      id: "cable-salida-1",
      etiqueta: "F-C-0167655",
      rol: "salida",
      tipo: "cable",
      grupos: [
        {
          numero: 1,
          color: "Azul",
          puntos: [
            { numero: 1, color: "Azul", etiqueta: "HIL-0167655-01-01" },
            { numero: 2, color: "Naranja" },
            { numero: 3, color: "Verde" },
            { numero: 4, color: "Café" },
            { numero: 5, color: "Gris" },
            { numero: 6, color: "Blanco" },
            { numero: 7, color: "Rojo" },
            { numero: 8, color: "Negro" },
            { numero: 9, color: "Amarillo" },
            { numero: 10, color: "Violeta" },
            { numero: 11, color: "Rosa" },
            { numero: 12, color: "Aguamarina" },
          ],
        },
      ],
    },
    {
      id: "cable-salida-2",
      etiqueta: "F-C-0167667",
      rol: "salida",
      tipo: "cable",
      grupos: [
        {
          numero: 1,
          color: "Azul",
          puntos: [
            { numero: 1, color: "Azul" },
            { numero: 2, color: "Naranja" },
            { numero: 3, color: "Verde" },
            { numero: 4, color: "Café" },
            { numero: 5, color: "Gris" },
            { numero: 6, color: "Blanco" },
            { numero: 7, color: "Rojo" },
            { numero: 8, color: "Negro" },
            { numero: 9, color: "Amarillo" },
            { numero: 10, color: "Violeta" },
            { numero: 11, color: "Rosa" },
            { numero: 12, color: "Aguamarina" },
          ],
        },
      ],
    },
  ],
  // Empalmes ya documentados en campo: el lienzo los dibuja al cargar.
  conexiones: [
    {
      tipo: "empalme",
      desde: { terminacion: "cable-entrada", grupo: 1, punto: 1 },
      hasta: { terminacion: "cable-salida-1", grupo: 1, punto: 1 },
    },
    {
      tipo: "empalme",
      desde: { terminacion: "cable-entrada", grupo: 1, punto: 2 },
      hasta: { terminacion: "cable-salida-1", grupo: 1, punto: 2 },
    },
    {
      tipo: "empalme",
      desde: { terminacion: "cable-entrada", grupo: 1, punto: 3 },
      hasta: { terminacion: "cable-salida-1", grupo: 1, punto: 3 },
    },
    {
      tipo: "empalme",
      desde: { terminacion: "cable-entrada", grupo: 2, punto: 1 },
      hasta: { terminacion: "cable-salida-2", grupo: 1, punto: 1 },
    },
    {
      tipo: "empalme",
      desde: { terminacion: "cable-entrada", grupo: 2, punto: 2 },
      hasta: { terminacion: "cable-salida-2", grupo: 1, punto: 2 },
    },
  ],
}

/**
 * Splitter 1:8. Un único pigtail de entrada alimenta las ocho salidas, que es
 * el caso que obliga a las conexiones de tipo `splitter` a compartir el origen.
 */
export const SPLITTER_MOCKUP: ElementoRedJSON = {
  id: "SPL-1X8-014",
  nombre: "Splitter 1:8 · NAP-014",
  tipo: "splitter",
  ubicacion: "Cali · Comuna 17",
  terminaciones: [
    {
      id: "modulo-entrada",
      etiqueta: "Troncal 1:8",
      rol: "entrada",
      tipo: "modulo",
      grupos: [{ numero: 1, puntos: [{ numero: 1, etiqueta: "PIG-IN-01" }] }],
    },
    {
      id: "modulo-salida",
      etiqueta: "Derivaciones 1:8",
      rol: "salida",
      tipo: "modulo",
      grupos: [
        {
          numero: 1,
          puntos: puntosNumerados(8, (numero) => `PIG-OUT-${String(numero).padStart(2, "0")}`),
        },
      ],
    },
  ],
  conexiones: puntosNumerados(8).map((punto) => ({
    tipo: "splitter" as const,
    desde: { terminacion: "modulo-entrada", grupo: 1, punto: 1 },
    hasta: { terminacion: "modulo-salida", grupo: 1, punto: punto.numero },
  })),
}

/**
 * ODF: la bandeja del cable troncal se une por conectorización a los puertos
 * frontales. Sólo la mitad de los puertos está patcheada.
 */
export const ODF_MOCKUP: ElementoRedJSON = {
  id: "ODF-CALI-01",
  nombre: "ODF Cali · Bastidor 3",
  tipo: "odf",
  ubicacion: "Cali · Nodo Centro",
  terminaciones: [
    {
      id: "bandeja-troncal",
      etiqueta: "Bandeja 1 · Troncal",
      rol: "entrada",
      tipo: "bandeja",
      grupos: [{ numero: 1, puntos: puntosNumerados(12) }],
    },
    {
      id: "bandeja-frontal",
      etiqueta: "Puertos frontales 1-12",
      rol: "salida",
      tipo: "puerto",
      grupos: [
        {
          numero: 1,
          puntos: puntosNumerados(12, (numero) => `LC-${String(numero).padStart(2, "0")}`),
        },
      ],
    },
  ],
  conexiones: puntosNumerados(6).map((punto) => ({
    tipo: "conector" as const,
    desde: { terminacion: "bandeja-troncal", grupo: 1, punto: punto.numero },
    hasta: { terminacion: "bandeja-frontal", grupo: 1, punto: punto.numero },
  })),
}

/**
 * NAP con un cable de paso: la troncal entra, dos hilos se derivan a los
 * abonados y el resto continúa. Ejercita los roles `derivacion` y `reserva`.
 */
export const NAP_MOCKUP: ElementoRedJSON = {
  id: "NAP-014",
  nombre: "NAP-014 · Poste 7412",
  tipo: "nap",
  ubicacion: "Cali · Comuna 17",
  terminaciones: [
    {
      id: "cable-troncal",
      etiqueta: "F-C-0170021",
      rol: "entrada",
      tipo: "cable",
      grupos: [{ numero: 1, puntos: puntosNumerados(12) }],
    },
    {
      id: "cable-continuidad",
      etiqueta: "F-C-0170022 · Continuidad",
      rol: "salida",
      tipo: "cable",
      grupos: [{ numero: 1, puntos: puntosNumerados(12) }],
    },
    {
      id: "derivacion-abonados",
      etiqueta: "Derivaciones a abonado",
      rol: "derivacion",
      tipo: "puerto",
      grupos: [{ numero: 1, puntos: puntosNumerados(2, (numero) => `DROP-${numero}`) }],
    },
    {
      id: "reserva-tecnica",
      etiqueta: "Reserva técnica",
      rol: "reserva",
      tipo: "puerto",
      grupos: [{ numero: 1, puntos: puntosNumerados(2) }],
    },
  ],
  conexiones: [
    {
      tipo: "empalme",
      desde: { terminacion: "cable-troncal", grupo: 1, punto: 1 },
      hasta: { terminacion: "derivacion-abonados", grupo: 1, punto: 1 },
    },
    {
      tipo: "empalme",
      desde: { terminacion: "cable-troncal", grupo: 1, punto: 2 },
      hasta: { terminacion: "derivacion-abonados", grupo: 1, punto: 2 },
    },
    // Los hilos que no se derivan atraviesan la caja sin intervención.
    ...puntosNumerados(10).map((punto) => ({
      tipo: "paso" as const,
      desde: { terminacion: "cable-troncal", grupo: 1, punto: punto.numero + 2 },
      hasta: { terminacion: "cable-continuidad", grupo: 1, punto: punto.numero + 2 },
    })),
  ],
}
