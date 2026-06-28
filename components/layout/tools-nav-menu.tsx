"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { Calculator, Landmark, TrendingUp } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"

const tools: { labelKey: string; descKey: string; href: string; icon: LucideIcon }[] = [
  { labelKey: "nav.tools.positionCalculator", descKey: "nav.tools.positionCalculatorDesc", href: "/tools/position-calculator", icon: Calculator },
  { labelKey: "nav.tools.returnCalculator", descKey: "nav.tools.returnCalculatorDesc", href: "/tools/return-calculator", icon: TrendingUp },
  { labelKey: "nav.tools.cdCalculator", descKey: "nav.tools.cdCalculatorDesc", href: "/tools/cd-calculator", icon: Landmark },
]

export function ToolsNavMenuItem() {
  const { t } = useTranslation()

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="h-7 text-xs bg-transparent">
        {t("nav.tools.label")}
      </NavigationMenuTrigger>
      <NavigationMenuContent className="min-w-64">
        {tools.map(({ labelKey, descKey, href, icon: Icon }) => (
          <NavigationMenuLink key={href} asChild>
            <Link href={href} className="flex items-start gap-3 p-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-0.5 text-start">
                <span className="text-xs font-medium">{t(labelKey)}</span>
                <span className="text-[11px] text-muted-foreground">{t(descKey)}</span>
              </div>
            </Link>
          </NavigationMenuLink>
        ))}
      </NavigationMenuContent>
    </NavigationMenuItem>
  )
}
