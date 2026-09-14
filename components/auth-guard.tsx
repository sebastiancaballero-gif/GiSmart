"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { expiracionDelToken, getToken, isTokenValid, terminarSesionCaducada } from "@/lib/auth"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false)

  // El token vive en localStorage, que no existe durante el render del
  // servidor: la comprobacion solo puede hacerse ya montado en el navegador.
  useEffect(() => {
    const token = getToken()
    if (!isTokenValid(token)) {
      window.location.replace("/")
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthorized(true)

    // La sesión dura ocho horas, más que una jornada de trabajo con el mapa
    // abierto. Antes solo se comprobaba al entrar, así que al vencer no pasaba
    // nada visible: las capas empezaban a fallar y el mapa se quedaba vacío.
    // Ahora se avisa en el momento justo, y también al volver a la pestaña
    // (los temporizadores no corren mientras el equipo está suspendido).
    const expira = expiracionDelToken(token)
    const restante = expira ? expira - Date.now() : 0

    // `setTimeout` no admite esperas mayores a ~24,8 días; ocho horas caben de
    // sobra, pero se acota por si algún día se alarga la vigencia.
    const temporizador = window.setTimeout(terminarSesionCaducada, Math.min(restante, 2_147_483_000))

    function comprobarAlVolver() {
      if (document.visibilityState === "visible" && !isTokenValid(getToken())) {
        terminarSesionCaducada()
      }
    }

    document.addEventListener("visibilitychange", comprobarAlVolver)
    return () => {
      window.clearTimeout(temporizador)
      document.removeEventListener("visibilitychange", comprobarAlVolver)
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
