"use client"

import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { EnrichedTrade } from '@/lib/trades/types'

type Props = {
  trades: EnrichedTrade[]
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

export function TradesTable({ trades }: Props) {
  const { t } = useTranslation()

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

  const table = useReactTable({
    data: trades,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <TooltipProvider>
    <div className="bg-background overflow-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id} className="whitespace-nowrap">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={'id' in col ? col.id : col.accessorKey as string} className="whitespace-nowrap">
                    &nbsp;
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  )
}
