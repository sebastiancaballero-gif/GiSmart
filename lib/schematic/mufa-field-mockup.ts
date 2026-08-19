import type { MufaCampoJSON } from "./mufa-field-data"

/**
 * Mockup de campo tomado de `JsonMufa.txt`: 1 cable de entrada (12 hilos),
 * 1 de salida (8 hilos), capacidad de 4 bandejas con 2 instaladas y 8 fusiones.
 */
export const MUFA_CAMPO_MOCKUP: MufaCampoJSON = {
  mufa_id: 231235,
  tipo: "CM 48H",
  estado: "Operativa",
  capacidad_band: 4,
  can_band_inst: 2,
  cables: [
    {
      cable_id: 763625,
      codigo: "RP-1",
      sentido: "Entrada",
      can_hilos: 12,
      Buffers: [
        {
          Buffer_id: 123412,
          color: "Azul",
          hilos: [
            { hilo_id: 456723, numero: 1, color: "Azul" },
            { hilo_id: 456724, numero: 2, color: "Naranja" },
            { hilo_id: 456725, numero: 3, color: "Verde" },
            { hilo_id: 456726, numero: 4, color: "Marron" },
            { hilo_id: 456727, numero: 5, color: "gris" },
            { hilo_id: 456728, numero: 6, color: "blanco" },
            { hilo_id: 456729, numero: 7, color: "rojo" },
            { hilo_id: 456730, numero: 8, color: "negro" },
            { hilo_id: 456731, numero: 9, color: "amarillo" },
            { hilo_id: 456732, numero: 10, color: "violeta" },
            { hilo_id: 456733, numero: 11, color: "rosa" },
            { hilo_id: 456734, numero: 12, color: "aguamarina" },
          ],
        },
      ],
    },
    {
      cable_id: 763626,
      codigo: "RP-2",
      sentido: "Salida",
      can_hilos: 8,
      Buffers: [
        {
          Buffer_id: 123672,
          color: "Azul",
          hilos: [
            { hilo_id: 458901, numero: 1, color: "Azul" },
            { hilo_id: 458902, numero: 2, color: "Naranja" },
            { hilo_id: 458903, numero: 3, color: "Verde" },
            { hilo_id: 458904, numero: 4, color: "Marron" },
            { hilo_id: 458905, numero: 5, color: "gris" },
            { hilo_id: 458906, numero: 6, color: "blanco" },
            { hilo_id: 458907, numero: 7, color: "rojo" },
            { hilo_id: 458908, numero: 8, color: "negro" },
          ],
        },
      ],
    },
  ],
  bandejas: [
    {
      bandeja_id: 876253,
      Numero_bandeja: 1,
      Capacidad_fusiones: 12,
      Slots_usados: 4,
      Slots: [
        {
          Slot: 1,
          "Tipo empalme": "Fusion",
          atenuacion: 0.02,
          origen: { cable_id: 763625, hilo_id: 456723 },
          destino: { cable_id: 763626, hilo_id: 458901 },
        },
        {
          Slot: 2,
          "Tipo empalme": "Fusion",
          atenuacion: 0.02,
          origen: { cable_id: 763625, hilo_id: 456724 },
          destino: { cable_id: 763626, hilo_id: 458902 },
        },
        {
          Slot: 3,
          "Tipo empalme": "Fusion",
          atenuacion: 0.02,
          origen: { cable_id: 763625, hilo_id: 456729 },
          destino: { cable_id: 763626, hilo_id: 458903 },
        },
        {
          Slot: 4,
          "Tipo empalme": "Fusion",
          atenuacion: 0.02,
          origen: { cable_id: 763625, hilo_id: 456726 },
          destino: { cable_id: 763626, hilo_id: 458904 },
        },
      ],
    },
    {
      bandeja_id: 876254,
      Numero_bandeja: 2,
      Capacidad_fusiones: 8,
      Slots_usados: 4,
      Empalmes_internos: [
        {
          Slot: 1,
          "Tipo empalme": "Fusion",
          atenuacion: 0.02,
          origen: { cable_id: 763625, hilo_id: 456727 },
          destino: { cable_id: 763626, hilo_id: 458905 },
        },
        {
          Slot: 2,
          "Tipo empalme": "Fusion",
          atenuacion: 0.02,
          origen: { cable_id: 763625, hilo_id: 456728 },
          destino: { cable_id: 763626, hilo_id: 458906 },
        },
        {
          Slot: 3,
          "Tipo empalme": "Fusion",
          atenuacion: 0.02,
          origen: { cable_id: 763625, hilo_id: 456729 },
          destino: { cable_id: 763626, hilo_id: 458907 },
        },
        {
          Slot: 4,
          "Tipo empalme": "Fusion",
          atenuacion: 0.02,
          origen: { cable_id: 763625, hilo_id: 456730 },
          destino: { cable_id: 763626, hilo_id: 458908 },
        },
      ],
    },
  ],
}
