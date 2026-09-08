"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { getToken, isTokenValid } from "@/lib/auth"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false)

  // El token vive en localStorage, que no existe durante el render del
  // servidor: la comprobacion solo puede hacerse ya montado en el navegador.
  useEffect(() => {
    const token = getToken()
    if (isTokenValid(token)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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