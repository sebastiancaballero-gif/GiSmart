"use client"

import { useForm } from "react-hook-form"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  User,
  Lock,
  Settings,
  X,
  ArrowRight,
  Globe,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react"
import { saveSession } from "@/lib/auth"
import { ConnectingModal } from "@/components/connecting-modal"

type FormValues = {
  usuario: string
  contrasena: string
  recordar: boolean
}

export function GiSmartLogin() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: { usuario: "", contrasena: "", recordar: false },
  })

  const usuarioValue = watch("usuario")
  const contrasenaValue = watch("contrasena")

  function handleCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false)
  }

  async function onSubmit(data: FormValues) {
    setServerError(null)
    setConnecting(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: data.usuario.trim(), contrasena: data.contrasena }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setConnecting(false)
        // Si el servidor indica el campo, marca el error inline
        if (body.field === "usuario" || body.field === "contrasena") {
          setError(body.field, { type: "server", message: body.message })
        } else {
          setServerError(body.message ?? "No se pudo conectar con el servidor.")
        }
        return
      }

      const { token, user } = await res.json()
      saveSession(token, user, data.recordar)
      setConnected(true)
      setTimeout(() => router.push("/dashboard"), 700)
    } catch {
      setConnecting(false)
      setServerError("Error de red. Verifica tu conexión e inténtalo de nuevo.")
    }
  }

  // Estado visual de un campo: error | ok | idle
  const usuarioOk = !errors.usuario && dirtyFields.usuario && usuarioValue.length >= 3
  const contrasenaOk = !errors.contrasena && dirtyFields.contrasena && contrasenaValue.length >= 6

  return (
    <div className="w-full max-w-md">
      <div className="overflow-hidden rounded-2xl bg-card shadow-2xl shadow-primary/20 ring-1 ring-border">
        {/* Barra de título estilo ventana */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Globe className="size-3.5" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-foreground">GiSmart — Conexión al servidor</span>
          </div>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-destructive" />
          </div>
        </div>

        {/* Encabezado de marca */}
        <div className="flex items-center gap-3 border-b border-border bg-gradient-to-b from-accent/60 to-card px-6 py-4">
          <span className="flex size-11 items-center justify-center rounded-full bg-card ring-1 ring-primary/25">
            <Globe className="size-5 text-primary" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight text-foreground">GiSmart</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Redes de Telecomunicaciones
            </p>
          </div>
        </div>

        {/* Cuerpo */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-6" noValidate>
          <p className="mb-5 text-center text-sm text-muted-foreground">
            Ingresa tus credenciales para acceder al sistema
          </p>

          {/* Usuario */}
          <div className="mb-4">
            <label htmlFor="usuario" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Usuario
            </label>
            <div className="relative">
              <input
                id="usuario"
                type="text"
                autoComplete="username"
                placeholder="Ingresa tu usuario"
                aria-invalid={!!errors.usuario}
                aria-describedby="usuario-error"
                className="w-full rounded-lg border border-input bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/30"
                {...register("usuario", {
                  required: "Ingresa un usuario.",
                  minLength: { value: 3, message: "El usuario debe tener al menos 3 caracteres." },
                  maxLength: { value: 20, message: "El usuario no puede superar 20 caracteres." },
                  pattern: {
                    value: /^[a-zA-Z0-9._-]+$/,
                    message: "Solo letras, números y . _ - (sin espacios).",
                  },
                  validate: (v) => v.trim().length > 0 || "El usuario no puede estar vacío.",
                })}
              />
              {usuarioOk && (
                <CheckCircle2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary" aria-hidden="true" />
              )}
              {errors.usuario && (
                <AlertCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-destructive" aria-hidden="true" />
              )}
            </div>
            {errors.usuario && (
              <p id="usuario-error" role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                {errors.usuario.message}
              </p>
            )}
          </div>

          {/* Contraseña */}
          <div className="mb-4">
            <label htmlFor="contrasena" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Contraseña
            </label>
            <div className="relative">
              <input
                id="contrasena"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                aria-invalid={!!errors.contrasena}
                aria-describedby="contrasena-error"
                onKeyUp={handleCaps}
                onKeyDown={handleCaps}
                className="w-full rounded-lg border border-input bg-card px-3.5 py-2.5 pr-16 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/30"
                {...register("contrasena", {
                  required: "Ingresa una contraseña.",
                  minLength: { value: 6, message: "La contraseña debe tener al menos 6 caracteres." },
                  maxLength: { value: 50, message: "La contraseña no puede superar 50 caracteres." },
                })}
              />
              <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                {contrasenaOk && <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />}
                {errors.contrasena && <AlertCircle className="size-4 text-destructive" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="rounded p-1 text-muted-foreground transition hover:text-primary"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {errors.contrasena && (
              <p id="contrasena-error" role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                {errors.contrasena.message}
              </p>
            )}
            {capsLock && !errors.contrasena && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                Bloq Mayús activado.
              </p>
            )}
          </div>

          {/* Recordar + servidor */}
          <div className="mb-4 flex items-center justify-between">
            <label htmlFor="recordar" className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                id="recordar"
                type="checkbox"
                className="size-4 rounded border-input text-primary accent-primary"
                {...register("recordar")}
              />
              Recordar usuario
            </label>
            <span className="text-sm font-medium text-primary">Servidor: ORCL</span>
          </div>

          {/* Mensaje de error general del servidor */}
          {serverError && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Acciones */}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-primary/20 transition hover:bg-accent/70"
              aria-label="Configuración"
            >
              <Settings className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                reset()
                setConnected(false)
                setServerError(null)
                setCapsLock(false)
              }}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-4" />
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary/80 px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Conectando..." : "Conectar"}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </form>

        {/* Pie */}
        <div className="flex items-center justify-between border-t border-border bg-secondary/40 px-6 py-3 text-xs text-muted-foreground">
          <span>Sistema de Información Geográfica</span>
          <span>v2.4 · SIGETP</span>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">© GiSmart — todos los derechos reservados</p>

      {/* Modal de carga durante la autenticación */}
      <ConnectingModal open={connecting} usuario={usuarioValue} done={connected} />
    </div>
  )
}
