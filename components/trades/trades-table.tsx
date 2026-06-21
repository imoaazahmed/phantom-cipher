"use client"

import { useMemo, useState } from 'react'
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
import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { EnrichedTrade } from '@/lib/trades/types'
import { PINNED_COLUMN, DEFAULT_COLUMN_ORDER, resolveColumnOrder } from '@/lib/trades/column-order'

type Props = {
  trades: EnrichedTrade[]
  scrolledX?: boolean
  scrolledY?: boolean
  initialColumnOrder: string[] | null
  onColumnReorder: (order: string[]) => void
  columnVisibility: Record<string, boolean>
  onHideColumn: (columnId: string) => void
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
  return `${parseInt(d)} ${months[parseInt(m) - 1]} '${year}`
}

function fmtTime(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':')
  const h = parseInt(hStr)
  const ampm = h >= 12 ? 'P' : 'A'
  const h12 = h % 12 || 12
  return `${h12}:${mStr} ${ampm}`
}

function HeaderCell({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger>
        {label}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

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
        cursor: 'grab',
      }}
      className={className}
      {...attributes}
      {...listeners}
    >
      {children}
    </TableHead>
  )
}

export function TradesTable({ trades, scrolledX, scrolledY, initialColumnOrder, onColumnReorder, columnVisibility, onHideColumn }: Props) {
  const { t } = useTranslation()

  const [columnOrder, setColumnOrder] = useState<string[]>([PINNED_COLUMN, ...resolveColumnOrder(initialColumnOrder, DEFAULT_COLUMN_ORDER)])

  const sensors = useSensors(useSensor(PointerSensor))

  const columns = useMemo<ColumnDef<EnrichedTrade>[]>(
    () => [
      {
        accessorKey: 'trade_number',
        header: () => <HeaderCell label={t('trades.columns.number')} tooltip={t('trades.columnTooltips.number')} />,
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: 'trade_date',
        header: () => <HeaderCell label={t('trades.columns.date')} tooltip={t('trades.columnTooltips.date')} />,
        cell: ({ getValue }) => fmtDate(getValue<string>()),
      },
      {
        accessorKey: 'trade_time',
        header: () => <HeaderCell label={t('trades.columns.time')} tooltip={t('trades.columnTooltips.time')} />,
        cell: ({ getValue }) => fmtTime(getValue<string>()),
      },
      {
        accessorKey: 'ticker',
        header: () => <HeaderCell label={t('trades.columns.ticker')} tooltip={t('trades.columnTooltips.ticker')} />,
      },
      {
        accessorKey: 'direction',
        header: () => <HeaderCell label={t('trades.columns.direction')} tooltip={t('trades.columnTooltips.direction')} />,
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
        header: () => <HeaderCell label={t('trades.columns.orderType')} tooltip={t('trades.columnTooltips.orderType')} />,
        cell: ({ getValue }) => t(`trades.orderType.${getValue<string>()}`),
      },
      {
        accessorKey: 'avg_entry',
        header: () => <HeaderCell label={t('trades.columns.avgEntry')} tooltip={t('trades.columnTooltips.avgEntry')} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmtCurrency(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'stop_loss',
        header: () => <HeaderCell label={t('trades.columns.stopLoss')} tooltip={t('trades.columnTooltips.stopLoss')} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmtCurrency(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'avg_exit',
        header: () => <HeaderCell label={t('trades.columns.avgExit')} tooltip={t('trades.columnTooltips.avgExit')} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmtCurrency(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'risk',
        header: () => <HeaderCell label={t('trades.columns.risk')} tooltip={t('trades.columnTooltips.risk')} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmtCurrency(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'realised_loss',
        header: () => <HeaderCell label={t('trades.columns.realisedLoss')} tooltip={t('trades.columnTooltips.realisedLoss')} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return null
          return <span className="tabular-nums text-red-500">{fmtCurrency(v)}</span>
        },
      },
      {
        accessorKey: 'realised_win',
        header: () => <HeaderCell label={t('trades.columns.realisedWin')} tooltip={t('trades.columnTooltips.realisedWin')} />,
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
        header: () => <HeaderCell label={t('trades.columns.deviation')} tooltip={t('trades.columnTooltips.deviation')} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return null
          return <span className="tabular-nums">{fmtPercent(v)}</span>
        },
      },
      {
        accessorKey: 'r_multiple',
        header: () => <HeaderCell label={t('trades.columns.rMultiple')} tooltip={t('trades.columnTooltips.rMultiple')} />,
        cell: ({ getValue }) => {
          const v = getValue<number>()
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
        header: () => <HeaderCell label={t('trades.columns.riskVolatility')} tooltip={t('trades.columnTooltips.riskVolatility')} />,
        cell: ({ getValue }) => {
          const v = getValue<number | null>()
          if (v === null) return null
          return <span className="tabular-nums">{fmtPercent(v)}</span>
        },
      },
      {
        accessorKey: 'cumulative_pnl',
        header: () => <HeaderCell label={t('trades.columns.cumulativePnl')} tooltip={t('trades.columnTooltips.cumulativePnl')} />,
        cell: ({ getValue }) => {
          const v = getValue<number>()
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
        header: () => <HeaderCell label={t('trades.columns.cumulativeR')} tooltip={t('trades.columnTooltips.cumulativeR')} />,
        cell: ({ getValue }) => {
          const v = getValue<number>()
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
        header: () => <HeaderCell label={t('trades.columns.rulesFollowed')} tooltip={t('trades.columnTooltips.rulesFollowed')} />,
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
        header: () => <HeaderCell label={t('trades.columns.setupType')} tooltip={t('trades.columnTooltips.setupType')} />,
      },
    ],
    [t]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = columnOrder.indexOf(active.id as string)
    const newIndex = columnOrder.indexOf(over.id as string)
    const next = arrayMove(columnOrder, oldIndex, newIndex)
    setColumnOrder(next)
    onColumnReorder(next.filter((id) => id !== PINNED_COLUMN))
  }

  const table = useReactTable({
    data: trades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnOrder, columnVisibility },
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
                items={columnOrder.filter((id) => id !== PINNED_COLUMN)}
                strategy={horizontalListSortingStrategy}
              >
                {hg.headers.map((h) => {
                  const isPinned = h.column.id === PINNED_COLUMN
                  const headClassName = cn(
                    'sticky top-0 z-10 bg-background',
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
                    <DraggableHeader key={h.id} id={h.column.id} className={headClassName}>
                      <ContextMenu>
                        <ContextMenuTrigger className="flex w-full items-center justify-center">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => onHideColumn(h.column.id)}>
                            {t('trades.columns.hide')}
                          </ContextMenuItem>
                          <ContextMenuItem disabled>
                            {t('trades.columns.delete')}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </DraggableHeader>
                  )
                })}
              </SortableContext>
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {table.getVisibleLeafColumns().map((col) => {
                  const isPinned = col.id === PINNED_COLUMN
                  return (
                    <TableCell
                      key={col.id}
                      className={cn(isPinned && cn('sticky inset-s-0 z-10 w-12.5 min-w-12.5 bg-background', scrolledX && colShadow))}
                    >
                      &nbsp;
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const isPinned = cell.column.id === PINNED_COLUMN
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(isPinned && cn('sticky inset-s-0 z-10 w-12.5 min-w-12.5 bg-background', scrolledX && colShadow))}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </DndContext>
    </div>
    </TooltipProvider>
  )
}
