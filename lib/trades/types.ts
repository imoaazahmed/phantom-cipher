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

export type EnrichedTrade = RawTrade & {
  r_multiple: number | null
  pnl: number | null
  deviation: number | null      // null when loss did not exceed planned risk (or trade was a win)
  risk_volatility: number | null // null for first trade in patch
  cumulative_pnl: number | null
  cumulative_r: number | null
}

export type TradeFormData = {
  trade_date: string         // "YYYY-MM-DD"
  trade_time: string         // "HH:MM" from form input, converted to "HH:MM:SS" before saving
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
  created_at: string
  updated_at: string
}
