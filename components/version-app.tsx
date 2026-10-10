import { COMPILACION, VERSION } from "@/lib/version"

/**
 * «Versión 1.4.0» para el pie del login. Al pasar el mouse dice desde qué
 * commit se compiló: sirve para saber qué hay exactamente en producción.
 */
export function VersionApp() {
  return (
    <span title={COMPILACION ? `Compilación ${COMPILACION}` : undefined} className="tabular-nums">
      Versión {VERSION}
    </span>
  )
}
