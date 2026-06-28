"use client"

import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"

export default function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-heading font-bold">{t("privacy.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("privacy.lastUpdated", { date: "June 28, 2026" })}</p>
      </div>

      <Card>
        <CardContent className="space-y-8 pt-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("privacy.section1.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("privacy.section1.body")}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("privacy.section2.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("privacy.section2.body")}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("privacy.section3.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("privacy.section3.body")}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("privacy.section4.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("privacy.section4.body")}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("privacy.contact.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("privacy.contact.body")}</p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
