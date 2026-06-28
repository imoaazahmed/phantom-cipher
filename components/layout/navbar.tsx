"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import type { User } from "@supabase/supabase-js"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { UserMenu } from "@/components/layout/user-menu"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { ToolsNavMenuItem } from "@/components/layout/tools-nav-menu"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

export function Navbar({ user }: { user: User }) {
  const { t } = useTranslation()

  return (
    <header className="flex h-14 shrink-0 items-center border-b bg-background px-4 gap-3">
      <Link
        href="/trades/overview"
        className="font-heading text-base font-semibold tracking-tight"
      >
        {t("nav.brand")}
      </Link>
      <NavigationMenu viewport={false}>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink asChild className={cn(navigationMenuTriggerStyle(), "h-7 bg-transparent")}>
              <Link href="/trades/overview">{t("nav.trades")}</Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <ToolsNavMenuItem />
        </NavigationMenuList>
      </NavigationMenu>
      <span className="me-auto" />
      <LocaleSwitcher />
      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  )
}
