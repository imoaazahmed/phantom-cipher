"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Code2, EyeOff, GripVertical, Info, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { columnSettingSchema, type ColumnSettingFormData } from '@/lib/schemas/column-setting'
import type { FormatType } from '@/lib/trades/types'
import {
  createColumnSetting,
  updateColumnSetting,
  upsertColumnSetting,
} from '@/lib/trades/actions'

// The comment + function signature shown at the top of every formula editor.
// This matches the destructuring in PARAM_LIST inside lib/trades/formula-engine.ts.
const FORMULA_HEADER = `\
/**
 * FORMULA FUNCTION — every variable below is injected automatically per row.
 * Return a number, string, or null. Returning null leaves the cell blank.
 *
 * ── PRICE & RISK ──────────────────────────────────────────────────────────
 *   avg_entry      number        Average entry price of the trade
 *   avg_exit       number        Average exit price of the trade
 *   stop_loss      number        Stop-loss price level
 *   risk           number        Planned risk amount in $ (always positive)
 *
 * ── REALISED P&L ──────────────────────────────────────────────────────────
 *   realised_win   number|null   Gross profit entered by user; null if not set
 *   realised_loss  number|null   Gross loss entered by user (positive); null if not set
 *   pnl            number|null   Net P&L: realised_win if win, -realised_loss if loss,
 *                                null if neither is set
 *
 * ── TRADE INFO ────────────────────────────────────────────────────────────
 *   direction      string        'long' or 'short'
 *   order_type     string        'market' or 'limit'
 *   ticker         string        Instrument/symbol (e.g. 'BTCUSDT')
 *   trade_date     string        Date in 'YYYY-MM-DD' format
 *   trade_time     string        Time in 'HH:MM:SS' format
 *   rules_followed boolean       Whether the trader followed their rules
 *   setup_type     string        The setup label chosen for this trade
 *   trade_number   number        Sequential trade number within the patch (1-based)
 *   row_index      number        0-based position of this row in the current view
 *
 * ── CROSS-ROW CONTEXT ─────────────────────────────────────────────────────
 *   prev_risk      number|null   Risk of the preceding trade; null on first row
 *   running_pnl    number        Sum of pnl for all rows BEFORE this one
 *   running_r      number        Sum of R multiples for all rows BEFORE this one
 *
 * ── OTHER FORMULA COLUMNS ─────────────────────────────────────────────────
 *   rest           object        Other formula columns keyed by Column ID.
 *                                Usage: rest.my_custom_column_id
 *                                Only columns evaluated before this one are
 *                                available (dependency order is automatic).
 */

function ({
  avg_entry, avg_exit, stop_loss,
  risk, pnl, realised_win, realised_loss,
  direction, order_type, ticker,
  trade_date, trade_time,
  rules_followed, setup_type,
  trade_number, row_index,
  prev_risk, running_pnl, running_r,
  ...rest
}) {`

const FORMULA_FOOTER = `}`

function buildDisplayCode(body: string): string {
  const trimmed = body.trim()
  const indented = trimmed
    ? trimmed.split('\n').map((l) => '  ' + l).join('\n')
    : ''
  return FORMULA_HEADER + (indented ? '\n' + indented + '\n' : '\n') + FORMULA_FOOTER
}

function extractFormulaBody(fullCode: string): string {
  const marker = '\n}) {'
  const idx = fullCode.indexOf(marker)
  if (idx === -1) return fullCode.trim()
  const bodyStart = idx + marker.length
  const lastBrace = fullCode.lastIndexOf('}')
  if (lastBrace <= bodyStart) return fullCode.trim()
  return fullCode.slice(bodyStart, lastBrace).trim()
}

export type EditColumnData = {
  columnId: string
  name: string
  description: string | null
  format_type: FormatType
  isBuiltIn?: boolean
  is_formula?: boolean
  formula?: string | null
}

function toSlug(str: string): string {
  const slug = str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^\d/.test(slug) ? `_${slug}` : slug
}

// Auto-generate: plain slug from name, no conflict resolution (user is informed if taken)
function generateFormulaId(name: string): string {
  return toSlug(name)
}

// Generate button: try base slug, fall back to base_copy if taken
function generateUniqueFormulaId(name: string, existingIds: string[], ownId: string | null): string {
  const base = toSlug(name)
  if (!base) return ''
  const taken = existingIds.filter((id) => id !== ownId)
  return taken.includes(base) ? `${base}_copy` : base
}

// Dropdown columns whose items are locked (not user-customizable)
const LOCKED_DROPDOWN_IDS = new Set(['direction', 'order_type', 'rules_followed'])

// The only built-in column allowed to change its Cell Type
const FLEXIBLE_BUILT_IN = 'setup_type'

type OptionRow = {
  id: string
  value: string  // immutable key; '' for new rows (will be set to label on save)
  label: string  // what the user sees / edits
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: EditColumnData
  initialOptions?: { value: string; label: string }[]
  onSaveOptions?: (columnId: string, opts: { value: string; label: string }[]) => Promise<void>
  onDeleteRequest?: () => void
  onHideRequest?: () => void
  existingFormulaIds?: string[]
}

const CELL_TYPE_OPTIONS = [
  { value: 'auto',     labelKey: 'trades.addColumnDialog.formatAuto' },
  { value: 'text',     labelKey: 'trades.addColumnDialog.formatText' },
  { value: 'currency', labelKey: 'trades.addColumnDialog.formatCurrency' },
  { value: 'percent',  labelKey: 'trades.addColumnDialog.formatPercent' },
  { value: 'date',     labelKey: 'trades.addColumnDialog.formatDate' },
  { value: 'time',     labelKey: 'trades.addColumnDialog.formatTime' },
  { value: 'number',   labelKey: 'trades.addColumnDialog.formatNumber' },
  { value: 'dropdown', labelKey: 'trades.addColumnDialog.formatDropdown' },
] as const

function SortableOptionRow({
  opt,
  onLabelChange,
  onDelete,
  isLocked = false,
  shouldFocus = false,
}: {
  opt: OptionRow
  onLabelChange: (id: string, label: string) => void
  onDelete: (id: string) => void
  isLocked?: boolean
  shouldFocus?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opt.id,
  })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (shouldFocus) inputRef.current?.focus()
  }, [shouldFocus])

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-1.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Input
        ref={inputRef}
        value={opt.label}
        onChange={(e) => onLabelChange(opt.id, e.target.value)}
        className="flex-1"
        disabled={isLocked}
      />
      <Button type="button" variant="ghost" size="icon-xs" onClick={() => onDelete(opt.id)} disabled={isLocked}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

export function AddColumnDialog({
  open,
  onOpenChange,
  initialData,
  initialOptions,
  onSaveOptions,
  onDeleteRequest,
  onHideRequest,
  existingFormulaIds = [],
}: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const nameRef = useRef<HTMLInputElement | null>(null)

  const isEditing = !!initialData
  const isBuiltIn = isEditing && !!initialData.isBuiltIn
  // Items locked: order_type and rules_followed options can't be modified
  const isLockedItems = isBuiltIn && LOCKED_DROPDOWN_IDS.has(initialData.columnId)
  // Cell type locked: all built-in columns except setup_type can't change their cell type
  const isCellTypeLocked = isBuiltIn && initialData.columnId !== FLEXIBLE_BUILT_IN

  const [optionRows, setOptionRows] = useState<OptionRow[]>([])
  const [newRowId, setNewRowId] = useState<string | null>(null)
  const [formulaCode, setFormulaCode] = useState<string>('')
  const [formulaSheetOpen, setFormulaSheetOpen] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [formulaIdAvailable, setFormulaIdAvailable] = useState(false)
  const [formulaIdChecking, setFormulaIdChecking] = useState(false)
  const formulaCodeSnapshot = useRef<string>('')
  const formulaCodeOnOpen = useRef<string>('')
  const formulaIdManuallyEdited = useRef(false)
  const prevFormatRef = useRef<string>('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ColumnSettingFormData>({
    resolver: yupResolver(columnSettingSchema),
    defaultValues: { name: '', description: '', format_type: 'auto', is_formula: false, formula: null, column_id: null },
  })

  const watchedFormatType = useWatch({ control, name: 'format_type' })
  const watchedIsFormula = watch('is_formula')
  const showOptions = watchedFormatType === 'dropdown'
  const showTimeToggle = watchedFormatType === 'time' || watchedFormatType === 'time24'
  // For built-in formula columns, show code read-only
  const showBuiltInFormula = isBuiltIn && initialData?.is_formula && initialData?.formula
  // Show the "View/Edit Formula" button whenever a formula is associated
  const showFormulaButton = !!showBuiltInFormula || (!isBuiltIn && watchedIsFormula)
  // column_id field is locked when editing an existing formula column
  const formulaIdLocked = isEditing && !isBuiltIn

  useEffect(() => {
    if (open) {
      const fmt = initialData?.format_type ?? 'auto'
      const isFormula = initialData?.is_formula ?? false
      reset({
        name: initialData?.name ?? '',
        description: initialData?.description ?? '',
        format_type: fmt,
        is_formula: isFormula,
        formula: initialData?.formula ?? null,
        column_id: initialData?.columnId ?? null,
      })
      const initialCode = buildDisplayCode(initialData?.formula ?? '')
      setFormulaCode(initialCode)
      formulaCodeOnOpen.current = initialCode
      formulaIdManuallyEdited.current = false
      prevFormatRef.current = fmt

      if (fmt === 'dropdown') {
        setOptionRows(
          initialOptions && initialOptions.length > 0
            ? initialOptions.map((o) => ({ id: crypto.randomUUID(), value: o.value, label: o.label }))
            : [
                { id: crypto.randomUUID(), value: '', label: 'Value 1' },
                { id: crypto.randomUUID(), value: '', label: 'Value 2' },
              ]
        )
      } else {
        setOptionRows([])
      }

      if (!isBuiltIn) {
        requestAnimationFrame(() => nameRef.current?.focus())
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData])

  // Real-time Column ID availability check (debounced)
  const watchedFormulaId = watch('column_id')
  useEffect(() => {
    if (isBuiltIn || formulaIdLocked) {
      setFormulaIdAvailable(false)
      setFormulaIdChecking(false)
      return
    }
    const trimmed = watchedFormulaId?.trim() ?? ''
    if (!trimmed) {
      setFormulaIdAvailable(false)
      setFormulaIdChecking(false)
      clearErrors('column_id')
      return
    }
    setFormulaIdChecking(true)
    setFormulaIdAvailable(false)
    const timer = setTimeout(() => {
      const ownId = initialData?.columnId ?? null
      const taken = existingFormulaIds.filter(id => id !== ownId).includes(trimmed)
      if (taken) {
        setFormulaIdAvailable(false)
        setError('column_id', { type: 'manual', message: 'trades.formula.errorVariableIdTaken' })
      } else {
        setFormulaIdAvailable(true)
        clearErrors('column_id')
      }
      setFormulaIdChecking(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [watchedFormulaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate Column ID from the column name until the user manually edits it
  const watchedName = watch('name')
  useEffect(() => {
    if (isBuiltIn || formulaIdLocked || formulaIdManuallyEdited.current) return
    const generated = generateFormulaId(watchedName ?? '')
    setValue('column_id', generated, { shouldValidate: false, shouldDirty: false })
  }, [watchedName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seed default options when switching to Dropdown for the first time
  useEffect(() => {
    if (watchedFormatType === 'dropdown' && prevFormatRef.current !== 'dropdown') {
      if (optionRows.length === 0) {
        setOptionRows([
          { id: crypto.randomUUID(), value: '', label: 'Value 1' },
          { id: crypto.randomUUID(), value: '', label: 'Value 2' },
        ])
      }
    }
    prevFormatRef.current = watchedFormatType ?? ''
  }, [watchedFormatType]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleOpenChange(next: boolean) {
    if (!next) {
      if (formulaCode !== formulaCodeOnOpen.current) {
        setDiscardConfirmOpen(true)
        return
      }
      reset()
      setFormulaSheetOpen(false)
    }
    onOpenChange(next)
  }

  function confirmDiscard() {
    setDiscardConfirmOpen(false)
    reset()
    setFormulaSheetOpen(false)
    onOpenChange(false)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setOptionRows((prev) => {
        const oldIdx = prev.findIndex((r) => r.id === active.id)
        const newIdx = prev.findIndex((r) => r.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  function addOptionRow() {
    const id = crypto.randomUUID()
    setNewRowId(id)
    setOptionRows((prev) => [...prev, { id, value: '', label: '' }])
  }

  function updateOptionLabel(id: string, label: string) {
    setOptionRows((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)))
  }

  function deleteOptionRow(id: string) {
    setOptionRows((prev) => prev.filter((r) => r.id !== id))
  }

  function buildMappedOptions() {
    return optionRows
      .filter((r) => r.label.trim())
      .map((r) => ({ value: r.value || r.label.trim(), label: r.label.trim() }))
  }

  async function onSubmit(data: ColumnSettingFormData) {
    const format_type = (data.format_type ?? 'auto') as FormatType
    const isDropdownNow = format_type === 'dropdown'

    if (!isBuiltIn) {
      const id = data.column_id?.trim() ?? ''
      if (!id) {
        setError('column_id', { type: 'manual', message: 'trades.formula.errorVariableIdRequired' })
        return
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
        setError('column_id', { type: 'manual', message: 'trades.formula.errorVariableIdFormat' })
        return
      }
      const ownId = initialData?.columnId ?? null
      if (existingFormulaIds.filter(fid => fid !== ownId).includes(id)) {
        setError('column_id', { type: 'manual', message: 'trades.formula.errorVariableIdTaken' })
        return
      }
    }

    if (isBuiltIn) {
      if (isDropdownNow) {
        // Save options only (skip locked columns)
        if (onSaveOptions) {
          await onSaveOptions(initialData!.columnId, buildMappedOptions())
        }
      } else {
        // Cell type changed (only possible for setup_type since others are locked)
        const { error } = await upsertColumnSetting({
          column_id: initialData!.columnId,
          name: initialData!.name,
          format_type,
        })
        if (error) { setError('root', { message: t(error) }); return }
        router.refresh()
      }
      onOpenChange(false)
      return
    }

    const isFormulaOn = data.is_formula ?? false
    const formulaPayload = {
      is_formula: isFormulaOn,
      formula: isFormulaOn ? (extractFormulaBody(formulaCode) || null) : null,
    }

    // Custom column — create or update
    if (isEditing) {
      const { error } = await updateColumnSetting(initialData!.columnId, {
        name: data.name,
        description: data.description || undefined,
        format_type,
        ...formulaPayload,
      })
      if (error) { setError('root', { message: t(error) }); return }
      if (isDropdownNow && onSaveOptions) {
        await onSaveOptions(initialData!.columnId, buildMappedOptions())
      }
    } else {
      const { data: created, error } = await createColumnSetting({
        name: data.name,
        description: data.description || undefined,
        format_type,
        column_id: data.column_id?.trim() ?? '',
        ...formulaPayload,
      })
      if (error) { setError('root', { message: t(error) }); return }
      if (isDropdownNow && onSaveOptions && created) {
        await onSaveOptions(created.column_id, buildMappedOptions())
      }
    }

    reset()
    onOpenChange(false)
    router.refresh()
  }

  const { ref: nameFieldRef, ...nameFieldProps } = register('name')

  const title = isBuiltIn
    ? initialData!.name
    : t(isEditing ? 'trades.addColumnDialog.editTitle' : 'trades.columns.addColumn')

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {errors.root && (
              <p className="text-sm text-destructive">{errors.root.message}</p>
            )}

            {isBuiltIn && (
              <Alert>
                <Info />
                <AlertDescription className="text-sm text-foreground">
                  {t('trades.addColumnDialog.builtInAlert')}
                </AlertDescription>
              </Alert>
            )}

            {/* Column Name */}
            <div className="space-y-1.5">
              <Label htmlFor="col-name">{t('trades.addColumnDialog.nameLabel')}</Label>
              <Input
                id="col-name"
                placeholder={t('trades.addColumnDialog.namePlaceholder')}
                aria-invalid={!!errors.name}
                disabled={isBuiltIn}
                ref={(el) => { nameFieldRef(el); nameRef.current = el }}
                {...nameFieldProps}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{t(errors.name.message ?? '')}</p>
              )}
            </div>

            {/* Column ID — auto-generated from name, editable until first save */}
            {!isBuiltIn && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="dialog-formula-id">{t('trades.addColumnDialog.variableIdLabel')}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {t('trades.addColumnDialog.variableIdTooltip')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <InputGroup>
                  <InputGroupInput
                    id="dialog-formula-id"
                    placeholder={t('trades.addColumnDialog.variableIdPlaceholder')}
                    disabled={formulaIdLocked}
                    aria-invalid={!!errors.column_id}
                    {...register('column_id', {
                      onChange: () => { formulaIdManuallyEdited.current = true },
                    })}
                  />
                  {formulaIdChecking && (
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>
                        <Spinner className="size-3.5" />
                      </InputGroupText>
                    </InputGroupAddon>
                  )}
                  {!formulaIdLocked && (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        onClick={() => {
                          const generated = generateUniqueFormulaId(watchedName ?? '', existingFormulaIds, initialData?.columnId ?? null)
                          setValue('column_id', generated, { shouldValidate: true, shouldDirty: true })
                          formulaIdManuallyEdited.current = false
                        }}
                      >
                        {t('trades.addColumnDialog.generateIdButton')}
                      </InputGroupButton>
                    </InputGroupAddon>
                  )}
                </InputGroup>
                {!isEditing && (
                  <>
                    {errors.column_id ? (
                      <p className="text-xs text-destructive">{t(errors.column_id.message ?? '')}</p>
                    ) : formulaIdAvailable ? (
                      <div className="space-y-0.5">
                        <p className="text-xs text-green-600 dark:text-green-400">{t('trades.addColumnDialog.variableIdAvailable')}</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">{t('trades.addColumnDialog.variableIdLockWarning')}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t('trades.addColumnDialog.variableIdHint')}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="col-desc">{t('trades.addColumnDialog.descriptionLabel')}</Label>
              <Textarea
                id="col-desc"
                placeholder={t('trades.addColumnDialog.descriptionPlaceholder')}
                disabled={isBuiltIn}
                {...register('description')}
              />
            </div>

            {/* Cell Type */}
            <div className="space-y-1.5">
              <Label>{t('trades.addColumnDialog.cellTypeLabel')}</Label>
              <Controller
                control={control}
                name="format_type"
                render={({ field }) => (
                  <Select
                    value={['time', 'time24'].includes(field.value ?? '') ? 'time' : (field.value ?? 'auto')}
                    onValueChange={field.onChange}
                    disabled={isCellTypeLocked}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CELL_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Time format toggle — 12h / 24h */}
            {showTimeToggle && (
              <div className="space-y-1.5">
                <Label>{t('trades.addColumnDialog.timeFormatLabel')}</Label>
                <ToggleGroup
                  type="single"
                  variant="primary"
                  spacing={0}
                  value={watchedFormatType === 'time24' ? '24' : '12'}
                  onValueChange={(v) => {
                    if (!v) return
                    setValue('format_type', v === '24' ? 'time24' : 'time')
                  }}
                  className="w-full"
                >
                  <ToggleGroupItem value="12" className="flex-1">
{t('trades.addColumnDialog.timeFormat12h')}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="24" className="flex-1">
{t('trades.addColumnDialog.timeFormat24h')}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            {/* Dropdown options */}
            {showOptions && (
              <div className="space-y-1.5">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={optionRows.map((r) => r.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-1.5">
                      {optionRows.map((row) => (
                        <SortableOptionRow
                          key={row.id}
                          opt={row}
                          onLabelChange={updateOptionLabel}
                          onDelete={deleteOptionRow}
                          isLocked={isLockedItems}
                          shouldFocus={row.id === newRowId}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                <div className="flex items-center gap-1.5">
                  <GripVertical className="size-4 invisible" aria-hidden />
                  <Button type="button" variant="outline" className="flex-1" onClick={addOptionRow} disabled={isLockedItems}>
                    <Plus className="size-4" />
                    {t('trades.addColumnDialog.addOption')}
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" className="invisible" aria-hidden tabIndex={-1}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Formula section — shown for built-in formula cols (locked) and all custom cols */}
            {(!!showBuiltInFormula || !isBuiltIn) && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('trades.addColumnDialog.formulaLabel')}
                </p>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('trades.addColumnDialog.autoCalculateLabel')}</Label>
                    <p className="text-xs text-muted-foreground">{t('trades.addColumnDialog.autoCalculateDescription')}</p>
                  </div>
                  <Controller
                    control={control}
                    name="is_formula"
                    render={({ field }) => (
                      <Switch
                        checked={!!showBuiltInFormula || !!field.value}
                        onCheckedChange={field.onChange}
                        disabled={!!showBuiltInFormula}
                      />
                    )}
                  />
                </div>

                {showFormulaButton && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      formulaCodeSnapshot.current = formulaCode
                      setFormulaSheetOpen(true)
                    }}
                  >
                    <Code2 className="size-4" />
                    {t(showBuiltInFormula
                      ? 'trades.addColumnDialog.viewFormulaButton'
                      : 'trades.addColumnDialog.editFormulaButton'
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Danger zone — only for custom columns */}
            {isEditing && !isBuiltIn && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                  {t('trades.addColumnDialog.dangerZone')}
                </p>

                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-muted-foreground">
                    {t('trades.addColumnDialog.hideColumnDescription')}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 w-32"
                    onClick={() => {
                      onHideRequest?.()
                      handleOpenChange(false)
                    }}
                  >
                    <EyeOff className="size-3.5" />
                    {t('trades.addColumnDialog.hideColumnLabel')}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-muted-foreground">
                    {t('trades.addColumnDialog.deleteColumnDescription')}
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="shrink-0 w-32"
                    onClick={onDeleteRequest}
                  >
                    <Trash2 className="size-3.5" />
                    {t('trades.addColumnDialog.deleteColumnLabel')}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {t('trades.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting || (isBuiltIn && isCellTypeLocked && !showOptions && !showTimeToggle)}>
                <Spinner data-icon="inline-start" className={isSubmitting ? '' : 'hidden'} />
                {t(isEditing ? 'trades.addColumnDialog.saveEdit' : 'trades.addColumnDialog.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Formula drawer — opens alongside the dialog */}
      <Sheet open={formulaSheetOpen} onOpenChange={setFormulaSheetOpen}>
        <SheetContent side="right" className="w-200 sm:max-w-200 flex flex-col p-0">
          <SheetHeader className="border-b px-6 py-4 shrink-0">
            <SheetTitle>{title}, {t('trades.addColumnDialog.formulaLabel')}</SheetTitle>
          </SheetHeader>

          {/* CodeMirror — flex-1 so it fills all space between header and footer */}
          <div className="flex-1 overflow-hidden text-xs [&_.cm-editor]:outline-none [&_.cm-focused]:outline-none">
            <CodeMirror
              value={formulaCode}
              height="100%"
              style={{ height: '100%' }}
              extensions={[javascript()]}
              theme={resolvedTheme === 'dark' ? oneDark : 'light'}
              readOnly={!!showBuiltInFormula}
              onChange={setFormulaCode}
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                dropCursor: false,
                allowMultipleSelections: false,
                indentOnInput: true,
              }}
            />
          </div>

          {/* Footer — Save / Cancel */}
          <SheetFooter className="border-t px-6 py-3 flex-row justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormulaCode(formulaCodeSnapshot.current)
                setFormulaSheetOpen(false)
              }}
            >
              {t('trades.cancel')}
            </Button>
            <Button
              type="button"
              disabled={!!showBuiltInFormula}
              onClick={() => setFormulaSheetOpen(false)}
            >
              {t('trades.addColumnDialog.saveEdit')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trades.addColumnDialog.discardFormulaTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('trades.addColumnDialog.discardFormulaDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('trades.addColumnDialog.discardFormulaKeep')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDiscard}>
              {t('trades.addColumnDialog.discardFormulaConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
