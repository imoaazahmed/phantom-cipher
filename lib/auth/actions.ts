"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export async function login(data: { email: string; password: string }) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(data)
  if (error) return { error: error.message }
  redirect("/trades/overview")
}

export async function signup(data: { email: string; password: string }) {
  const supabase = await createClient()
  const { data: result, error } = await supabase.auth.signUp(data)
  if (error) return { error: error.message }
  if (result.user?.identities?.length === 0) return { error: "auth.signup.emailTaken" }
  return { success: "auth.signup.successMessage" }
}

export async function forgotPassword(data: { email: string }) {
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  })
  if (error) {
    if (error.message.toLowerCase().includes("rate limit")) {
      return { error: "errors.rateLimitExceeded" }
    }
    return { error: error.message }
  }
  return { success: "auth.forgotPassword.successMessage" }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

export async function resetPassword(data: { password: string }) {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: data.password })
  if (error) return { error: error.message }
  redirect("/trades/overview")
}
