"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { Button } from "@/components/ui/button"
import { ToolsNavMenuItem } from "@/components/layout/tools-nav-menu"
import {
  NavigationMenu,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"

export function LandingNavbar() {
  const { t } = useTranslation()

  return (
    <header className="flex h-14 items-center border-b bg-background px-6 gap-2">
      <Link
        href="/"
        className="font-heading text-sm font-semibold tracking-tight"
      >
        {t("nav.brand")}
      </Link>
      <NavigationMenu viewport={false}>
        <NavigationMenuList>
          <ToolsNavMenuItem />
        </NavigationMenuList>
      </NavigationMenu>
      <span className="me-auto" />
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
