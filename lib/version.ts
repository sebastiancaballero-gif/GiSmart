/**
 * La versión de GISmart que se ve en el login.
 *
 * Sale de `package.json` al compilar: next.config.mjs la pasa como
 * `NEXT_PUBLIC_VERSION`, junto con el commit desde el que se compiló (si se
 * compila desde el repositorio). Así hay un solo lugar donde cambiarla. Qué
 * trae cada versión: CHANGELOG.md. En `pnpm dev`, un cambio de versión se ve
 * al reiniciar el servidor (Next lo reinicia solo al tocar next.config.mjs).
 */
export const VERSION = process.env.NEXT_PUBLIC_VERSION || "0.0.0"

/** El commit corto desde el que se compiló, o `null` si no se compiló desde git. */
export const COMPILACION = process.env.NEXT_PUBLIC_COMPILACION || null
