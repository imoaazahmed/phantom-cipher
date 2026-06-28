import { createClient } from "@/lib/supabase/server"
import { Navbar } from "@/components/layout/navbar"
import { LandingNavbar } from "@/components/layout/landing-navbar"
import { LandingFooter } from "@/components/layout/landing-footer"

export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-svh flex-col">
      {user ? <Navbar user={user} /> : <LandingNavbar />}
      <main className="flex-1">{children}</main>
      <LandingFooter />
    </div>
  )
}
