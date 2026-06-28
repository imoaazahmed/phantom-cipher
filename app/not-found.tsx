"use client"

import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { FileQuestion, Search } from "lucide-react"
import Link from "next/link"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"

export default function NotFound() {
  const { t } = useTranslation()
  const router = useRouter()

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = (
      e.currentTarget.elements.namedItem("q") as HTMLInputElement
    ).value.trim()
    if (q) router.push(q.startsWith("/") ? q : `/${q}`)
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("notFound.title")}</EmptyTitle>
          <EmptyDescription>{t("notFound.description")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="w-full max-w-sm flex-col gap-4">
          <form onSubmit={handleSearch} className="w-full">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <InputGroupText>
                  <Search />
                </InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                name="q"
                autoComplete="off"
                placeholder={t("notFound.searchPlaceholder")}
              />
              <InputGroupAddon align="inline-end">
                <Kbd>/</Kbd>
              </InputGroupAddon>
            </InputGroup>
          </form>

          <EmptyDescription>
            <Link href="/">{t("notFound.goHome")}</Link>
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    </div>
  )
}
