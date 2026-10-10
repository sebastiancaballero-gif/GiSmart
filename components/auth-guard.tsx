"use client"

import { useEffect, useState } from "react"
import { Clock, Loader2, X } from "lucide-react"
import { expiracionGuardada, saveSession, terminarSesionCaducada, verificarSesion } from "@/lib/auth"
import { GismartLogo } from "@/components/gismart-mark"
import { TramaRed } from "@/components/trama-red"

/** Con cuánta anticipación se avisa que la sesión va a vencer. */
const AVISO_ANTES_MS = 5 * 60 * 1000

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false)
  // Hora a la que vence la sesión, cuando faltan pocos minutos. Antes la
  // sesión se cortaba de golpe y el usuario aparecía en el login sin aviso.
  const [venceA, setVenceA] = useState<number | null>(null)

  // La sesión vive en una cookie httpOnly que el navegador no puede leer: se le
  // pregunta al servidor. Lo que dejó el login en el navegador solo sirve para
  // no esperar en vano cuando ya venció.
  //
  // Sin nada guardado en esta pestaña (se entró sin «Recordar» y se abrió otra
  // pestaña, o un marcador) la cookie puede seguir siendo válida: antes se
  // mandaba al login sin preguntar y había que volver a escribir la clave.
  useEffect(() => {
    const guardada = expiracionGuardada()
    if (guardada !== null && guardada <= Date.now()) {
      window.location.replace("/")
      return
    }

    let activo = true
    let temporizador: number | undefined
    let temporizadorAviso: number | undefined
    let expira = guardada ?? 0

    function comprobarAlVolver() {
      if (document.visibilityState === "visible" && expira <= Date.now()) terminarSesionCaducada()
    }

    void verificarSesion().then((resultado) => {
      if (!activo) return
      if (resultado === "invalida") {
        // Si esta pestaña no tenía sesión, no hay nada que «caducó»: al login, sin aviso.
        if (guardada === null) window.location.replace("/")
        else terminarSesionCaducada()
        return
      }
      if (resultado === "sin-red") {
        // Sin red no se puede confirmar, pero tampoco es una sesión vencida: se
        // entra con lo guardado y las capas dirán si algo falla. Sin nada
        // guardado no hay con qué entrar.
        if (guardada === null) {
          window.location.replace("/")
          return
        }
      } else {
        expira = resultado.expira
        // La sesión de la cookie, para esta pestaña (el encabezado muestra el usuario).
        if (guardada === null) saveSession({ usuario: resultado.usuario }, resultado.expira, false)
      }
      setAuthorized(true)

      // La sesión dura ocho horas, más que una jornada de trabajo con el mapa
      // abierto. Antes solo se comprobaba al entrar, así que al vencer no
      // pasaba nada visible: las capas empezaban a fallar y el mapa se quedaba
      // vacío. Ahora se avisa en el momento justo, y también al volver a la
      // pestaña (los temporizadores no corren mientras el equipo está
      // suspendido). `setTimeout` no admite esperas mayores a ~24,8 días.
      temporizador = window.setTimeout(terminarSesionCaducada, Math.min(expira - Date.now(), 2_147_483_000))
      const vence = expira
      temporizadorAviso = window.setTimeout(
        () => setVenceA(vence),
        Math.min(Math.max(0, vence - AVISO_ANTES_MS - Date.now()), 2_147_483_000),
      )
      document.addEventListener("visibilitychange", comprobarAlVolver)
    })

    return () => {
      activo = false
      window.clearTimeout(temporizador)
      window.clearTimeout(temporizadorAviso)
      document.removeEventListener("visibilitychange", comprobarAlVolver)
    }
  }, [])

  if (!authorized) {
    // Mismo fondo y logo que el login: es el paso intermedio entre las dos
    // pantallas, y así el cambio se siente continuo.
    //
    // El logo espera 300 ms antes de asomar. Casi siempre la sesión se confirma
    // antes, y entonces no se ve nada más que el fondo; antes el logo alcanzaba
    // a parpadear un instante entre el «Bienvenido» del login y el tablero.
    return (
      <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-background">
        <TramaRed />
        <div
          className="gismart-entrada relative flex flex-col items-center gap-5"
          style={{ "--retraso": "300ms" } as React.CSSProperties}
        >
          <GismartLogo tamanoMarca="h-11" tamanoNombre="text-3xl" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            <p>Verificando sesión…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {children}
      {venceA !== null && (
        <div
          role="alert"
          className="fixed left-1/2 top-3 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-950 shadow-lg ring-1 ring-amber-300 animate-gismart-fade-in dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700"
        >
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Tu sesión vence a las{" "}
            <span className="font-semibold tabular-nums">
              {/* 24 horas: «13:44». Con «p. m.» el punto final quedaba doble. */}
              {new Date(venceA).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
            </span>
            . Después tendrás que volver a iniciar sesión.
          </span>
          <button
            type="button"
            onClick={() => setVenceA(null)}
            aria-label="Cerrar el aviso"
            className="-mr-1 rounded-md p-1 outline-none transition hover:bg-amber-200/60 focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-amber-800/60"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  )
}
