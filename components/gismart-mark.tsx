// Marca de GiSmart: un pin de ubicación con un blanco en el centro y dos arcos
// de señal que salen por su lado superior izquierdo. Es el logo que entregó la
// empresa, redibujado como SVG para que se vea nítido a cualquier tamaño y sin
// el fondo blanco de la imagen original. Es el mismo dibujo del favicon
// (public/icon.svg).
//
// `idDegradado`: el degradado y la máscara se referencian por id, y si dos
// marcas en la página comparten el mismo, el navegador usa el primero que
// encuentra. Cuando ese primero está oculto (la columna de marca del login en
// el celular), la otra marca se quedaba sin color. Una marca que puede
// ocultarse lleva su propio id.

// Centro del pin y radios de sus anillos, en unidades del viewBox (100 × 120).
const CX = 54
const CY = 50
const R_PIN = 36
const R_HUECO = 24.5

// Puntos donde las rectas hacia la punta tocan el círculo del pin.
const PUNTA_Y = 112
const angulo = Math.acos(R_PIN / (PUNTA_Y - CY))
const TANGENTE_X = R_PIN * Math.sin(angulo)
const TANGENTE_Y = CY + R_PIN * Math.cos(angulo)

// El pin se corta entre estos dos ángulos (grados, sentido horario desde las
// 3): el cuarto superior izquierdo, donde van los arcos de señal.
const CORTE_DESDE = 168
const CORTE_HASTA = 282
// Radio y grosor de la banda del pin, para redondear sus puntas en el corte.
const R_BANDA = (R_PIN + R_HUECO) / 2
const GROSOR_BANDA = R_PIN - R_HUECO

/** Punto a una distancia y un ángulo del centro del pin. */
function punto(radio: number, grados: number) {
  const rad = (grados * Math.PI) / 180
  return [CX + radio * Math.cos(rad), CY + radio * Math.sin(rad)] as const
}

/** Arco de circunferencia centrado en el pin, entre dos ángulos. */
function arco(radio: number, desde: number, hasta: number) {
  const [x1, y1] = punto(radio, desde)
  const [x2, y2] = punto(radio, hasta)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radio} ${radio} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const [CORTE_X1, CORTE_Y1] = punto(80, CORTE_DESDE)
const [CORTE_X2, CORTE_Y2] = punto(80, CORTE_HASTA)
const [PUNTA_IZQ_X, PUNTA_IZQ_Y] = punto(R_BANDA, CORTE_DESDE)
const [PUNTA_SUP_X, PUNTA_SUP_Y] = punto(R_BANDA, CORTE_HASTA)

export function GismartMark({ className, idDegradado = "gismart-mark-bg" }: { className?: string; idDegradado?: string }) {
  const idMascara = `${idDegradado}-corte`

  return (
    <svg viewBox="4 0 88 113" className={className} aria-hidden="true" fill="none">
      <defs>
        <linearGradient id={idDegradado} x1="0" y1={CY - R_PIN} x2="0" y2={PUNTA_Y} gradientUnits="userSpaceOnUse">
          <stop stopColor="#3d98c0" />
          <stop offset="1" stopColor="#2f6d9e" />
        </linearGradient>
        {/* Quita el cuarto superior izquierdo del pin: ahí van los arcos. */}
        <mask id={idMascara} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="120">
          <rect width="100" height="120" fill="#fff" />
          <path d={`M ${CX} ${CY} L ${CORTE_X1} ${CORTE_Y1} L ${CX - 80} ${CY - 80} L ${CORTE_X2} ${CORTE_Y2} Z`} fill="#000" />
        </mask>
      </defs>

      {/* Cuerpo del pin: círculo con punta hacia abajo y hueco en el centro. */}
      <path
        mask={`url(#${idMascara})`}
        fill={`url(#${idDegradado})`}
        fillRule="evenodd"
        d={`M ${CX + TANGENTE_X} ${TANGENTE_Y} L ${CX} ${PUNTA_Y} L ${CX - TANGENTE_X} ${TANGENTE_Y}
            A ${R_PIN} ${R_PIN} 0 1 1 ${CX + TANGENTE_X} ${TANGENTE_Y} Z
            M ${CX + R_HUECO} ${CY} A ${R_HUECO} ${R_HUECO} 0 1 0 ${CX - R_HUECO} ${CY}
            A ${R_HUECO} ${R_HUECO} 0 1 0 ${CX + R_HUECO} ${CY} Z`}
      />

      {/* Puntas redondeadas del pin en el corte, como en el logo original. */}
      <circle cx={PUNTA_IZQ_X} cy={PUNTA_IZQ_Y} r={GROSOR_BANDA / 2} fill={`url(#${idDegradado})`} />
      <circle cx={PUNTA_SUP_X} cy={PUNTA_SUP_Y} r={GROSOR_BANDA / 2} fill={`url(#${idDegradado})`} />

      {/* Los dos arcos de señal, en el cuarto que se le quitó al pin. */}
      <path d={arco(R_BANDA, 200, 250)} stroke="#3aa3c2" strokeWidth={GROSOR_BANDA - 1} strokeLinecap="round" />
      <path d={arco(R_PIN + 11, 197, 253)} stroke="#a6dbe6" strokeWidth={7.5} strokeLinecap="round" />

      {/* Blanco del centro: anillo celeste y punto. */}
      <circle cx={CX} cy={CY} r={16.5} stroke="#6fc5df" strokeWidth={7} />
      <circle cx={CX} cy={CY} r={5.5} fill="#2a9bc4" />
    </svg>
  )
}

/**
 * Logo completo: la marca y el nombre. El color del nombre se define en
 * globals.css (`.gismart-nombre`), porque tiene que leerse sobre la tarjeta del
 * tema claro y del oscuro; `sobreOscuro` lo fuerza a la versión clara para
 * fondos que siempre son oscuros, como la columna de marca del login.
 */
export function GismartLogo({
  className = "",
  tamanoMarca = "h-10",
  tamanoNombre = "text-2xl",
  sobreOscuro = false,
  idDegradado,
}: {
  className?: string
  /** Alto de la marca, en clases de Tailwind. */
  tamanoMarca?: string
  /** Tamaño del nombre, en clases de Tailwind. */
  tamanoNombre?: string
  sobreOscuro?: boolean
  idDegradado?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <GismartMark idDegradado={idDegradado} className={`${tamanoMarca} w-auto shrink-0`} />
      <span
        className={`${sobreOscuro ? "gismart-nombre-claro" : "gismart-nombre"} font-extrabold leading-none tracking-tight ${tamanoNombre}`}
      >
        GiSmart
      </span>
    </span>
  )
}
