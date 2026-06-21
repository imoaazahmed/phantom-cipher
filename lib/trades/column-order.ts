export const PINNED_COLUMN = 'trade_number'

// All non-pinned column keys in default definition order.
// Keep this in sync with the column definitions in trades-table.tsx.
export const DEFAULT_COLUMN_ORDER: string[] = [
  'trade_date',
  'trade_time',
  'ticker',
  'direction',
  'order_type',
  'avg_entry',
  'stop_loss',
  'avg_exit',
  'risk',
  'realised_loss',
  'realised_win',
  'deviation',
  'r_multiple',
  'risk_volatility',
  'cumulative_pnl',
  'cumulative_r',
  'rules_followed',
  'setup_type',
]

/**
 * Merges a saved column order with the live column list.
 *
 * - Saved IDs that no longer exist in allKeys are dropped.
 * - New IDs in allKeys not present in saved are appended at the end.
 * - trade_number (pinned) is never included — callers prepend it separately.
 */
export function resolveColumnOrder(
  saved: string[] | null,
  allKeys: string[]
): string[] {
  if (!saved || saved.length === 0) return allKeys
  const allSet = new Set(allKeys)
  const savedSet = new Set(saved)
  const kept = saved.filter((id) => allSet.has(id))
  const appended = allKeys.filter((id) => !savedSet.has(id))
  return [...kept, ...appended]
}

export const COLUMN_LABELS: Record<string, string> = {
  trade_date:      'trades.columns.date',
  trade_time:      'trades.columns.time',
  ticker:          'trades.columns.ticker',
  direction:       'trades.columns.direction',
  order_type:      'trades.columns.orderType',
  avg_entry:       'trades.columns.avgEntry',
  stop_loss:       'trades.columns.stopLoss',
  avg_exit:        'trades.columns.avgExit',
  risk:            'trades.columns.risk',
  realised_loss:   'trades.columns.realisedLoss',
  realised_win:    'trades.columns.realisedWin',
  deviation:       'trades.columns.deviation',
  r_multiple:      'trades.columns.rMultiple',
  risk_volatility: 'trades.columns.riskVolatility',
  cumulative_pnl:  'trades.columns.cumulativePnl',
  cumulative_r:    'trades.columns.cumulativeR',
  rules_followed:  'trades.columns.rulesFollowed',
  setup_type:      'trades.columns.setupType',
}
