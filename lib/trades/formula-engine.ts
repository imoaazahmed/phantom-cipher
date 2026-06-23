import type { ColumnSetting, FormulaRow } from './types'

// Reserved parameter names — cannot be used as formula_id values
export const BUILT_IN_PARAM_NAMES = new Set([
  'avg_entry', 'avg_exit', 'stop_loss', 'risk',
  'realised_win', 'realised_loss', 'direction', 'ticker',
  'trade_date', 'trade_time', 'rules_followed', 'setup_type', 'trade_number',
  'pnl', 'prev_risk', 'running_pnl', 'running_r', 'row_index',
])

const PARAM_LIST =
  '{ avg_entry, avg_exit, stop_loss, risk, realised_win, realised_loss, ' +
  'direction, ticker, trade_date, trade_time, rules_followed, setup_type, trade_number, ' +
  'pnl, prev_risk, running_pnl, running_r, row_index, ...rest }'

export function compileFormula(code: string): (row: FormulaRow) => unknown {
  return new Function(PARAM_LIST, code) as (row: FormulaRow) => unknown
}

/**
 * Sort formula columns so that if column B's formula references column A's
 * formula_id, A is evaluated before B. Uses Kahn's algorithm.
 * Cycles are broken by appending remaining nodes at the end.
 */
export function topoSort(columns: ColumnSetting[]): ColumnSetting[] {
  const formulaCols = columns.filter(c => c.formula_id)
  const ids = new Set(formulaCols.map(c => c.formula_id as string))

  // For each column, find which other formula_ids appear in its code
  const depMap = new Map<string, string[]>() // formulaId → [dep formulaIds]
  for (const col of formulaCols) {
    if (!col.formula || !col.formula_id) continue
    const myDeps: string[] = []
    for (const id of ids) {
      if (id !== col.formula_id && col.formula.includes(id)) {
        myDeps.push(id)
      }
    }
    depMap.set(col.formula_id, myDeps)
  }

  const byFormulaId = new Map(formulaCols.map(c => [c.formula_id as string, c]))

  // Build: graph[A] = [B, C] means B and C depend on A (A must come first)
  const graph = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const fid of ids) {
    graph.set(fid, [])
    inDegree.set(fid, 0)
  }
  for (const [fid, deps] of depMap) {
    for (const dep of deps) {
      graph.get(dep)!.push(fid)
      inDegree.set(fid, (inDegree.get(fid) ?? 0) + 1)
    }
  }

  // Kahn's algorithm
  const queue = Array.from(ids).filter(fid => (inDegree.get(fid) ?? 0) === 0)
  const sorted: ColumnSetting[] = []

  while (queue.length > 0) {
    const fid = queue.shift()!
    const col = byFormulaId.get(fid)
    if (col) sorted.push(col)
    for (const dependent of (graph.get(fid) ?? [])) {
      const deg = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, deg)
      if (deg === 0) queue.push(dependent)
    }
  }

  // Append any remaining nodes (cycles) at the end
  const sortedIds = new Set(sorted.map(c => c.formula_id))
  for (const col of formulaCols) {
    if (!sortedIds.has(col.formula_id)) sorted.push(col)
  }

  // Preserve non-formula columns at their original positions (shouldn't happen
  // since caller filters to is_formula, but guard anyway)
  return sorted
}
