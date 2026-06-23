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
  trade_date: string       // "YYYY-MM-DD"
  trade_time: string       // "HH:MM:SS"
  ticker: string
  direction: 'long' | 'short'
  order_type: 'market' | 'limit'
  avg_entry: number
  stop_loss: number
  avg_exit: number
  risk: number
  rules_followed: boolean
  setup_type: string
  realised_win: number | null
  realised_loss: number | null
  is_draft?: boolean
  draft_fields?: string[]
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
  avg_entry: number
  avg_exit: number
  stop_loss: number
  risk: number
  realised_win: number | null
  realised_loss: number | null
  direction: 'long' | 'short'
  ticker: string
  trade_date: string
  trade_time: string
  rules_followed: boolean
  setup_type: string
  trade_number: number
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
  trade_date: string
  trade_time: string
  ticker: string
  direction: 'long' | 'short'
  order_type: 'market' | 'limit'
  avg_entry: number
  stop_loss: number
  avg_exit: number
  risk: number
  rules_followed: boolean
  setup_type: string
  realised_win?: number | null
  realised_loss?: number | null
  draft_fields?: string[]
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
  column_id: string
  name: string
  description: string | null
  format_type: FormatType
  is_formula: boolean
  formula: string | null
  formula_id: string | null
  created_at: string
  updated_at: string
}
