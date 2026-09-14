import { GiSmartLogin } from "@/components/gismart-login"

export default function Page() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Trama tenue de red de fibra: hilos y cubiertas de empalme, el mismo
          lenguaje visual del mapa, sin competir con el formulario. */}
      <svg aria-hidden="true" className="gismart-trama pointer-events-none absolute inset-0 size-full">
        <defs>
          {/* Trama menuda: a mayor escala se leía como papel tapiz en vez de
              como textura de fondo. */}
          <pattern id="login-red" width="132" height="108" patternUnits="userSpaceOnUse">
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
        <rect width="100%" height="100%" fill="url(#login-red)" />
      </svg>

      {/* Halo de color que concentra la atención en la tarjeta. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_8%,color-mix(in_oklch,var(--color-primary)_12%,transparent)_0%,transparent_72%)]"
      />
      {/* Difumina la trama justo detrás de la tarjeta para que el formulario
          quede sobre un fondo limpio y se lea sin interferencias. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/70 blur-2xl"
      />

      <GiSmartLogin />
    </main>
  )
}
