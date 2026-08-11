"use client"

import { useEffect, useState } from "react"
import { Minimize } from "lucide-react"
import { RIBBON_TABS, type RibbonItem } from "@/components/dashboard-ribbon-data"
import { LogoutConfirmDialog } from "@/components/logout-confirm-dialog"

export function DashboardRibbon() {
  const [activeTab, setActiveTab] = useState("inicio")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const currentTab = RIBBON_TABS.find((t) => t.id === activeTab) ?? RIBBON_TABS[0]

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      const mapPanel = document.getElementById("map-panel") ?? document.documentElement
      mapPanel.requestFullscreen().catch(() => {})
    }
  }

  function handleItemClick(item: RibbonItem) {
    if (item.label === "Salir") {
      setLogoutOpen(true)
      return
    }
    if (item.label === "Extensión") {
      toggleFullscreen()
      return
    }
    item.onClick?.()
  }

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* Pestañas */}
      <div role="tablist" aria-label="Secciones" className="flex items-end border-b border-border bg-gradient-to-b from-card to-muted/30 px-1 pt-1">
        {RIBBON_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative rounded-t-lg px-4 py-2 text-sm font-semibold outline-none transition-all
                focus-visible:ring-2 focus-visible:ring-ring/50
                ${isActive
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }
              `}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-1 right-1 h-[3px] rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div role="tabpanel" className="flex h-[92px] items-stretch overflow-x-auto bg-card px-2">
        {currentTab.groups.map((group, gi) => (
          <div key={gi} className="flex items-stretch">
            <div className="flex flex-col justify-center px-2 py-1.5">
              <div className="flex items-center gap-0.5">
                {group.items.map((item, ii) => {
                  const isExtension = item.label === "Extensión"
                  const Icon = isExtension && isFullscreen ? Minimize : item.icon
                  const isPrimary = item.variant === "primary" || (isExtension && isFullscreen)
                  const isDestructive = item.variant === "destructive"

                  return (
                    <button
                      key={ii}
                      onClick={() => handleItemClick(item)}
                      disabled={item.disabled}
                      title={isExtension && isFullscreen ? "Salir de pantalla completa" : item.label}
                      aria-label={isExtension && isFullscreen ? "Salir de pantalla completa" : item.label}
                      aria-pressed={isExtension ? isFullscreen : undefined}
                      className={`
                        group flex flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 outline-none transition
                        focus-visible:ring-2 focus-visible:ring-ring/50
                        ${isPrimary
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : isDestructive
                            ? "text-destructive hover:bg-destructive/10"
                            : "text-foreground hover:bg-accent"
                        }
                        ${item.disabled ? "opacity-40 cursor-not-allowed" : ""}
                        min-w-[60px]
                      `}
                    >
                      <Icon className="size-[18px] shrink-0" />
                      <span className="max-w-[60px] truncate text-[10px] font-medium leading-tight">
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
              <span className="mt-1 text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
            </div>
            {gi < currentTab.groups.length - 1 && (
              <div className="my-2 w-px bg-border" />
            )}
          </div>
        ))}
      </div>

      <LogoutConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </div>
  )
}