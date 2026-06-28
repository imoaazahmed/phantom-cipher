import type { FormatType } from './types'

export const DEFAULT_MENU_OPTIONS: Record<string, { value: string; label: string }[]> = {
  direction: [
    { value: 'long', label: 'Long' },
    { value: 'short', label: 'Short' },
  ],
  ticker: [
    { value: 'BTC', label: 'BTC' },
    { value: 'ETH', label: 'ETH' },
  ],
  order_type: [
    { value: 'market', label: 'Market' },
    { value: 'limit', label: 'Limit' },
  ],
  rules_followed: [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ],
  setup_type: [
    { value: 'Trend Following', label: 'Trend Following' },
    { value: 'Pull-back', label: 'Pull-back' },
    { value: 'Trend Reversal', label: 'Trend Reversal' },
    { value: 'SFP', label: 'SFP' },
    { value: 'Breakout', label: 'Breakout' },
  ],
}

// Columns that use MenuCellEditor for inline cell editing
export const MENU_COLUMN_IDS = new Set(['ticker', 'order_type', 'rules_followed', 'setup_type'])

// Default format_type for each built-in column (used in settings dialog)
export const BUILT_IN_FORMAT_TYPES: Record<string, FormatType> = {
  trade_date:     'date',
  trade_time:     'time',
  ticker:         'dropdown',
  direction:      'dropdown',
  order_type:     'dropdown',
  avg_entry:      'currency',
  stop_loss:      'currency',
  avg_exit:       'currency',
  risk:           'currency',
  realised_loss:  'currency',
  realised_win:   'currency',
  deviation:      'percent',
  r_multiple:     'number',
  risk_volatility: 'percent',
  cumulative_pnl: 'currency',
  cumulative_r:   'number',
  rules_followed: 'dropdown',
  setup_type:     'dropdown',
}
