"use client"

import { Controller, useForm } from "react-hook-form"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  User,
  Lock,
  Sun,
  Moon,
  X,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react"
import { saveSession } from "@/lib/auth"
import { getCurrentTheme, toggleTheme } from "@/lib/theme"
import { ConnectingModal } from "@/components/connecting-modal"
import { GismartMark } from "@/components/gismart-mark"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(getCurrentTheme() === "dark")
  }, [])

  function handleToggleTheme() {
    setIsDark(toggleTheme() === "dark")
  }

  const {
    register,
    control,
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
    // `relative z-10`: los fondos decorativos de la página van posicionados y,
    // sin esto, se pintarían por encima del formulario aunque estén antes.
    <div className="relative z-10 w-full max-w-sm animate-gismart-fade-in">
      {/* La tarjeta va sobre el fondo con trama, así que lleva algo más de
          elevación y un filo de marca arriba para despegarse de él. */}
      <div className="overflow-hidden rounded-2xl bg-card shadow-[0_20px_50px_-12px_rgb(15_23_42/0.25)] ring-1 ring-border">
        <div
          aria-hidden="true"
          className="h-1.5 bg-gradient-to-r from-[#2563eb] via-[#0ea5e9] to-[#2563eb]"
        />

        <div className="px-7 pb-7 pt-6">
          {/* Encabezado sobrio: la marca identifica sin acaparar la pantalla. */}
          <div className="mb-7 flex items-start justify-between gap-3">
            <div>
              <GismartMark className="size-11 rounded-xl shadow-sm" />
              <h1 className="mt-4 text-lg font-bold tracking-tight text-foreground">
                Iniciar sesión
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Accede al sistema de red de fibra
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleTheme}
              className="-mr-1.5 -mt-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Usuario */}
            <div className="mb-4">
              <Label htmlFor="usuario" className="mb-1.5">
                <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
                Usuario
              </Label>
              <div className="relative">
                <Input
                  id="usuario"
                  type="text"
                  autoComplete="username"
                  placeholder="Ingresa tu usuario"
                  aria-invalid={!!errors.usuario}
                  aria-describedby="usuario-error"
                  className="pr-10"
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
              <Label htmlFor="contrasena" className="mb-1.5">
                <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="contrasena"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  aria-invalid={!!errors.contrasena}
                  aria-describedby="contrasena-error"
                  onKeyUp={handleCaps}
                  onKeyDown={handleCaps}
                  className="pr-16"
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

            <div className="mb-5 mt-1 flex items-center">
              <Label htmlFor="recordar" className="cursor-pointer font-normal">
                <Controller
                  name="recordar"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id="recordar"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                Recordar usuario
              </Label>
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
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Conectando..." : "Conectar"}
              <ArrowRight className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                reset()
                setConnected(false)
                setServerError(null)
                setCapsLock(false)
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" />
              Limpiar formulario
            </button>
          </form>
        </div>
      </div>

      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        GiSmart · Sistema de Información Geográfica
      </p>

      {/* Modal de carga durante la autenticación */}
      <ConnectingModal open={connecting} usuario={usuarioValue} done={connected} />
    </div>
  )
}
