"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, ChevronDown, Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { InputGroupButton } from "@/components/ui/input-group"
import { CURRENCY_CODES } from "@/lib/currencies"
import { cn } from "@/lib/utils"

export function CurrencyPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (code: string) => void
}) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const displayNames = useMemo(
    () => new Intl.DisplayNames([i18n.language], { type: "currency" }),
    [i18n.language]
  )

  const getName = (code: string) => {
    try { return displayNames.of(code) ?? code } catch { return code }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return CURRENCY_CODES
    return CURRENCY_CODES.filter(
      (code) =>
        code.toLowerCase().includes(q) ||
        getName(code).toLowerCase().includes(q)
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, displayNames])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <InputGroupButton variant="ghost" className="gap-1 font-mono pe-1">
          {value}
          <ChevronDown className="size-3 opacity-50" />
        </InputGroupButton>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search currencies…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No results</p>
          ) : (
            filtered.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onChange(code)
                  setOpen(false)
                  setSearch("")
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-xs hover:bg-muted",
                  value === code && "bg-muted"
                )}
              >
                <span className="w-8 shrink-0 font-mono">{code}</span>
                <span className="flex-1 truncate text-muted-foreground">{getName(code)}</span>
                {value === code && <Check className="size-3 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
