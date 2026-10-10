import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"

/**
 * La versión que se ve en el login (lib/version.ts) sale de package.json, y el
 * commit desde el que se compila, de git. Cada cambio importante sube la
 * versión y queda anotado en CHANGELOG.md.
 */
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))

function commitActual() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    // Compilado fuera del repositorio: se ve solo la versión.
    return ""
  }
}

/**
 * Cabeceras de seguridad para todas las respuestas.
 *
 * La aplicación se publica detrás de IIS en un servidor propio (ver
 * docs/despliegue-windows.md), así que no hay una plataforma que las ponga por
 * su cuenta: sin esto, la pantalla de inicio de sesión se puede meter en un
 * iframe ajeno y capturar las pulsaciones sobre el formulario.
 *
 * No se define Content-Security-Policy todavía: OpenLayers y Next inyectan
 * estilos en línea, y una política mal ajustada rompe el mapa entero. Queda
 * pendiente probarla con calma.
 */
const cabecerasDeSeguridad = [
  // Nadie puede incrustar la aplicación en un iframe.
  { key: "X-Frame-Options", value: "DENY" },
  // El navegador respeta el Content-Type declarado y no lo adivina.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al salir hacia Nominatim u OpenStreetMap no se filtra la ruta interna.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La aplicación no usa cámara, micrófono ni ubicación del dispositivo.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_VERSION: version,
    NEXT_PUBLIC_COMPILACION: commitActual(),
  },
  // Sin «X-Powered-By: Next.js»: no hace falta anunciar con qué está hecha.
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecerasDeSeguridad }]
  },
}

export default nextConfig
