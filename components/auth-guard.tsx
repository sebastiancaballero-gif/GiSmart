"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { getToken, isTokenValid } from "@/lib/auth"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (isTokenValid(token)) {
      setAuthorized(true)
    } else {
      window.location.replace("/")
    }
  }, [])

  if (!authorized) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">Verificando sesión...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}