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
