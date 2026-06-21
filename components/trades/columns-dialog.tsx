"use client"

import { Columns3Cog } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { DEFAULT_COLUMN_ORDER, COLUMN_LABELS } from '@/lib/trades/column-order'

type ColumnsDialogProps = {
  columnVisibility: Record<string, boolean>
  onVisibilityChange: (columnId: string, visible: boolean) => void
}

export function ColumnsDialog({ columnVisibility, onVisibilityChange }: ColumnsDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('trades.columns.manageColumns')}>
          <Columns3Cog className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('trades.columns.manageColumns')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {DEFAULT_COLUMN_ORDER.map((id) => {
            const checked = columnVisibility[id] !== false
            return (
              <div key={id} className="flex items-center gap-3">
                <Checkbox
                  id={`col-${id}`}
                  checked={checked}
                  onCheckedChange={(value) => onVisibilityChange(id, value === true)}
                />
                <Label htmlFor={`col-${id}`} className="cursor-pointer font-normal">
                  {t(COLUMN_LABELS[id])}
                </Label>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
