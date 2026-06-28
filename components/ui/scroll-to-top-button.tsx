"use client"

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next"

export function ScrollToTopButton() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (!visible) return null

  return (
    <Button
      onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}
      variant="outline"
      className="fixed bottom-16 inset-e-6 z-50 flex-col gap-0.5 shadow-lg h-12 w-12 p-0"
    >
      <ArrowUp className="size-4" />
      <span className="text-[10px] leading-none">{t("common.scrollToTop")}</span>
    </Button>
  )
}
