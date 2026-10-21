"use client"

import { useCallback, useState } from "react"

import {
  exportarReporteEmpalmesPdf,
  type OpcionesReporteEmpalmesPdf,
} from "@/lib/schematic/exportar-pdf"

/**
 * Estado de la exportación a PDF del reporte de empalmes. La lógica de
 * dibujo vive en `exportar-pdf.ts`; este hook solo cubre el estado de la UI.
 */
export function useExportarPdf() {
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportar = useCallback(async (opciones: OpcionesReporteEmpalmesPdf) => {
    setExportando(true)
    setError(null)
    try {
      await exportarReporteEmpalmesPdf(opciones)
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo generar el PDF.")
    } finally {
      setExportando(false)
    }
  }, [])

  return { exportar, exportando, error }
}
