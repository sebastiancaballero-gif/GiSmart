import OSM from "ol/source/OSM"
import XYZ from "ol/source/XYZ"

/**
 * De dónde salen las teselas del mapa de fondo.
 *
 * Por defecto, OpenStreetMap. Su servidor es comunitario y su política de uso
 * prohíbe el uso intensivo o comercial; durante las pruebas llegó a cortar el
 * servicio y el mapa se quedó sin fondo. Para producción se puede apuntar a un
 * servidor de teselas propio o a un proveedor con contrato sin tocar código:
 *
 *   NEXT_PUBLIC_TESELAS_URL=https://proveedor/{z}/{x}/{y}.png?key=...
 *   NEXT_PUBLIC_TESELAS_ATRIBUCION=© Proveedor, © OpenStreetMap
 *   NEXT_PUBLIC_TESELAS_ZOOM_MAXIMO=20
 *
 * Son variables `NEXT_PUBLIC_`: Next las fija al compilar, así que cambiarlas
 * pide volver a compilar (o reiniciar `pnpm dev`). La URL de las teselas la ve
 * el navegador de todas formas, así que no es un secreto.
 */
export function fuenteDelMapaBase() {
  const url = process.env.NEXT_PUBLIC_TESELAS_URL?.trim()
  if (!url) return new OSM()

  const zoomMaximo = Number(process.env.NEXT_PUBLIC_TESELAS_ZOOM_MAXIMO)
  return new XYZ({
    url,
    attributions: process.env.NEXT_PUBLIC_TESELAS_ATRIBUCION?.trim() || undefined,
    // Igual que OSM: sin esto el lienzo queda «contaminado» y no se puede
    // exportar como imagen.
    crossOrigin: "anonymous",
    maxZoom: Number.isFinite(zoomMaximo) && zoomMaximo > 0 ? zoomMaximo : 19,
  })
}
