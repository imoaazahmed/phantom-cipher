import type { ColumnSetting, FormulaRow } from './types'

// Reserved parameter names — cannot be used as formula_id values
export const BUILT_IN_PARAM_NAMES = new Set([
  'avg_entry', 'avg_exit', 'stop_loss', 'risk',
  'realised_win', 'realised_loss', 'direction', 'order_type', 'ticker',
  'trade_date', 'trade_time', 'rules_followed', 'setup_type', 'trade_number',
  'pnl', 'prev_risk', 'running_pnl', 'running_r', 'row_index',
])

const PARAM_LIST =
  '{ avg_entry, avg_exit, stop_loss, risk, realised_win, realised_loss, ' +
  'direction, order_type, ticker, trade_date, trade_time, rules_followed, setup_type, trade_number, ' +
  'pnl, prev_risk, running_pnl, running_r, row_index, ...rest }'

export function compileFormula(code: string): (row: FormulaRow) => unknown {
  return new Function(PARAM_LIST, code) as (row: FormulaRow) => unknown
}

/**
 * Sort formula columns so that if column B's formula references column A's
 * column_id, A is evaluated before B. Uses Kahn's algorithm.
 * Cycles are broken by appending remaining nodes at the end.
 */
export function topoSort(columns: ColumnSetting[]): ColumnSetting[] {
  const ids = new Set(columns.map(c => c.column_id))

  // For each column, find which other column_ids appear in its code
  const depMap = new Map<string, string[]>() // columnId → [dep columnIds]
  for (const col of columns) {
    if (!col.formula) continue
    const myDeps: string[] = []
    for (const id of ids) {
      if (id !== col.column_id && col.formula.includes(id)) {
        myDeps.push(id)
      }
    }
    depMap.set(col.column_id, myDeps)
  }

  const byColumnId = new Map(columns.map(c => [c.column_id, c]))

  // Build: graph[A] = [B, C] means B and C depend on A (A must come first)
  const graph = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const id of ids) {
    graph.set(id, [])
    inDegree.set(id, 0)
  }
  for (const [id, deps] of depMap) {
    for (const dep of deps) {
      graph.get(dep)!.push(id)
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1)
    }
  }

  // Kahn's algorithm
  const queue = Array.from(ids).filter(id => (inDegree.get(id) ?? 0) === 0)
  const sorted: ColumnSetting[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    const col = byColumnId.get(id)
    if (col) sorted.push(col)
    for (const dependent of (graph.get(id) ?? [])) {
      const deg = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, deg)
      if (deg === 0) queue.push(dependent)
    }
  }

  // Append any remaining nodes (cycles) at the end
  const sortedIds = new Set(sorted.map(c => c.column_id))
  for (const col of columns) {
    if (!sortedIds.has(col.column_id)) sorted.push(col)
  }

  return sorted
}
