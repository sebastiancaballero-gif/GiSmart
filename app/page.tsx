import { GiSmartLogin } from "@/components/gismart-login"
import { LoginPanelMarca } from "@/components/login-panel-marca"
import { TramaRed } from "@/components/trama-red"

export default function Page() {
  return (
    // En pantallas anchas, dos columnas: la red a la izquierda y el acceso a la
    // derecha. En el celular solo el formulario, que es lo único necesario.
    // `lg:h-screen`: con alto fijo, el dibujo de la columna de marca cede
    // espacio en pantallas bajas en vez de alargar la página.
    <main className="grid min-h-screen bg-background lg:h-screen lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <LoginPanelMarca className="hidden lg:flex" />

      <section className="relative flex items-center justify-center overflow-hidden p-4 sm:p-8">
        <TramaRed />

        {/* Halo de color que concentra la atención en la tarjeta. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_8%,color-mix(in_oklch,var(--color-primary)_12%,transparent)_0%,transparent_72%)]"
        />
        {/* Difumina la trama justo detrás de la tarjeta para que el formulario
            quede sobre un fondo limpio y se lea sin interferencias. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/70 blur-2xl"
        />

        <GiSmartLogin />

        {/* En el celular esto ya va debajo de la tarjeta (ver GiSmartLogin). */}
        <p className="absolute inset-x-0 bottom-5 hidden text-center text-[11px] text-muted-foreground lg:block">
          {`© ${new Date().getFullYear()} G&G Technology SAS`}
        </p>
      </section>
    </main>
  )
}
