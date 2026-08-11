import { GiSmartLogin } from "@/components/gismart-login"

export default function Page() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_12%,transparent)_0%,transparent_70%)]"
      />
      <GiSmartLogin />
    </main>
  )
}