import type { MufaJSON } from "./mufa-data"

/**
 * Datos de prueba del escenario por defecto: 1 cable de entrada de 24 hilos
 * (2 buffers de 12) y 2 cables de salida de 12 hilos (1 buffer cada uno).
 *
 * La estructura imita la respuesta que entregaría el backend, por lo que los
 * hilos se declaran uno por uno con su color del código TIA-598-D. El lienzo se
 * dibuja leyendo únicamente esta constante.
 */
export const MUFA_MOCKUP: MufaJSON = {
  id: "MUFA-001",
  nombre: "MUFA-001",
  ubicacion: "Cali · Valle del Cauca",
  cables: [
    {
      id: "cable-entrada",
      etiqueta: "F-C-0167653",
      rol: "entrada",
      buffers: [
        {
          numero: 1,
          color: "Azul",
          hilos: [
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
          hilos: [
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
      buffers: [
        {
          numero: 1,
          color: "Azul",
          hilos: [
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
      buffers: [
        {
          numero: 1,
          color: "Azul",
          hilos: [
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
  empalmes: [
    {
      desde: { cable: "cable-entrada", buffer: 1, hilo: 1 },
      hasta: { cable: "cable-salida-1", buffer: 1, hilo: 1 },
    },
    {
      desde: { cable: "cable-entrada", buffer: 1, hilo: 2 },
      hasta: { cable: "cable-salida-1", buffer: 1, hilo: 2 },
    },
    {
      desde: { cable: "cable-entrada", buffer: 1, hilo: 3 },
      hasta: { cable: "cable-salida-1", buffer: 1, hilo: 3 },
    },
    {
      desde: { cable: "cable-entrada", buffer: 2, hilo: 1 },
      hasta: { cable: "cable-salida-2", buffer: 1, hilo: 1 },
    },
    {
      desde: { cable: "cable-entrada", buffer: 2, hilo: 2 },
      hasta: { cable: "cable-salida-2", buffer: 1, hilo: 2 },
    },
  ],
}
