"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import type { User } from "@supabase/supabase-js"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { UserMenu } from "@/components/layout/user-menu"
import { LocaleSwitcher } from "@/components/locale-switcher"
export function Navbar({ user }: { user: User }) {
  const { t } = useTranslation()

  return (
    <header className="flex h-14 shrink-0 items-center border-b bg-background px-4 gap-3">
      <Link
        href="/overview"
        className="me-auto font-heading text-base font-semibold tracking-tight"
      >
        {t("nav.brand")}
      </Link>
      <LocaleSwitcher />
      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  )
}
