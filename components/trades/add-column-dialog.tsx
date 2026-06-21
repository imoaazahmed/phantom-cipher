"use client"

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { useTranslation } from 'react-i18next'
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
import { createColumnSetting, updateColumnSetting } from '@/lib/trades/actions'

export type EditColumnData = {
  columnId: string
  name: string
  description: string | null
  format_type: FormatType
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: EditColumnData
}

const FORMAT_OPTIONS = [
  { value: 'auto',     labelKey: 'trades.addColumnDialog.formatAuto' },
  { value: 'text',     labelKey: 'trades.addColumnDialog.formatText' },
  { value: 'currency', labelKey: 'trades.addColumnDialog.formatCurrency' },
  { value: 'percent',  labelKey: 'trades.addColumnDialog.formatPercent' },
  { value: 'date',     labelKey: 'trades.addColumnDialog.formatDate' },
  { value: 'time',     labelKey: 'trades.addColumnDialog.formatTime' },
  { value: 'number',   labelKey: 'trades.addColumnDialog.formatNumber' },
] as const

export function AddColumnDialog({ open, onOpenChange, initialData }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const nameRef = useRef<HTMLInputElement | null>(null)
  const isEditing = !!initialData

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

  // Re-populate form whenever the dialog opens or switches between create/edit.
  useEffect(() => {
    if (open) {
      reset({
        name: initialData?.name ?? '',
        description: initialData?.description ?? '',
        format_type: initialData?.format_type ?? 'auto',
      })
      // Focus name input after Radix finishes its own focus management.
      requestAnimationFrame(() => nameRef.current?.focus())
    }
  }, [open, initialData]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function onSubmit(data: ColumnSettingFormData) {
    const format_type = data.format_type ?? 'auto'

    const { error } = isEditing
      ? await updateColumnSetting(initialData.columnId, {
          name: data.name,
          description: data.description || undefined,
          format_type,
        })
      : await createColumnSetting({
          name: data.name,
          description: data.description || undefined,
          format_type,
        })

    if (error) {
      setError('root', { message: t(error) })
      return
    }

    reset()
    onOpenChange(false)
    router.refresh()
  }

  const { ref: nameFieldRef, ...nameFieldProps } = register('name')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'trades.addColumnDialog.editTitle' : 'trades.columns.addColumn')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {errors.root && (
            <p className="text-sm text-destructive">{errors.root.message}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="col-name">{t('trades.addColumnDialog.nameLabel')}</Label>
            <Input
              id="col-name"
              placeholder={t('trades.addColumnDialog.namePlaceholder')}
              aria-invalid={!!errors.name}
              ref={(el) => {
                nameFieldRef(el)
                nameRef.current = el
              }}
              {...nameFieldProps}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{t(errors.name.message ?? '')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="col-desc">{t('trades.addColumnDialog.descriptionLabel')}</Label>
            <Textarea
              id="col-desc"
              placeholder={t('trades.addColumnDialog.descriptionPlaceholder')}
              {...register('description')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('trades.addColumnDialog.formatLabel')}</Label>
            <Controller
              control={control}
              name="format_type"
              render={({ field }) => (
                <Select value={field.value ?? 'auto'} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
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
