import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Navbar } from "@/components/layout/navbar"
import { AppSidebar } from "@/components/layout/app-sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh flex-col" style={{ "--sidebar-width": "207px" } as React.CSSProperties}>
      <Navbar user={user} />
      <div className="flex flex-1 min-h-0">
        <AppSidebar />
        <SidebarInset className="overflow-auto bg-muted">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
