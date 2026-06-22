// lib/trades/calculations.ts
import type { RawTrade, EnrichedTrade, TradePreview } from './types'

export function deriveDirection(avg_entry: number, stop_loss: number): 'long' | 'short' {
  return avg_entry > stop_loss ? 'long' : 'short'
}

export function enrichTrades(trades: RawTrade[]): EnrichedTrade[] {
  let cumulative_pnl = 0
  let cumulative_r = 0

  return trades.map((trade, index) => {
    let pnl: number | null
    let r_multiple: number | null
    if (trade.realised_win !== null) {
      pnl = trade.realised_win
      r_multiple = trade.risk !== 0 ? pnl / trade.risk : 0
    } else if (trade.realised_loss !== null) {
      pnl = -trade.realised_loss
      r_multiple = trade.risk !== 0 ? pnl / trade.risk : 0
    } else {
      pnl = null
      r_multiple = null
    }
    const realised_win = trade.realised_win
    const realised_loss = trade.realised_loss
    // Deviation: only meaningful when user manually entered a realised_loss that exceeded planned risk
    const rawDeviation = trade.realised_loss !== null ? (trade.realised_loss - trade.risk) / trade.risk * 100 : null
    const deviation = rawDeviation !== null && rawDeviation > 0 ? rawDeviation : null
    const prev = index > 0 ? trades[index - 1] : null
    const risk_volatility =
      prev !== null ? (trade.risk - prev.risk) / prev.risk * 100 : null

    cumulative_pnl += pnl ?? 0
    cumulative_r += r_multiple ?? 0

    return {
      ...trade,
      r_multiple,
      pnl,
      realised_win,
      realised_loss,
      deviation,
      risk_volatility,
      cumulative_pnl: pnl !== null ? cumulative_pnl : null,
      cumulative_r: r_multiple !== null ? cumulative_r : null,
    }
  })
}

export function calcPreview(
  avg_entry: number | undefined,
  stop_loss: number | undefined,
  avg_exit: number | undefined,
  risk: number | undefined,
): TradePreview | null {
  if (!avg_entry || !stop_loss || !avg_exit || !risk) return null
  if (avg_entry <= 0 || stop_loss <= 0 || avg_exit <= 0 || risk <= 0) return null

  const direction = deriveDirection(avg_entry, stop_loss)
  const factor = direction === 'long' ? 1 : -1
  const riskDistance = (avg_entry - stop_loss) * factor
  if (riskDistance <= 0) return null

  const r_multiple = (avg_exit - avg_entry) * factor / riskDistance
  const pnl = r_multiple * risk

  return {
    r_multiple,
    realised_win: pnl > 0 ? pnl : null,
    realised_loss: pnl < 0 ? Math.abs(pnl) : null,
  }
}
