"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { clearSession } from "@/lib/auth"

export function LogoutButton() {
  const router = useRouter()

  function handleLogout() {
    clearSession()
    router.replace("/")
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      <LogOut className="size-4" />
      <span className="hidden sm:inline">Salir</span>
    </button>
  )
}
