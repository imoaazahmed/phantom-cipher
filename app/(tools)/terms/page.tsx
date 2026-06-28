"use client"

import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"

export default function TermsPage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-heading font-bold">{t("terms.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("terms.lastUpdated", { date: "June 28, 2026" })}</p>
      </div>

      <Card>
        <CardContent className="space-y-8 pt-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("terms.section1.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("terms.section1.body")}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("terms.section2.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("terms.section2.body")}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("terms.section3.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("terms.section3.body")}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("terms.section4.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("terms.section4.body")}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("terms.contact.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("terms.contact.body")}</p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
