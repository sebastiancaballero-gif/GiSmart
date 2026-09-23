import Link from "next/link"
import { ArrowLeft, LogIn, MapPinOff } from "lucide-react"
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, PantallaAviso } from "@/components/pantalla-aviso"

export default function NotFound() {
  return (
    <PantallaAviso
      codigo="404"
      icono={MapPinOff}
      titulo="Página no encontrada"
      descripcion="La dirección que abriste no existe en GiSmart. Puede que el enlace esté mal escrito o que la página se haya movido."
    >
      <Link href="/dashboard" className={BOTON_PRINCIPAL}>
        <ArrowLeft className="size-4" />
        Volver al mapa de red
      </Link>
      <Link href="/" className={BOTON_SECUNDARIO}>
        <LogIn className="size-4" />
        Ir al inicio de sesión
      </Link>
    </PantallaAviso>
  )
}
