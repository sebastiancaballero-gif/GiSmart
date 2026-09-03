import { GiSmartLogin } from "@/components/gismart-login"

export default function Page() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Trama tenue de red de fibra: hilos y cubiertas de empalme, el mismo
          lenguaje visual del mapa, sin competir con el formulario. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full text-primary/[0.07]"
      >
        <defs>
          <pattern id="login-red" width="220" height="180" patternUnits="userSpaceOnUse">
            <path
              d="M-20 40 H 80 M 110 40 H 240 M 40 40 V 140 M 150 10 V 40 M 150 40 C 150 90, 190 90, 190 140"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <g stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="95" cy="40" r="10" />
              <path d="M95 30 V 50 M 85 40 H 105" />
              <circle cx="40" cy="140" r="7" />
              <circle cx="190" cy="140" r="7" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-red)" />
      </svg>

      {/* Halo de color que concentra la atención en la tarjeta. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_16%,transparent)_0%,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 left-1/2 size-[540px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <GiSmartLogin />
    </main>
  )
}
