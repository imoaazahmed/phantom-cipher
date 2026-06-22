"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { useTranslation } from 'react-i18next'
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
import { EyeOff, GripVertical, Info, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

export type EditColumnData = {
  columnId: string
  name: string
  description: string | null
  format_type: FormatType
  isBuiltIn?: boolean
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
}: {
  opt: OptionRow
  onLabelChange: (id: string, label: string) => void
  onDelete: (id: string) => void
  isLocked?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opt.id,
  })

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
}: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const nameRef = useRef<HTMLInputElement | null>(null)

  const isEditing = !!initialData
  const isBuiltIn = isEditing && !(initialData.columnId.startsWith('custom_'))
  // Items locked: order_type and rules_followed options can't be modified
  const isLockedItems = isBuiltIn && LOCKED_DROPDOWN_IDS.has(initialData.columnId)
  // Cell type locked: all built-in columns except setup_type can't change their cell type
  const isCellTypeLocked = isBuiltIn && initialData.columnId !== FLEXIBLE_BUILT_IN

  const [optionRows, setOptionRows] = useState<OptionRow[]>([])
  const prevFormatRef = useRef<string>('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ColumnSettingFormData>({
    resolver: yupResolver(columnSettingSchema),
    defaultValues: { name: '', description: '', format_type: 'auto' },
  })

  const watchedFormatType = useWatch({ control, name: 'format_type' })
  const showOptions = watchedFormatType === 'dropdown'

  useEffect(() => {
    if (open) {
      const fmt = initialData?.format_type ?? 'auto'
      reset({
        name: initialData?.name ?? '',
        description: initialData?.description ?? '',
        format_type: fmt,
      })
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
    if (!next) reset()
    onOpenChange(next)
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
    setOptionRows((prev) => [...prev, { id: crypto.randomUUID(), value: '', label: '' }])
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

    // Custom column — create or update
    if (isEditing) {
      const { error } = await updateColumnSetting(initialData!.columnId, {
        name: data.name,
        description: data.description || undefined,
        format_type,
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {errors.root && (
            <p className="text-sm text-destructive">{errors.root.message}</p>
          )}

          {isBuiltIn && (
            <Alert>
              <Info />
              <AlertDescription className="text-sm text-foreground">
                {t(isLockedItems
                  ? 'trades.addColumnDialog.builtInLockedItemsAlert'
                  : 'trades.addColumnDialog.builtInAlert'
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Column Name — shown for all; disabled for built-in */}
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

          {/* Description — shown for all; disabled for built-in */}
          <div className="space-y-1.5">
            <Label htmlFor="col-desc">{t('trades.addColumnDialog.descriptionLabel')}</Label>
            <Textarea
              id="col-desc"
              placeholder={t('trades.addColumnDialog.descriptionPlaceholder')}
              disabled={isBuiltIn}
              {...register('description')}
            />
          </div>

          {/* Cell Type — shown for all; disabled for built-in except setup_type */}
          <div className="space-y-1.5">
            <Label>{t('trades.addColumnDialog.cellTypeLabel')}</Label>
            <Controller
              control={control}
              name="format_type"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'auto'}
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

          {/* Danger zone — only for custom columns */}
          {isEditing && !isBuiltIn && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                {t('trades.addColumnDialog.dangerZone')}
              </p>

              {/* Hide */}
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  {t('trades.addColumnDialog.hideColumnDescription')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    onHideRequest?.()
                    handleOpenChange(false)
                  }}
                >
                  <EyeOff className="size-3.5" />
                  {t('trades.addColumnDialog.hideColumnLabel')}
                </Button>
              </div>

              {/* Delete */}
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  {t('trades.addColumnDialog.deleteColumnDescription')}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="shrink-0"
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
            <Button type="submit" disabled={isSubmitting}>
              <Spinner data-icon="inline-start" className={isSubmitting ? '' : 'hidden'} />
              {t(isEditing ? 'trades.addColumnDialog.saveEdit' : 'trades.addColumnDialog.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
