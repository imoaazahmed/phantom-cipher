"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { Button } from "@/components/ui/button"

export function LandingNavbar() {
  const { t } = useTranslation()

  return (
    <header className="flex h-14 items-center border-b bg-background px-6 gap-2">
      <Link
        href="/"
        className="me-auto font-heading text-sm font-semibold tracking-tight"
      >
        {t("nav.brand")}
      </Link>
      <LocaleSwitcher />
      <ThemeToggle />
      <Button variant="outline" size="sm" asChild>
        <Link href="/login">{t("nav.signIn")}</Link>
      </Button>
      <Button size="sm" asChild>
        <Link href="/signup">{t("nav.getStarted")}</Link>
      </Button>
    </header>
  )
}
