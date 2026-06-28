"use client"

import { useEffect, useRef, useState } from "react"
import { useForm, useWatch, UseFormSetValue } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button"
import { CurrencyPicker } from "@/components/ui/currency-picker"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

// --- Storage ---
const STORAGE_KEY = "phantom-cipher:return-calculator"

type CalcState = {
  values: Partial<FormValues>
  currency: string
}

function defaultState(): CalcState {
  return { values: {}, currency: "USD" }
}

function loadState(): CalcState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultState(), ...JSON.parse(raw) }
  } catch {}
  return defaultState()
}

function saveState(state: CalcState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

// --- Presets ---
const PRESETS_KEY = "phantom-cipher:return-calculator:presets"

type Preset = {
  id: string
  name: string
  values: Partial<FormValues>
  currency: string
}

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function savePresets(presets: Preset[]) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)) } catch {}
}

// --- Schema & types ---
type FormValues = {
  startBalance: string
  numTrades: string
  risk: string
  rr: string
  winRate: string
}

function parseNum(val: string | undefined) {
  return parseFloat((val ?? "").replace(/,/g, ""))
}

function isPositive(val: string | undefined) {
  const n = parseNum(val)
  return !isNaN(n) && n > 0
}

function isPositiveInteger(val: string | undefined) {
  const n = parseNum(val)
  return !isNaN(n) && n > 0 && Number.isInteger(n)
}

function isValidRate(val: string | undefined) {
  const n = parseNum(val)
  return !isNaN(n) && n > 0 && n < 100
}

const schema = yup.object({
  startBalance: yup.string().required("validation.required").test("positive", "validation.positive", isPositive),
  numTrades: yup.string().required("validation.required").test("positive-integer", "validation.integer", isPositiveInteger),
  risk: yup.string().required("validation.required").test("valid-rate", "validation.rate", isValidRate),
  rr: yup.string().required("validation.required").test("positive", "validation.positive", isPositive),
  winRate: yup.string().required("validation.required").test("valid-rate", "validation.rate", isValidRate),
})

function sanitizeDecimal(val: string) { return val.replace(/[^0-9,.]/g, "") }
function sanitizeInteger(val: string) { return val.replace(/[^0-9,]/g, "") }

function applyThousands(val: string): string {
  const [intPart, ...rest] = val.replace(/,/g, "").split(".")
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return rest.length > 0 ? `${formatted}.${rest.join(".")}` : formatted
}

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

type CalcResult = {
  startBalance: number
  avgGainPerTrade: number
  endBalance: number
  roi: number
  numTrades: number
  profitableTrades: number
  losingTrades: number
  maxDrawdownAbs: number
  maxDrawdownPct: number
}

function compute(v: Partial<FormValues>): CalcResult | null {
  const startBalance = parseNum(v.startBalance)
  const numTrades = parseNum(v.numTrades)
  const riskPct = parseNum(v.risk)
  const rr = parseNum(v.rr)
  const winRatePct = parseNum(v.winRate)

  if (
    !isFinite(startBalance) || startBalance <= 0 ||
    !isFinite(numTrades) || numTrades <= 0 ||
    !isFinite(riskPct) || riskPct <= 0 || riskPct >= 100 ||
    !isFinite(rr) || rr <= 0 ||
    !isFinite(winRatePct) || winRatePct <= 0 || winRatePct >= 100
  ) return null

  const risk = riskPct / 100
  const winRate = winRatePct / 100
  const profitableTrades = Math.round(numTrades * winRate)
  const losingTrades = numTrades - profitableTrades

  const gainPerWin = risk * rr
  const lossPerLoss = risk
  const avgGainPerTrade = (winRate * gainPerWin - (1 - winRate) * lossPerLoss) * 100

  const endBalance =
    startBalance *
    Math.pow(1 + gainPerWin, profitableTrades) *
    Math.pow(1 - lossPerLoss, losingTrades)

  const roi = ((endBalance - startBalance) / startBalance) * 100

  // Max drawdown: worst-case ordering — all losses first from peak
  let balance = startBalance
  let maxDrawdownAbs = 0
  for (let i = 0; i < losingTrades; i++) {
    balance *= 1 - lossPerLoss
    const dd = startBalance - balance
    if (dd > maxDrawdownAbs) maxDrawdownAbs = dd
  }
  const maxDrawdownPct = (maxDrawdownAbs / startBalance) * 100

  return {
    startBalance,
    avgGainPerTrade,
    endBalance,
    roi,
    numTrades,
    profitableTrades,
    losingTrades,
    maxDrawdownAbs,
    maxDrawdownPct,
  }
}

// --- Trade simulation ---
type TradeRow = {
  tradeNumber: number
  startingBalance: number
  profit: number
  endingBalance: number
  totalProfit: number
  totalGain: number
}

function generateTradeData(
  startBalance: number,
  numTrades: number,
  riskPct: number,
  rr: number,
  profitableTrades: number,
  losingTrades: number
): TradeRow[] {
  // Build exact win/loss sequence then shuffle — preserves counts and end balance
  const outcomes: boolean[] = [
    ...Array(profitableTrades).fill(true),
    ...Array(losingTrades).fill(false),
  ]
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]]
  }

  const rows: TradeRow[] = []
  let balance = startBalance
  for (let i = 0; i < numTrades; i++) {
    const win = outcomes[i]
    const startingBalance = balance
    const profit = win
      ? startingBalance * (riskPct / 100) * rr
      : -startingBalance * (riskPct / 100)
    balance = startingBalance + profit
    rows.push({
      tradeNumber: i + 1,
      startingBalance,
      profit,
      endingBalance: balance,
      totalProfit: balance - startBalance,
      totalGain: ((balance - startBalance) / startBalance) * 100,
    })
  }
  return rows
}

// --- Page ---
export default function ReturnCalculatorPage() {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [currency, setCurrency] = useState("USD")
  const [presets, setPresets] = useState<Preset[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState("")
  const [presetNameError, setPresetNameError] = useState("")
  const [deletePreset, setDeletePreset] = useState<Preset | null>(null)
  const isLoadingPreset = useRef(false)

  const {
    register,
    formState: { errors, isValid },
    reset,
    control,
    setValue,
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    mode: "onChange",
    defaultValues: { startBalance: "", numTrades: "", risk: "", rr: "", winRate: "" },
  })

  const values = useWatch({ control })

  useEffect(() => {
    const saved = loadState()
    setCurrency(saved.currency)
    reset({
      startBalance: saved.values.startBalance ?? "",
      numTrades: saved.values.numTrades ?? "",
      risk: saved.values.risk ?? "",
      rr: saved.values.rr ?? "",
      winRate: saved.values.winRate ?? "",
    })
    setPresets(loadPresets())
    setTimeout(() => setMounted(true), 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mounted) return
    saveState({
      currency,
      values: {
        startBalance: values.startBalance,
        numTrades: values.numTrades,
        risk: values.risk,
        rr: values.rr,
        winRate: values.winRate,
      },
    })
    // Clear active preset when user manually edits values
    if (!isLoadingPreset.current) setActivePresetId(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.startBalance, values.numTrades, values.risk, values.rr, values.winRate, currency])

  function handleClear() {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    setCurrency("USD")
    reset({ startBalance: "", numTrades: "", risk: "", rr: "", winRate: "" })
    setActivePresetId(null)
  }

  function handleSavePreset() {
    const trimmed = presetName.trim()
    if (!trimmed) {
      setPresetNameError(t("tools.returnCalculator.presets.nameRequired"))
      return
    }
    if (presets.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setPresetNameError(t("tools.returnCalculator.presets.nameTaken"))
      return
    }
    const preset: Preset = {
      id: `${Date.now()}`,
      name: trimmed,
      values: {
        startBalance: values.startBalance,
        numTrades: values.numTrades,
        risk: values.risk,
        rr: values.rr,
        winRate: values.winRate,
      },
      currency,
    }
    const updated = [...presets, preset]
    setPresets(updated)
    savePresets(updated)
    setActivePresetId(preset.id)
    setSaveDialogOpen(false)
    setPresetName("")
    setPresetNameError("")
  }

  function handleDeletePreset(id: string) {
    const updated = presets.filter((p) => p.id !== id)
    setPresets(updated)
    savePresets(updated)
    if (activePresetId === id) setActivePresetId(null)
    setDeletePreset(null)
  }

  function handleLoadPreset(id: string) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    isLoadingPreset.current = true
    setCurrency(preset.currency)
    reset({
      startBalance: preset.values.startBalance ?? "",
      numTrades: preset.values.numTrades ?? "",
      risk: preset.values.risk ?? "",
      rr: preset.values.rr ?? "",
      winRate: preset.values.winRate ?? "",
    })
    setActivePresetId(id)
    setTimeout(() => { isLoadingPreset.current = false }, 0)
  }

  const result = mounted ? compute(values) : null

  const [tradeData, setTradeData] = useState<TradeRow[]>([])

  useEffect(() => {
    const r = mounted ? compute(values) : null
    if (!r) { setTradeData([]); return }
    setTradeData(generateTradeData(r.startBalance, r.numTrades, parseNum(values.risk), parseNum(values.rr), r.profitableTrades, r.losingTrades))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, values.startBalance, values.numTrades, values.risk, values.rr, values.winRate])

  const chartData = tradeData.length > 0 && result
    ? [{ trade: 0, balance: result.startBalance }, ...tradeData.map((r) => ({ trade: r.tradeNumber, balance: Math.round(r.endingBalance) }))]
    : []

  // Max drawdown from actual random simulation: track running peak, measure peak-to-trough drops
  const { simMaxDrawdownAbs, simMaxDrawdownPct } = (() => {
    if (!tradeData.length || !result) return { simMaxDrawdownAbs: 0, simMaxDrawdownPct: 0 }
    let peak = result.startBalance
    let simMaxDrawdownAbs = 0
    let simMaxDrawdownPct = 0
    for (const row of tradeData) {
      if (row.endingBalance > peak) peak = row.endingBalance
      const dd = peak - row.endingBalance
      if (dd > simMaxDrawdownAbs) {
        simMaxDrawdownAbs = dd
        simMaxDrawdownPct = (dd / peak) * 100
      }
    }
    return { simMaxDrawdownAbs, simMaxDrawdownPct }
  })()

  return (
    <div className="mx-auto max-w-6xl px-6 pt-6 pb-10 space-y-8">
      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("tools.returnCalculator.title")}
        </h1>
        <p className="text-muted-foreground max-w-xl">
          {t("tools.returnCalculator.description")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="uppercase tracking-wide text-muted-foreground">
              {t("tools.returnCalculator.sections.settings")}
            </CardTitle>
            <CardAction className="flex items-center gap-2">
              <Button variant="outline" onClick={handleClear}>
                {t("tools.returnCalculator.clearAll")}
              </Button>
              <Button disabled={!isValid} onClick={() => { setPresetName(""); setPresetNameError(""); setSaveDialogOpen(true) }}>
                {t("tools.returnCalculator.presets.save")}
              </Button>
            </CardAction>
          </CardHeader>
          {presets.length > 0 && (
            <div className="px-(--card-spacing) -mt-2 pb-1">
              <ScrollAreaPrimitive.Root className="w-full">
                <ScrollAreaPrimitive.Viewport className="w-full">
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    spacing={1}
                    value={activePresetId ?? ""}
                    onValueChange={(val) => { if (val) handleLoadPreset(val) }}
                    className="flex-nowrap justify-start pb-2"
                  >
                    {presets.map((preset) => (
                      <ToggleGroupItem key={preset.id} value={preset.id} className="group/preset shrink-0 text-xs gap-1.5">
                        {preset.name}
                        <span
                          role="button"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeletePreset(preset) }}
                        >
                          <X className="size-3" />
                        </span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </ScrollAreaPrimitive.Viewport>
                <ScrollAreaPrimitive.Scrollbar orientation="horizontal" className="flex h-2 flex-col border-t border-t-transparent p-px">
                  <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-none bg-border" />
                </ScrollAreaPrimitive.Scrollbar>
              </ScrollAreaPrimitive.Root>
            </div>
          )}
          <CardContent className="space-y-5">

            {/* Start Balance */}
            <Field data-invalid={!!errors.startBalance}>
              <FieldLabel htmlFor="startBalance" className="text-base font-medium">
                {t("tools.returnCalculator.fields.startBalance")}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <CurrencyPicker value={currency} onChange={setCurrency} />
                </InputGroupAddon>
                {(() => {
                  const { onChange: rhfOnChange, ...rest } = register("startBalance")
                  return (
                    <InputGroupInput
                      {...rest}
                      onChange={(e) => { e.target.value = applyThousands(sanitizeDecimal(e.target.value)); rhfOnChange(e) }}
                      id="startBalance"
                      placeholder="10,000"
                      aria-invalid={!!errors.startBalance}
                    />
                  )
                })()}
              </InputGroup>
              <FieldDescription>{t("tools.returnCalculator.fields.startBalanceDesc")}</FieldDescription>
              {errors.startBalance && <FieldError>{t(errors.startBalance.message!)}</FieldError>}
              <QuickOptions options={["1,000", "5,000", "10,000", "50,000", "100,000"]} field="startBalance" current={values.startBalance} setValue={setValue} />
            </Field>

            {/* Row: Number of Trades + Risk % */}
            <div className="grid grid-cols-2 gap-4">
              <Field data-invalid={!!errors.numTrades}>
                <FieldLabel htmlFor="numTrades" className="text-base font-medium">
                  {t("tools.returnCalculator.fields.numTrades")}
                </FieldLabel>
                {(() => {
                  const { onChange: rhfOnChange, ...rest } = register("numTrades")
                  return (
                    <InputGroup>
                      <InputGroupInput
                        {...rest}
                        onChange={(e) => { e.target.value = applyThousands(sanitizeInteger(e.target.value)); rhfOnChange(e) }}
                        id="numTrades"
                        placeholder="100"
                        aria-invalid={!!errors.numTrades}
                      />
                    </InputGroup>
                  )
                })()}
                {errors.numTrades && <FieldError>{t(errors.numTrades.message!)}</FieldError>}
                <QuickOptions options={["100", "200", "300", "400"]} field="numTrades" current={values.numTrades} setValue={setValue} />
              </Field>

              <Field data-invalid={!!errors.risk}>
                <FieldLabel htmlFor="risk" className="text-base font-medium">
                  {t("tools.returnCalculator.fields.risk")}
                </FieldLabel>
                {(() => {
                  const { onChange: rhfOnChange, ...rest } = register("risk")
                  return (
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>%</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...rest}
                        onChange={(e) => { e.target.value = applyThousands(sanitizeDecimal(e.target.value)); rhfOnChange(e) }}
                        id="risk"
                        placeholder="1"
                        aria-invalid={!!errors.risk}
                      />
                    </InputGroup>
                  )
                })()}
                {errors.risk && <FieldError>{t(errors.risk.message!)}</FieldError>}
                <QuickOptions options={["0.5", "1", "2", "5"]} field="risk" current={values.risk} setValue={setValue} />
              </Field>
            </div>

            {/* Row: Risk:Reward + Win Rate */}
            <div className="grid grid-cols-2 gap-4">
              <Field data-invalid={!!errors.rr}>
                <FieldLabel htmlFor="rr" className="text-base font-medium">
                  {t("tools.returnCalculator.fields.rr")}
                </FieldLabel>
                {(() => {
                  const { onChange: rhfOnChange, ...rest } = register("rr")
                  return (
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText className="text-muted-foreground">1 :</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...rest}
                        onChange={(e) => { e.target.value = applyThousands(sanitizeDecimal(e.target.value)); rhfOnChange(e) }}
                        id="rr"
                        placeholder="3"
                        aria-invalid={!!errors.rr}
                      />
                    </InputGroup>
                  )
                })()}
                {errors.rr && <FieldError>{t(errors.rr.message!)}</FieldError>}
                <QuickOptions options={["1.5", "2", "3", "5"]} field="rr" current={values.rr} setValue={setValue} />
              </Field>

              <Field data-invalid={!!errors.winRate}>
                <FieldLabel htmlFor="winRate" className="text-base font-medium">
                  {t("tools.returnCalculator.fields.winRate")}
                </FieldLabel>
                {(() => {
                  const { onChange: rhfOnChange, ...rest } = register("winRate")
                  return (
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>%</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...rest}
                        onChange={(e) => { e.target.value = applyThousands(sanitizeDecimal(e.target.value)); rhfOnChange(e) }}
                        id="winRate"
                        placeholder="40"
                        aria-invalid={!!errors.winRate}
                      />
                    </InputGroup>
                  )
                })()}
                {errors.winRate && <FieldError>{t(errors.winRate.message!)}</FieldError>}
                <QuickOptions options={["30", "40", "50", "60"]} field="winRate" current={values.winRate} setValue={setValue} />
              </Field>
            </div>

          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="uppercase tracking-wide text-muted-foreground">
              {t("tools.returnCalculator.sections.results")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <ResultRow
                label={`${t("tools.returnCalculator.results.endBalance")}, ${currency}`}
                value={result ? formatCurrency(result.endBalance, currency) : "-"}
                large
              />
              <div className="border-t" />
              <ResultRow
                label={`${t("tools.returnCalculator.results.accountStart")}, ${currency}`}
                value={result ? formatCurrency(result.startBalance, currency) : "-"}
              />
              <ResultRow
                label={`${t("tools.returnCalculator.results.roi")}, %`}
                value={result ? `${result.roi >= 0 ? "+" : ""}${result.roi.toFixed(2)}%` : "-"}
              />
              <ResultRow
                label={`${t("tools.returnCalculator.results.avgGain")}, %`}
                value={result ? `${result.avgGainPerTrade >= 0 ? "+" : ""}${result.avgGainPerTrade.toFixed(2)}%` : "-"}
              />
              <div className="border-t" />
              <ResultRow
                label={t("tools.returnCalculator.results.numTrades")}
                value={result ? result.numTrades.toLocaleString() : "-"}
              />
              <ResultRow
                label={t("tools.returnCalculator.results.profitableTrades")}
                value={result ? result.profitableTrades.toLocaleString() : "-"}
              />
              <ResultRow
                label={t("tools.returnCalculator.results.losingTrades")}
                value={result ? result.losingTrades.toLocaleString() : "-"}
              />
              <div className="border-t" />
              <ResultRow
                label={`${t("tools.returnCalculator.results.maxDrawdownAbs")}, ${currency}`}
                value={result ? `-${formatCurrency(simMaxDrawdownAbs, currency)}` : "-"}
              />
              <ResultRow
                label={t("tools.returnCalculator.results.maxDrawdownPct")}
                value={result ? `-${simMaxDrawdownPct.toFixed(2)}%` : "-"}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="uppercase tracking-wide text-muted-foreground">
              {t("tools.returnCalculator.chart.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <TradeReturnChart data={chartData} currency={currency} />
          </CardContent>
        </Card>
      )}

      {/* Per-trade table */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="uppercase tracking-wide text-muted-foreground">
              {t("tools.returnCalculator.table.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border overflow-hidden">
              <TradeTable data={tradeData} currency={currency} t={t} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info section */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          <h2 className="text-2xl font-semibold">{t("tools.returnCalculator.info.title")}</h2>
          <p className="text-base text-muted-foreground leading-relaxed">{t("tools.returnCalculator.info.intro")}</p>
          <ol className="space-y-4 list-decimal list-inside">
            {(["1","2","3","4","5"] as const).map((n) => (
              <li key={n} className="text-base text-muted-foreground leading-relaxed">
                <strong className="text-foreground font-semibold">{t(`tools.returnCalculator.info.item${n}Label`)}</strong>
                {" — "}
                {t(`tools.returnCalculator.info.item${n}Desc`)}
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground leading-relaxed border-t pt-4">{t("tools.returnCalculator.info.note")}</p>
        </CardContent>
      </Card>

      <ScrollToTopButton />

      {/* Delete preset dialog */}
      <AlertDialog open={!!deletePreset} onOpenChange={(open) => { if (!open) setDeletePreset(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tools.returnCalculator.presets.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tools.returnCalculator.presets.deleteDesc", { name: deletePreset?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tools.returnCalculator.presets.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deletePreset && handleDeletePreset(deletePreset.id)}>
              {t("tools.returnCalculator.presets.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save preset dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tools.returnCalculator.presets.dialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Input
              placeholder={t("tools.returnCalculator.presets.namePlaceholder")}
              value={presetName}
              onChange={(e) => { setPresetName(e.target.value); setPresetNameError("") }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset() }}
              autoFocus
            />
            {presetNameError && (
              <p className="text-xs text-destructive">{presetNameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              {t("tools.returnCalculator.presets.cancel")}
            </Button>
            <Button onClick={handleSavePreset}>
              {t("tools.returnCalculator.presets.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QuickOptions({
  options,
  field,
  current,
  setValue,
}: {
  options: string[]
  field: keyof FormValues
  current: string | undefined
  setValue: UseFormSetValue<FormValues>
}) {
  return (
    <ToggleGroup
      type="single"
      variant="default"
      size="sm"
      spacing={1}
      value={options.includes(current ?? "") ? (current ?? "") : ""}
      onValueChange={(val) => { if (val) setValue(field, val, { shouldValidate: true }) }}
      className="flex-wrap justify-start"
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt} value={opt} className="h-6 px-2 text-xs">
          {opt}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function ResultRow({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-base font-medium">{label}</p>
      <p className={large ? "text-2xl font-bold tabular-nums" : "text-base font-semibold tabular-nums"}>{value}</p>
    </div>
  )
}

const chartConfig = {
  balance: {
    label: "Balance",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

function BalanceTooltip({
  active,
  payload,
  label,
  currencySymbol,
  tradeLabel,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: number
  currencySymbol: string
  tradeLabel: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="flex items-stretch gap-2.5 border border-border bg-card px-3 py-2.5 shadow-xl text-xs">
      <div className="w-0.75 shrink-0 self-stretch rounded-none bg-chart-1" />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold tabular-nums text-card-foreground">
          {currencySymbol}{Math.round(payload[0].value).toLocaleString()}
        </span>
        <span className="text-muted-foreground">{tradeLabel} {label}</span>
      </div>
    </div>
  )
}

function TradeReturnChart({ data, currency }: { data: { trade: number; balance: number }[]; currency: string }) {
  const { t } = useTranslation()

  const currencySymbol = (() => {
    try {
      return (0).toLocaleString("en", { style: "currency", currency, maximumFractionDigits: 0 }).replace(/[\d,.\s]/g, "")
    } catch { return currency }
  })()

  // Dynamic width: measure the longest Y-axis label to avoid clipping
  const yAxisWidth = (() => {
    if (!data.length) return 64
    const maxVal = Math.max(...data.map((d) => d.balance))
    const label = `${currencySymbol}${Math.round(maxVal).toLocaleString()}`
    return label.length * 7 + 8 // ~7px per char at 11px font + padding
  })()

  return (
    <ChartContainer config={chartConfig} className="h-75 w-full" dir="ltr">
      <AreaChart data={data} margin={{ top: 12, right: 16, left: 16, bottom: 4 }}>
        <defs>
          <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="var(--border)"
          strokeOpacity={0.5}
        />
        <XAxis
          dataKey="trade"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickCount={6}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => `${currencySymbol}${(v as number).toLocaleString()}`}
          width={yAxisWidth}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          content={<BalanceTooltip currencySymbol={currencySymbol} tradeLabel={t("tools.returnCalculator.chart.trade")} />}
        />
        <Area
          type="monotone"
          dataKey="balance"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#balanceFill)"
          dot={false}
          activeDot={{ r: 4, fill: "var(--chart-1)", strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

const columnHelper = createColumnHelper<TradeRow>()

function TradeTable({ data, currency, t }: { data: TradeRow[]; currency: string; t: (key: string) => string }) {
  const fmt = (n: number) => Math.round(n).toLocaleString()

  const columns = [
    columnHelper.accessor("tradeNumber", {
      header: () => t("tools.returnCalculator.table.tradeNumber"),
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor("startingBalance", {
      header: () => t("tools.returnCalculator.table.startingBalance"),
      cell: (info) => fmt(info.getValue()),
    }),
    columnHelper.accessor("profit", {
      header: () => t("tools.returnCalculator.table.profit"),
      cell: (info) => {
        const v = info.getValue()
        return (
          <span className={v >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
            {v >= 0 ? "" : "-"}{fmt(Math.abs(v))}
          </span>
        )
      },
    }),
    columnHelper.accessor("endingBalance", {
      header: () => t("tools.returnCalculator.table.endingBalance"),
      cell: (info) => fmt(info.getValue()),
    }),
    columnHelper.accessor("totalProfit", {
      header: () => t("tools.returnCalculator.table.totalProfit"),
      cell: (info) => fmt(info.getValue()),
    }),
    columnHelper.accessor("totalGain", {
      header: () => t("tools.returnCalculator.table.totalGain"),
      cell: (info) => `${Math.round(info.getValue())}%`,
    }),
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((header) => (
              <TableHead key={header.id} className="text-center font-semibold">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id} className="text-center tabular-nums">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
