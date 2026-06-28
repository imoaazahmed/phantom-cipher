"use client"

import { useTranslation } from "react-i18next"

export function LandingFooter() {
  const { t } = useTranslation()

  return (
    <footer className="flex h-14 items-center border-t bg-background px-6 gap-2 text-sm text-muted-foreground">
      <p className="me-auto">{t("footer.copyright", { year: new Date().getFullYear() })}</p>
      <a href="#" className="hover:text-foreground transition-colors">{t("footer.privacy")}</a>
      <a href="#" className="hover:text-foreground transition-colors">{t("footer.terms")}</a>
    </footer>
  )
}
