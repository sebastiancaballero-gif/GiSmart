// Node no conoce el alias "@/" del tsconfig ni le pone extension a los
// modulos TypeScript, y "next/server" solo resuelve con el .js explicito.
// Este hook cubre las tres cosas para poder importar las rutas tal cual.
import { pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { resolve as resolverRuta } from "node:path"

export function resolve(especificador, contexto, siguiente) {
  if (especificador === "next/server") return siguiente("next/server.js", contexto)

  if (especificador.startsWith("@/")) {
    const base = resolverRuta(process.cwd(), especificador.slice(2))
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(base + ext)) return siguiente(pathToFileURL(base + ext).href, contexto)
    }
  }

  return siguiente(especificador, contexto)
}
