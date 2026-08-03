import { AuthGuard } from "@/components/auth-guard"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { NetworkMap } from "@/components/network-map"

export default function DashboardPage() {
  return (
    <AuthGuard>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <DashboardSidebar />

        <div className="flex flex-1 flex-col overflow-hidden">
          <DashboardHeader />
          <main className="flex-1 overflow-hidden">
            <NetworkMap />
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}