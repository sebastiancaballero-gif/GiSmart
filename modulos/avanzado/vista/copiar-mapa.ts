import type { MapaApi } from "@/components/network-map"
import { atribucionDelMapaBase } from "@/lib/map/mapa-base"
import { componerLamina } from "../imprimir/componer"

/**
 * Avanzado › Copiar mapa: la misma lámina de Imprimir (título, leyenda,
 * escala, fecha y la atribución del fondo) al portapapeles, para pegarla en
 * WhatsApp o en un correo con Ctrl+V. Si el navegador no deja copiar imágenes
 * (sin HTTPS, por ejemplo), se descarga como PNG.
 */
export async function copiarMapa(
  api: MapaApi,
  { lugar, conFondo }: { lugar: string; conFondo: boolean },
): Promise<{ como: "copiado" | "descargado"; incompleta: boolean }> {
  // Si el mapa base no terminó de bajar, la imagen sale igual (ver capturarMapa) y se avisa.
  let incompleta = false
  const imagen = (async () => {
    const captura = await api.capturarMapa()
    if (!captura) throw new Error("No se pudo tomar la imagen del mapa.")
    incompleta = captura.incompleta === true
    const lamina = componerLamina(
      captura,
      {
        titulo: "Red de fibra óptica",
        subtitulo: lugar,
        fondo: conFondo,
        atribucion: atribucionDelMapaBase(),
        leyenda: true,
        escalaYNorte: true,
        fecha: new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" }),
      },
      window.devicePixelRatio || 1,
    )
    const blob = await new Promise<Blob | null>((listo) => lamina.toBlob(listo, "image/png"))
    if (!blob) throw new Error("No se pudo armar la imagen del mapa.")
    return blob
  })()

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      // El portapapeles se pide enseguida, con la imagen todavía por armar: si
      // se pidiera después, el navegador ya no lo contaría como parte del click.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": imagen })])
      return { como: "copiado", incompleta }
    } catch {
      // Sin permiso para el portapapeles: se descarga (abajo).
    }
  }
  const blob = await imagen
  const enlace = document.createElement("a")
  enlace.href = URL.createObjectURL(blob)
  enlace.download = `mapa-${new Date().toISOString().slice(0, 10)}.png`
  enlace.click()
  window.setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000)
  return { como: "descargado", incompleta }
}
