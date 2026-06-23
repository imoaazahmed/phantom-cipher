# Formula Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded enrichment pipeline with a unified formula engine where every computed column — built-in or user-created — is driven by a JavaScript formula string stored in `column_settings`, compiled once, and evaluated per-row.

**Architecture:** Built-in formula rows live in `column_settings` with `user_id = NULL`. User formula rows have `user_id = auth.uid()` and `is_formula = true`. `enrichTrades` now only pre-computes cross-row primitives (pnl, prev_risk, running totals); all column values flow through a topologically-sorted formula engine built on `new Function()`. The code panel in the column settings dialog shows the formula read-only for built-ins and editable for user columns via CodeMirror 6.

**Tech Stack:** CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-javascript`, `@codemirror/theme-one-dark`), `new Function()` formula engine, Supabase RLS, Next.js App Router, TypeScript, react-hook-form + yup.

## Global Constraints

- No rounded borders — use `rounded-none` if overriding a default
- Every visible string goes through `t()` — add to both `messages/en.json` and `messages/ar.json`
- All forms use `react-hook-form` + `yup` — no exceptions
- Memoize formula compilation — never recompile on every render
- `formula_id` must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, not conflict with `BUILT_IN_PARAM_NAMES`, and be unique across all `column_settings.formula_id` values for the user
- Built-in rows (`user_id = NULL`) are read-only — no user can edit or delete them

---

## File Map

| File | Action |
|---|---|
| `lib/trades/types.ts` | Update `ColumnSetting`, `EnrichedTrade`; add `FormulaRow`, `FormulaColumn` |
| `lib/trades/formula-engine.ts` | **Create** — `BUILT_IN_PARAM_NAMES`, `compileFormula`, `topoSort` |
| `lib/trades/calculations.ts` | Refactor `enrichTrades` to accept `FormulaColumn[]`; compute primitives only |
| `lib/trades/actions.ts` | Update `getColumnSettings` to include `user_id IS NULL` rows; add `formula_id` validation |
| `lib/schemas/column-setting.ts` | Add `is_formula`, `formula`, `formula_id` fields |
| `components/trades/trades-client.tsx` | Build `formulaColumns` useMemo; pass to `enrichTrades` and `TradesTable` |
| `components/trades/trades-table.tsx` | Remove `AUTO_GENERATED_COLS`; update column defs + draft renderers to read from `custom_data`; add `SquareFunction` icon to formula column headers; accept `formulaColumns` prop |
| `components/trades/add-column-dialog.tsx` | Add auto-calculate toggle, Variable ID field, CodeMirror panel; widen dialog |
| `messages/en.json` + `messages/ar.json` | Add i18n keys for all new UI strings |

---

## Task 1: DB Migration + Install Packages + Update Types

**Files:**
- Modify: `lib/trades/types.ts`

**Interfaces:**
- Produces: Updated `ColumnSetting` type with `is_formula`, `formula`, `formula_id`; new `EnrichedTrade` with primitives instead of computed fields; new `FormulaRow` and `FormulaColumn` types consumed by Tasks 2–6

- [ ] **Step 1: Run the DB migration in Supabase SQL editor**

Open Supabase dashboard → SQL Editor → New query. Run:

```sql
-- Allow NULL user_id for built-in rows
alter table public.column_settings
  alter column user_id drop not null;

-- New columns
alter table public.column_settings
  add column is_formula boolean not null default false,
  add column formula text null,
  add column formula_id text null unique;

-- Seed built-in formula rows
insert into public.column_settings
  (user_id, column_id, name, description, is_formula, formula_id, formula, format_type)
values
  (null, 'r_multiple', 'R+/-', 'Realised PnL divided by planned risk',
   true, 'r_multiple',
   'return risk !== 0 && pnl != null ? pnl / risk : null',
   'number'),

  (null, 'deviation', 'Deviation', 'How much the realised loss exceeded planned risk',
   true, 'deviation',
   E'if (realised_loss == null) return null\nconst d = (realised_loss - risk) / risk * 100\nreturn d > 0 ? d : null',
   'percent'),

  (null, 'risk_volatility', 'Risk Volatility', 'Change in risk vs the previous trade',
   true, 'risk_volatility',
   'return prev_risk != null ? (risk - prev_risk) / prev_risk * 100 : null',
   'percent'),

  (null, 'cumulative_pnl', 'Cumulative PnL $', 'Running total of realised PnL',
   true, 'cumulative_pnl',
   'return pnl != null ? running_pnl + pnl : null',
   'currency'),

  (null, 'cumulative_r', 'Cumulative R', 'Running total of R multiples',
   true, 'cumulative_r',
   'return r_multiple != null ? running_r + r_multiple : null',
   'number');

-- Drop old single RLS policy; replace with split policies
drop policy "Users can manage their own column settings" on public.column_settings;

create policy "Read built-in and own column settings"
  on public.column_settings for select
  using (user_id is null or auth.uid() = user_id);

create policy "Insert own column settings"
  on public.column_settings for insert
  with check (auth.uid() = user_id);

create policy "Update own column settings"
  on public.column_settings for update
  using (auth.uid() = user_id);

create policy "Delete own column settings"
  on public.column_settings for delete
  using (auth.uid() = user_id);
```

Also run the same migration on the **production** Supabase project (`trading-logs-prod`) when ready to ship.

- [ ] **Step 2: Install CodeMirror packages**

```bash
npm install @uiw/react-codemirror @codemirror/lang-javascript @codemirror/theme-one-dark
```

Expected: packages added to `package.json`, no errors.

- [ ] **Step 3: Update `lib/trades/types.ts`**

Replace the entire file with:

```ts
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
```

- [ ] **Step 4: Verify TypeScript (expect errors — that's fine)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors referencing `r_multiple`, `deviation`, `risk_volatility`, `cumulative_pnl`, `cumulative_r` on `EnrichedTrade` — these are fixed in Tasks 3–6.

- [ ] **Step 5: Commit**

```bash
git add lib/trades/types.ts package.json package-lock.json
git commit -m "feat: update types and install CodeMirror for formula columns"
```

---

## Task 2: Formula Engine

**Files:**
- Create: `lib/trades/formula-engine.ts`

**Interfaces:**
- Consumes: `FormulaRow`, `FormulaColumn`, `ColumnSetting` from `lib/trades/types.ts`
- Produces: `BUILT_IN_PARAM_NAMES` (Set<string>), `compileFormula(code: string) => (row: FormulaRow) => unknown`, `topoSort(columns: ColumnSetting[]) => ColumnSetting[]`

- [ ] **Step 1: Create `lib/trades/formula-engine.ts`**

```ts
import type { ColumnSetting, FormulaColumn, FormulaRow } from './types'

// Reserved — cannot be used as formula_id values
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
  // new Function creates a function whose body is `code`.
  // The single parameter is destructured so the user writes bare names.
  return new Function(PARAM_LIST, code) as (row: FormulaRow) => unknown
}

/**
 * Sort formula columns so that if column B's formula references column A's
 * formula_id, A is evaluated before B. Uses Kahn's algorithm.
 * Cycles are broken by keeping the dependent node last (its dep will be undefined).
 */
export function topoSort(columns: ColumnSetting[]): ColumnSetting[] {
  const ids = new Set(columns.map(c => c.formula_id).filter(Boolean) as string[])

  // Build adjacency: dep → dependents
  const deps = new Map<string, string[]>() // formulaId → [formulaId, ...]
  for (const col of columns) {
    if (!col.formula || !col.formula_id) continue
    const myDeps: string[] = []
    for (const id of ids) {
      if (id !== col.formula_id && col.formula.includes(id)) {
        myDeps.push(id)
      }
    }
    deps.set(col.formula_id, myDeps)
  }

  const byFormulaId = new Map(columns.map(c => [c.formula_id, c]))
  const inDegree = new Map<string, number>()
  const graph = new Map<string, string[]>() // A → [B] means B depends on A

  for (const col of columns) {
    const fid = col.formula_id!
    if (!inDegree.has(fid)) inDegree.set(fid, 0)
    if (!graph.has(fid)) graph.set(fid, [])
    for (const dep of (deps.get(fid) ?? [])) {
      if (!graph.has(dep)) graph.set(dep, [])
      graph.get(dep)!.push(fid)
      inDegree.set(fid, (inDegree.get(fid) ?? 0) + 1)
    }
  }

  const queue = columns
    .filter(c => (inDegree.get(c.formula_id!) ?? 0) === 0)
    .map(c => c.formula_id!)
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

  // Any columns not yet sorted (cycle) — append them at the end
  const sortedIds = new Set(sorted.map(c => c.formula_id))
  for (const col of columns) {
    if (!sortedIds.has(col.formula_id)) sorted.push(col)
  }

  return sorted
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "formula-engine" | head -10
```

Expected: no errors in `formula-engine.ts`. Other files still have errors from Task 1 — ignore them for now.

- [ ] **Step 3: Commit**

```bash
git add lib/trades/formula-engine.ts
git commit -m "feat: add formula engine with compileFormula and topoSort"
```

---

## Task 3: Refactor `enrichTrades`

**Files:**
- Modify: `lib/trades/calculations.ts`

**Interfaces:**
- Consumes: `FormulaColumn`, `FormulaRow`, `EnrichedTrade`, `RawTrade` from `lib/trades/types.ts`
- Produces: `enrichTrades(trades: RawTrade[], formulaColumns?: FormulaColumn[]) => EnrichedTrade[]` — same signature minus removed fields on return type; `calcPreview` and `deriveDirection` unchanged

- [ ] **Step 1: Replace `lib/trades/calculations.ts`**

```ts
// lib/trades/calculations.ts
import type { RawTrade, EnrichedTrade, FormulaColumn, FormulaRow, TradePreview } from './types'

export function deriveDirection(avg_entry: number, stop_loss: number): 'long' | 'short' {
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

    // Build the formula row from trade fields + primitives
    const formulaRow: FormulaRow = {
      avg_entry: trade.avg_entry,
      avg_exit: trade.avg_exit,
      stop_loss: trade.stop_loss,
      risk: trade.risk,
      realised_win: trade.realised_win,
      realised_loss: trade.realised_loss,
      direction: trade.direction,
      ticker: trade.ticker,
      trade_date: trade.trade_date,
      trade_time: trade.trade_time,
      rules_followed: trade.rules_followed,
      setup_type: trade.setup_type,
      trade_number: trade.trade_number,
      ...primitives,
    }

    const newCustomData: Record<string, string> = { ...(trade.custom_data ?? {}) }

    // Evaluate each formula column in topological order.
    // Results are injected back into formulaRow so later columns can reference them.
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

    // Accumulate running totals using the formula engine's r_multiple result
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
```

- [ ] **Step 2: Verify TypeScript (errors expected in trades-client and trades-table)**

```bash
npx tsc --noEmit 2>&1 | grep "calculations" | head -10
```

Expected: no errors in `calculations.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add lib/trades/calculations.ts
git commit -m "feat: refactor enrichTrades to use formula engine pipeline"
```

---

## Task 4: Update `actions.ts` + Schema

**Files:**
- Modify: `lib/trades/actions.ts`
- Modify: `lib/schemas/column-setting.ts`

**Interfaces:**
- Produces: `getColumnSettings()` now returns built-in rows (`user_id IS NULL`) alongside user rows; `createColumnSetting` and `updateColumnSetting` accept and validate `formula`, `is_formula`, `formula_id`

- [ ] **Step 1: Update `getColumnSettings` in `lib/trades/actions.ts`**

Find the `getColumnSettings` function and replace it:

```ts
export async function getColumnSettings(): Promise<ColumnSetting[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('column_settings')
    .select('*')
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order('created_at', { ascending: true })

  return (data ?? []) as ColumnSetting[]
}
```

- [ ] **Step 2: Update `createColumnSetting` in `lib/trades/actions.ts`**

Find `createColumnSetting` and replace the input type and insert to include the new fields:

```ts
export async function createColumnSetting(input: {
  name: string
  description?: string
  format_type: FormatType
  is_formula?: boolean
  formula?: string | null
  formula_id?: string | null
}): Promise<{ data: ColumnSetting | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  // Validate formula_id uniqueness (DB UNIQUE constraint is the hard guard,
  // but check here for a clean error message)
  if (input.formula_id) {
    const { data: existing } = await supabase
      .from('column_settings')
      .select('id')
      .eq('formula_id', input.formula_id)
      .limit(1)
    if (existing && existing.length > 0)
      return { data: null, error: 'trades.formula.errorVariableIdTaken' }
  }

  const column_id = `custom_${crypto.randomUUID()}`
  const { data, error } = await supabase
    .from('column_settings')
    .insert({
      user_id: user.id,
      column_id,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      format_type: input.format_type,
      is_formula: input.is_formula ?? false,
      formula: input.formula ?? null,
      formula_id: input.formula_id ?? null,
    })
    .select()
    .single()

  if (error) return { data: null, error: 'errors.generic' }
  revalidatePath('/trades')
  return { data: data as ColumnSetting, error: null }
}
```

- [ ] **Step 3: Update `updateColumnSetting` in `lib/trades/actions.ts`**

Find `updateColumnSetting` and replace:

```ts
export async function updateColumnSetting(
  columnId: string,
  input: {
    name: string
    description?: string
    format_type: FormatType
    is_formula?: boolean
    formula?: string | null
    formula_id?: string | null
  }
): Promise<{ data: ColumnSetting | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  // Fetch the existing row to check formula_id immutability
  const { data: existing } = await supabase
    .from('column_settings')
    .select('formula_id')
    .eq('column_id', columnId)
    .eq('user_id', user.id)
    .single()

  // formula_id is immutable once set
  const formula_id = existing?.formula_id ?? input.formula_id ?? null

  const { data, error } = await supabase
    .from('column_settings')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      format_type: input.format_type,
      is_formula: input.is_formula ?? false,
      formula: input.formula ?? null,
      formula_id,
    })
    .eq('column_id', columnId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return { data: null, error: 'errors.generic' }
  revalidatePath('/trades')
  return { data: data as ColumnSetting, error: null }
}
```

- [ ] **Step 4: Update `lib/schemas/column-setting.ts`**

```ts
import * as yup from 'yup'
import { FORMAT_TYPES } from '@/lib/trades/types'

export const columnSettingSchema = yup.object({
  name: yup.string().trim().required('validation.columnSetting.nameRequired'),
  description: yup.string().trim().optional().default(''),
  format_type: yup
    .string()
    .oneOf([...FORMAT_TYPES])
    .default('auto'),
  is_formula: yup.boolean().default(false),
  formula: yup.string().nullable().default(null),
  formula_id: yup
    .string()
    .nullable()
    .default(null)
    .when('is_formula', {
      is: true,
      then: (s) =>
        s
          .required('trades.formula.errorVariableIdRequired')
          .matches(
            /^[a-zA-Z_][a-zA-Z0-9_]*$/,
            'trades.formula.errorVariableIdFormat'
          ),
    }),
})

export type ColumnSettingFormData = yup.InferType<typeof columnSettingSchema>
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -E "actions\.ts|column-setting\.ts" | head -10
```

Expected: no errors in these files.

- [ ] **Step 6: Commit**

```bash
git add lib/trades/actions.ts lib/schemas/column-setting.ts
git commit -m "feat: update getColumnSettings to include built-ins; add formula fields to actions and schema"
```

---

## Task 5: Wire Formula Pipeline in `trades-client.tsx`

**Files:**
- Modify: `components/trades/trades-client.tsx`

**Interfaces:**
- Consumes: `compileFormula`, `topoSort` from `lib/trades/formula-engine.ts`; `FormulaColumn` from `lib/trades/types.ts`
- Produces: `formulaColumns: FormulaColumn[]` — passed as prop to `TradesTable`; `enrichTrades` called with this second argument

- [ ] **Step 1: Add imports at the top of `trades-client.tsx`**

Add after the existing calculation import:

```ts
import { compileFormula, topoSort } from '@/lib/trades/formula-engine'
import type { FormulaColumn } from '@/lib/trades/types'
```

- [ ] **Step 2: Add `formulaColumns` useMemo**

Inside the component, after `const rawTrades = tradeCache.get(activePatchId) ?? []`, add:

```ts
const formulaColumns = useMemo<FormulaColumn[]>(() => {
  const formulas = columnSettings.filter(
    (s) => s.is_formula && s.formula && s.formula_id
  )
  return topoSort(formulas).map((s) => ({
    columnId: s.column_id,
    formulaId: s.formula_id!,
    fn: compileFormula(s.formula!),
  }))
}, [columnSettings])
```

- [ ] **Step 3: Pass `formulaColumns` to `enrichTrades`**

Find the `enriched` useMemo and update:

```ts
const enriched = useMemo(
  () => enrichTrades(rawTrades, formulaColumns),
  [rawTrades, formulaColumns]
)
```

- [ ] **Step 4: Pass `formulaColumns` as prop to `TradesTable`**

Find the `<TradesTable ... />` JSX and add the prop:

```tsx
<TradesTable
  ...existing props...
  formulaColumns={formulaColumns}
/>
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "trades-client" | head -10
```

Expected: error that `formulaColumns` is not a known prop on `TradesTable` — fixed in Task 6.

- [ ] **Step 6: Commit**

```bash
git add components/trades/trades-client.tsx
git commit -m "feat: compile and wire formula columns in trades-client"
```

---

## Task 6: Update `trades-table.tsx`

This is the largest task. It removes `AUTO_GENERATED_COLS`, updates all 5 computed column defs to read from `custom_data`, fixes draft cell renderers, accepts the `formulaColumns` prop, and adds the `SquareFunction` icon to formula column headers.

**Files:**
- Modify: `components/trades/trades-table.tsx`

**Interfaces:**
- Consumes: `FormulaColumn` from types; `formulaColumns` prop from `trades-client`
- Produces: working table where all computed column cells read from `custom_data`

- [ ] **Step 1: Add `formulaColumns` to the props type**

Find the `TradesTableProps` type (or wherever props are defined) and add:

```ts
formulaColumns: FormulaColumn[]
```

And destructure it in the component:

```ts
function TradesTable({
  ...existing,
  formulaColumns,
}: TradesTableProps) {
```

- [ ] **Step 2: Remove `AUTO_GENERATED_COLS` and replace with a helper**

Delete the `AUTO_GENERATED_COLS` const (lines 249–256). Replace with a helper function that checks `columnSettings` (which is already a prop):

```ts
function isFormulaCol(colId: string): boolean {
  return columnSettings.some((s) => s.column_id === colId && s.is_formula)
}
```

Place this inside the component body (it closes over `columnSettings`).

- [ ] **Step 3: Fix `renderDraftCellContent` — replace AUTO_GENERATED_COLS check**

Find: `if (colId in df || AUTO_GENERATED_COLS.has(colId)) {`

Replace with: `if (colId in df || isFormulaCol(colId)) {`

- [ ] **Step 4: Add a helper to read formula values from custom_data**

Add this inside the component, near `isFormulaCol`:

```ts
function getFormulaVal(trade: EnrichedTrade, colId: string): number | null {
  const raw = trade.custom_data?.[colId]
  if (raw == null) return null
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}
```

- [ ] **Step 5: Update `renderDraftCellContent` — replace enrichedDraft field reads**

Find the block that handles `r_multiple`, `deviation`, `risk_volatility`, `cumulative_pnl`, `cumulative_r` in `renderDraftCellContent`. They all currently read `enrichedDraft.r_multiple` etc. Replace each with `getFormulaVal(enrichedDraft, colId)`:

```ts
if (colId === "r_multiple") {
  const v = getFormulaVal(enrichedDraft, "r_multiple")
  return v != null ? (
    <span className={`text-sm font-medium tabular-nums ${v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      {v.toFixed(2)}
    </span>
  ) : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
}
if (colId === "deviation") {
  const v = getFormulaVal(enrichedDraft, "deviation")
  return v != null ? (
    <span className="text-sm tabular-nums">{fmtPercent(v)}</span>
  ) : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
}
if (colId === "risk_volatility") {
  const v = getFormulaVal(enrichedDraft, "risk_volatility")
  return v != null ? (
    <span className="text-sm tabular-nums">{fmtPercent(v)}</span>
  ) : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
}
if (colId === "cumulative_pnl") {
  const v = getFormulaVal(enrichedDraft, "cumulative_pnl")
  return v != null ? (
    <span className={`text-sm font-medium tabular-nums ${v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      {(v >= 0 ? "+" : "") + fmtCurrency(Math.abs(v))}
    </span>
  ) : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
}
if (colId === "cumulative_r") {
  const v = getFormulaVal(enrichedDraft, "cumulative_r")
  return v != null ? (
    <span className={`text-sm font-medium tabular-nums ${v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      {v.toFixed(2)}
    </span>
  ) : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
}
```

- [ ] **Step 6: Update draft enrichment calls to pass `formulaColumns`**

Find all places that call `enrichTrades(allForEnrich)` inside `trades-table.tsx` (used for draft row enrichment). Add `formulaColumns` as second argument:

```ts
const enrichedDraft = enrichTrades(allForEnrich, formulaColumns)[allForEnrich.length - 1]
```

There are multiple occurrences (one per row type: `type === "draft"`, `type === "inserted"`, bottom section). Update all of them.

- [ ] **Step 7: Update the 5 computed column defs to use `accessorFn`**

For each of `deviation`, `r_multiple`, `risk_volatility`, `cumulative_pnl`, `cumulative_r` in `builtInColumns`, change from `accessorKey: "..."` to `accessorFn` reading from `custom_data`:

**`deviation`:**
```ts
{
  id: "deviation",
  accessorFn: (row: EnrichedTrade) => {
    const raw = row.custom_data?.['deviation']
    return raw != null ? parseFloat(raw) : null
  },
  header: () => (
    <HeaderCell
      label={t("trades.columns.deviation")}
      tooltip={t("trades.columnTooltips.deviation")}
      onOpenSettings={() => handleOpenColumnSettings("deviation", t("trades.columns.deviation"), t("trades.columnTooltips.deviation"))}
    />
  ),
  cell: ({ getValue }) => {
    const v = getValue<number | null>()
    if (v == null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    return <span className="tabular-nums">{fmtPercent(v)}</span>
  },
},
```

**`r_multiple`:**
```ts
{
  id: "r_multiple",
  accessorFn: (row: EnrichedTrade) => {
    const raw = row.custom_data?.['r_multiple']
    return raw != null ? parseFloat(raw) : null
  },
  header: () => (
    <HeaderCell
      label={t("trades.columns.rMultiple")}
      tooltip={t("trades.columnTooltips.rMultiple")}
      onOpenSettings={() => handleOpenColumnSettings("r_multiple", t("trades.columns.rMultiple"), t("trades.columnTooltips.rMultiple"))}
    />
  ),
  cell: ({ getValue }) => {
    const v = getValue<number | null>()
    if (v == null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    return (
      <span className={`font-medium tabular-nums ${v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
        {v.toFixed(2)}
      </span>
    )
  },
},
```

**`risk_volatility`:**
```ts
{
  id: "risk_volatility",
  accessorFn: (row: EnrichedTrade) => {
    const raw = row.custom_data?.['risk_volatility']
    return raw != null ? parseFloat(raw) : null
  },
  header: () => (
    <HeaderCell
      label={t("trades.columns.riskVolatility")}
      tooltip={t("trades.columnTooltips.riskVolatility")}
      onOpenSettings={() => handleOpenColumnSettings("risk_volatility", t("trades.columns.riskVolatility"), t("trades.columnTooltips.riskVolatility"))}
    />
  ),
  cell: ({ getValue }) => {
    const v = getValue<number | null>()
    if (v == null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    return <span className="tabular-nums">{fmtPercent(v)}</span>
  },
},
```

**`cumulative_pnl`:**
```ts
{
  id: "cumulative_pnl",
  accessorFn: (row: EnrichedTrade) => {
    const raw = row.custom_data?.['cumulative_pnl']
    return raw != null ? parseFloat(raw) : null
  },
  header: () => (
    <HeaderCell
      label={t("trades.columns.cumulativePnl")}
      tooltip={t("trades.columnTooltips.cumulativePnl")}
      onOpenSettings={() => handleOpenColumnSettings("cumulative_pnl", t("trades.columns.cumulativePnl"), t("trades.columnTooltips.cumulativePnl"))}
    />
  ),
  cell: ({ getValue }) => {
    const v = getValue<number | null>()
    if (v == null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    return (
      <span className={`font-medium tabular-nums ${v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
        {(v >= 0 ? "+" : "") + fmtCurrency(Math.abs(v))}
      </span>
    )
  },
},
```

**`cumulative_r`:**
```ts
{
  id: "cumulative_r",
  accessorFn: (row: EnrichedTrade) => {
    const raw = row.custom_data?.['cumulative_r']
    return raw != null ? parseFloat(raw) : null
  },
  header: () => (
    <HeaderCell
      label={t("trades.columns.cumulativeR")}
      tooltip={t("trades.columnTooltips.cumulativeR")}
      onOpenSettings={() => handleOpenColumnSettings("cumulative_r", t("trades.columns.cumulativeR"), t("trades.columnTooltips.cumulativeR"))}
    />
  ),
  cell: ({ getValue }) => {
    const v = getValue<number | null>()
    if (v == null) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    return (
      <span className={`font-medium tabular-nums ${v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
        {v.toFixed(2)}
      </span>
    )
  },
},
```

- [ ] **Step 8: Add `SquareFunction` icon to formula column headers**

In `HeaderCell` or wherever the header label is assembled for custom columns, add the icon when the column is a formula column. Find the header render path for custom columns (around where `handleOpenColumnSettings` is called for custom columns) and add:

```tsx
<HeaderCell
  label={
    <span className="flex items-center gap-1">
      {isFormulaCol(col.column_id) && (
        <SquareFunction className="size-3 text-muted-foreground" />
      )}
      {label}
    </span>
  }
  ...
/>
```

Note: `SquareFunction` is already imported. Apply this pattern to custom column header cells — built-in formula columns already have their headers defined explicitly in `builtInColumns`.

- [ ] **Step 9: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no output (zero errors).

- [ ] **Step 10: Commit**

```bash
git add components/trades/trades-table.tsx
git commit -m "feat: update trades-table to read formula results from custom_data"
```

---

## Task 7: Code Panel in `add-column-dialog.tsx` + i18n

**Files:**
- Modify: `components/trades/add-column-dialog.tsx`
- Modify: `messages/en.json`
- Modify: `messages/ar.json`

**Interfaces:**
- Consumes: `@uiw/react-codemirror`, `@codemirror/lang-javascript`, `@codemirror/theme-one-dark`, `BUILT_IN_PARAM_NAMES` from `formula-engine.ts`, updated `ColumnSettingFormData` from schema
- Produces: column settings dialog with auto-calculate toggle, Variable ID field, CodeMirror code panel; dialog widens when formula panel is shown

- [ ] **Step 1: Add i18n keys to `messages/en.json`**

Add inside the `"trades"` object:

```json
"formula": {
  "toggle": "Auto-calculate",
  "toggleHint": "Compute this column's value from a formula instead of manual input.",
  "variableId": "Variable ID",
  "variableIdHint": "Use this name to reference this column in other formulas.",
  "variableIdImmutableHint": "Variable ID cannot be changed after the column is saved.",
  "panel": "Formula",
  "availableParams": "Available parameters",
  "builtInNotice": "This is a built-in formula. You can view it but not edit it.",
  "starterComment": "// Return the computed value for this cell.\n// Return null to show a blank cell.\nreturn null",
  "errorVariableIdRequired": "Variable ID is required when formula is enabled.",
  "errorVariableIdFormat": "Only letters, numbers, and underscores. Must start with a letter.",
  "errorVariableIdReserved": "This name is reserved by the formula engine.",
  "errorVariableIdTaken": "This variable ID is already used by another column."
}
```

- [ ] **Step 2: Add Arabic translations to `messages/ar.json`**

Add inside the `"trades"` object:

```json
"formula": {
  "toggle": "حساب تلقائي",
  "toggleHint": "احسب قيمة هذا العمود باستخدام صيغة بدلاً من الإدخال اليدوي.",
  "variableId": "معرّف المتغير",
  "variableIdHint": "استخدم هذا الاسم للإشارة إلى هذا العمود في الصيغ الأخرى.",
  "variableIdImmutableHint": "لا يمكن تغيير معرّف المتغير بعد حفظ العمود.",
  "panel": "الصيغة",
  "availableParams": "المعاملات المتاحة",
  "builtInNotice": "هذه صيغة مدمجة. يمكنك عرضها فقط ولا يمكن تعديلها.",
  "starterComment": "// أعد القيمة المحسوبة لهذه الخلية.\n// أعد null لإظهار خلية فارغة.\nreturn null",
  "errorVariableIdRequired": "معرّف المتغير مطلوب عند تفعيل الصيغة.",
  "errorVariableIdFormat": "أحرف وأرقام وشرطة سفلية فقط. يجب أن يبدأ بحرف.",
  "errorVariableIdReserved": "هذا الاسم محجوز من قِبل محرك الصيغ.",
  "errorVariableIdTaken": "معرّف المتغير هذا مستخدم بالفعل في عمود آخر."
}
```

- [ ] **Step 3: Update `EditColumnData` type in `add-column-dialog.tsx`**

Replace the existing `EditColumnData` type:

```ts
export type EditColumnData = {
  columnId: string
  name: string
  description: string | null
  format_type: FormatType
  isBuiltIn?: boolean
  is_formula?: boolean
  formula?: string | null
  formula_id?: string | null
}
```

- [ ] **Step 4: Add new imports to `add-column-dialog.tsx`**

```ts
import { useTheme } from 'next-themes'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { Switch } from '@/components/ui/switch'
import { BUILT_IN_PARAM_NAMES } from '@/lib/trades/formula-engine'
```

(`Switch` is a shadcn component — confirm it exists at `components/ui/switch.tsx`. If not, run `npx shadcn@latest add switch`.)

- [ ] **Step 5: Add formula state to the component**

Inside the `AddColumnDialog` / edit dialog component, add state for the formula fields:

```ts
const { resolvedTheme } = useTheme()
const [isFormula, setIsFormula] = useState(initialData?.is_formula ?? false)
const [formula, setFormula] = useState<string>(
  initialData?.formula ?? t('trades.formula.starterComment')
)
const [formulaId, setFormulaId] = useState(initialData?.formula_id ?? '')
const formulaIdImmutable = !!initialData?.formula_id  // locked once saved
```

- [ ] **Step 6: Widen the dialog when formula panel is visible**

The `isBuiltIn` formula columns also show the panel. Define:

```ts
const showPanel = isFormula || (initialData?.isBuiltIn && initialData?.is_formula)
```

Update the `DialogContent` className:

```tsx
<DialogContent className={showPanel ? "sm:max-w-5xl" : "sm:max-w-2xl"}>
```

Wrap the dialog body in a two-column flex when panel is shown:

```tsx
<div className={showPanel ? "flex gap-6" : ""}>
  {/* LEFT: existing form fields */}
  <div className={showPanel ? "w-80 shrink-0 space-y-4" : "space-y-4"}>
    {/* ... existing fields: name, description, cell type, options ... */}

    {/* Auto-calculate section — only for custom columns */}
    {!initialData?.isBuiltIn && (
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t('trades.formula.toggle')}</p>
            <p className="text-xs text-muted-foreground">{t('trades.formula.toggleHint')}</p>
          </div>
          <Switch checked={isFormula} onCheckedChange={setIsFormula} />
        </div>

        {isFormula && (
          <div className="space-y-1.5">
            <Label>{t('trades.formula.variableId')}</Label>
            <Input
              value={formulaId}
              onChange={(e) => setFormulaId(e.target.value)}
              disabled={formulaIdImmutable}
              placeholder="e.g. coinSize"
            />
            <p className="text-xs text-muted-foreground">
              {formulaIdImmutable
                ? t('trades.formula.variableIdImmutableHint')
                : t('trades.formula.variableIdHint')}
            </p>
          </div>
        )}
      </div>
    )}
  </div>

  {/* RIGHT: code panel */}
  {showPanel && (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t('trades.formula.panel')}</p>
        {initialData?.isBuiltIn && (
          <p className="text-xs text-muted-foreground">{t('trades.formula.builtInNotice')}</p>
        )}
      </div>

      {/* Available parameters hint */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          {t('trades.formula.availableParams')}
        </summary>
        <div className="mt-1 font-mono leading-relaxed break-all">
          {Array.from(BUILT_IN_PARAM_NAMES).join(', ')}
        </div>
      </details>

      <CodeMirror
        value={formula}
        onChange={setFormula}
        readOnly={initialData?.isBuiltIn && initialData?.is_formula}
        extensions={[javascript({ typescript: true })]}
        theme={resolvedTheme === 'dark' ? oneDark : undefined}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
        className="border text-sm"
        minHeight="240px"
      />
    </div>
  )}
</div>
```

- [ ] **Step 7: Include formula fields in save handler**

When the form calls `createColumnSetting` or `updateColumnSetting`, include the formula fields:

```ts
// In the submit handler, add to the input object:
is_formula: isFormula,
formula: isFormula ? formula : null,
formula_id: isFormula && formulaId.trim() ? formulaId.trim() : null,
```

Also validate `formulaId` on submit: if `isFormula && !formulaId.trim()`, call `setError('root', { message: t('trades.formula.errorVariableIdRequired') })` and return early.

For `formula_id` conflict with reserved names:

```ts
if (isFormula && formulaId && BUILT_IN_PARAM_NAMES.has(formulaId)) {
  setError('root', { message: t('trades.formula.errorVariableIdReserved') })
  return
}
```

- [ ] **Step 8: Pass formula fields when opening settings from `trades-table.tsx`**

In `trades-table.tsx`, `handleOpenColumnSettings` sets `settingsTarget`. Update it to also pass `is_formula` and `formula` from `columnSettings`:

```ts
const handleOpenColumnSettings = useCallback(
  (columnId: string, label: string, description: string) => {
    const isCustom = columnId.startsWith("custom_")
    const existing = columnSettings.find((s) => s.column_id === columnId)
    const format_type: FormatType = (existing?.format_type as FormatType) ?? BUILT_IN_FORMAT_TYPES[columnId] ?? "auto"
    const isDropdown = format_type === "dropdown"
    setSettingsTarget({
      columnId,
      label,
      description,
      format_type,
      initialOptions: isDropdown ? resolveOptions(columnId) : undefined,
      isBuiltIn: !isCustom,
      is_formula: existing?.is_formula ?? false,
      formula: existing?.formula ?? null,
      formula_id: existing?.formula_id ?? null,
    })
  },
  [columnSettings, columnOptions]
)
```

And ensure `settingsTarget` type and the `EditColumnData` passed to `AddColumnDialog` include these fields.

- [ ] **Step 9: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no output.

- [ ] **Step 10: Manual browser test**

1. Open a patch with trades. Confirm `r_multiple`, `deviation`, `cumulative_pnl` etc. still compute correctly.
2. Right-click the `R+/-` column header → open settings. Confirm: dialog widens, code panel appears on the right, formula is read-only, shows `return risk !== 0 && pnl != null ? pnl / risk : null`.
3. Create a new custom column. Enable "Auto-calculate". Enter `profitPct` as Variable ID. Enter formula `return realised_win != null ? realised_win / risk * 100 : null`. Set Cell Type to "Number". Save. Confirm column appears in table with computed values.
4. Create a second custom column that references `profitPct`. Enter `return profitPct != null ? profitPct * 2 : null`. Confirm it computes correctly.
5. Confirm Variable ID field is disabled when editing the column after saving.

- [ ] **Step 11: Commit**

```bash
git add components/trades/add-column-dialog.tsx messages/en.json messages/ar.json
git commit -m "feat: formula code panel, auto-calculate toggle, and Variable ID in column settings dialog"
```

---

## Self-Review

**Spec coverage:**
- ✅ DB migration with built-in formula rows seeded (Task 1)
- ✅ `user_id = NULL` for built-ins + RLS split policies (Task 1)
- ✅ `FormulaRow` type with all parameters including cross-row primitives (Task 1)
- ✅ `compileFormula` + `topoSort` + `BUILT_IN_PARAM_NAMES` (Task 2)
- ✅ `enrichTrades` refactored to pipeline (Task 3)
- ✅ `getColumnSettings` includes built-ins (Task 4)
- ✅ `formula_id` uniqueness validation client + server (Tasks 4, 7)
- ✅ `formulaColumns` wired in `trades-client` (Task 5)
- ✅ `AUTO_GENERATED_COLS` removed (Task 6)
- ✅ Column defs use `accessorFn` reading `custom_data` (Task 6)
- ✅ Draft renderers updated (Task 6)
- ✅ Formula icon on formula column headers (Task 6)
- ✅ Dialog widens for formula columns (Task 7)
- ✅ CodeMirror read-only for built-ins, editable for user formulas (Task 7)
- ✅ Auto-calculate toggle + Variable ID field (Task 7)
- ✅ i18n keys in both en.json and ar.json (Task 7)
- ✅ `formula_id` immutable after first save (Task 4 server + Task 7 client)

**Type consistency:** `FormulaColumn` defined in `types.ts` (Task 1), consumed by `formula-engine.ts` (Task 2), `calculations.ts` (Task 3), `trades-client.tsx` (Task 5), `trades-table.tsx` (Task 6) — consistent throughout.
