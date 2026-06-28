// lib/trades/calculations.ts
import type { RawTrade, EnrichedTrade, FormulaColumn, FormulaRow, TradePreview } from './types'

export function deriveDirection(avg_entry: number | null, stop_loss: number | null): 'long' | 'short' | null {
  if (!avg_entry || !stop_loss) return null
  return avg_entry > stop_loss ? 'long' : 'short'
}

export function enrichTrades(
  trades: RawTrade[],
  formulaColumns: FormulaColumn[] = []
): EnrichedTrade[] {
  let running_pnl = 0
  let running_r = 0

  return trades.map((trade, index) => {
    const prev = index > 0 ? trades[index - 1] : null
    const pnl: number | null =
      trade.realised_win != null
        ? trade.realised_win
        : trade.realised_loss != null
        ? -trade.realised_loss
        : null

    const primitives = {
      pnl,
      prev_risk: prev?.risk ?? null,
      running_pnl,   // sum of pnl of all rows BEFORE this one
      running_r,     // sum of r_multiple of all rows BEFORE this one
      row_index: index,
    }

    const formulaRow: FormulaRow = {
      avg_entry: trade.avg_entry ?? null,
      avg_exit: trade.avg_exit ?? null,
      stop_loss: trade.stop_loss ?? null,
      risk: trade.risk ?? null,
      realised_win: trade.realised_win ?? null,
      realised_loss: trade.realised_loss ?? null,
      direction: trade.direction ?? null,
      order_type: trade.order_type ?? null,
      ticker: trade.ticker ?? null,
      trade_date: trade.trade_date ?? null,
      trade_time: trade.trade_time ?? null,
      rules_followed: trade.rules_followed ?? null,
      setup_type: trade.setup_type ?? null,
      trade_number: trade.trade_number,
      ...primitives,
    }

    const newCustomData: Record<string, string> = { ...(trade.custom_data ?? {}) }

    for (const col of formulaColumns) {
      try {
        const result = col.fn(formulaRow)
        if (result != null) {
          newCustomData[col.columnId] = String(result)
          ;(formulaRow as Record<string, unknown>)[col.formulaId] = result
        }
      } catch {
        // formula error → cell shows blank; never crash the page
      }
    }

    // Accumulate running totals using formula engine results
    running_pnl += pnl ?? 0
    running_r += typeof formulaRow['r_multiple'] === 'number' ? formulaRow['r_multiple'] : 0

    return { ...trade, ...primitives, custom_data: newCustomData }
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
