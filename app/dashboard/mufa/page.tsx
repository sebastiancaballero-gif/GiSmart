"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

import { AuthGuard } from "@/components/auth-guard"
import { DashboardHeader } from "@/components/dashboard-header"
import { MUFA_CAMPO_MOCKUP } from "@/lib/schematic/mufa-field-mockup"
import { getSelectedMufaSchema } from "@/lib/schematic/selected-mufa"

// JointJS depende del DOM al cargarse, por lo que el esquema se importa sólo
// en el cliente.
const MufaSchematic = dynamic(
  () => import("@/components/mufa-schematic").then((mod) => mod.MufaSchematic),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">Cargando esquema de la mufa...</p>
        </div>
      </div>
    ),
  },
)

export default function MufaPage() {
  // Si se llegó desde "Ver conexiones" en el mapa, se usa el esquema real de
  // esa mufa (guardado por selected-mufa.ts); si no, se cae al mockup fijo.
  const [datos, setDatos] = useState(MUFA_CAMPO_MOCKUP)

  useEffect(() => {
    const stored = getSelectedMufaSchema()
    if (stored) setDatos(stored)
  }, [])

  return (
    <AuthGuard>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
        <DashboardHeader
          title="Manejo Esquemático · Conectividad Interna"
          subtitle={`MUFA-${datos.mufa_id} · ${datos.tipo} · ${datos.estado}`}
          backHref="/dashboard"
        />
        <main className="flex-1 overflow-hidden">
          <MufaSchematic datos={datos} />
        </main>
      </div>
    </AuthGuard>
  )
}
