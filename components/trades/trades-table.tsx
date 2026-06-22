"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, addDays, subDays } from 'date-fns'
import { toast } from 'sonner'
import { Copy, EyeOff, Info, Pencil, Plus, Settings2, SquareFunction, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar } from '@/components/ui/calendar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import type { EnrichedTrade, RawTrade, TradeFormData, ColumnSetting, FormatType } from '@/lib/trades/types'
import { enrichTrades } from '@/lib/trades/calculations'
import { PINNED_COLUMN, DEFAULT_COLUMN_ORDER, REQUIRED_COLUMNS, resolveColumnOrder } from '@/lib/trades/column-order'
import { BUILT_IN_FORMAT_TYPES, DEFAULT_MENU_OPTIONS, MENU_COLUMN_IDS } from '@/lib/trades/column-options'
import { deleteColumnSetting } from '@/lib/trades/actions'
import { AddColumnDialog } from './add-column-dialog'

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
  onSaveColumnOptions?: (columnId: string, options: { value: string; label: string }[]) => Promise<void>
  initialDraftTrades?: RawTrade[]
  onCreateTrade: () => Promise<RawTrade | null>
  onPatchTrade: (tradeId: string, fields: Partial<TradeFormData>) => void
  onDeleteTrade: (tradeId: string) => Promise<void>
}

function fmtCurrency(value: number): string {
  return '$' + Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtPercent(value: number): string {
  return value.toFixed(2) + '%'
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const year = y.slice(2)
  return `${d.padStart(2, '0')} ${months[parseInt(m) - 1]} '${year}`
}

function fmtTime(timeStr: string, use24h = false): string {
  const [hStr, mStr] = timeStr.split(':')
  const h = parseInt(hStr)
  if (use24h) return `${String(h).padStart(2, '0')}:${mStr}`
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${String(h12).padStart(2, '0')}:${mStr} ${ampm}`
}

function HeaderCell({
  label,
  tooltip,
  onOpenSettings,
}: {
  label: string
  tooltip: string
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
          <TooltipContent side="bottom" className="max-w-56 flex-col items-start gap-0.5">
            <p className="font-semibold">{label}</p>
            {tooltip
              ? <p>{tooltip}</p>
              : <p className="opacity-60 italic">{t('trades.addColumnDialog.noDescriptionHint')}</p>
            }
          </TooltipContent>
        </Tooltip>
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
        <TooltipContent side="bottom">{t('trades.columns.columnSettings')}</TooltipContent>
      </Tooltip>
    </span>
  )
}

const EDITABLE_COLUMNS = new Set([
  'trade_date', 'trade_time', 'ticker', 'order_type',
  'avg_entry', 'stop_loss', 'avg_exit', 'risk', 'rules_followed', 'setup_type',
  'realised_win', 'realised_loss',
])

const AUTO_GENERATED_COLS = new Set([
  'direction', 'r_multiple',
  'deviation', 'risk_volatility', 'cumulative_pnl', 'cumulative_r',
])

const colShadow = "before:pointer-events-none before:absolute before:inset-y-0 before:start-full before:w-4 before:bg-[linear-gradient(to_right,rgb(0_0_0/0.07),transparent)] rtl:before:bg-[linear-gradient(to_left,rgb(0_0_0/0.07),transparent)] dark:before:bg-[linear-gradient(to_right,rgb(255_255_255/0.1),transparent)] dark:rtl:before:bg-[linear-gradient(to_left,rgb(255_255_255/0.1),transparent)]"
const rowShadow = "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-[linear-gradient(to_bottom,rgb(0_0_0/0.07),transparent)] dark:after:bg-[linear-gradient(to_bottom,rgb(255_255_255/0.1),transparent)]"

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
        cursor: isDragging ? 'grabbing' : 'grab',
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
    onCommit(format(date, 'yyyy-MM-dd'))
  }

  return (
    <Popover open={open} onOpenChange={(o) => { if (!o) onClose() }}>
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
          onSelect={(date) => { if (date) select(date) }}
          captionLayout="dropdown"
          className="w-full"
          classNames={{
            month: 'w-full flex flex-col gap-4',
            dropdown: 'absolute inset-0 opacity-0',
            dropdown_root: 'relative border border-[--color-border] px-2 text-sm h-7 flex items-center',
          }}
        />
        <div className="flex gap-1.5 border-t border-[--color-border] p-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => select(subDays(today, 1))}>
            {t('trades.cell.yesterday')}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => select(today)}>
            {t('trades.cell.today')}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => select(addDays(today, 1))}>
            {t('trades.cell.tomorrow')}
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
    <DropdownMenu open onOpenChange={(open) => { if (!open) onClose() }}>
      <DropdownMenuTrigger asChild>
        <span className="sr-only" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((opt) => (
          <DropdownMenuItem key={opt.value} onSelect={() => onCommit(opt.value)}>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TradesTable({ trades, scrolledX, scrolledY, initialColumnOrder, onColumnReorder, columnVisibility, onHideColumn, columnSettings = [], columnOptions = {}, onSaveColumnOptions, initialDraftTrades = [], onCreateTrade, onPatchTrade, onDeleteTrade }: Props) {
  const { t } = useTranslation()

  const customColumns = columnSettings.filter((s) => s.column_id.startsWith('custom_'))
  const allColumnKeys = [...DEFAULT_COLUMN_ORDER, ...customColumns.map((s) => s.column_id)]

  const [columnOrder, setColumnOrder] = useState<string[]>(() => [PINNED_COLUMN, ...resolveColumnOrder(initialColumnOrder, allColumnKeys)])
  const [addColumnOpen, setAddColumnOpen] = useState(false)

  type SettingsTarget = {
    columnId: string
    label: string
    description: string
    format_type: FormatType
    initialOptions?: { value: string; label: string }[]
    isBuiltIn: boolean
  }
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [tradeDeleteTarget, setTradeDeleteTarget] = useState<{ id: string; number: number; draftRowIndex?: number } | null>(null)
  const [isDeletingTrade, setIsDeletingTrade] = useState(false)

  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [blankRowCount, setBlankRowCount] = useState(() => Math.max(initialDraftTrades.length, trades.length === 0 ? 1 : 0))

  type DraftRow = { id: string | null; fields: Partial<RawTrade>; filledFields: string[] }
  const [draftRows, setDraftRows] = useState<Map<number, DraftRow>>(() => {
    const map = new Map<number, DraftRow>()
    initialDraftTrades.forEach((trade, idx) => {
      const filledFields = trade.draft_fields ?? []
      const fields: Partial<RawTrade> = {}
      for (const key of filledFields) {
        const k = key as keyof RawTrade
        if (trade[k] !== undefined) (fields as Record<string, unknown>)[key] = trade[k]
      }
      if (trade.custom_data && Object.keys(trade.custom_data).length > 0) {
        fields.custom_data = trade.custom_data
      }
      map.set(idx, { id: trade.id, fields, filledFields })
    })
    return map
  })
  const draftRowsRef = useRef<Map<number, DraftRow>>(new Map())
  draftRowsRef.current = draftRows

  // When the last real trade is deleted, ensure at least one blank row remains
  useEffect(() => {
    if (trades.length === 0) setBlankRowCount((prev) => Math.max(prev, 1))
  }, [trades.length])

  function handleCellDoubleClick(rowId: string, columnId: string, currentValue: unknown) {
    const isEditable = EDITABLE_COLUMNS.has(columnId) || columnId.startsWith('custom_')
    if (!isEditable) {
      toast(t('trades.cell.readOnly'))
      return
    }
    setEditingCell({ rowId, columnId })
    if (rowId.startsWith('new-')) {
      const idx = parseInt(rowId.slice(4))
      const draft = draftRowsRef.current.get(idx)
      const draftVal = columnId.startsWith('custom_')
        ? draft?.fields.custom_data?.[columnId]
        : draft?.fields[columnId as keyof RawTrade]
      setEditValue(draftVal != null ? String(draftVal) : '')
    } else {
      setEditValue(String(currentValue ?? ''))
    }
  }

  function cancelEdit() {
    setEditingCell(null)
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function resolveOptions(columnId: string) {
    return columnOptions[columnId] ?? DEFAULT_MENU_OPTIONS[columnId] ?? []
  }

  function isDropdownColumn(columnId: string): boolean {
    return MENU_COLUMN_IDS.has(columnId) || (columnOptions[columnId]?.length ?? 0) > 0
  }

  function resolveFormatType(columnId: string): FormatType {
    const saved = columnSettings.find((s) => s.column_id === columnId)
    return (saved?.format_type as FormatType) ?? BUILT_IN_FORMAT_TYPES[columnId] ?? 'auto'
  }

  function parseFieldForSave(columnId: string, raw: string): Partial<TradeFormData> {
    if (['avg_entry', 'stop_loss', 'avg_exit', 'risk'].includes(columnId)) {
      return { [columnId]: parseFloat(raw) || 0 } as Partial<TradeFormData>
    }
    if (['realised_win', 'realised_loss'].includes(columnId)) {
      const n = parseFloat(raw)
      return { [columnId]: isNaN(n) ? null : n } as Partial<TradeFormData>
    }
    if (columnId === 'rules_followed') return { rules_followed: raw === 'true' }
    return { [columnId]: raw } as Partial<TradeFormData>
  }

  function saveAndClose(value: string) {
    const rowId = editingCell?.rowId
    const columnId = editingCell?.columnId
    setEditingCell(null)

    if (!rowId || !columnId) return

    if (columnId.startsWith('custom_')) {
      // Merge into custom_data — never pollutes built-in fields
      if (rowId.startsWith('new-')) {
        const idx = parseInt(rowId.slice(4))
        const existing = draftRowsRef.current.get(idx) ?? { id: null, fields: {}, filledFields: [] }
        const mergedCustomData = { ...(existing.fields.custom_data ?? {}), [columnId]: value }
        setDraftRows((prev) => {
          const curr = prev.get(idx) ?? { id: null, fields: {}, filledFields: [] }
          return new Map(prev).set(idx, { ...curr, fields: { ...curr.fields, custom_data: mergedCustomData } })
        })
        if (!value.trim()) return
        const patchFields = { custom_data: mergedCustomData }
        if (existing.id) {
          onPatchTrade(existing.id, patchFields)
        } else {
          onCreateTrade().then((newTrade) => {
            if (!newTrade) return
            setDraftRows((prev) => {
              const curr = prev.get(idx) ?? { id: null, fields: {}, filledFields: [] }
              return new Map(prev).set(idx, { ...curr, id: newTrade.id })
            })
            onPatchTrade(newTrade.id, patchFields)
          })
        }
      } else {
        const trade = trades.find((t) => t.id === rowId)
        const mergedCustomData = { ...(trade?.custom_data ?? {}), [columnId]: value }
        onPatchTrade(rowId, { custom_data: mergedCustomData })
      }
      return
    }

    const isEmpty = !value.trim()
    const fields = parseFieldForSave(columnId, value)
    const isRequiredNumeric = ['avg_entry', 'stop_loss', 'avg_exit', 'risk'].includes(columnId)
    const isOptionalNumeric = ['realised_win', 'realised_loss'].includes(columnId)
    const isNumericColumn = isRequiredNumeric || isOptionalNumeric
    const counterpart = columnId === 'realised_win' ? 'realised_loss' : columnId === 'realised_loss' ? 'realised_win' : null

    if (rowId.startsWith('new-')) {
      const idx = parseInt(rowId.slice(4))
      const existing = draftRowsRef.current.get(idx) ?? { id: null, fields: {}, filledFields: [] }
      const newFilledFields = isEmpty
        ? existing.filledFields.filter((f) => f !== columnId)
        : [...new Set([...existing.filledFields.filter((f) => f !== counterpart), columnId])]
      setDraftRows((prev) => {
        const curr = prev.get(idx) ?? { id: null, fields: {}, filledFields: [] }
        const newFields = { ...curr.fields }
        if (isEmpty && isNumericColumn) {
          delete (newFields as Record<string, unknown>)[columnId]
        } else {
          Object.assign(newFields, fields)
          // Entering one of the pair clears the other
          if (counterpart && !isEmpty) delete (newFields as Record<string, unknown>)[counterpart]
        }
        return new Map(prev).set(idx, { ...curr, fields: newFields, filledFields: newFilledFields })
      })
      if (isEmpty) {
        // Still persist the clearing to DB so it survives a reload
        if (existing.id) {
          const clearFields: Partial<TradeFormData> = { draft_fields: newFilledFields }
          if (isOptionalNumeric) {
            // Can be nulled in DB
            (clearFields as Record<string, unknown>)[columnId] = null
            if (counterpart) (clearFields as Record<string, unknown>)[counterpart] = null
          } else if (!isRequiredNumeric) {
            // Text/other — save empty value
            Object.assign(clearFields, fields)
          }
          // Required numerics: only update draft_fields; can't store null in a NOT NULL column
          onPatchTrade(existing.id, clearFields)
        }
        return
      }
      const patchFields = { ...fields, ...(counterpart ? { [counterpart]: null } : {}), draft_fields: newFilledFields }
      if (existing.id) {
        onPatchTrade(existing.id, patchFields)
      } else {
        onCreateTrade().then((newTrade) => {
          if (!newTrade) return
          setDraftRows((prev) => {
            const curr = prev.get(idx) ?? { id: null, fields: {}, filledFields: [] }
            return new Map(prev).set(idx, { ...curr, id: newTrade.id })
          })
          onPatchTrade(newTrade.id, patchFields)
        })
      }
    } else {
      // Clearing a required numeric field on a real trade reverts to old value — don't save
      if (isEmpty && isRequiredNumeric) return
      // Clearing an optional numeric field saves null (removes the override)
      const saveFields = isEmpty && isOptionalNumeric
        ? { [columnId]: null } as Partial<TradeFormData>
        : { ...fields, ...(counterpart && !isEmpty ? { [counterpart]: null } : {}) } as Partial<TradeFormData>
      onPatchTrade(rowId, saveFields)
    }
  }

  function validateAndCommit(value?: string) {
    const columnId = editingCell?.columnId
    if (!columnId) return
    const fmt = resolveFormatType(columnId)
    const raw = value ?? editValue
    if ((fmt === 'number' || fmt === 'currency') && raw.trim() !== '') {
      const num = Number(raw.replace(/,/g, ''))
      if (isNaN(num)) {
        toast.error(t('trades.cell.invalidNumber'))
        setEditValue('')
        setEditingCell(null)
        return
      }
    }
    saveAndClose(raw)
  }

  const handleOpenColumnSettings = useCallback((columnId: string, label: string, description: string) => {
    const isCustom = columnId.startsWith('custom_')
    const existing = columnSettings.find((s) => s.column_id === columnId)
    const format_type: FormatType =
      (existing?.format_type as FormatType) ??
      BUILT_IN_FORMAT_TYPES[columnId] ??
      'auto'
    const isDropdown = format_type === 'dropdown'
    setSettingsTarget({
      columnId,
      label,
      description,
      format_type,
      initialOptions: (isDropdown) ? resolveOptions(columnId) : undefined,
      isBuiltIn: !isCustom,
    })
  }, [columnSettings, columnOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  function getHeaderLabel(columnId: string): string {
    const override = columnSettings.find((s) => s.column_id === columnId)
    if (override) return override.name
    const map: Record<string, string> = {
      trade_number: t('trades.columns.number'),
      trade_date: t('trades.columns.date'),
      trade_time: t('trades.columns.time'),
      ticker: t('trades.columns.ticker'),
      direction: t('trades.columns.direction'),
      order_type: t('trades.columns.orderType'),
      avg_entry: t('trades.columns.avgEntry'),
      stop_loss: t('trades.columns.stopLoss'),
      avg_exit: t('trades.columns.avgExit'),
      risk: t('trades.columns.risk'),
      realised_loss: t('trades.columns.realisedLoss'),
      realised_win: t('trades.columns.realisedWin'),
      deviation: t('trades.columns.deviation'),
      r_multiple: t('trades.columns.rMultiple'),
      risk_volatility: t('trades.columns.riskVolatility'),
      cumulative_pnl: t('trades.columns.cumulativePnl'),
      cumulative_r: t('trades.columns.cumulativeR'),
      rules_followed: t('trades.columns.rulesFollowed'),
      setup_type: t('trades.columns.setupType'),
    }
    return map[columnId] ?? columnId
  }

  const builtInColumns = useMemo<ColumnDef<EnrichedTrade>[]>(
    () => [
      {
        accessorKey: 'trade_number',
        header: () => t('trades.columns.number'),
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: 'trade_date',
        header: () => <HeaderCell label={t('trades.columns.date')} tooltip={t('trades.columnTooltips.date')} onOpenSettings={() => handleOpenColumnSettings('trade_date', t('trades.columns.date'), t('trades.columnTooltips.date'))} />,
        cell: ({ getValue }) => fmtDate(getValue<string>()),
      },
      {
        accessorKey: 'trade_time',
        header: () => <HeaderCell label={t('trades.columns.time')} tooltip={t('trades.columnTooltips.time')} onOpenSettings={() => handleOpenColumnSettings('trade_time', t('trades.columns.time'), t('trades.columnTooltips.time'))} />,
        cell: ({ getValue }) => fmtTime(getValue<string>(), resolveFormatType('trade_time') === 'time24'),
      },
      {
        accessorKey: 'ticker',
        header: () => <HeaderCell label={t('trades.columns.ticker')} tooltip={t('trades.columnTooltips.ticker')} onOpenSettings={() => handleOpenColumnSettings('ticker', t('trades.columns.ticker'), t('trades.columnTooltips.ticker'))} />,
      },
      {
        accessorKey: 'direction',
        header: () => <HeaderCell label={t('trades.columns.direction')} tooltip={t('trades.columnTooltips.direction')} onOpenSettings={() => handleOpenColumnSettings('direction', t('trades.columns.direction'), t('trades.columnTooltips.direction'))} />,
        cell: ({ getValue }) => {
          const v = getValue<string>()
          return (
            <span className={v === 'long'
              ? 'text-green-600 dark:text-green-400 font-medium'
              : 'text-red-500 font-medium'
            }>
              {t(`trades.direction.${v}`)}
            </span>
          )
        },
      },
      {
        accessorKey: 'order_type',
        header: () => <HeaderCell label={t('trades.columns.orderType')} tooltip={t('trades.columnTooltips.orderType')} onOpenSettings={() => handleOpenColumnSettings('order_type', t('trades.columns.orderType'), t('trades.columnTooltips.orderType'))} />,
        cell: ({ getValue }) => t(`trades.orderType.${getValue<string>()}`),
      },
      {
        accessorKey: 'avg_entry',
        header: () => <HeaderCell label={t('trades.columns.avgEntry')} tooltip={t('trades.columnTooltips.avgEntry')} onOpenSettings={() => handleOpenColumnSettings('avg_entry', t('trades.columns.avgEntry'), t('trades.columnTooltips.avgEntry'))} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmtCurrency(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'stop_loss',
        header: () => <HeaderCell label={t('trades.columns.stopLoss')} tooltip={t('trades.columnTooltips.stopLoss')} onOpenSettings={() => handleOpenColumnSettings('stop_loss', t('trades.columns.stopLoss'), t('trades.columnTooltips.stopLoss'))} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmtCurrency(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'avg_exit',
        header: () => <HeaderCell label={t('trades.columns.avgExit')} tooltip={t('trades.columnTooltips.avgExit')} onOpenSettings={() => handleOpenColumnSettings('avg_exit', t('trades.columns.avgExit'), t('trades.columnTooltips.avgExit'))} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmtCurrency(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'risk',
        header: () => <HeaderCell label={t('trades.columns.risk')} tooltip={t('trades.columnTooltips.risk')} onOpenSettings={() => handleOpenColumnSettings('risk', t('trades.columns.risk'), t('trades.columnTooltips.risk'))} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmtCurrency(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'realised_loss',
        header: () => <HeaderCell label={t('trades.columns.realisedLoss')} tooltip={t('trades.columnTooltips.realisedLoss')} onOpenSettings={() => handleOpenColumnSettings('realised_loss', t('trades.columns.realisedLoss'), t('trades.columnTooltips.realisedLoss'))} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return null
          return <span className="tabular-nums text-red-500">{fmtCurrency(v)}</span>
        },
      },
      {
        accessorKey: 'realised_win',
        header: () => <HeaderCell label={t('trades.columns.realisedWin')} tooltip={t('trades.columnTooltips.realisedWin')} onOpenSettings={() => handleOpenColumnSettings('realised_win', t('trades.columns.realisedWin'), t('trades.columnTooltips.realisedWin'))} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return null
          return (
            <span className="tabular-nums text-green-600 dark:text-green-400">
              {fmtCurrency(v)}
            </span>
          )
        },
      },
      {
        accessorKey: 'deviation',
        header: () => <HeaderCell label={t('trades.columns.deviation')} tooltip={t('trades.columnTooltips.deviation')} onOpenSettings={() => handleOpenColumnSettings('deviation', t('trades.columns.deviation'), t('trades.columnTooltips.deviation'))} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
          return <span className="tabular-nums">{fmtPercent(v)}</span>
        },
      },
      {
        accessorKey: 'r_multiple',
        header: () => <HeaderCell label={t('trades.columns.rMultiple')} tooltip={t('trades.columnTooltips.rMultiple')} onOpenSettings={() => handleOpenColumnSettings('r_multiple', t('trades.columns.rMultiple'), t('trades.columnTooltips.rMultiple'))} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
          return (
            <span className={`tabular-nums font-medium ${
              v >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-500'
            }`}>
              {v.toFixed(2)}
            </span>
          )
        },
      },
      {
        accessorKey: 'risk_volatility',
        header: () => <HeaderCell label={t('trades.columns.riskVolatility')} tooltip={t('trades.columnTooltips.riskVolatility')} onOpenSettings={() => handleOpenColumnSettings('risk_volatility', t('trades.columns.riskVolatility'), t('trades.columnTooltips.riskVolatility'))} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
          return <span className="tabular-nums">{fmtPercent(v)}</span>
        },
      },
      {
        accessorKey: 'cumulative_pnl',
        header: () => <HeaderCell label={t('trades.columns.cumulativePnl')} tooltip={t('trades.columnTooltips.cumulativePnl')} onOpenSettings={() => handleOpenColumnSettings('cumulative_pnl', t('trades.columns.cumulativePnl'), t('trades.columnTooltips.cumulativePnl'))} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
          return (
            <span className={`tabular-nums font-medium ${
              v >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-500'
            }`}>
              {(v >= 0 ? '+' : '') + fmtCurrency(Math.abs(v))}
            </span>
          )
        },
      },
      {
        accessorKey: 'cumulative_r',
        header: () => <HeaderCell label={t('trades.columns.cumulativeR')} tooltip={t('trades.columnTooltips.cumulativeR')} onOpenSettings={() => handleOpenColumnSettings('cumulative_r', t('trades.columns.cumulativeR'), t('trades.columnTooltips.cumulativeR'))} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
          return (
            <span className={`tabular-nums font-medium ${
              v >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-500'
            }`}>
              {v.toFixed(2)}
            </span>
          )
        },
      },
      {
        accessorKey: 'rules_followed',
        header: () => <HeaderCell label={t('trades.columns.rulesFollowed')} tooltip={t('trades.columnTooltips.rulesFollowed')} onOpenSettings={() => handleOpenColumnSettings('rules_followed', t('trades.columns.rulesFollowed'), t('trades.columnTooltips.rulesFollowed'))} />,
        cell: ({ getValue }) => {
          const v = getValue<boolean>()
          return (
            <span className={v
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-500'
            }>
              {t(v ? 'trades.form.rulesYes' : 'trades.form.rulesNo')}
            </span>
          )
        },
      },
      {
        accessorKey: 'setup_type',
        header: () => <HeaderCell label={t('trades.columns.setupType')} tooltip={t('trades.columnTooltips.setupType')} onOpenSettings={() => handleOpenColumnSettings('setup_type', t('trades.columns.setupType'), t('trades.columnTooltips.setupType'))} />,
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
        accessorFn: (row) => row.custom_data?.[s.column_id] ?? '',
        header: () => (
          <HeaderCell
            label={s.name}
            tooltip={s.description ?? ''}
            onOpenSettings={() => handleOpenColumnSettings(s.column_id, s.name, s.description ?? '')}
          />
        ),
        cell: ({ getValue }) => {
          const val = getValue<string>()
          return val ? <span className="text-sm">{val}</span> : null
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
                items={displayColumnOrder.filter((id) => id !== PINNED_COLUMN)}
                strategy={horizontalListSortingStrategy}
              >
                {hg.headers.map((h) => {
                  const isPinned = h.column.id === PINNED_COLUMN
                  const headClassName = cn(
                    'sticky top-0 z-10 bg-background border-t',
                    scrolledY && rowShadow,
                    isPinned && 'inset-s-0 z-20 w-12.5 min-w-12.5',
                    !isPinned && 'min-w-20',
                    isPinned && scrolledX && colShadow,
                  )
                  if (isPinned) {
                    return (
                      <TableHead key={h.id} className={headClassName}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    )
                  }
                  return (
                    <ContextMenu key={h.id}>
                      <DraggableHeader id={h.column.id} className={headClassName}>
                        <ContextMenuTrigger asChild>
                          <span className="flex w-full items-center">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </span>
                        </ContextMenuTrigger>
                      </DraggableHeader>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => navigator.clipboard.writeText(getHeaderLabel(h.column.id))}>
                          <Copy className="size-4" />
                          {t('trades.cell.copy')}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuLabel>{t('trades.cell.sectionColumn')}</ContextMenuLabel>
                        <ContextMenuItem
                          disabled={REQUIRED_COLUMNS.has(h.column.id)}
                          onClick={() => onHideColumn(h.column.id)}
                        >
                          <EyeOff className="size-4" />
                          {t('trades.columns.hide')}
                        </ContextMenuItem>
                        {h.column.id.startsWith('custom_') ? (
                          <ContextMenuItem
                            onClick={() => {
                              const s = customColumns.find((c) => c.column_id === h.column.id)
                              if (s) handleOpenColumnSettings(s.column_id, s.name, s.description ?? '')
                            }}
                          >
                            <Pencil className="size-4" />
                            {t('trades.columns.rename')}
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem disabled>
                            <Pencil className="size-4" />
                            {t('trades.columns.rename')}
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem onClick={() => setAddColumnOpen(true)}>
                          <Plus className="size-4" />
                          {t('trades.columns.addColumn')}
                        </ContextMenuItem>
                        {h.column.id.startsWith('custom_') ? (
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => {
                              const setting = customColumns.find((s) => s.column_id === h.column.id)
                              setDeleteTarget({ id: h.column.id, name: setting?.name ?? h.column.id })
                            }}
                          >
                            <Trash2 className="size-4" />
                            {t('trades.columns.delete')}
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem disabled variant="destructive">
                            <Trash2 className="size-4" />
                            {t('trades.columns.delete')}
                          </ContextMenuItem>
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
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => {
                const isPinned = cell.column.id === PINNED_COLUMN
                const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === cell.column.id
                const rawVal = cell.getValue()
                const copyText = typeof rawVal === 'boolean'
                  ? (rawVal ? t('trades.form.rulesYes') : t('trades.form.rulesNo'))
                  : String(rawVal ?? '')
                const cellContent = isEditing && cell.column.id === 'trade_date' ? (
                  <>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    <DateCellEditor value={editValue} open onClose={cancelEdit} onCommit={saveAndClose} />
                  </>
                ) : isEditing && isDropdownColumn(cell.column.id) ? (
                  <>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    <MenuCellEditor value={editValue} options={resolveOptions(cell.column.id)} onClose={cancelEdit} onCommit={saveAndClose} />
                  </>
                ) : isEditing ? (
                  <input
                    autoFocus
                    type={cell.column.id === 'trade_time' ? 'time' : 'text'}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => validateAndCommit()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') validateAndCommit()
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    size={1}
                    className="h-full w-full bg-transparent px-2 text-center text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                  />
                ) : (
                  flexRender(cell.column.columnDef.cell, cell.getContext())
                )

                if (isPinned) {
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn('sticky inset-s-0 z-10 w-12.5 min-w-12.5 bg-background', scrolledX && colShadow)}
                    >
                      {cellContent}
                    </TableCell>
                  )
                }

                return (
                  <ContextMenu key={cell.id}>
                    <ContextMenuTrigger asChild>
                      <TableCell
                        className={cn(
                          isEditing && 'ring-1 ring-inset ring-primary',
                          isEditing && cell.column.id !== 'trade_date' && !isDropdownColumn(cell.column.id) && 'p-0',
                          isEditing && (cell.column.id === 'trade_date' || isDropdownColumn(cell.column.id)) && 'select-none cursor-default',
                        )}
                        onDoubleClick={() => handleCellDoubleClick(row.id, cell.column.id, cell.getValue())}
                      >
                        {cellContent}
                      </TableCell>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => navigator.clipboard.writeText(copyText)}>
                        <Copy className="size-4" />
                        {t('trades.cell.copy')}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuLabel>{t('trades.cell.sectionTrade')}</ContextMenuLabel>
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() => setTradeDeleteTarget({ id: row.original.id, number: row.original.trade_number })}
                      >
                        <Trash2 className="size-4" />
                        {t('trades.deleteTrade')}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuLabel>{t('trades.cell.sectionColumn')}</ContextMenuLabel>
                      <ContextMenuItem
                        disabled={REQUIRED_COLUMNS.has(cell.column.id)}
                        onClick={() => onHideColumn(cell.column.id)}
                      >
                        <EyeOff className="size-4" />
                        {t('trades.columns.hide')}
                      </ContextMenuItem>
                      {cell.column.id.startsWith('custom_') ? (
                        <ContextMenuItem
                          onClick={() => {
                            const s = customColumns.find((c) => c.column_id === cell.column.id)
                            if (s) handleOpenColumnSettings(s.column_id, s.name, s.description ?? '')
                          }}
                        >
                          <Pencil className="size-4" />
                          {t('trades.columns.rename')}
                        </ContextMenuItem>
                      ) : (
                        <ContextMenuItem disabled>
                          <Pencil className="size-4" />
                          {t('trades.columns.rename')}
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem onClick={() => setAddColumnOpen(true)}>
                        <Plus className="size-4" />
                        {t('trades.columns.addColumn')}
                      </ContextMenuItem>
                      {cell.column.id.startsWith('custom_') ? (
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => {
                            const setting = customColumns.find((s) => s.column_id === cell.column.id)
                            setDeleteTarget({ id: cell.column.id, name: setting?.name ?? cell.column.id })
                          }}
                        >
                          <Trash2 className="size-4" />
                          {t('trades.columns.delete')}
                        </ContextMenuItem>
                      ) : (
                        <ContextMenuItem disabled variant="destructive">
                          <Trash2 className="size-4" />
                          {t('trades.columns.delete')}
                        </ContextMenuItem>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
            </TableRow>
          ))}

          {/* Blank new-trade rows */}
          {Array.from({ length: blankRowCount }, (_, i) => {
            const rowId = `new-${i}`
            const draft = draftRows.get(i)
            const df = draft?.fields ?? {}

            // Build a RawTrade from the draft for enrichment (compute auto-generated columns)
            const draftRaw: RawTrade = {
              id: draft?.id ?? `__draft_${i}`,
              patch_id: '',
              trade_number: trades.length + i + 1,
              trade_date: df.trade_date ?? new Date().toISOString().split('T')[0],
              trade_time: df.trade_time ?? '00:00:00',
              ticker: df.ticker ?? '',
              direction: 'long',
              order_type: df.order_type ?? 'market',
              avg_entry: df.avg_entry ?? 0,
              stop_loss: df.stop_loss ?? 0,
              avg_exit: df.avg_exit ?? 0,
              risk: df.risk ?? 0,
              rules_followed: df.rules_followed ?? false,
              setup_type: df.setup_type ?? '',
              realised_win: df.realised_win ?? null,
              realised_loss: df.realised_loss ?? null,
              created_at: '',
              updated_at: '',
            }
            const allForEnrich = [...(trades as unknown as RawTrade[]), draftRaw]
            const enrichedDraft = enrichTrades(allForEnrich)[allForEnrich.length - 1]
            const hasPrices = draftRaw.avg_entry > 0 && draftRaw.stop_loss > 0 && draftRaw.avg_exit > 0

            function renderDraftCell(colId: string): React.ReactNode {
              if (colId.startsWith('custom_')) {
                const val = df.custom_data?.[colId]
                return val ? <span className="text-sm">{val}</span> : <>&nbsp;</>
              }
              if (colId in df || AUTO_GENERATED_COLS.has(colId)) {
                if (colId === 'trade_date') return <span className="text-sm tabular-nums">{df.trade_date ? fmtDate(df.trade_date) : ''}</span>
                if (colId === 'trade_time') return <span className="text-sm tabular-nums">{df.trade_time ? fmtTime(String(df.trade_time), resolveFormatType('trade_time') === 'time24') : ''}</span>
                if (colId === 'ticker') return <span className="text-sm">{df.ticker ?? ''}</span>
                if (colId === 'order_type') return <span className="text-sm capitalize">{df.order_type ?? ''}</span>
                if (colId === 'avg_entry') return <span className="text-sm tabular-nums">{df.avg_entry != null ? fmtCurrency(df.avg_entry) : ''}</span>
                if (colId === 'stop_loss') return <span className="text-sm tabular-nums">{df.stop_loss != null ? fmtCurrency(df.stop_loss) : ''}</span>
                if (colId === 'avg_exit') return <span className="text-sm tabular-nums">{df.avg_exit != null ? fmtCurrency(df.avg_exit) : ''}</span>
                if (colId === 'risk') return <span className="text-sm tabular-nums">{df.risk != null ? fmtCurrency(df.risk) : ''}</span>
                if (colId === 'rules_followed') return <span className="text-sm">{df.rules_followed != null ? (df.rules_followed ? t('trades.form.rulesYes') : t('trades.form.rulesNo')) : ''}</span>
                if (colId === 'setup_type') return <span className="text-sm">{df.setup_type ?? ''}</span>
                if (colId === 'realised_win') return df.realised_win != null ? <span className="text-sm tabular-nums text-green-600 dark:text-green-400">{fmtCurrency(df.realised_win)}</span> : <></>
                if (colId === 'realised_loss') return df.realised_loss != null ? <span className="text-sm tabular-nums text-red-500">-{fmtCurrency(df.realised_loss)}</span> : <></>
                // Auto-generated — only show when we have price data
                if (!hasPrices) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
                if (colId === 'direction') return <span className={cn('text-sm font-medium', enrichedDraft.direction === 'long' ? 'text-green-500' : 'text-red-500')}>{enrichedDraft.direction === 'long' ? t('trades.direction.long') : t('trades.direction.short')}</span>
                if (colId === 'r_multiple') return enrichedDraft.r_multiple != null ? <span className={cn('text-sm tabular-nums', enrichedDraft.r_multiple >= 0 ? 'text-green-500' : 'text-red-500')}>{enrichedDraft.r_multiple.toFixed(2)}R</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
                if (colId === 'deviation') return enrichedDraft.deviation != null ? <span className="text-sm tabular-nums">{fmtPercent(enrichedDraft.deviation)}</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
                if (colId === 'risk_volatility') return enrichedDraft.risk_volatility != null ? <span className="text-sm tabular-nums">{fmtPercent(enrichedDraft.risk_volatility)}</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
                if (colId === 'cumulative_pnl') return enrichedDraft.cumulative_pnl != null ? <span className={cn('text-sm tabular-nums', enrichedDraft.cumulative_pnl >= 0 ? 'text-green-500' : 'text-red-500')}>{fmtCurrency(enrichedDraft.cumulative_pnl)}</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
                if (colId === 'cumulative_r') return enrichedDraft.cumulative_r != null ? <span className={cn('text-sm tabular-nums', enrichedDraft.cumulative_r >= 0 ? 'text-green-500' : 'text-red-500')}>{enrichedDraft.cumulative_r.toFixed(2)}R</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
              }
              return <>&nbsp;</>
            }

            function getDraftCopyValue(colId: string): string {
              if (colId.startsWith('custom_')) return df.custom_data?.[colId] ?? ''
              if (AUTO_GENERATED_COLS.has(colId)) {
                if (!hasPrices) return ''
                const v = enrichedDraft[colId as keyof typeof enrichedDraft]
                return v !== null && v !== undefined ? String(v) : ''
              }
              const v = df[colId as keyof typeof df]
              if (v === null || v === undefined) return ''
              if (typeof v === 'boolean') return v ? t('trades.form.rulesYes') : t('trades.form.rulesNo')
              return String(v)
            }

            return (
              <TableRow key={rowId}>
                {table.getVisibleLeafColumns().map((col) => {
                  const isPinned = col.id === PINNED_COLUMN
                  const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === col.id
                  const draftCellContent = isEditing && col.id === 'trade_date' ? (
                    <DateCellEditor value={editValue} open onClose={cancelEdit} onCommit={saveAndClose} />
                  ) : isEditing && isDropdownColumn(col.id) ? (
                    <MenuCellEditor value={editValue} options={resolveOptions(col.id)} onClose={cancelEdit} onCommit={saveAndClose} />
                  ) : isEditing ? (
                    <input
                      autoFocus
                      type={col.id === 'trade_time' ? 'time' : 'text'}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => validateAndCommit()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') validateAndCommit()
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      size={1}
                      className="h-full w-full bg-transparent px-2 text-center text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                  ) : isPinned ? (
                    <span className="font-medium tabular-nums">{trades.length + i + 1}</span>
                  ) : (
                    renderDraftCell(col.id)
                  )

                  if (isPinned) {
                    return (
                      <TableCell
                        key={col.id}
                        className={cn('sticky inset-s-0 z-10 w-12.5 min-w-12.5 bg-background', scrolledX && colShadow)}
                      >
                        {draftCellContent}
                      </TableCell>
                    )
                  }

                  return (
                    <ContextMenu key={col.id}>
                      <ContextMenuTrigger asChild>
                        <TableCell
                          className={cn(
                            isEditing && 'ring-1 ring-inset ring-primary',
                            isEditing && col.id !== 'trade_date' && !isDropdownColumn(col.id) && 'p-0',
                            isEditing && (col.id === 'trade_date' || isDropdownColumn(col.id)) && 'select-none cursor-default',
                          )}
                          onDoubleClick={() => handleCellDoubleClick(rowId, col.id, '')}
                        >
                          {draftCellContent}
                        </TableCell>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => navigator.clipboard.writeText(getDraftCopyValue(col.id))}>
                          <Copy className="size-4" />
                          {t('trades.cell.copy')}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuLabel>{t('trades.cell.sectionTrade')}</ContextMenuLabel>
                        {draft?.id && (
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => setTradeDeleteTarget({ id: draft.id!, number: trades.length + i + 1, draftRowIndex: i })}
                          >
                            <Trash2 className="size-4" />
                            {t('trades.deleteTrade')}
                          </ContextMenuItem>
                        )}
                        <ContextMenuSeparator />
                        <ContextMenuLabel>{t('trades.cell.sectionColumn')}</ContextMenuLabel>
                        <ContextMenuItem
                          disabled={REQUIRED_COLUMNS.has(col.id)}
                          onClick={() => onHideColumn(col.id)}
                        >
                          <EyeOff className="size-4" />
                          {t('trades.columns.hide')}
                        </ContextMenuItem>
                        {col.id.startsWith('custom_') ? (
                          <ContextMenuItem
                            onClick={() => {
                              const s = customColumns.find((c) => c.column_id === col.id)
                              if (s) handleOpenColumnSettings(s.column_id, s.name, s.description ?? '')
                            }}
                          >
                            <Pencil className="size-4" />
                            {t('trades.columns.rename')}
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem disabled>
                            <Pencil className="size-4" />
                            {t('trades.columns.rename')}
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem onClick={() => setAddColumnOpen(true)}>
                          <Plus className="size-4" />
                          {t('trades.columns.addColumn')}
                        </ContextMenuItem>
                        {col.id.startsWith('custom_') ? (
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => {
                              const setting = customColumns.find((s) => s.column_id === col.id)
                              setDeleteTarget({ id: col.id, name: setting?.name ?? col.id })
                            }}
                          >
                            <Trash2 className="size-4" />
                            {t('trades.columns.delete')}
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem disabled variant="destructive">
                            <Trash2 className="size-4" />
                            {t('trades.columns.delete')}
                          </ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
              </TableRow>
            )
          })}

          {/* Add Trade row — colSpan fills the table width; sticky div inside keeps text pinned to the start */}
          <TableRow className="group cursor-pointer border-t border-b border-[--color-border]" onClick={() => setBlankRowCount((c) => c + 1)}>
            <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-0">
              <div className="sticky inset-s-0 flex w-fit items-center gap-1.5 p-2 text-xs text-muted-foreground group-hover:text-foreground">
                <Plus className="size-3" />
                {t('trades.addTrade')} #{trades.length + blankRowCount + 1}
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
        if (!open) { setAddColumnOpen(false); setSettingsTarget(null) }
      }}
      initialData={settingsTarget ? {
        columnId: settingsTarget.columnId,
        name: settingsTarget.label,
        description: settingsTarget.description,
        format_type: settingsTarget.format_type,
        isBuiltIn: settingsTarget.isBuiltIn,
      } : undefined}
      initialOptions={settingsTarget?.initialOptions}
      onSaveOptions={onSaveColumnOptions}
      onDeleteRequest={() => {
        if (settingsTarget) setDeleteTarget({ id: settingsTarget.columnId, name: settingsTarget.label })
      }}
      onHideRequest={() => {
        if (settingsTarget) onHideColumn(settingsTarget.columnId)
      }}
    />
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
      <AlertDialogContent>
        <AlertDialogCancel size="icon-sm" variant="ghost" className="absolute inset-e-3 top-3">
          <X className="size-4" />
        </AlertDialogCancel>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('trades.deleteColumnDialog.title', { name: deleteTarget?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('trades.deleteColumnDialog.description')}
          </AlertDialogDescription>
          <p className="text-sm text-muted-foreground">
            {t('trades.deleteColumnDialog.hint')}
          </p>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('trades.cancel')}
          </AlertDialogCancel>
          <AlertDialogCancel disabled={isDeleting} onClick={() => {
            if (deleteTarget) onHideColumn(deleteTarget.id)
            setDeleteTarget(null)
          }}>
            {t('trades.deleteColumnDialog.hide')}
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
            <Spinner data-icon="inline-start" className={isDeleting ? '' : 'hidden'} />
            {t('trades.deleteColumnDialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!tradeDeleteTarget} onOpenChange={(open) => { if (!open) setTradeDeleteTarget(null) }}>
      <AlertDialogContent>
        <AlertDialogCancel size="icon-sm" variant="ghost" className="absolute inset-e-3 top-3">
          <X className="size-4" />
        </AlertDialogCancel>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('trades.deleteConfirmTitle', { number: tradeDeleteTarget?.number ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('trades.deleteConfirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeletingTrade}>
            {t('trades.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeletingTrade}
            onClick={async (e) => {
              e.preventDefault()
              if (!tradeDeleteTarget) return
              setIsDeletingTrade(true)
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
            <Spinner data-icon="inline-start" className={isDeletingTrade ? '' : 'hidden'} />
            {t('trades.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </TooltipProvider>
  )
}
