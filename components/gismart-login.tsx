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
  Loader2,
} from "lucide-react"
import { saveSession } from "@/lib/auth"
import { getCurrentTheme, toggleTheme } from "@/lib/theme"
import { ConnectingModal } from "@/components/connecting-modal"
import { GismartLogo } from "@/components/gismart-mark"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip } from "@/components/ui/tooltip"

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
  // Nombre que devuelve el servidor al entrar, para saludar en la ventana de
  // conexión en vez de un «Conexión establecida» impersonal.
  const [nombreBienvenida, setNombreBienvenida] = useState<string | null>(null)
  const [capsLock, setCapsLock] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [sesionCaducada, setSesionCaducada] = useState(false)
  /** Instante en que se levanta el bloqueo por intentos, o `null` si no lo hay. */
  const [bloqueoHasta, setBloqueoHasta] = useState<number | null>(null)
  const [segundosRestantes, setSegundosRestantes] = useState(0)

  // El servidor devuelve `lockedUntil` al bloquear la cuenta, pero antes solo
  // se pintaba el "30s" del mensaje y ahí se quedaba: había que probar a ciegas
  // para saber si ya se podía. Aquí ese dato se convierte en una cuenta atrás.
  useEffect(() => {
    if (!bloqueoHasta) return

    const actualizar = () => {
      const restantes = Math.max(0, Math.ceil((bloqueoHasta - Date.now()) / 1000))
      setSegundosRestantes(restantes)
      if (restantes === 0) {
        setBloqueoHasta(null)
        setServerError(null)
      }
    }

    actualizar()
    const id = window.setInterval(actualizar, 250)
    return () => window.clearInterval(id)
  }, [bloqueoHasta])

  const bloqueada = bloqueoHasta !== null && segundosRestantes > 0

  useEffect(() => {
    setIsDark(getCurrentTheme() === "dark")

    // Se llega con `?sesion=caducada` cuando el token venció con el mapa
    // abierto. Decirlo evita que parezca que la aplicación cerró sola.
    if (new URLSearchParams(window.location.search).get("sesion") === "caducada") {
      setSesionCaducada(true)
      // Se limpia de la barra de direcciones para que no reaparezca al
      // recargar ni quede en el historial.
      window.history.replaceState(null, "", window.location.pathname)
    }
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
        // 429 con `lockedUntil`: la cuenta quedó bloqueada un rato.
        if (typeof body.lockedUntil === "number") setBloqueoHasta(body.lockedUntil)
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
      setNombreBienvenida(typeof user?.nombre === "string" ? user.nombre : null)
      setConnected(true)
      setTimeout(() => router.push("/dashboard"), 700)
    } catch {
      setConnecting(false)
      setServerError("Error de red. Verifica tu conexión e inténtalo de nuevo.")
    }
  }

  // Estado visual de un campo: error | ok | idle
  const usuarioOk = !errors.usuario && dirtyFields.usuario && usuarioValue.length >= 3
  // Basta con que haya algo escrito: el visto no juzga la contraseña, solo
  // indica que el campo está diligenciado.
  const contrasenaOk = !errors.contrasena && dirtyFields.contrasena && contrasenaValue.length > 0

  return (
    // `relative z-10`: los fondos decorativos de la página van posicionados y,
    // sin esto, se pintarían por encima del formulario aunque estén antes.
    <div className="gismart-entrada relative z-10 w-full max-w-[400px]">
      {/* La tarjeta va sobre el fondo con trama, así que lleva algo más de
          elevación y un filo de marca arriba para despegarse de él. */}
      <div className="overflow-hidden rounded-2xl bg-card shadow-[0_20px_50px_-12px_rgb(15_23_42/0.25)] ring-1 ring-border">
        <div
          aria-hidden="true"
          className="h-1.5 bg-gradient-to-r from-[#2a9bc4] via-[#6fc5df] to-[#2f6d9e]"
        />

        <div className="px-7 pb-7 pt-6">
          {/* Encabezado sobrio: la marca identifica sin acaparar la pantalla. */}
          <div className="mb-7 flex items-start justify-between gap-3">
            <div>
              <GismartLogo tamanoMarca="h-10" tamanoNombre="text-[26px]" />
              <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
                Bienvenido
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Ingresa tus credenciales para continuar
              </p>
            </div>
            <Tooltip label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} side="left">
              <button
                type="button"
                onClick={handleToggleTheme}
                className="-mr-1.5 -mt-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              >
                {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </Tooltip>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Usuario */}
            <div className="mb-4">
              <Label htmlFor="usuario" className="mb-1.5">
                Usuario
              </Label>
              {/* El icono va dentro del campo: en la etiqueta competía con el
                  texto, y así el campo se reconoce de un vistazo. */}
              <div className="relative">
                <User
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="usuario"
                  type="text"
                  autoComplete="username"
                  // Es una pantalla dedicada a entrar y no hay nada más que
                  // hacer en ella, así que el cursor empieza en el primer campo.
                  autoFocus
                  placeholder="Ingresa tu usuario"
                  aria-invalid={!!errors.usuario}
                  aria-describedby={errors.usuario ? "usuario-error" : undefined}
                  className="pl-10 pr-10"
                  // Estas reglas solo evitan un viaje al servidor que ya se
                  // sabe que va a fallar: son las mismas que aplica la ruta, ni
                  // una más. Antes había además un patrón que solo aceptaba
                  // letras sin tilde, números y `._-`, así que un nombre como
                  // "José" o "Ana Maria" no habría podido ni intentarlo.
                  {...register("usuario", {
                    required: "Ingresa un usuario.",
                    minLength: { value: 3, message: "El usuario debe tener al menos 3 caracteres." },
                    maxLength: { value: 120, message: "El usuario no puede superar 120 caracteres." },
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
                Contraseña
              </Label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="contrasena"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  aria-invalid={!!errors.contrasena}
                  aria-describedby={errors.contrasena ? "contrasena-error" : undefined}
                  onKeyUp={handleCaps}
                  onKeyDown={handleCaps}
                  className="pl-10 pr-16"
                  // Sin mínimo de longitud: esto es entrar, no crear una cuenta.
                  // El mínimo de 6 que había aquí dejaba fuera a quien tuviera
                  // una contraseña más corta —la columna original era
                  // varchar(12)— y el formulario ni siquiera enviaba la
                  // petición: le decía que su propia contraseña era inválida.
                  // Dario, con una de 5 caracteres, no podía entrar.
                  {...register("contrasena", {
                    required: "Ingresa una contraseña.",
                    maxLength: { value: 200, message: "La contraseña no puede superar 200 caracteres." },
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

            {/* Sesión vencida mientras el mapa estaba abierto */}
            {sesionCaducada && !serverError && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-400"
              >
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>Tu sesión venció por seguridad. Vuelve a conectarte para seguir.</span>
              </div>
            )}

            {/* Mensaje de error general del servidor */}
            {serverError && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {bloqueada
                    ? `Demasiados intentos fallidos. Podrás reintentar en ${segundosRestantes} s.`
                    : serverError}
                </span>
              </div>
            )}

            {/* Acciones */}
            <button
              type="submit"
              disabled={isSubmitting || bloqueada}
              // Bloqueada, el botón deja de ser azul: un primario al 70 % se
              // seguía leyendo como pulsable, y la única señal de que no lo
              // era llegaba al intentar usarlo.
              className={`mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed ${
                bloqueada
                  ? "bg-muted text-muted-foreground shadow-none"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
              }`}
            >
              {isSubmitting && !bloqueada && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {bloqueada ? `Espera ${segundosRestantes} s` : isSubmitting ? "Conectando..." : "Conectar"}
              {!bloqueada && !isSubmitting && <ArrowRight className="size-4" aria-hidden="true" />}
            </button>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              Acceso exclusivo para personal autorizado
            </p>
            {/* Aquí había un botón «Limpiar formulario». En un formulario de
                dos campos no aporta nada —se borran solos seleccionando— y
                colocado justo debajo le restaba peso a «Conectar», que es la
                única acción que importa en esta pantalla. */}
          </form>
        </div>
      </div>

      {/* En pantallas anchas la columna de la izquierda ya dice quién es. */}
      <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground lg:hidden">
        Sistema de Información Geográfica
        <br />
        <span className="font-medium text-foreground/70">G&amp;G Technology SAS</span>
      </p>

      {/* Modal de carga durante la autenticación */}
      <ConnectingModal open={connecting} usuario={usuarioValue} done={connected} nombre={nombreBienvenida ?? undefined} />
    </div>
  )
}
