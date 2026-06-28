"use client"

import React, { useEffect, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import { useTranslation } from "react-i18next"
import { Car, House } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { CurrencyPicker } from "@/components/ui/currency-picker"

// --- Storage keys ---
const STORAGE_ACTIVE_TAB = "phantom-cipher:cd-calculator:active-tab"
const tabKey = (id: string) => `phantom-cipher:cd-calculator:${id}`

// --- Tab definitions ---
type FieldType = "currency" | "period" | "rate"

type FieldDef = {
  key: keyof FormValues
  labelKey: string
  placeholder: string
  type: FieldType
  descKey?: string
}

type TabDef = {
  id: string
  labelKey: string
  sectionLabelKey: string
  icon: React.ElementType
  fields: FieldDef[]
}

const TABS: TabDef[] = [
  {
    id: "car",
    labelKey: "tools.cdCalculator.tabs.car",
    sectionLabelKey: "tools.cdCalculator.sections.car",
    icon: Car,
    fields: [
      { key: "monthlyInstallment", labelKey: "tools.cdCalculator.fields.monthlyInstallment", placeholder: "17,000", type: "currency", descKey: "tools.cdCalculator.fields.desc.carMonthlyInstallment" },
      { key: "installmentPeriod", labelKey: "tools.cdCalculator.fields.installmentPeriod", placeholder: "60", type: "period", descKey: "tools.cdCalculator.fields.desc.carInstallmentPeriod" },
    ],
  },
  {
    id: "house",
    labelKey: "tools.cdCalculator.tabs.house",
    sectionLabelKey: "tools.cdCalculator.sections.house",
    icon: House,
    fields: [
      { key: "monthlyInstallment", labelKey: "tools.cdCalculator.fields.monthlyInstallment", placeholder: "25,000", type: "currency", descKey: "tools.cdCalculator.fields.desc.houseMonthlyInstallment" },
      { key: "installmentPeriod", labelKey: "tools.cdCalculator.fields.loanPeriod", placeholder: "120", type: "period", descKey: "tools.cdCalculator.fields.desc.houseInstallmentPeriod" },
    ],
  },
]

// --- Schema & types ---
type FormValues = {
  monthlyInstallment: string
  installmentPeriod: string
  interestRate: string
}

type PeriodUnit = "months" | "years"

type TabState = {
  values: Partial<FormValues>
  periodUnit: PeriodUnit
  currency: string
}

function defaultTabState(): TabState {
  return { values: {}, periodUnit: "months", currency: "USD" }
}

function loadTabState(id: string): TabState {
  try {
    const raw = localStorage.getItem(tabKey(id))
    if (raw) return { ...defaultTabState(), ...JSON.parse(raw) }
  } catch {}
  return defaultTabState()
}

function saveTabState(id: string, state: TabState) {
  try { localStorage.setItem(tabKey(id), JSON.stringify(state)) } catch {}
}

function parseNum(val: string | undefined) {
  return parseFloat((val ?? "").replace(/,/g, ""))
}

function isPositive(val: string | undefined) {
  const n = parseNum(val)
  return !isNaN(n) && n > 0
}

const schema = yup.object({
  monthlyInstallment: yup
    .string()
    .required("validation.required")
    .test("positive", "validation.positive", isPositive),
  installmentPeriod: yup
    .string()
    .required("validation.required")
    .test("positive-integer", "validation.integer", (val) => {
      const n = parseNum(val)
      return !isNaN(n) && n > 0 && Number.isInteger(n)
    }),
  interestRate: yup
    .string()
    .required("validation.required")
    .test("valid-rate", "validation.positive", isPositive)
    .test("max-rate", "validation.maxRate", (val) => parseNum(val) <= 100),
})

function sanitizeDecimal(val: string) { return val.replace(/[^0-9,.]/g, "") }
function sanitizeInteger(val: string) { return val.replace(/[^0-9,]/g, "") }

function formatCurrency(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${currencyCode} ${Math.round(value).toLocaleString()}`
  }
}

function toMonths(value: number, unit: PeriodUnit) {
  return unit === "years" ? value * 12 : value
}

function computeResult(monthly: number, periodRaw: number, unit: PeriodUnit, rate: number) {
  const period = toMonths(periodRaw, unit)
  const monthlyRate = rate / 100 / 12
  const cdAmount = monthly / monthlyRate
  return { cdAmount, monthlyPayout: cdAmount * monthlyRate, monthsToHold: period }
}

// --- Page ---
export default function CdCalculatorPage() {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("months")
  const [currency, setCurrency] = useState("USD")

  // Snapshot of all tab states so we can save the leaving tab on switch
  const tabStatesRef = useRef<Record<string, TabState>>(
    Object.fromEntries(TABS.map((t) => [t.id, defaultTabState()]))
  )

  const {
    register,
    formState: { errors },
    setValue,
    reset,
    control,
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    mode: "onChange",
    defaultValues: { monthlyInstallment: "", installmentPeriod: "", interestRate: "" },
  })

  const values = useWatch({ control })

  // Load all tabs from localStorage on mount
  useEffect(() => {
    const savedActiveTab = (() => {
      try { return localStorage.getItem(STORAGE_ACTIVE_TAB) ?? TABS[0].id } catch { return TABS[0].id }
    })()
    const initialTab = TABS.find((t) => t.id === savedActiveTab) ? savedActiveTab : TABS[0].id

    const allStates: Record<string, TabState> = {}
    for (const tab of TABS) {
      allStates[tab.id] = loadTabState(tab.id)
    }
    tabStatesRef.current = allStates

    setActiveTab(initialTab)
    applyTabState(allStates[initialTab])
    setMounted(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyTabState(state: TabState) {
    setPeriodUnit(state.periodUnit)
    setCurrency(state.currency)
    reset({
      monthlyInstallment: state.values.monthlyInstallment ?? "",
      installmentPeriod: state.values.installmentPeriod ?? "",
      interestRate: state.values.interestRate ?? "",
    })
  }

  function currentTabState(): TabState {
    return {
      periodUnit,
      currency,
      values: {
        monthlyInstallment: values.monthlyInstallment,
        installmentPeriod: values.installmentPeriod,
        interestRate: values.interestRate,
      },
    }
  }

  // Persist active tab's state whenever form values / unit / currency change
  useEffect(() => {
    if (!mounted) return
    const state = currentTabState()
    tabStatesRef.current[activeTab] = state
    saveTabState(activeTab, state)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.monthlyInstallment, values.installmentPeriod, values.interestRate, periodUnit, currency])

  function handleTabChange(tabId: string) {
    // Save current tab before switching
    const state = currentTabState()
    tabStatesRef.current[activeTab] = state
    saveTabState(activeTab, state)

    // Switch to new tab
    setActiveTab(tabId)
    try { localStorage.setItem(STORAGE_ACTIVE_TAB, tabId) } catch {}
    applyTabState(tabStatesRef.current[tabId])
  }

  function handleClear() {
    const cleared = defaultTabState()
    tabStatesRef.current[activeTab] = cleared
    saveTabState(activeTab, cleared)
    setPeriodUnit(cleared.periodUnit)
    setCurrency(cleared.currency)
    reset({ monthlyInstallment: "", installmentPeriod: "", interestRate: "" })
  }

  function handlePeriodUnitToggle(unit: PeriodUnit) {
    const current = parseNum(values.installmentPeriod)
    if (!isNaN(current) && current > 0) {
      const converted = unit === "years" ? current / 12 : current * 12
      setValue("installmentPeriod", String(Math.round(converted)), { shouldValidate: true })
    }
    setPeriodUnit(unit)
  }

  const monthly = parseNum(values.monthlyInstallment)
  const periodRaw = parseNum(values.installmentPeriod)
  const rate = parseNum(values.interestRate)
  const result =
    mounted && monthly > 0 && periodRaw > 0 && rate > 0
      ? computeResult(monthly, periodRaw, periodUnit, rate)
      : null

  return (
    <div className="mx-auto max-w-6xl px-6 pt-6 pb-10 space-y-8">
      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t("tools.cdCalculator.title")}</h1>
        <p className="text-muted-foreground max-w-xl">{t("tools.cdCalculator.description")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="rounded-none">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="rounded-none gap-2">
              <tab.icon className="size-4" />
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Inputs */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="uppercase tracking-wide text-muted-foreground">
                      {t(tab.sectionLabelKey)}
                    </CardTitle>
                    <CardAction>
                      <Button variant="outline" size="sm" onClick={handleClear}>
                        {t("tools.cdCalculator.clearAll")}
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-5">
                  {tab.fields.map((field) => {
                    const inputId = `${tab.id}-${field.key}`
                    const isDecimal = field.type !== "period"
                    const { onChange: rhfOnChange, ...rest } = register(field.key)

                    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                      e.target.value = isDecimal
                        ? sanitizeDecimal(e.target.value)
                        : sanitizeInteger(e.target.value)
                      rhfOnChange(e)
                    }

                    return (
                      <Field key={field.key} data-invalid={!!errors[field.key]}>
                        <FieldLabel htmlFor={inputId} className="text-base font-medium">
                          {t(field.labelKey)}
                        </FieldLabel>

                        {field.type === "currency" && (
                          <InputGroup>
                            <InputGroupAddon align="inline-start">
                              <CurrencyPicker value={currency} onChange={setCurrency} />
                            </InputGroupAddon>
                            <InputGroupInput
                              {...rest}
                              onChange={handleChange}
                              id={inputId}
                              placeholder={field.placeholder}
                              aria-invalid={!!errors[field.key]}
                            />
                          </InputGroup>
                        )}

                        {field.type === "period" && (
                          <InputGroup>
                            <InputGroupInput
                              {...rest}
                              onChange={handleChange}
                              id={inputId}
                              placeholder={periodUnit === "years" ? "5" : "60"}
                              aria-invalid={!!errors[field.key]}
                            />
                            <InputGroupAddon align="inline-end">
                              <InputGroupButton
                                variant={periodUnit === "months" ? "default" : "ghost"}
                                onClick={() => handlePeriodUnitToggle("months")}
                              >
                                {t("tools.cdCalculator.fields.months")}
                              </InputGroupButton>
                              <InputGroupButton
                                variant={periodUnit === "years" ? "default" : "ghost"}
                                onClick={() => handlePeriodUnitToggle("years")}
                              >
                                {t("tools.cdCalculator.fields.years")}
                              </InputGroupButton>
                            </InputGroupAddon>
                          </InputGroup>
                        )}

                        {field.descKey && (
                          <FieldDescription>{t(field.descKey)}</FieldDescription>
                        )}
                        {errors[field.key] && (
                          <FieldError>{t(errors[field.key]!.message!)}</FieldError>
                        )}
                      </Field>
                    )
                  })}
                  </CardContent>
                </Card>

                {/* CD section — per-tab, independent interest rate */}
                <Card>
                  <CardHeader>
                    <CardTitle className="uppercase tracking-wide text-muted-foreground">
                      {t("tools.cdCalculator.sections.cd")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                  <Field data-invalid={!!errors.interestRate}>
                    <FieldLabel htmlFor={`${tab.id}-interestRate`} className="text-base font-medium">
                      {t("tools.cdCalculator.fields.interestRate")}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>%</InputGroupText>
                      </InputGroupAddon>
                      {(() => {
                        const { onChange: rhfOnChange, ...rest } = register("interestRate")
                        return (
                          <InputGroupInput
                            {...rest}
                            onChange={(e) => {
                              e.target.value = sanitizeDecimal(e.target.value)
                              rhfOnChange(e)
                            }}
                            id={`${tab.id}-interestRate`}
                            placeholder="17"
                            aria-invalid={!!errors.interestRate}
                          />
                        )
                      })()}
                    </InputGroup>
                    <FieldDescription>{t("tools.cdCalculator.fields.interestRateNote")}</FieldDescription>
                    {errors.interestRate && (
                      <FieldError>{t(errors.interestRate.message!)}</FieldError>
                    )}
                  </Field>
                  </CardContent>
                </Card>
              </div>

              {/* Results */}
              <Card>
                <CardHeader>
                  <CardTitle className="uppercase tracking-wide text-muted-foreground">
                    {t("tools.cdCalculator.sections.results")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                {!result ? (
                  <p className="text-base text-muted-foreground pt-2">{t("tools.cdCalculator.results.empty")}</p>
                ) : (
                  <div className="space-y-4">
                    <ResultRow
                      label={t("tools.cdCalculator.results.cdAmount")}
                      value={formatCurrency(result.cdAmount, currency)}
                      note={t("tools.cdCalculator.results.cdAmountNote")}
                      highlight
                    />
                    <div className="border-t" />
                    <ResultRow
                      label={t("tools.cdCalculator.results.monthlyPayout")}
                      value={formatCurrency(result.monthlyPayout, currency)}
                      note={t("tools.cdCalculator.results.monthlyPayoutNote")}
                    />
                    <ResultRow
                      label={t("tools.cdCalculator.results.monthsToHold")}
                      value={t("tools.cdCalculator.results.monthsValue", { count: result.monthsToHold })}
                      note={t("tools.cdCalculator.results.years", { count: (result.monthsToHold / 12).toFixed(1) })}
                    />
                    <div className="border-t" />
                    <div className="space-y-1 pt-1">
                      <p className="text-sm font-medium text-muted-foreground">{t("tools.cdCalculator.results.howItWorks")}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {t("tools.cdCalculator.results.howItWorksText", {
                          amount: formatCurrency(result.cdAmount, currency),
                          rate: values.interestRate,
                          payout: formatCurrency(result.monthlyPayout, currency),
                          months: result.monthsToHold,
                        })}
                      </p>
                    </div>
                  </div>
                )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function ResultRow({
  label,
  value,
  note,
  highlight,
}: {
  label: string
  value: string
  note?: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-base font-medium">{label}</p>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      <p className={highlight ? "text-2xl font-bold tabular-nums" : "text-lg font-semibold tabular-nums"}>
        {value}
      </p>
    </div>
  )
}
