"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { expiracionGuardada, terminarSesionCaducada, verificarSesion } from "@/lib/auth"
import { GismartLogo } from "@/components/gismart-mark"
import { TramaRed } from "@/components/trama-red"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false)

  // La sesión vive en una cookie httpOnly que el navegador no puede leer: se le
  // pregunta al servidor. Lo que dejó el login en el navegador solo sirve para
  // no esperar en vano cuando claramente no hay sesión.
  useEffect(() => {
    const guardada = expiracionGuardada()
    if (!guardada || guardada <= Date.now()) {
      window.location.replace("/")
      return
    }

    let activo = true
    let temporizador: number | undefined
    let expira = guardada

    function comprobarAlVolver() {
      if (document.visibilityState === "visible" && expira <= Date.now()) terminarSesionCaducada()
    }

    void verificarSesion().then((resultado) => {
      if (!activo) return
      if (resultado === "invalida") {
        terminarSesionCaducada()
        return
      }
      // Sin red no se puede confirmar, pero tampoco es una sesión vencida: se
      // entra con lo guardado y las capas dirán si algo falla.
      if (resultado !== "sin-red") expira = resultado.expira
      setAuthorized(true)

      // La sesión dura ocho horas, más que una jornada de trabajo con el mapa
      // abierto. Antes solo se comprobaba al entrar, así que al vencer no
      // pasaba nada visible: las capas empezaban a fallar y el mapa se quedaba
      // vacío. Ahora se avisa en el momento justo, y también al volver a la
      // pestaña (los temporizadores no corren mientras el equipo está
      // suspendido). `setTimeout` no admite esperas mayores a ~24,8 días.
      temporizador = window.setTimeout(terminarSesionCaducada, Math.min(expira - Date.now(), 2_147_483_000))
      document.addEventListener("visibilitychange", comprobarAlVolver)
    })

    return () => {
      activo = false
      window.clearTimeout(temporizador)
      document.removeEventListener("visibilitychange", comprobarAlVolver)
    }
  }, [])

  if (!authorized) {
    // Mismo fondo y logo que el login: es el paso intermedio entre las dos
    // pantallas, y así el cambio se siente continuo.
    return (
      <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-background">
        <TramaRed />
        <div className="gismart-entrada relative flex flex-col items-center gap-5">
          <GismartLogo tamanoMarca="h-11" tamanoNombre="text-3xl" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            <p>Verificando sesión…</p>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
