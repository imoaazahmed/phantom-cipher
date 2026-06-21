"use client"

import { useState } from 'react'
import { Columns3Cog, Plus, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DEFAULT_COLUMN_ORDER, COLUMN_LABELS, REQUIRED_COLUMNS } from '@/lib/trades/column-order'
import type { ColumnSetting } from '@/lib/trades/types'
import { AddColumnDialog } from './add-column-dialog'

type ColumnsDialogProps = {
  columnVisibility: Record<string, boolean>
  onVisibilityChange: (columnId: string, visible: boolean) => void
  onShowAll: () => void
  columnSettings?: ColumnSetting[]
}

export function ColumnsDialog({ columnVisibility, onVisibilityChange, onShowAll, columnSettings = [] }: ColumnsDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [addColumnOpen, setAddColumnOpen] = useState(false)

  const customColumns = columnSettings.filter((s) => s.column_id.startsWith('custom_'))

  const query = search.trim().toLowerCase()
  const filtered = DEFAULT_COLUMN_ORDER.filter((id) => {
    if (!query) return true
    const label = t(COLUMN_LABELS[id]).toLowerCase()
    const desc = t(COLUMN_LABELS[id].replace('.columns.', '.columnTooltips.')).toLowerCase()
    return label.includes(query) || desc.includes(query)
  })

  return (
    <Dialog onOpenChange={() => setSearch('')}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('trades.columns.manageColumns')}>
                <Columns3Cog className="size-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{t('trades.columns.manageColumns')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('trades.columns.manageColumns')}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('trades.columns.searchPlaceholder')}
            className="ps-9"
          />
        </div>

        <ScrollArea className="max-h-96">
          {filtered.length === 0 && customColumns.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('trades.columns.searchEmpty')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1 pe-3">
              {filtered.map((id) => {
                const required = REQUIRED_COLUMNS.has(id)
                const checked = required || columnVisibility[id] !== false
                const descKey = COLUMN_LABELS[id].replace('.columns.', '.columnTooltips.')
                return (
                  <Label
                    key={id}
                    htmlFor={`col-${id}`}
                    className="flex items-start gap-3 px-2 py-2.5 hover:bg-accent"
                    style={{ cursor: required ? 'default' : 'pointer' }}
                  >
                    <Checkbox
                      id={`col-${id}`}
                      checked={checked}
                      disabled={required}
                      onCheckedChange={(value) => onVisibilityChange(id, value === true)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium leading-none">
                        {t(COLUMN_LABELS[id])}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(descKey)}
                      </p>
                    </div>
                  </Label>
                )
              })}
              {customColumns.map((s) => {
                const checked = columnVisibility[s.column_id] !== false
                return (
                  <Label
                    key={s.column_id}
                    htmlFor={`col-${s.column_id}`}
                    className="flex items-start gap-3 px-2 py-2.5 hover:bg-accent"
                  >
                    <Checkbox
                      id={`col-${s.column_id}`}
                      checked={checked}
                      onCheckedChange={(value) => onVisibilityChange(s.column_id, value === true)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium leading-none">{s.name}</p>
                      {s.description && (
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      )}
                    </div>
                  </Label>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onShowAll}>
            {t('trades.columns.showAll')}
          </Button>
          <Button className="flex-1" onClick={() => setAddColumnOpen(true)}>
            <Plus className="size-4" />
            {t('trades.columns.addColumn')}
          </Button>
        </div>
      </DialogContent>
      <AddColumnDialog open={addColumnOpen} onOpenChange={setAddColumnOpen} />
    </Dialog>
  )
}
