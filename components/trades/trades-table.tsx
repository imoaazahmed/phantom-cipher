"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { format, addDays, subDays } from "date-fns"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  EyeOff,
  Files,
  Info,
  Pencil,
  Plus,
  Settings2,
  Code2,
  Trash2,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import type {
  EnrichedTrade,
  RawTrade,
  TradeFormData,
  ColumnSetting,
  FormatType,
  FormulaColumn,
} from "@/lib/trades/types"
import { enrichTrades, deriveDirection } from "@/lib/trades/calculations"
import {
  PINNED_COLUMN,
  DEFAULT_COLUMN_ORDER,
  REQUIRED_COLUMNS,
  resolveColumnOrder,
} from "@/lib/trades/column-order"
import {
  BUILT_IN_FORMAT_TYPES,
  DEFAULT_MENU_OPTIONS,
  MENU_COLUMN_IDS,
} from "@/lib/trades/column-options"
import { deleteColumnSetting } from "@/lib/trades/actions"
import { AddColumnDialog } from "./add-column-dialog"

type Props = {
  trades: EnrichedTrade[]
  scrolledX?: boolean
  scrolledY?: boolean
  initialColumnOrder: string[] | null
  onColumnReorder: (order: string[]) => void
  columnVisibility: Record<string, boolean>
  onHideColumn: (columnId: string) => void
  columnSettings?: ColumnSetting[]
  columnOptions?: Record<string, { value: string; label: string }[]>
  onSaveColumnOptions?: (
    columnId: string,
    options: { value: string; label: string }[]
  ) => Promise<void>
  formulaColumns?: FormulaColumn[]
  initialDraftTrades?: RawTrade[]
  onCreateTrade: (sortOrder?: number) => Promise<RawTrade | null>
  onPatchTrade: (tradeId: string, fields: Partial<TradeFormData>) => void
  onDeleteTrade: (tradeId: string) => Promise<void>
  onDuplicateTrade: (tradeId: string) => Promise<void>
}

function fmtCurrency(value: number): string {
  return (
    "$" +
    Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function fmtPercent(value: number): string {
  return value.toFixed(2) + "%"
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const year = y.slice(2)
  return `${d.padStart(2, "0")} ${months[parseInt(m) - 1]} '${year}`
}

function fmtTime(timeStr: string, use24h = false): string {
  const [hStr, mStr] = timeStr.split(":")
  const h = parseInt(hStr)
  if (use24h) return `${String(h).padStart(2, "0")}:${mStr}`
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return `${String(h12).padStart(2, "0")}:${mStr} ${ampm}`
}

function fmtCustomCell(raw: string, formatType?: FormatType | null): string {
  if (!formatType || formatType === 'auto' || formatType === 'text' || formatType === 'dropdown') return raw
  const n = parseFloat(raw)
  if (formatType === 'currency') return isNaN(n) ? raw : fmtCurrency(n)
  if (formatType === 'percent') return isNaN(n) ? raw : fmtPercent(n)
  if (formatType === 'number') return isNaN(n) ? raw : n.toLocaleString()
  if (formatType === 'date') return fmtDate(raw)
  if (formatType === 'time') return fmtTime(raw, false)
  if (formatType === 'time24') return fmtTime(raw, true)
  return raw
}

function HeaderCell({
  label,
  tooltip,
  isFormula,
  onOpenSettings,
}: {
  label: string
  tooltip: string
  isFormula?: boolean
  onOpenSettings?: () => void
}) {
  const { t } = useTranslation()
  return (
    <span className="flex w-full items-center justify-between gap-2.5">
      <span className="flex items-center gap-1.25">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default text-muted-foreground hover:text-foreground">
              <Info className="size-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-56 flex-col items-start gap-0.5"
          >
            <p className="font-semibold">{label}</p>
            {tooltip ? (
              <p>{tooltip}</p>
            ) : (
              <p className="italic opacity-60">
                {t("trades.addColumnDialog.noDescriptionHint")}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
        {isFormula && <Code2 className="size-3 text-muted-foreground" />}
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="cursor-pointer text-muted-foreground hover:text-foreground"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onOpenSettings}
          >
            <Settings2 className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("trades.columns.columnSettings")}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

const EDITABLE_COLUMNS = new Set([
  "trade_date",
  "trade_time",
  "ticker",
  "order_type",
  "avg_entry",
  "stop_loss",
  "avg_exit",
  "risk",
  "rules_followed",
  "setup_type",
  "realised_win",
  "realised_loss",
])

const colShadow =
  "before:pointer-events-none before:absolute before:inset-y-0 before:start-full before:w-4 before:bg-[linear-gradient(to_right,rgb(0_0_0/0.07),transparent)] rtl:before:bg-[linear-gradient(to_left,rgb(0_0_0/0.07),transparent)] dark:before:bg-[linear-gradient(to_right,rgb(255_255_255/0.1),transparent)] dark:rtl:before:bg-[linear-gradient(to_left,rgb(255_255_255/0.1),transparent)]"
const rowShadow =
  "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-[linear-gradient(to_bottom,rgb(0_0_0/0.07),transparent)] dark:after:bg-[linear-gradient(to_bottom,rgb(255_255_255/0.1),transparent)]"

type DraggableHeaderProps = {
  id: string
  className?: string
  children: React.ReactNode
}

function DraggableHeader({ id, className, children }: DraggableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <TableHead
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      className={className}
      {...attributes}
      {...listeners}
    >
      {children}
    </TableHead>
  )
}

function DateCellEditor({
  value,
  open,
  onClose,
  onCommit,
}: {
  value: string
  open: boolean
  onClose: () => void
  onCommit: (dateStr: string) => void
}) {
  const { t } = useTranslation()
  const today = new Date()
  const selected = value ? new Date(value) : undefined

  function select(date: Date) {
    onCommit(format(date, "yyyy-MM-dd"))
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <PopoverTrigger asChild>
        <span className="sr-only" />
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) select(date)
          }}
          captionLayout="dropdown"
          className="w-full"
          classNames={{
            month: "w-full flex flex-col gap-4",
            dropdown: "absolute inset-0 opacity-0",
            dropdown_root:
              "relative border border-[--color-border] px-2 text-sm h-7 flex items-center",
          }}
        />
        <div className="flex gap-1.5 border-t border-[--color-border] p-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => select(subDays(today, 1))}
          >
            {t("trades.cell.yesterday")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => select(today)}
          >
            {t("trades.cell.today")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => select(addDays(today, 1))}
          >
            {t("trades.cell.tomorrow")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MenuCellEditor({
  options,
  onClose,
  onCommit,
}: {
  value: string
  options: { value: string; label: string }[]
  onClose: () => void
  onCommit: (value: string) => void
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger asChild>
        <span className="sr-only" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={() => onCommit(opt.value)}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TradesTable({
  trades,
  scrolledX,
  scrolledY,
  initialColumnOrder,
  onColumnReorder,
  columnVisibility,
  onHideColumn,
  columnSettings = [],
  columnOptions = {},
  onSaveColumnOptions,
  formulaColumns = [],
  initialDraftTrades = [],
  onCreateTrade,
  onPatchTrade,
  onDeleteTrade,
  onDuplicateTrade,
}: Props) {
  const { t } = useTranslation()

  const BUILT_IN_IDS = useMemo(
    () => new Set([PINNED_COLUMN, ...DEFAULT_COLUMN_ORDER]),
    []
  )
  const customColumns = columnSettings.filter(
    (s) => s.user_id !== null && !BUILT_IN_IDS.has(s.column_id)
  )
  const customColumnIds = useMemo(
    () => new Set(customColumns.map((s) => s.column_id)),
    [customColumns]
  )
  const allColumnKeys = [
    ...DEFAULT_COLUMN_ORDER,
    ...customColumns.map((s) => s.column_id),
  ]

  const [columnOrder, setColumnOrder] = useState<string[]>(() => [
    PINNED_COLUMN,
    ...resolveColumnOrder(initialColumnOrder, allColumnKeys),
  ])
  const [addColumnOpen, setAddColumnOpen] = useState(false)

  type SettingsTarget = {
    columnId: string
    label: string
    description: string
    format_type: FormatType
    initialOptions?: { value: string; label: string }[]
    isBuiltIn: boolean
    is_formula?: boolean
    formula?: string | null
  }
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(
    null
  )
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [tradeDeleteTarget, setTradeDeleteTarget] = useState<{
    id: string | null
    number: number
    draftRowIndex?: number
  } | null>(null)
  const [isDeletingTrade, setIsDeletingTrade] = useState(false)

  const [editingCell, setEditingCell] = useState<{
    rowId: string
    columnId: string
  } | null>(null)
  const [editValue, setEditValue] = useState("")
  const [blankRowCount, setBlankRowCount] = useState(() =>
    Math.max(initialDraftTrades.length, trades.length === 0 ? 1 : 0)
  )

  type DraftRow = {
    id: string | null
    fields: Partial<RawTrade>
    filledFields: string[]
    sortOrder: number
  }
  const [draftRows, setDraftRows] = useState<Map<number, DraftRow>>(() => {
    const map = new Map<number, DraftRow>()
    initialDraftTrades.forEach((trade, idx) => {
      const filledFields = trade.draft_fields ?? []
      const fields: Partial<RawTrade> = {}
      for (const key of filledFields) {
        const k = key as keyof RawTrade
        if (trade[k] !== undefined)
          (fields as Record<string, unknown>)[key] = trade[k]
      }
      if (trade.custom_data && Object.keys(trade.custom_data).length > 0) {
        fields.custom_data = trade.custom_data
      }
      map.set(idx, { id: trade.id, fields, filledFields, sortOrder: trade.sort_order })
    })
    return map
  })
  const draftRowsRef = useRef<Map<number, DraftRow>>(new Map())
  draftRowsRef.current = draftRows

  // Sync newly arriving draft trades (e.g. after duplication) into draftRows.
  // The lazy useState initializer only runs once at mount, so new entries in
  // initialDraftTrades won't appear unless we explicitly add them here.
  useEffect(() => {
    const knownIds = new Set(Array.from(draftRowsRef.current.values()).map((d) => d.id))
    const incoming = initialDraftTrades.filter((t) => !knownIds.has(t.id))
    if (incoming.length === 0) return
    setDraftRows((prev) => {
      const newMap = new Map(prev)
      let nextIdx = prev.size === 0 ? 0 : Math.max(...Array.from(prev.keys())) + 1
      for (const trade of incoming) {
        const filledFields = (trade.draft_fields as string[]) ?? []
        const fields: Partial<RawTrade> = {}
        for (const key of filledFields) {
          const k = key as keyof RawTrade
          if (trade[k] !== undefined) (fields as Record<string, unknown>)[key] = trade[k]
        }
        if (trade.custom_data && Object.keys(trade.custom_data).length > 0)
          fields.custom_data = trade.custom_data
        newMap.set(nextIdx++, { id: trade.id, fields, filledFields, sortOrder: trade.sort_order })
      }
      return newMap
    })
  }, [initialDraftTrades])

  type InsertedBlank = {
    localId: string
    sortOrder: number
    id: string | null
    fields: Partial<RawTrade>
    filledFields: string[]
  }
  const [insertedBlanks, setInsertedBlanks] = useState<InsertedBlank[]>([])
  const insertedBlanksRef = useRef<InsertedBlank[]>([])
  insertedBlanksRef.current = insertedBlanks

  type MergedRow =
    | { type: "real"; trade: EnrichedTrade }
    | { type: "inserted"; blank: InsertedBlank }
    | { type: "draft"; idx: number; draft: DraftRow }

  const { mergedRows, rankMap } = useMemo(() => {
    const savedDrafts: MergedRow[] = Array.from(draftRows.entries())
      .filter(([, d]) => d.id !== null)
      .map(([idx, d]) => ({ type: "draft" as const, idx, draft: d }))
    const items: MergedRow[] = [
      ...trades.map<MergedRow>((trade) => ({ type: "real", trade })),
      ...savedDrafts,
      ...insertedBlanks.map<MergedRow>((blank) => ({
        type: "inserted",
        blank,
      })),
    ].sort((a, b) => {
      const sa =
        a.type === "real"
          ? a.trade.sort_order
          : a.type === "draft"
            ? a.draft.sortOrder
            : a.blank.sortOrder
      const sb =
        b.type === "real"
          ? b.trade.sort_order
          : b.type === "draft"
            ? b.draft.sortOrder
            : b.blank.sortOrder
      return sa - sb
    })
    const map = new Map<string, number>()
    items.forEach((item, i) => {
      const key =
        item.type === "real"
          ? item.trade.id
          : item.type === "draft"
            ? item.draft.id!
            : item.blank.localId
      map.set(key, i + 1)
    })
    return { mergedRows: items, rankMap: map }
  }, [trades, draftRows, insertedBlanks])

  const rankMapRef = useRef<Map<string, number>>(new Map())
  rankMapRef.current = rankMap

  // When the last real trade is deleted, ensure at least one blank row remains
  useEffect(() => {
    if (trades.length === 0) setBlankRowCount((prev) => Math.max(prev, 1))
  }, [trades.length])

  function handleCellDoubleClick(
    rowId: string,
    columnId: string,
    currentValue: unknown
  ) {
    const isEditable =
      EDITABLE_COLUMNS.has(columnId) || (customColumnIds.has(columnId) && !isFormulaCol(columnId))
    if (!isEditable) {
      toast(t("trades.cell.readOnly"))
      return
    }
    setEditingCell({ rowId, columnId })
    if (rowId.startsWith("new-")) {
      const idx = parseInt(rowId.slice(4))
      const draft = draftRowsRef.current.get(idx)
      const draftVal = customColumnIds.has(columnId)
        ? draft?.fields.custom_data?.[columnId]
        : draft?.fields[columnId as keyof RawTrade]
      setEditValue(draftVal != null ? String(draftVal) : "")
    } else if (rowId.startsWith("inserted-")) {
      const localId = rowId.slice("inserted-".length)
      const blank = insertedBlanksRef.current.find((b) => b.localId === localId)
      const val = customColumnIds.has(columnId)
        ? blank?.fields.custom_data?.[columnId]
        : blank?.fields[columnId as keyof RawTrade]
      setEditValue(val != null ? String(val) : "")
    } else {
      setEditValue(String(currentValue ?? ""))
    }
  }

  function cancelEdit() {
    setEditingCell(null)
  }

  function insertBlankAtSortOrder(referenceSortOrder: number, position: "before" | "after") {
    const sortedSortOrders = [
      ...trades.map((t) => t.sort_order),
      ...Array.from(draftRowsRef.current.values())
        .filter((d) => d.id !== null)
        .map((d) => d.sortOrder),
      ...insertedBlanksRef.current.map((b) => b.sortOrder),
    ].sort((a, b) => a - b)
    let newSortOrder: number
    if (position === "after") {
      const next = sortedSortOrders.find((s) => s > referenceSortOrder)
      newSortOrder = next != null
        ? (referenceSortOrder + next) / 2
        : referenceSortOrder + 1.0
    } else {
      const prev = [...sortedSortOrders].reverse().find((s) => s < referenceSortOrder)
      newSortOrder = prev != null
        ? (prev + referenceSortOrder) / 2
        : referenceSortOrder - 1.0
    }
    setInsertedBlanks((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), sortOrder: newSortOrder, id: null, fields: {}, filledFields: [] },
    ])
  }

  function handleInsertTrade(tradeId: string, position: "before" | "after") {
    const allItems = [
      ...trades.map((t) => ({ id: t.id, sortOrder: t.sort_order })),
      ...Array.from(draftRowsRef.current.values())
        .filter((d) => d.id !== null)
        .map((d) => ({ id: d.id!, sortOrder: d.sortOrder })),
      ...insertedBlanksRef.current.map((b) => ({ id: b.localId, sortOrder: b.sortOrder })),
    ]
    const found = allItems.find((item) => item.id === tradeId)
    const referenceSortOrder = found?.sortOrder ?? (Math.max(0, ...allItems.map(i => i.sortOrder)) + 1.0)
    insertBlankAtSortOrder(referenceSortOrder, position)
  }

  function saveAndCloseInserted(
    localId: string,
    columnId: string,
    value: string
  ) {
    setEditingCell(null)
    const blank = insertedBlanksRef.current.find((b) => b.localId === localId)
    if (!blank) return

    const isEmpty = !value.trim()
    const isCustom = customColumnIds.has(columnId)

    if (isCustom) {
      const mergedCustomData = {
        ...(blank.fields.custom_data ?? {}),
        [columnId]: value,
      }
      setInsertedBlanks((prev) =>
        prev.map((b) =>
          b.localId === localId
            ? { ...b, fields: { ...b.fields, custom_data: mergedCustomData } }
            : b
        )
      )
      if (isEmpty) return
      if (blank.id) {
        onPatchTrade(blank.id, { custom_data: mergedCustomData })
      } else {
        onCreateTrade(blank.sortOrder).then((newTrade) => {
          if (!newTrade) return
          setInsertedBlanks((prev) =>
            prev.map((b) =>
              b.localId === localId ? { ...b, id: newTrade.id } : b
            )
          )
          onPatchTrade(newTrade.id, { custom_data: mergedCustomData })
        })
      }
      return
    }

    const fields = parseFieldForSave(columnId, value)
    const isRequiredNumeric = [
      "avg_entry",
      "stop_loss",
      "avg_exit",
      "risk",
    ].includes(columnId)
    const isOptionalNumeric = ["realised_win", "realised_loss"].includes(
      columnId
    )
    const counterpart =
      columnId === "realised_win"
        ? "realised_loss"
        : columnId === "realised_loss"
          ? "realised_win"
          : null

    const newFilledFields = isEmpty
      ? blank.filledFields.filter((f) => f !== columnId)
      : [
          ...new Set([
            ...blank.filledFields.filter((f) => f !== counterpart),
            columnId,
          ]),
        ]

    setInsertedBlanks((prev) =>
      prev.map((b) => {
        if (b.localId !== localId) return b
        const newFields = { ...b.fields }
        if (isEmpty && (isRequiredNumeric || isOptionalNumeric)) {
          delete (newFields as Record<string, unknown>)[columnId]
        } else {
          Object.assign(newFields, fields)
          if (counterpart && !isEmpty)
            delete (newFields as Record<string, unknown>)[counterpart]
        }
        return { ...b, fields: newFields, filledFields: newFilledFields }
      })
    )

    if (isEmpty) {
      if (blank.id) {
        const clearFields: Partial<TradeFormData> = {
          draft_fields: newFilledFields,
        }
        if (isOptionalNumeric)
          (clearFields as Record<string, unknown>)[columnId] = null
        else if (!isRequiredNumeric) Object.assign(clearFields, fields)
        onPatchTrade(blank.id, clearFields)
      }
      return
    }

    const patchFields = {
      ...fields,
      ...(counterpart ? { [counterpart]: null } : {}),
      draft_fields: newFilledFields,
    } as Partial<TradeFormData>

    if (blank.id) {
      onPatchTrade(blank.id, patchFields)
    } else {
      onCreateTrade(blank.sortOrder).then((newTrade) => {
        if (!newTrade) return
        setInsertedBlanks((prev) =>
          prev.map((b) =>
            b.localId === localId ? { ...b, id: newTrade.id } : b
          )
        )
        onPatchTrade(newTrade.id, patchFields)
      })
    }
  }

  function validateAndCommitInserted(localId: string, columnId: string) {
    const fmt = resolveFormatType(columnId)
    const raw = editValue
    if ((fmt === "number" || fmt === "currency") && raw.trim() !== "") {
      const num = Number(raw.replace(/,/g, ""))
      if (isNaN(num)) {
        toast.error(t("trades.cell.invalidNumber"))
        setEditValue("")
        setEditingCell(null)
        return
      }
    }
    saveAndCloseInserted(localId, columnId, raw)
  }

  function renderDraftCellContent(
    colId: string,
    df: Partial<RawTrade>,
    hasPrices: boolean,
    enrichedDraft: EnrichedTrade
  ): React.ReactNode {
    if (customColumnIds.has(colId)) {
      const colSetting = columnSettings.find((s) => s.column_id === colId)
      if (isFormulaCol(colId)) {
        const val = enrichedDraft.custom_data?.[colId]
        if (val == null) return <Code2 className="mx-auto size-4 text-muted-foreground/40" />
        return <span className="text-sm">{fmtCustomCell(val, colSetting?.format_type)}</span>
      }
      const val = df.custom_data?.[colId]
      return val ? <span className="text-sm">{fmtCustomCell(val, colSetting?.format_type)}</span> : <>&nbsp;</>
    }
    // direction is always auto-derived from prices
    if (colId === "direction") {
      if (!hasPrices) return <Code2 className="mx-auto size-4 text-muted-foreground/40" />
      const dir =
        (enrichedDraft.custom_data?.["direction"] as 'long' | 'short' | undefined) ??
        (df.avg_entry && df.stop_loss ? deriveDirection(df.avg_entry, df.stop_loss) : undefined)
      if (!dir) return <Code2 className="mx-auto size-4 text-muted-foreground/40" />
      return (
        <span className={cn("text-sm font-medium", dir === "long" ? "text-green-500" : "text-red-500")}>
          {dir === "long" ? t("trades.direction.long") : t("trades.direction.short")}
        </span>
      )
    }
    if (colId in df || isFormulaCol(colId)) {
      if (colId === "trade_date")
        return (
          <span className="text-sm tabular-nums">
            {df.trade_date ? fmtDate(df.trade_date) : ""}
          </span>
        )
      if (colId === "trade_time")
        return (
          <span className="text-sm tabular-nums">
            {df.trade_time
              ? fmtTime(
                  String(df.trade_time),
                  resolveFormatType("trade_time") === "time24"
                )
              : ""}
          </span>
        )
      if (colId === "ticker")
        return <span className="text-sm">{df.ticker ?? ""}</span>
      if (colId === "order_type")
        return <span className="text-sm capitalize">{df.order_type ?? ""}</span>
      if (colId === "avg_entry")
        return (
          <span className="text-sm tabular-nums">
            {df.avg_entry != null ? fmtCurrency(df.avg_entry) : ""}
          </span>
        )
      if (colId === "stop_loss")
        return (
          <span className="text-sm tabular-nums">
            {df.stop_loss != null ? fmtCurrency(df.stop_loss) : ""}
          </span>
        )
      if (colId === "avg_exit")
        return (
          <span className="text-sm tabular-nums">
            {df.avg_exit != null ? fmtCurrency(df.avg_exit) : ""}
          </span>
        )
      if (colId === "risk")
        return (
          <span className="text-sm tabular-nums">
            {df.risk != null ? fmtCurrency(df.risk) : ""}
          </span>
        )
      if (colId === "rules_followed")
        return (
          <span className="text-sm">
            {df.rules_followed != null
              ? df.rules_followed
                ? t("trades.form.rulesYes")
                : t("trades.form.rulesNo")
              : ""}
          </span>
        )
      if (colId === "setup_type")
        return <span className="text-sm">{df.setup_type ?? ""}</span>
      if (colId === "realised_win")
        return df.realised_win != null ? (
          <span className="text-sm text-green-600 tabular-nums dark:text-green-400">
            {fmtCurrency(df.realised_win)}
          </span>
        ) : (
          <></>
        )
      if (colId === "realised_loss")
        return df.realised_loss != null ? (
          <span className="text-sm text-red-500 tabular-nums">
            -{fmtCurrency(df.realised_loss)}
          </span>
        ) : (
          <></>
        )
      // Formula columns — need prices to compute
      if (!hasPrices)
        return (
          <Code2 className="mx-auto size-4 text-muted-foreground/40" />
        )
      if (colId === "r_multiple") {
        const v = getFormulaVal("r_multiple", enrichedDraft)
        return v != null ? (
          <span className={cn("text-sm tabular-nums", v >= 0 ? "text-green-500" : "text-red-500")}>
            {v.toFixed(2)}R
          </span>
        ) : (
          <Code2 className="mx-auto size-4 text-muted-foreground/40" />
        )
      }
      if (colId === "deviation") {
        const v = getFormulaVal("deviation", enrichedDraft)
        return v != null ? (
          <span className="text-sm tabular-nums">{fmtPercent(v)}</span>
        ) : (
          <Code2 className="mx-auto size-4 text-muted-foreground/40" />
        )
      }
      if (colId === "risk_volatility") {
        const v = getFormulaVal("risk_volatility", enrichedDraft)
        return v != null ? (
          <span className="text-sm tabular-nums">{fmtPercent(v)}</span>
        ) : (
          <Code2 className="mx-auto size-4 text-muted-foreground/40" />
        )
      }
      if (colId === "cumulative_pnl") {
        const v = getFormulaVal("cumulative_pnl", enrichedDraft)
        return v != null ? (
          <span className={cn("text-sm tabular-nums", v >= 0 ? "text-green-500" : "text-red-500")}>
            {fmtCurrency(v)}
          </span>
        ) : (
          <Code2 className="mx-auto size-4 text-muted-foreground/40" />
        )
      }
      if (colId === "cumulative_r") {
        const v = getFormulaVal("cumulative_r", enrichedDraft)
        return v != null ? (
          <span className={cn("text-sm tabular-nums", v >= 0 ? "text-green-500" : "text-red-500")}>
            {v.toFixed(2)}R
          </span>
        ) : (
          <Code2 className="mx-auto size-4 text-muted-foreground/40" />
        )
      }
    }
    return <>&nbsp;</>
  }

  function getDraftCopyText(
    colId: string,
    df: Partial<RawTrade>,
    hasPrices: boolean,
    enrichedDraft: EnrichedTrade
  ): string {
    if (customColumnIds.has(colId)) {
      if (isFormulaCol(colId)) return enrichedDraft.custom_data?.[colId] ?? ""
      return df.custom_data?.[colId] ?? ""
    }
    if (colId === "direction") {
      if (!hasPrices) return ""
      return (enrichedDraft.custom_data?.["direction"] as string | undefined)
        ?? (df.avg_entry && df.stop_loss ? deriveDirection(df.avg_entry, df.stop_loss) : "")
    }
    if (isFormulaCol(colId)) {
      if (!hasPrices) return ""
      return enrichedDraft.custom_data?.[colId] ?? ""
    }
    const v = df[colId as keyof typeof df]
    if (v === null || v === undefined) return ""
    if (typeof v === "boolean")
      return v ? t("trades.form.rulesYes") : t("trades.form.rulesNo")
    return String(v)
  }

  // When new custom columns arrive (after router.refresh()), append them to the order.
  const seenColumnIds = useRef(new Set(columnOrder))
  const displayColumnOrder = useMemo(() => {
    const newIds = allColumnKeys.filter((id) => !seenColumnIds.current.has(id))
    if (newIds.length === 0) return columnOrder
    newIds.forEach((id) => seenColumnIds.current.add(id))
    const next = [...columnOrder, ...newIds]
    setColumnOrder(next)
    return next
  }, [columnOrder, allColumnKeys])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function resolveOptions(columnId: string) {
    return columnOptions[columnId] ?? DEFAULT_MENU_OPTIONS[columnId] ?? []
  }

  function isDropdownColumn(columnId: string): boolean {
    return (
      MENU_COLUMN_IDS.has(columnId) ||
      (columnOptions[columnId]?.length ?? 0) > 0
    )
  }

  function resolveFormatType(columnId: string): FormatType {
    const saved = columnSettings.find((s) => s.column_id === columnId)
    return (
      (saved?.format_type as FormatType) ??
      BUILT_IN_FORMAT_TYPES[columnId] ??
      "auto"
    )
  }

  function isFormulaCol(colId: string): boolean {
    return columnSettings.some((s) => s.column_id === colId && s.is_formula)
  }

  function getFormulaVal(colId: string, enriched: EnrichedTrade): number | null {
    const v = enriched.custom_data?.[colId]
    if (v == null) return null
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  function parseFieldForSave(
    columnId: string,
    raw: string
  ): Partial<TradeFormData> {
    if (["avg_entry", "stop_loss", "avg_exit", "risk"].includes(columnId)) {
      return { [columnId]: parseFloat(raw) || 0 } as Partial<TradeFormData>
    }
    if (["realised_win", "realised_loss"].includes(columnId)) {
      const n = parseFloat(raw)
      return { [columnId]: isNaN(n) ? null : n } as Partial<TradeFormData>
    }
    if (columnId === "rules_followed") return { rules_followed: raw === "true" }
    return { [columnId]: raw } as Partial<TradeFormData>
  }

  function saveAndClose(value: string) {
    const rowId = editingCell?.rowId
    const columnId = editingCell?.columnId
    setEditingCell(null)

    if (!rowId || !columnId) return

    if (customColumnIds.has(columnId)) {
      // Merge into custom_data — never pollutes built-in fields
      if (rowId.startsWith("new-")) {
        const idx = parseInt(rowId.slice(4))
        const existing = draftRowsRef.current.get(idx) ?? {
          id: null,
          fields: {},
          filledFields: [],
          sortOrder: 0,
        }
        const mergedCustomData = {
          ...(existing.fields.custom_data ?? {}),
          [columnId]: value,
        }
        setDraftRows((prev) => {
          const curr = prev.get(idx) ?? {
            id: null,
            fields: {},
            filledFields: [],
            sortOrder: 0,
          }
          return new Map(prev).set(idx, {
            ...curr,
            fields: { ...curr.fields, custom_data: mergedCustomData },
          })
        })
        if (!value.trim()) return
        const patchFields = { custom_data: mergedCustomData }
        if (existing.id) {
          onPatchTrade(existing.id, patchFields)
        } else {
          onCreateTrade().then((newTrade) => {
            if (!newTrade) return
            setDraftRows((prev) => {
              const curr = prev.get(idx) ?? {
                id: null,
                fields: {},
                filledFields: [],
                sortOrder: 0,
              }
              return new Map(prev).set(idx, { ...curr, id: newTrade.id, sortOrder: newTrade.sort_order })
            })
            onPatchTrade(newTrade.id, patchFields)
          })
        }
      } else {
        const trade = trades.find((t) => t.id === rowId)
        const mergedCustomData = {
          ...(trade?.custom_data ?? {}),
          [columnId]: value,
        }
        onPatchTrade(rowId, { custom_data: mergedCustomData })
      }
      return
    }

    const isEmpty = !value.trim()
    const fields = parseFieldForSave(columnId, value)
    const isRequiredNumeric = [
      "avg_entry",
      "stop_loss",
      "avg_exit",
      "risk",
    ].includes(columnId)
    const isOptionalNumeric = ["realised_win", "realised_loss"].includes(
      columnId
    )
    const isNumericColumn = isRequiredNumeric || isOptionalNumeric
    const counterpart =
      columnId === "realised_win"
        ? "realised_loss"
        : columnId === "realised_loss"
          ? "realised_win"
          : null

    if (rowId.startsWith("new-")) {
      const idx = parseInt(rowId.slice(4))
      const existing = draftRowsRef.current.get(idx) ?? {
        id: null,
        fields: {},
        filledFields: [],
        sortOrder: 0,
      }
      const newFilledFields = isEmpty
        ? existing.filledFields.filter((f) => f !== columnId)
        : [
            ...new Set([
              ...existing.filledFields.filter((f) => f !== counterpart),
              columnId,
            ]),
          ]
      setDraftRows((prev) => {
        const curr = prev.get(idx) ?? { id: null, fields: {}, filledFields: [], sortOrder: 0 }
        const newFields = { ...curr.fields }
        if (isEmpty && isNumericColumn) {
          delete (newFields as Record<string, unknown>)[columnId]
        } else {
          Object.assign(newFields, fields)
          // Entering one of the pair clears the other
          if (counterpart && !isEmpty)
            delete (newFields as Record<string, unknown>)[counterpart]
        }
        return new Map(prev).set(idx, {
          ...curr,
          fields: newFields,
          filledFields: newFilledFields,
        })
      })
      if (isEmpty) {
        // Still persist the clearing to DB so it survives a reload
        if (existing.id) {
          const clearFields: Partial<TradeFormData> = {
            draft_fields: newFilledFields,
          }
          if (isOptionalNumeric) {
            // Can be nulled in DB
            ;(clearFields as Record<string, unknown>)[columnId] = null
            if (counterpart)
              (clearFields as Record<string, unknown>)[counterpart] = null
          } else if (!isRequiredNumeric) {
            // Text/other — save empty value
            Object.assign(clearFields, fields)
          }
          // Required numerics: only update draft_fields; can't store null in a NOT NULL column
          onPatchTrade(existing.id, clearFields)
        }
        return
      }
      const patchFields = {
        ...fields,
        ...(counterpart ? { [counterpart]: null } : {}),
        draft_fields: newFilledFields,
      }
      if (existing.id) {
        onPatchTrade(existing.id, patchFields)
      } else {
        onCreateTrade().then((newTrade) => {
          if (!newTrade) return
          setDraftRows((prev) => {
            const curr = prev.get(idx) ?? {
              id: null,
              fields: {},
              filledFields: [],
              sortOrder: 0,
            }
            return new Map(prev).set(idx, { ...curr, id: newTrade.id, sortOrder: newTrade.sort_order })
          })
          onPatchTrade(newTrade.id, patchFields)
        })
      }
    } else {
      // Clearing a required numeric field on a real trade reverts to old value — don't save
      if (isEmpty && isRequiredNumeric) return
      // Clearing an optional numeric field saves null (removes the override)
      const saveFields =
        isEmpty && isOptionalNumeric
          ? ({ [columnId]: null } as Partial<TradeFormData>)
          : ({
              ...fields,
              ...(counterpart && !isEmpty ? { [counterpart]: null } : {}),
            } as Partial<TradeFormData>)
      onPatchTrade(rowId, saveFields)
    }
  }

  function validateAndCommit(value?: string) {
    const columnId = editingCell?.columnId
    if (!columnId) return
    const fmt = resolveFormatType(columnId)
    const raw = value ?? editValue
    if ((fmt === "number" || fmt === "currency") && raw.trim() !== "") {
      const num = Number(raw.replace(/,/g, ""))
      if (isNaN(num)) {
        toast.error(t("trades.cell.invalidNumber"))
        setEditValue("")
        setEditingCell(null)
        return
      }
    }
    saveAndClose(raw)
  }

  const handleOpenColumnSettings = useCallback(
    (columnId: string, label: string, description: string) => {
      const isCustom = customColumnIds.has(columnId)
      const existing = columnSettings.find((s) => s.column_id === columnId)
      const format_type: FormatType =
        (existing?.format_type as FormatType) ??
        BUILT_IN_FORMAT_TYPES[columnId] ??
        "auto"
      const isDropdown = format_type === "dropdown"
      setSettingsTarget({
        columnId,
        label,
        description,
        format_type,
        initialOptions: isDropdown ? resolveOptions(columnId) : undefined,
        isBuiltIn: !isCustom,
        is_formula: existing?.is_formula,
        formula: existing?.formula,
      })
    },
    [columnSettings, columnOptions]
  ) // eslint-disable-line react-hooks/exhaustive-deps

  function getHeaderLabel(columnId: string): string {
    const override = columnSettings.find((s) => s.column_id === columnId)
    if (override) return override.name
    const map: Record<string, string> = {
      trade_number: t("trades.columns.number"),
      trade_date: t("trades.columns.date"),
      trade_time: t("trades.columns.time"),
      ticker: t("trades.columns.ticker"),
      direction: t("trades.columns.direction"),
      order_type: t("trades.columns.orderType"),
      avg_entry: t("trades.columns.avgEntry"),
      stop_loss: t("trades.columns.stopLoss"),
      avg_exit: t("trades.columns.avgExit"),
      risk: t("trades.columns.risk"),
      realised_loss: t("trades.columns.realisedLoss"),
      realised_win: t("trades.columns.realisedWin"),
      deviation: t("trades.columns.deviation"),
      r_multiple: t("trades.columns.rMultiple"),
      risk_volatility: t("trades.columns.riskVolatility"),
      cumulative_pnl: t("trades.columns.cumulativePnl"),
      cumulative_r: t("trades.columns.cumulativeR"),
      rules_followed: t("trades.columns.rulesFollowed"),
      setup_type: t("trades.columns.setupType"),
    }
    return map[columnId] ?? columnId
  }

  const builtInColumns = useMemo<ColumnDef<EnrichedTrade>[]>(
    () => [
      {
        accessorKey: "trade_number",
        header: () => t("trades.columns.number"),
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {rankMapRef.current.get(row.original.id) ??
              row.original.trade_number}
          </span>
        ),
      },
      {
        accessorKey: "trade_date",
        header: () => (
          <HeaderCell
            label={t("trades.columns.date")}
            tooltip={t("trades.columnTooltips.date")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "trade_date",
                t("trades.columns.date"),
                t("trades.columnTooltips.date")
              )
            }
          />
        ),
        cell: ({ getValue }) => fmtDate(getValue<string>()),
      },
      {
        accessorKey: "trade_time",
        header: () => (
          <HeaderCell
            label={t("trades.columns.time")}
            tooltip={t("trades.columnTooltips.time")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "trade_time",
                t("trades.columns.time"),
                t("trades.columnTooltips.time")
              )
            }
          />
        ),
        cell: ({ getValue }) =>
          fmtTime(
            getValue<string>(),
            resolveFormatType("trade_time") === "time24"
          ),
      },
      {
        accessorKey: "ticker",
        header: () => (
          <HeaderCell
            label={t("trades.columns.ticker")}
            tooltip={t("trades.columnTooltips.ticker")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "ticker",
                t("trades.columns.ticker"),
                t("trades.columnTooltips.ticker")
              )
            }
          />
        ),
      },
      {
        accessorKey: "direction",
        header: () => (
          <HeaderCell
            label={t("trades.columns.direction")}
            tooltip={t("trades.columnTooltips.direction")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "direction",
                t("trades.columns.direction"),
                t("trades.columnTooltips.direction")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<string>()
          return (
            <span
              className={
                v === "long"
                  ? "font-medium text-green-600 dark:text-green-400"
                  : "font-medium text-red-500"
              }
            >
              {t(`trades.direction.${v}`)}
            </span>
          )
        },
      },
      {
        accessorKey: "order_type",
        header: () => (
          <HeaderCell
            label={t("trades.columns.orderType")}
            tooltip={t("trades.columnTooltips.orderType")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "order_type",
                t("trades.columns.orderType"),
                t("trades.columnTooltips.orderType")
              )
            }
          />
        ),
        cell: ({ getValue }) => t(`trades.orderType.${getValue<string>()}`),
      },
      {
        accessorKey: "avg_entry",
        header: () => (
          <HeaderCell
            label={t("trades.columns.avgEntry")}
            tooltip={t("trades.columnTooltips.avgEntry")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "avg_entry",
                t("trades.columns.avgEntry"),
                t("trades.columnTooltips.avgEntry")
              )
            }
          />
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {fmtCurrency(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "stop_loss",
        header: () => (
          <HeaderCell
            label={t("trades.columns.stopLoss")}
            tooltip={t("trades.columnTooltips.stopLoss")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "stop_loss",
                t("trades.columns.stopLoss"),
                t("trades.columnTooltips.stopLoss")
              )
            }
          />
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {fmtCurrency(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "avg_exit",
        header: () => (
          <HeaderCell
            label={t("trades.columns.avgExit")}
            tooltip={t("trades.columnTooltips.avgExit")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "avg_exit",
                t("trades.columns.avgExit"),
                t("trades.columnTooltips.avgExit")
              )
            }
          />
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {fmtCurrency(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "risk",
        header: () => (
          <HeaderCell
            label={t("trades.columns.risk")}
            tooltip={t("trades.columnTooltips.risk")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "risk",
                t("trades.columns.risk"),
                t("trades.columnTooltips.risk")
              )
            }
          />
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {fmtCurrency(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "realised_loss",
        header: () => (
          <HeaderCell
            label={t("trades.columns.realisedLoss")}
            tooltip={t("trades.columnTooltips.realisedLoss")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "realised_loss",
                t("trades.columns.realisedLoss"),
                t("trades.columnTooltips.realisedLoss")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return null
          return (
            <span className="text-red-500 tabular-nums">{fmtCurrency(v)}</span>
          )
        },
      },
      {
        accessorKey: "realised_win",
        header: () => (
          <HeaderCell
            label={t("trades.columns.realisedWin")}
            tooltip={t("trades.columnTooltips.realisedWin")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "realised_win",
                t("trades.columns.realisedWin"),
                t("trades.columnTooltips.realisedWin")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return null
          return (
            <span className="text-green-600 tabular-nums dark:text-green-400">
              {fmtCurrency(v)}
            </span>
          )
        },
      },
      {
        id: "deviation",
        accessorFn: (row) => {
          const v = row.custom_data?.["deviation"]
          return v != null ? parseFloat(v) : null
        },
        header: () => (
          <HeaderCell
            label={t("trades.columns.deviation")}
            tooltip={t("trades.columnTooltips.deviation")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "deviation",
                t("trades.columns.deviation"),
                t("trades.columnTooltips.deviation")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null)
            return (
              <Code2 className="mx-auto size-4 text-muted-foreground/40" />
            )
          return <span className="tabular-nums">{fmtPercent(v)}</span>
        },
      },
      {
        id: "r_multiple",
        accessorFn: (row) => {
          const v = row.custom_data?.["r_multiple"]
          return v != null ? parseFloat(v) : null
        },
        header: () => (
          <HeaderCell
            label={t("trades.columns.rMultiple")}
            tooltip={t("trades.columnTooltips.rMultiple")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "r_multiple",
                t("trades.columns.rMultiple"),
                t("trades.columnTooltips.rMultiple")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null)
            return (
              <Code2 className="mx-auto size-4 text-muted-foreground/40" />
            )
          return (
            <span
              className={`font-medium tabular-nums ${
                v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"
              }`}
            >
              {v.toFixed(2)}
            </span>
          )
        },
      },
      {
        id: "risk_volatility",
        accessorFn: (row) => {
          const v = row.custom_data?.["risk_volatility"]
          return v != null ? parseFloat(v) : null
        },
        header: () => (
          <HeaderCell
            label={t("trades.columns.riskVolatility")}
            tooltip={t("trades.columnTooltips.riskVolatility")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "risk_volatility",
                t("trades.columns.riskVolatility"),
                t("trades.columnTooltips.riskVolatility")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null)
            return (
              <Code2 className="mx-auto size-4 text-muted-foreground/40" />
            )
          return <span className="tabular-nums">{fmtPercent(v)}</span>
        },
      },
      {
        id: "cumulative_pnl",
        accessorFn: (row) => {
          const v = row.custom_data?.["cumulative_pnl"]
          return v != null ? parseFloat(v) : null
        },
        header: () => (
          <HeaderCell
            label={t("trades.columns.cumulativePnl")}
            tooltip={t("trades.columnTooltips.cumulativePnl")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "cumulative_pnl",
                t("trades.columns.cumulativePnl"),
                t("trades.columnTooltips.cumulativePnl")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null)
            return (
              <Code2 className="mx-auto size-4 text-muted-foreground/40" />
            )
          return (
            <span
              className={`font-medium tabular-nums ${
                v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"
              }`}
            >
              {(v >= 0 ? "+" : "") + fmtCurrency(Math.abs(v))}
            </span>
          )
        },
      },
      {
        id: "cumulative_r",
        accessorFn: (row) => {
          const v = row.custom_data?.["cumulative_r"]
          return v != null ? parseFloat(v) : null
        },
        header: () => (
          <HeaderCell
            label={t("trades.columns.cumulativeR")}
            tooltip={t("trades.columnTooltips.cumulativeR")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "cumulative_r",
                t("trades.columns.cumulativeR"),
                t("trades.columnTooltips.cumulativeR")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null)
            return (
              <Code2 className="mx-auto size-4 text-muted-foreground/40" />
            )
          return (
            <span
              className={`font-medium tabular-nums ${
                v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"
              }`}
            >
              {v.toFixed(2)}
            </span>
          )
        },
      },
      {
        accessorKey: "rules_followed",
        header: () => (
          <HeaderCell
            label={t("trades.columns.rulesFollowed")}
            tooltip={t("trades.columnTooltips.rulesFollowed")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "rules_followed",
                t("trades.columns.rulesFollowed"),
                t("trades.columnTooltips.rulesFollowed")
              )
            }
          />
        ),
        cell: ({ getValue }) => {
          const v = getValue<boolean>()
          return (
            <span
              className={
                v ? "text-green-600 dark:text-green-400" : "text-red-500"
              }
            >
              {t(v ? "trades.form.rulesYes" : "trades.form.rulesNo")}
            </span>
          )
        },
      },
      {
        accessorKey: "setup_type",
        header: () => (
          <HeaderCell
            label={t("trades.columns.setupType")}
            tooltip={t("trades.columnTooltips.setupType")}
            onOpenSettings={() =>
              handleOpenColumnSettings(
                "setup_type",
                t("trades.columns.setupType"),
                t("trades.columnTooltips.setupType")
              )
            }
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, handleOpenColumnSettings]
  )

  const columns = useMemo<ColumnDef<EnrichedTrade>[]>(
    () => [
      ...builtInColumns,
      ...customColumns.map<ColumnDef<EnrichedTrade>>((s) => ({
        id: s.column_id,
        accessorFn: (row) => row.custom_data?.[s.column_id] ?? "",
        header: () => (
          <HeaderCell
            label={s.name}
            tooltip={s.description ?? ""}
            isFormula={s.is_formula}
            onOpenSettings={() =>
              handleOpenColumnSettings(s.column_id, s.name, s.description ?? "")
            }
          />
        ),
        cell: ({ getValue }) => {
          const raw = getValue<string>()
          if (!raw) return null
          return <span className="text-sm tabular-nums">{fmtCustomCell(raw, s.format_type)}</span>
        },
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [builtInColumns, customColumns]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = displayColumnOrder.indexOf(active.id as string)
    const newIndex = displayColumnOrder.indexOf(over.id as string)
    const next = arrayMove(displayColumnOrder, oldIndex, newIndex)
    setColumnOrder(next)
    onColumnReorder(next.filter((id) => id !== PINNED_COLUMN))
  }

  const table = useReactTable({
    data: trades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnOrder: displayColumnOrder, columnVisibility },
    onColumnOrderChange: setColumnOrder,
  })

  function renderCellMenuContent(
    copyText: string,
    tradeItems: React.ReactNode | null,
    columnId: string,
    forceColumnActionsDisabled = false,
  ) {
    const isCustom = !forceColumnActionsDisabled && customColumnIds.has(columnId)
    return (
      <>
        <ContextMenuItem
          onClick={() => navigator.clipboard.writeText(copyText)}
        >
          <Copy className="size-4" />
          {t("trades.cell.copy")}
        </ContextMenuItem>
        {tradeItems != null && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel>{t("trades.cell.sectionTrade")}</ContextMenuLabel>
            {tradeItems}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuLabel>{t("trades.cell.sectionColumn")}</ContextMenuLabel>
        <ContextMenuItem
          disabled={REQUIRED_COLUMNS.has(columnId)}
          onClick={() => onHideColumn(columnId)}
        >
          <EyeOff className="size-4" />
          {t("trades.columns.hide")}
        </ContextMenuItem>
        {isCustom ? (
          <ContextMenuItem
            onClick={() => {
              const s = customColumns.find((c) => c.column_id === columnId)
              if (s)
                handleOpenColumnSettings(
                  s.column_id,
                  s.name,
                  s.description ?? ""
                )
            }}
          >
            <Pencil className="size-4" />
            {t("trades.columns.rename")}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem disabled>
            <Pencil className="size-4" />
            {t("trades.columns.rename")}
          </ContextMenuItem>
        )}
        {isCustom ? (
          <ContextMenuItem
            variant="destructive"
            onClick={() => {
              const setting = customColumns.find(
                (s) => s.column_id === columnId
              )
              setDeleteTarget({
                id: columnId,
                name: setting?.name ?? columnId,
              })
            }}
          >
            <Trash2 className="size-4" />
            {t("trades.columns.delete")}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem disabled variant="destructive">
            <Trash2 className="size-4" />
            {t("trades.columns.delete")}
          </ContextMenuItem>
        )}
      </>
    )
  }

  function renderBodyCell(
    key: string,
    cell: {
      isPinned: boolean
      isEditing: boolean
      columnId: string
      content: React.ReactNode
      onDoubleClick: () => void
    },
    menu: {
      copyText: string
      tradeItems: React.ReactNode | null
      forceColumnActionsDisabled?: boolean
    }
  ) {
    const isDropdown = isDropdownColumn(cell.columnId)
    return (
      <ContextMenu key={key}>
        <ContextMenuTrigger asChild>
          <TableCell
            className={cn(
              cell.isPinned && "sticky inset-s-0 z-10 w-12.5 min-w-12.5 bg-background",
              cell.isPinned && scrolledX && colShadow,
              !cell.isPinned && cell.isEditing && "ring-1 ring-primary ring-inset",
              !cell.isPinned && cell.isEditing && cell.columnId !== "trade_date" && !isDropdown && "p-0",
              !cell.isPinned && cell.isEditing && (cell.columnId === "trade_date" || isDropdown) && "cursor-default select-none"
            )}
            onDoubleClick={cell.isPinned ? undefined : cell.onDoubleClick}
          >
            {cell.isPinned && (
              <span className="pointer-events-none absolute inset-0 group-hover:bg-muted/50 group-has-aria-expanded:bg-muted/50" />
            )}
            <span className={cell.isPinned ? "relative" : undefined}>{cell.content}</span>
          </TableCell>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {renderCellMenuContent(
            menu.copyText,
            menu.tradeItems,
            cell.columnId,
            menu.forceColumnActionsDisabled
          )}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <TooltipProvider>
      <div className="bg-background">
        <DndContext
          id="trades-table-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table containerClassName="overflow-visible">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  <SortableContext
                    items={displayColumnOrder.filter(
                      (id) => id !== PINNED_COLUMN
                    )}
                    strategy={horizontalListSortingStrategy}
                  >
                    {hg.headers.map((h) => {
                      const isPinned = h.column.id === PINNED_COLUMN
                      const headClassName = cn(
                        "sticky top-0 z-10 border-t bg-background",
                        scrolledY && rowShadow,
                        isPinned && "inset-s-0 z-20 w-12.5 min-w-12.5",
                        !isPinned && "min-w-20",
                        isPinned && scrolledX && colShadow
                      )
                      if (isPinned) {
                        return (
                          <TableHead key={h.id} className={headClassName}>
                            {flexRender(
                              h.column.columnDef.header,
                              h.getContext()
                            )}
                          </TableHead>
                        )
                      }
                      return (
                        <ContextMenu key={h.id}>
                          <DraggableHeader
                            id={h.column.id}
                            className={headClassName}
                          >
                            <ContextMenuTrigger asChild>
                              <span className="flex w-full items-center">
                                {flexRender(
                                  h.column.columnDef.header,
                                  h.getContext()
                                )}
                              </span>
                            </ContextMenuTrigger>
                          </DraggableHeader>
                          <ContextMenuContent>
                            {renderCellMenuContent(
                              getHeaderLabel(h.column.id),
                              null,
                              h.column.id
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      )
                    })}
                  </SortableContext>
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {mergedRows.map((item) => {
                // ── Real trade row ────────────────────────────────────────────────
                if (item.type === "real") {
                  const row = table
                    .getRowModel()
                    .rows.find((r) => r.original.id === item.trade.id)
                  if (!row) return null
                  const rank =
                    rankMap.get(item.trade.id) ?? item.trade.trade_number
                  return (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => {
                        const isPinned = cell.column.id === PINNED_COLUMN
                        const isEditing =
                          editingCell?.rowId === row.id &&
                          editingCell?.columnId === cell.column.id
                        const rawVal = cell.getValue()
                        const copyText =
                          typeof rawVal === "boolean"
                            ? rawVal
                              ? t("trades.form.rulesYes")
                              : t("trades.form.rulesNo")
                            : String(rawVal ?? "")
                        const cellContent =
                          isEditing && cell.column.id === "trade_date" ? (
                            <>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                              <DateCellEditor
                                value={editValue}
                                open
                                onClose={cancelEdit}
                                onCommit={saveAndClose}
                              />
                            </>
                          ) : isEditing && isDropdownColumn(cell.column.id) ? (
                            <>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                              <MenuCellEditor
                                value={editValue}
                                options={resolveOptions(cell.column.id)}
                                onClose={cancelEdit}
                                onCommit={saveAndClose}
                              />
                            </>
                          ) : isEditing ? (
                            <input
                              autoFocus
                              type={
                                cell.column.id === "trade_time"
                                  ? "time"
                                  : "text"
                              }
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => validateAndCommit()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") validateAndCommit()
                                if (e.key === "Escape") cancelEdit()
                              }}
                              size={1}
                              className="h-full w-full bg-transparent px-2 text-center text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                            />
                          ) : (
                            flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )
                          )

                        return renderBodyCell(
                          cell.id,
                          {
                            isPinned,
                            isEditing,
                            columnId: cell.column.id,
                            content: cellContent,
                            onDoubleClick: () => handleCellDoubleClick(row.id, cell.column.id, cell.getValue()),
                          },
                          {
                            copyText,
                            tradeItems: (
                              <>
                                <ContextMenuItem onClick={() => handleInsertTrade(row.original.id, "before")}>
                                  <ArrowUp className="size-4" />
                                  {t("trades.insertTradeBefore")}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleInsertTrade(row.original.id, "after")}>
                                  <ArrowDown className="size-4" />
                                  {t("trades.insertTradeAfter")}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => onDuplicateTrade(row.original.id)}>
                                  <Files className="size-4" />
                                  {t("trades.duplicateTrade")}
                                </ContextMenuItem>
                                <ContextMenuItem
                                  variant="destructive"
                                  onClick={() => setTradeDeleteTarget({ id: row.original.id, number: rank })}
                                >
                                  <Trash2 className="size-4" />
                                  {t("trades.deleteTrade", { number: rank })}
                                </ContextMenuItem>
                              </>
                            ),
                          }
                        )
                      })}
                    </TableRow>
                  )
                }

                // ── Saved draft row ───────────────────────────────────────────────
                if (item.type === "draft") {
                  const { idx, draft } = item
                  const rowId = `new-${idx}`
                  const rank = rankMap.get(draft.id!) ?? idx + 1
                  const df = draft.fields
                  const draftRaw: RawTrade = {
                    id: draft.id!,
                    patch_id: "",
                    trade_number: rank,
                    sort_order: draft.sortOrder,
                    trade_date: df.trade_date ?? new Date().toISOString().split("T")[0],
                    trade_time: df.trade_time ?? "00:00:00",
                    ticker: df.ticker ?? "",
                    direction: "long",
                    order_type: df.order_type ?? "market",
                    avg_entry: df.avg_entry ?? 0,
                    stop_loss: df.stop_loss ?? 0,
                    avg_exit: df.avg_exit ?? 0,
                    risk: df.risk ?? 0,
                    rules_followed: df.rules_followed ?? false,
                    setup_type: df.setup_type ?? "",
                    realised_win: df.realised_win ?? null,
                    realised_loss: df.realised_loss ?? null,
                    created_at: "",
                    updated_at: "",
                  }
                  const allForEnrich = [...(trades as unknown as RawTrade[]), draftRaw]
                  const enrichedDraft = enrichTrades(allForEnrich, formulaColumns)[allForEnrich.length - 1]
                  const hasPrices = draftRaw.avg_entry > 0 && draftRaw.stop_loss > 0 && draftRaw.avg_exit > 0
                  return (
                    <TableRow key={rowId}>
                      {table.getVisibleLeafColumns().map((col) => {
                        const isPinned = col.id === PINNED_COLUMN
                        const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === col.id
                        const draftCellContent =
                          isEditing && col.id === "trade_date" ? (
                            <DateCellEditor value={editValue} open onClose={cancelEdit} onCommit={saveAndClose} />
                          ) : isEditing && isDropdownColumn(col.id) ? (
                            <MenuCellEditor value={editValue} options={resolveOptions(col.id)} onClose={cancelEdit} onCommit={saveAndClose} />
                          ) : isEditing ? (
                            <input
                              autoFocus
                              type={col.id === "trade_time" ? "time" : "text"}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => validateAndCommit()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") validateAndCommit()
                                if (e.key === "Escape") cancelEdit()
                              }}
                              size={1}
                              className="h-full w-full bg-transparent px-2 text-center text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                            />
                          ) : isPinned ? (
                            <span className="font-medium tabular-nums">{rank}</span>
                          ) : (
                            renderDraftCellContent(col.id, df, hasPrices, enrichedDraft)
                          )
                        return renderBodyCell(
                          col.id,
                          {
                            isPinned,
                            isEditing,
                            columnId: col.id,
                            content: draftCellContent,
                            onDoubleClick: () => handleCellDoubleClick(rowId, col.id, ""),
                          },
                          {
                            copyText: getDraftCopyText(col.id, df, hasPrices, enrichedDraft),
                            tradeItems: (
                              <>
                                <ContextMenuItem onClick={() => handleInsertTrade(draft.id!, "before")}>
                                  <ArrowUp className="size-4" />
                                  {t("trades.insertTradeBefore")}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleInsertTrade(draft.id!, "after")}>
                                  <ArrowDown className="size-4" />
                                  {t("trades.insertTradeAfter")}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => onDuplicateTrade(draft.id!)}>
                                  <Files className="size-4" />
                                  {t("trades.duplicateTrade")}
                                </ContextMenuItem>
                                <ContextMenuItem
                                  variant="destructive"
                                  onClick={() => setTradeDeleteTarget({ id: draft.id!, number: rank, draftRowIndex: idx })}
                                >
                                  <Trash2 className="size-4" />
                                  {t("trades.deleteTrade", { number: rank })}
                                </ContextMenuItem>
                              </>
                            ),
                          }
                        )
                      })}
                    </TableRow>
                  )
                }

                // ── Inserted blank row ────────────────────────────────────────────
                const blank = item.blank
                const rowId = `inserted-${blank.localId}`
                const rank = rankMap.get(blank.localId) ?? 0
                const df = blank.fields

                const draftRaw: RawTrade = {
                  id: blank.id ?? `__inserted_${blank.localId}`,
                  patch_id: "",
                  trade_number: rank,
                  sort_order: blank.sortOrder,
                  trade_date:
                    df.trade_date ?? new Date().toISOString().split("T")[0],
                  trade_time: df.trade_time ?? "00:00:00",
                  ticker: df.ticker ?? "",
                  direction: "long",
                  order_type: df.order_type ?? "market",
                  avg_entry: df.avg_entry ?? 0,
                  stop_loss: df.stop_loss ?? 0,
                  avg_exit: df.avg_exit ?? 0,
                  risk: df.risk ?? 0,
                  rules_followed: df.rules_followed ?? false,
                  setup_type: df.setup_type ?? "",
                  realised_win: df.realised_win ?? null,
                  realised_loss: df.realised_loss ?? null,
                  created_at: "",
                  updated_at: "",
                }
                const allForEnrich = [
                  ...(trades as unknown as RawTrade[]),
                  draftRaw,
                ]
                const enrichedBlank =
                  enrichTrades(allForEnrich, formulaColumns)[allForEnrich.length - 1]
                const hasPrices =
                  draftRaw.avg_entry > 0 &&
                  draftRaw.stop_loss > 0 &&
                  draftRaw.avg_exit > 0

                return (
                  <TableRow key={rowId}>
                    {table.getVisibleLeafColumns().map((col) => {
                      const isPinned = col.id === PINNED_COLUMN
                      const isEditing =
                        editingCell?.rowId === rowId &&
                        editingCell?.columnId === col.id
                      const cellContent =
                        isEditing && col.id === "trade_date" ? (
                          <>
                            {renderDraftCellContent(
                              col.id,
                              df,
                              hasPrices,
                              enrichedBlank
                            )}
                            <DateCellEditor
                              value={editValue}
                              open
                              onClose={cancelEdit}
                              onCommit={(v) =>
                                saveAndCloseInserted(blank.localId, col.id, v)
                              }
                            />
                          </>
                        ) : isEditing && isDropdownColumn(col.id) ? (
                          <>
                            {renderDraftCellContent(
                              col.id,
                              df,
                              hasPrices,
                              enrichedBlank
                            )}
                            <MenuCellEditor
                              value={editValue}
                              options={resolveOptions(col.id)}
                              onClose={cancelEdit}
                              onCommit={(v) =>
                                saveAndCloseInserted(blank.localId, col.id, v)
                              }
                            />
                          </>
                        ) : isEditing ? (
                          <input
                            autoFocus
                            type={col.id === "trade_time" ? "time" : "text"}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() =>
                              validateAndCommitInserted(blank.localId, col.id)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                validateAndCommitInserted(blank.localId, col.id)
                              if (e.key === "Escape") cancelEdit()
                            }}
                            size={1}
                            className="h-full w-full bg-transparent px-2 text-center text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                          />
                        ) : isPinned ? (
                          <span className="font-medium tabular-nums">
                            {rank}
                          </span>
                        ) : (
                          renderDraftCellContent(
                            col.id,
                            df,
                            hasPrices,
                            enrichedBlank
                          )
                        )

                      return renderBodyCell(
                        col.id,
                        {
                          isPinned,
                          isEditing,
                          columnId: col.id,
                          content: cellContent,
                          onDoubleClick: () => handleCellDoubleClick(rowId, col.id, ""),
                        },
                        {
                          copyText: getDraftCopyText(col.id, df, hasPrices, enrichedBlank),
                          tradeItems: (
                            <>
                              <ContextMenuItem onClick={() => insertBlankAtSortOrder(blank.sortOrder, "before")}>
                                <ArrowUp className="size-4" />
                                {t("trades.insertTradeBefore")}
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => insertBlankAtSortOrder(blank.sortOrder, "after")}>
                                <ArrowDown className="size-4" />
                                {t("trades.insertTradeAfter")}
                              </ContextMenuItem>
                              <ContextMenuItem
                                variant="destructive"
                                onClick={async () => {
                                  if (blank.id) await onDeleteTrade(blank.id)
                                  setInsertedBlanks((prev) => prev.filter((b) => b.localId !== blank.localId))
                                }}
                              >
                                <Trash2 className="size-4" />
                                {t("trades.deleteTrade", { number: rank })}
                              </ContextMenuItem>
                            </>
                          ),
                          forceColumnActionsDisabled: true,
                        }
                      )
                    })}
                  </TableRow>
                )
              })}

              {/* Blank new-trade rows — only unsaved slots (saved drafts are in mergedRows) */}
              {(() => {
                let bottomRank = mergedRows.length
                let bottomIndex = -1
                const maxSavedSortOrder = mergedRows.reduce((max, item) => {
                  const s = item.type === "real" ? item.trade.sort_order : item.type === "draft" ? item.draft.sortOrder : item.blank.sortOrder
                  return Math.max(max, s)
                }, 0)
                return Array.from({ length: blankRowCount }, (_, i) => {
                const rowId = `new-${i}`
                const draft = draftRows.get(i)
                // Skip saved drafts — they are rendered in the mergedRows loop above
                if (draft?.id) return null
                bottomRank++
                bottomIndex++
                const rank = bottomRank
                const virtualSortOrder = maxSavedSortOrder + bottomIndex + 1
                const df = draft?.fields ?? {}

                const draftRaw: RawTrade = {
                  id: `__draft_${i}`,
                  patch_id: "",
                  trade_number: rank,
                  sort_order: 0,
                  trade_date:
                    df.trade_date ?? new Date().toISOString().split("T")[0],
                  trade_time: df.trade_time ?? "00:00:00",
                  ticker: df.ticker ?? "",
                  direction: "long",
                  order_type: df.order_type ?? "market",
                  avg_entry: df.avg_entry ?? 0,
                  stop_loss: df.stop_loss ?? 0,
                  avg_exit: df.avg_exit ?? 0,
                  risk: df.risk ?? 0,
                  rules_followed: df.rules_followed ?? false,
                  setup_type: df.setup_type ?? "",
                  realised_win: df.realised_win ?? null,
                  realised_loss: df.realised_loss ?? null,
                  created_at: "",
                  updated_at: "",
                }
                const allForEnrich = [
                  ...(trades as unknown as RawTrade[]),
                  draftRaw,
                ]
                const enrichedDraft =
                  enrichTrades(allForEnrich, formulaColumns)[allForEnrich.length - 1]
                const hasPrices =
                  draftRaw.avg_entry > 0 &&
                  draftRaw.stop_loss > 0 &&
                  draftRaw.avg_exit > 0

                return (
                  <TableRow key={rowId}>
                    {table.getVisibleLeafColumns().map((col) => {
                      const isPinned = col.id === PINNED_COLUMN
                      const isEditing =
                        editingCell?.rowId === rowId &&
                        editingCell?.columnId === col.id
                      const draftCellContent =
                        isEditing && col.id === "trade_date" ? (
                          <DateCellEditor
                            value={editValue}
                            open
                            onClose={cancelEdit}
                            onCommit={saveAndClose}
                          />
                        ) : isEditing && isDropdownColumn(col.id) ? (
                          <MenuCellEditor
                            value={editValue}
                            options={resolveOptions(col.id)}
                            onClose={cancelEdit}
                            onCommit={saveAndClose}
                          />
                        ) : isEditing ? (
                          <input
                            autoFocus
                            type={col.id === "trade_time" ? "time" : "text"}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => validateAndCommit()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") validateAndCommit()
                              if (e.key === "Escape") cancelEdit()
                            }}
                            size={1}
                            className="h-full w-full bg-transparent px-2 text-center text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                          />
                        ) : isPinned ? (
                          <span className="font-medium tabular-nums">
                            {rank}
                          </span>
                        ) : (
                          renderDraftCellContent(
                            col.id,
                            df,
                            hasPrices,
                            enrichedDraft
                          )
                        )

                      return renderBodyCell(
                        col.id,
                        {
                          isPinned,
                          isEditing,
                          columnId: col.id,
                          content: draftCellContent,
                          onDoubleClick: () => handleCellDoubleClick(rowId, col.id, ""),
                        },
                        {
                          copyText: getDraftCopyText(col.id, df, hasPrices, enrichedDraft),
                          tradeItems: (
                            <>
                              <ContextMenuItem onClick={() => insertBlankAtSortOrder(virtualSortOrder, "before")}>
                                <ArrowUp className="size-4" />
                                {t("trades.insertTradeBefore")}
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => insertBlankAtSortOrder(virtualSortOrder, "after")}>
                                <ArrowDown className="size-4" />
                                {t("trades.insertTradeAfter")}
                              </ContextMenuItem>
                              {draft?.id && (
                                <ContextMenuItem onClick={() => onDuplicateTrade(draft.id!)}>
                                  <Files className="size-4" />
                                  {t("trades.duplicateTrade")}
                                </ContextMenuItem>
                              )}
                              <ContextMenuItem
                                variant="destructive"
                                onClick={() => setTradeDeleteTarget({ id: draft?.id ?? null, number: rank, draftRowIndex: i })}
                              >
                                <Trash2 className="size-4" />
                                {t("trades.deleteTrade", { number: rank })}
                              </ContextMenuItem>
                            </>
                          ),
                        }
                      )
                    })}
                  </TableRow>
                )
              })
              })()}

              {/* Add Trade row — colSpan fills the table width; sticky div inside keeps text pinned to the start */}
              <TableRow
                className="group cursor-pointer border-t border-b border-[--color-border]"
                onClick={() => setBlankRowCount((c) => c + 1)}
              >
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="p-0"
                >
                  <div className="sticky inset-s-0 flex w-fit items-center gap-1.5 p-2 text-xs text-muted-foreground group-hover:text-foreground">
                    <Plus className="size-3" />
                    {t("trades.addTrade")} #
                    {mergedRows.length + Array.from(draftRows.values()).filter(d => !d.id).length + 1}
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </DndContext>
      </div>
      <AddColumnDialog
        open={addColumnOpen || !!settingsTarget}
        onOpenChange={(open) => {
          if (!open) {
            setAddColumnOpen(false)
            setSettingsTarget(null)
          }
        }}
        existingFormulaIds={columnSettings.map(s => s.column_id)}
        existingColumnNames={columnSettings.map(s => s.name)}
        initialData={
          settingsTarget
            ? {
                columnId: settingsTarget.columnId,
                name: settingsTarget.label,
                description: settingsTarget.description,
                format_type: settingsTarget.format_type,
                isBuiltIn: settingsTarget.isBuiltIn,
                is_formula: settingsTarget.is_formula,
                formula: settingsTarget.formula,
              }
            : undefined
        }
        initialOptions={settingsTarget?.initialOptions}
        onSaveOptions={onSaveColumnOptions}
        onDeleteRequest={() => {
          if (settingsTarget)
            setDeleteTarget({
              id: settingsTarget.columnId,
              name: settingsTarget.label,
            })
        }}
        onHideRequest={() => {
          if (settingsTarget) onHideColumn(settingsTarget.columnId)
        }}
      />
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogCancel
            size="icon-sm"
            variant="ghost"
            className="absolute inset-e-3 top-3"
          >
            <X className="size-4" />
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("trades.deleteColumnDialog.title", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("trades.deleteColumnDialog.description")}
            </AlertDialogDescription>
            <p className="text-sm text-muted-foreground">
              {t("trades.deleteColumnDialog.hint")}
            </p>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("trades.cancel")}
            </AlertDialogCancel>
            <AlertDialogCancel
              disabled={isDeleting}
              onClick={() => {
                if (deleteTarget) onHideColumn(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              {t("trades.deleteColumnDialog.hide")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={async (e) => {
                e.preventDefault()
                if (!deleteTarget) return
                setIsDeleting(true)
                await deleteColumnSetting(deleteTarget.id)
                setIsDeleting(false)
                setDeleteTarget(null)
                setSettingsTarget(null)
              }}
            >
              <Spinner
                data-icon="inline-start"
                className={isDeleting ? "" : "hidden"}
              />
              {t("trades.deleteColumnDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!tradeDeleteTarget}
        onOpenChange={(open) => {
          if (!open) setTradeDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogCancel
            size="icon-sm"
            variant="ghost"
            className="absolute inset-e-3 top-3"
          >
            <X className="size-4" />
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("trades.deleteConfirmTitle", {
                number: tradeDeleteTarget?.number ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("trades.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTrade}>
              {t("trades.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeletingTrade}
              onClick={async (e) => {
                e.preventDefault()
                if (!tradeDeleteTarget) return
                setIsDeletingTrade(true)
                if (tradeDeleteTarget.id)
                  await onDeleteTrade(tradeDeleteTarget.id)
                setIsDeletingTrade(false)
                if (tradeDeleteTarget.draftRowIndex !== undefined) {
                  const deletedIdx = tradeDeleteTarget.draftRowIndex
                  setDraftRows((prev) => {
                    const next = new Map<number, DraftRow>()
                    for (const [idx, row] of prev) {
                      if (idx < deletedIdx) next.set(idx, row)
                      else if (idx > deletedIdx) next.set(idx - 1, row)
                    }
                    return next
                  })
                  setBlankRowCount((prev) => {
                    const next = Math.max(0, prev - 1)
                    return trades.length === 0 && next === 0 ? 1 : next
                  })
                }
                setTradeDeleteTarget(null)
              }}
            >
              <Spinner
                data-icon="inline-start"
                className={isDeletingTrade ? "" : "hidden"}
              />
              {t("trades.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
