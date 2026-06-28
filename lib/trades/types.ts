// lib/trades/types.ts
export type Patch = {
  id: string
  user_id: string
  patch_number: number
  name: string
  patch_limit: number
  is_hidden: boolean
  sort_order: number
  column_order: string[] | null
  column_visibility: Record<string, boolean> | null
  created_at: string
}

export type RawTrade = {
  id: string
  patch_id: string
  trade_number: number
  sort_order: number
  trade_date: string | null       // "YYYY-MM-DD"
  trade_time: string | null       // "HH:MM:SS"
  ticker: string | null
  direction: 'long' | 'short' | null
  order_type: 'market' | 'limit' | null
  avg_entry: number | null
  stop_loss: number | null
  avg_exit: number | null
  risk: number | null
  rules_followed: boolean | null
  setup_type: string | null
  realised_win: number | null
  realised_loss: number | null
  custom_data?: Record<string, string>
  created_at: string
  updated_at: string
}

// Primitives pre-computed by enrichTrades before any formula runs.
// All five formula columns (r_multiple, deviation, etc.) now live in custom_data.
export type EnrichedTrade = RawTrade & {
  pnl: number | null
  prev_risk: number | null
  running_pnl: number          // cumulative pnl of all rows BEFORE this one
  running_r: number            // cumulative r_multiple of all rows BEFORE this one
  row_index: number
}

// The parameter object destructured inside every formula function body.
export type FormulaRow = {
  // Raw trade fields (nullable since trade fields are now nullable)
  avg_entry: number | null
  avg_exit: number | null
  stop_loss: number | null
  risk: number | null
  realised_win: number | null
  realised_loss: number | null
  direction: 'long' | 'short' | null
  order_type: 'market' | 'limit' | null
  ticker: string | null
  trade_date: string | null
  trade_time: string | null
  rules_followed: boolean | null
  setup_type: string | null
  trade_number: number
  // Computed primitives
  pnl: number | null
  prev_risk: number | null
  running_pnl: number
  running_r: number
  row_index: number
  [key: string]: unknown   // earlier formula results accumulated in topo order
}

// Runtime shape passed from trades-client to enrichTrades.
export type FormulaColumn = {
  columnId: string    // e.g. "r_multiple" or "custom_abc123" — key in custom_data
  formulaId: string   // e.g. "r_multiple" or "coinSize" — variable name in FormulaRow
  fn: (row: FormulaRow) => unknown
}

export type TradeFormData = {
  trade_date?: string | null
  trade_time?: string | null
  ticker?: string | null
  direction?: 'long' | 'short' | null
  order_type?: 'market' | 'limit' | null
  avg_entry?: number | null
  stop_loss?: number | null
  avg_exit?: number | null
  risk?: number | null
  rules_followed?: boolean | null
  setup_type?: string | null
  realised_win?: number | null
  realised_loss?: number | null
  custom_data?: Record<string, string>
}

export type TradePreview = {
  r_multiple: number
  realised_win: number | null
  realised_loss: number | null
}

export type ColumnOption = {
  id: string
  column_id: string
  value: string
  label: string
  position: number
  created_at: string
}

export const FORMAT_TYPES = ['auto', 'text', 'currency', 'number', 'percent', 'date', 'time', 'time24', 'dropdown'] as const
export type FormatType = (typeof FORMAT_TYPES)[number]

export type ColumnSetting = {
  id: string
  user_id: string | null
  column_id: string
  name: string
  description: string | null
  format_type: FormatType
  is_formula: boolean
  formula: string | null
  created_at: string
  updated_at: string
}
