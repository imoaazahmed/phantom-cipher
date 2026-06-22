// lib/trades/calculations.ts
import type { RawTrade, EnrichedTrade, TradePreview } from './types'

export function deriveDirection(avg_entry: number, stop_loss: number): 'long' | 'short' {
  return avg_entry > stop_loss ? 'long' : 'short'
}

function calcR(avg_entry: number, stop_loss: number, avg_exit: number): number {
  const direction = deriveDirection(avg_entry, stop_loss)
  const factor = direction === 'long' ? 1 : -1
  const priceDiff = (avg_exit - avg_entry) * factor
  const riskDistance = (avg_entry - stop_loss) * factor
  if (riskDistance === 0) return 0
  return priceDiff / riskDistance
}

export function enrichTrades(trades: RawTrade[]): EnrichedTrade[] {
  let cumulative_pnl = 0
  let cumulative_r = 0

  return trades.map((trade, index) => {
    const direction = deriveDirection(trade.avg_entry, trade.stop_loss)
    const r_multiple = calcR(trade.avg_entry, trade.stop_loss, trade.avg_exit)
    const pnl = r_multiple * trade.risk
    const realised_win = pnl > 0 ? pnl : null
    const realised_loss = pnl < 0 ? Math.abs(pnl) : null
    // deviation only shown for losing trades
    const deviation =
      pnl < 0 ? (Math.abs(pnl) - trade.risk) / trade.risk * 100 : null
    const prev = index > 0 ? trades[index - 1] : null
    const risk_volatility =
      prev !== null ? (trade.risk - prev.risk) / prev.risk * 100 : null

    cumulative_pnl += pnl
    cumulative_r += r_multiple

    return {
      ...trade,
      direction,
      r_multiple,
      pnl,
      realised_win,
      realised_loss,
      deviation,
      risk_volatility,
      cumulative_pnl,
      cumulative_r,
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
