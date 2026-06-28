import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Navbar } from "@/components/layout/navbar"

export default async function FullpageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  return (
    <div className="flex h-svh flex-col">
      <Navbar user={user} />
      <main className="flex-1 overflow-auto bg-muted p-6">{children}</main>
    </div>
  )
}
