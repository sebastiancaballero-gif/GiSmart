import { GitBranch, Layers, Map as MapaIcono } from "lucide-react"
import { GismartLogo } from "@/components/gismart-mark"

/**
 * Columna de marca del login, solo en pantallas anchas.
 *
 * Dibuja un tramo de red de fibra con los mismos símbolos del mapa y resalta el
 * recorrido desde la cabecera. Es decorativa y va siempre en oscuro, sin
 * importar el tema, para que el formulario de la derecha sea lo claro de la
 * pantalla. Los textos son generales a propósito: presentan el sistema, no
 * describen la red de un cliente.
 */

type Nodo = { x: number; y: number; tipo: "cabecera" | "empalme" | "primer" | "segundo" }

const NODOS: Record<string, Nodo> = {
  cab: { x: 70, y: 332, tipo: "cabecera" },
  emp: { x: 176, y: 300, tipo: "empalme" },
  n1: { x: 276, y: 250, tipo: "primer" },
  n2: { x: 236, y: 372, tipo: "primer" },
  n3: { x: 330, y: 186, tipo: "segundo" },
  n4: { x: 382, y: 118, tipo: "segundo" },
  n5: { x: 462, y: 128, tipo: "segundo" },
  n6: { x: 530, y: 150, tipo: "segundo" },
  n7: { x: 470, y: 222, tipo: "segundo" },
  n8: { x: 372, y: 300, tipo: "segundo" },
  n9: { x: 336, y: 404, tipo: "segundo" },
}

// Cables: pares de nodos. Los del recorrido resaltado van aparte.
const CABLES: [string, string][] = [
  ["emp", "n2"],
  ["n1", "n8"],
  ["n3", "n7"],
  ["n5", "n6"],
  ["n2", "n9"],
  ["n7", "n6"],
]
const RECORRIDO = ["cab", "emp", "n1", "n3", "n4", "n5"]

const COLOR_NIVEL = {
  cabecera: "#34d399",
  empalme: "#fb923c",
  primer: "#60a5fa",
  segundo: "#f472b6",
} as const

function SimboloNodo({ nodo }: { nodo: Nodo }) {
  const color = COLOR_NIVEL[nodo.tipo]
  if (nodo.tipo === "cabecera") {
    return (
      <g>
        <circle cx={nodo.x} cy={nodo.y} r={13} fill="#0a1a33" stroke={color} strokeWidth={2.5} />
        <path d={`M${nodo.x} ${nodo.y - 6} L${nodo.x + 6} ${nodo.y + 4} L${nodo.x - 6} ${nodo.y + 4} Z`} fill={color} />
      </g>
    )
  }
  const r = nodo.tipo === "primer" ? 9 : nodo.tipo === "empalme" ? 8 : 7
  return (
    <g>
      <circle cx={nodo.x} cy={nodo.y} r={r + 3} fill="#0a1a33" />
      <circle cx={nodo.x} cy={nodo.y} r={r} fill="#0a1a33" stroke={color} strokeWidth={2} />
      <path d={`M${nodo.x - r} ${nodo.y} H${nodo.x + r} M${nodo.x} ${nodo.y - r} V${nodo.y + r}`} stroke={color} strokeWidth={1.5} />
    </g>
  )
}

const CARACTERISTICAS = [
  { icono: MapaIcono, texto: "Visualización geográfica de la red" },
  { icono: GitBranch, texto: "Consulta de conectividad" },
  { icono: Layers, texto: "Información técnica de cada elemento" },
]

export function LoginPanelMarca({ className = "" }: { className?: string }) {
  const puntosRecorrido = RECORRIDO.map((id) => `${NODOS[id].x},${NODOS[id].y}`).join(" ")

  return (
    <aside
      className={`relative flex-col justify-between overflow-hidden bg-[#0a1a33] px-12 py-10 text-slate-200 ${className}`}
    >
      {/* Luz de fondo: más clara donde está la red, para darle profundidad. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_65%_45%,rgb(37_99_235/0.22),transparent_70%)]"
      />
      {/* Cuadrícula de mapa, muy tenue. */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-white/[0.04]">
        <defs>
          <pattern id="login-cuadricula" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M36 0 H0 V36" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-cuadricula)" />
      </svg>

      <div className="gismart-entrada relative flex items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <GismartLogo sobreOscuro idDegradado="gismart-mark-bg-panel" tamanoMarca="h-10" tamanoNombre="text-[26px]" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300/80">
            Sistema de Información Geográfica
          </p>
        </div>
      </div>

      <div
        // `min-h-0`: el dibujo cede alto en pantallas bajas en vez de empujar el
        // texto de abajo fuera de la vista.
        className="gismart-entrada relative -mx-4 my-4 flex min-h-0 flex-1 items-center"
        style={{ "--retraso": "120ms" } as React.CSSProperties}
      >
        <svg viewBox="0 0 600 460" className="h-full max-h-[460px] w-full max-w-[560px]" aria-hidden="true">
          {CABLES.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={NODOS[a].x}
              y1={NODOS[a].y}
              x2={NODOS[b].x}
              y2={NODOS[b].y}
              stroke="#3b82f6"
              strokeOpacity={0.45}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
          {/* Recorrido desde la cabecera: el camino que sigue la señal. */}
          <polyline points={puntosRecorrido} fill="none" stroke="#1d4ed8" strokeWidth={9} strokeOpacity={0.35} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={puntosRecorrido} fill="none" stroke="#38bdf8" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          <polyline
            points={puntosRecorrido}
            fill="none"
            stroke="#e0f2fe"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="gismart-pulso-red"
          />
          {Object.entries(NODOS).map(([id, nodo]) => (
            <SimboloNodo key={id} nodo={nodo} />
          ))}
        </svg>
      </div>

      <div className="gismart-entrada relative max-w-md" style={{ "--retraso": "220ms" } as React.CSSProperties}>
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-white">
          Gestión de redes de fibra óptica
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300/90">
          Consulta y administra la infraestructura de la red desde un solo lugar.
        </p>
        <ul className="mt-6 space-y-2.5">
          {CARACTERISTICAS.map(({ icono: Icono, texto }) => (
            <li key={texto} className="flex items-center gap-3 text-sm text-slate-200">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
                <Icono className="size-4 text-sky-300" aria-hidden="true" />
              </span>
              {texto}
            </li>
          ))}
        </ul>

        <p className="mt-8 border-t border-white/10 pt-5 text-[11px] font-medium text-slate-400">
          G&amp;G Technology SAS
        </p>
      </div>
    </aside>
  )
}
