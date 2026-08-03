"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { getToken, isTokenValid } from "@/lib/auth"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = useState<"checking" | "ok">("checking")

  useEffect(() => {
    if (isTokenValid(getToken())) {
      setStatus("ok")
    } else {
      router.replace("/")
    }
  }, [router])

  if (status === "checking") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm">Verificando sesión...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}