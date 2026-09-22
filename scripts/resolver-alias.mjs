// Node no conoce el alias "@/" del tsconfig ni le pone extension a los
// modulos TypeScript, y "next/server" solo resuelve con el .js explicito.
// Este hook cubre las tres cosas para poder importar las rutas tal cual.
import { fileURLToPath, pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { dirname, extname, resolve as resolverRuta } from "node:path"

const EXTENSIONES = [".ts", ".tsx", "/index.ts"]

/** La ruta con la primera extensión TypeScript que exista, o null. */
function conExtension(base) {
  for (const ext of EXTENSIONES) {
    if (existsSync(base + ext)) return pathToFileURL(base + ext).href
  }
  return null
}

export function resolve(especificador, contexto, siguiente) {
  if (especificador === "next/server") return siguiente("next/server.js", contexto)

  if (especificador.startsWith("@/")) {
    const url = conExtension(resolverRuta(process.cwd(), especificador.slice(2)))
    if (url) return siguiente(url, contexto)
  }

  // Imports relativos sin extensión entre módulos TypeScript, como
  // "./fiber-colors" dentro de lib/schematic.
  const relativo = especificador.startsWith("./") || especificador.startsWith("../")
  if (relativo && !extname(especificador) && contexto.parentURL?.startsWith("file:")) {
    const url = conExtension(resolverRuta(dirname(fileURLToPath(contexto.parentURL)), especificador))
    if (url) return siguiente(url, contexto)
  }

  return siguiente(especificador, contexto)
}
