// lib/trades/types.ts
export type Patch = {
  id: string
  user_id: string
  patch_number: number
  name: string
  patch_limit: number
  is_hidden: boolean
  sort_order: number
  created_at: string
}

export type RawTrade = {
  id: string
  patch_id: string
  trade_number: number
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
  created_at: string
  updated_at: string
}

export type EnrichedTrade = RawTrade & {
  r_multiple: number
  pnl: number
  realised_win: number | null
  realised_loss: number | null
  deviation: number | null      // null for winning trades
  risk_volatility: number | null // null for first trade in patch
  cumulative_pnl: number
  cumulative_r: number
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
}

export type TradePreview = {
  r_multiple: number
  realised_win: number | null
  realised_loss: number | null
}
