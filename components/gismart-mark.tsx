// Marca de GISmart: hilos de fibra que convergen en una cubierta de empalme.
// Es el mismo dibujo del favicon (public/icon.svg), para que el login, la barra
// lateral y la pestaña del navegador muestren siempre el mismo símbolo.
export function GismartMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 180" className={className} aria-hidden="true" fill="none">
      <defs>
        <linearGradient id="gismart-mark-bg" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>

      <rect width="180" height="180" rx="37" fill="url(#gismart-mark-bg)" />

      <g stroke="#ffffff" strokeWidth="11" strokeLinecap="round">
        <path d="M12 56 C 42 56, 46 90, 64 90" />
        <path d="M12 90 H 64" />
        <path d="M12 124 C 42 124, 46 90, 64 90" />
        <path d="M168 56 C 138 56, 134 90, 116 90" />
        <path d="M168 90 H 116" />
        <path d="M168 124 C 138 124, 134 90, 116 90" />
      </g>

      <circle cx="90" cy="90" r="30" fill="#ffffff" />
      <g stroke="#2563eb" strokeWidth="9" strokeLinecap="round">
        <path d="M90 71 V 109" />
        <path d="M71 90 H 109" />
      </g>
    </svg>
  )
}
