/**
 * Trama tenue de red de fibra para fondos de pantalla completa: hilos y
 * cubiertas de empalme, el mismo lenguaje visual del mapa, sin competir con lo
 * que va encima. El color lo pone la clase `gismart-trama` (globals.css), que
 * lo ajusta al tema.
 *
 * Solo debe haber una por página: el patrón se referencia por id.
 */
export function TramaRed() {
  return (
    <svg aria-hidden="true" className="gismart-trama pointer-events-none absolute inset-0 size-full">
      <defs>
        {/* Trama menuda: a mayor escala se leía como papel tapiz en vez de
            como textura de fondo. */}
        <pattern id="gismart-trama-red" width="132" height="108" patternUnits="userSpaceOnUse">
          <path
            d="M-12 24 H 48 M 66 24 H 144 M 24 24 V 84 M 90 6 V 24 M 90 24 C 90 54, 114 54, 114 84"
            stroke="currentColor"
            strokeWidth="1.25"
            fill="none"
          />
          <g stroke="currentColor" strokeWidth="1.25" fill="none">
            <circle cx="57" cy="24" r="6" />
            <path d="M57 18 V 30 M 51 24 H 63" />
            <circle cx="24" cy="84" r="4" />
            <circle cx="114" cy="84" r="4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#gismart-trama-red)" />
    </svg>
  )
}
