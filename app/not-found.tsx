import Link from "next/link"
import { MapPin, ArrowLeft } from "lucide-react"
import { GismartMark } from "@/components/gismart-mark"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-7 text-center shadow-xl ring-1 ring-border">
        <GismartMark className="mx-auto size-11 rounded-xl shadow-sm" />

        <div className="mt-5 flex items-center justify-center gap-2 text-foreground">
          <MapPin className="size-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Página no encontrada</h1>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          La dirección que abriste no existe en GiSmart.
        </p>

        <Link
          href="/dashboard"
          className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" />
          Volver al mapa de red
        </Link>
      </div>
    </main>
  )
}
