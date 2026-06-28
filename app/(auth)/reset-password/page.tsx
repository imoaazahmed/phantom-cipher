import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect("/login")

  // Decode JWT payload to check AMR — only recovery sessions are allowed here
  const payload = JSON.parse(
    Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf-8")
  )
  const isRecovery = payload.amr?.some(
    (entry: { method: string }) => entry.method === "recovery"
  )

  if (!isRecovery) redirect("/login")

  return <ResetPasswordForm />
}
