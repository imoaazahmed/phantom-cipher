"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useTranslation } from "react-i18next"
import { Check, Languages } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { setLocale } from "@/app/actions"
import { LOCALES, type Locale } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
}

export function LocaleSwitcher() {
  const { i18n } = useTranslation()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const current = i18n.language as Locale

  function handleSelect(locale: Locale) {
    if (locale === current) return
    startTransition(async () => {
      await setLocale(locale)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" disabled={isPending} aria-label="Switch language">
          {isPending ? <Spinner /> : <Languages className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => handleSelect(locale)}
            className="gap-2"
          >
            <Check
              className={`size-3.5 ${locale === current ? "opacity-100" : "opacity-0"}`}
            />
            {LOCALE_LABELS[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
