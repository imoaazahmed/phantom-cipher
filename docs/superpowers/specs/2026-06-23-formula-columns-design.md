# Formula Columns Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow every column — built-in auto-generated and user-created — to be driven by a JavaScript formula stored in the database and evaluated through a single unified formula engine.

**Architecture:** Formula strings are stored in `column_settings` (built-ins with `user_id = NULL`, user columns with `user_id = auth.uid()`). A formula engine compiles each string into a function via `new Function()`, topologically sorts them by dependency, and evaluates them per-row inside `enrichTrades`. Results are stored in `custom_data` and rendered by the existing cell format pipeline.

**Tech Stack:** CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-javascript`, `@codemirror/theme-one-dark`), Supabase RLS, Next.js App Router, TypeScript.

---

## Global Constraints

- No rounded borders anywhere — use `rounded-none` if overriding a default
- All visible text goes through `t()` — add keys to `messages/en.json` and `messages/ar.json`
- Forms use `react-hook-form` + `yup` — no exceptions
- Performance first — memoize formula compilation, never recompile on every render
- `formula_id` must be alphanumeric + underscore, not conflict with built-in parameter names or other custom `formula_id` values
- Built-in formula rows (`user_id = NULL`) are read-only — no user can edit or delete them

---

## Database Migration

```sql
-- 1. Allow user_id to be NULL (built-in rows have no owner)
alter table public.column_settings
  alter column user_id drop not null;

-- 2. New columns
alter table public.column_settings
  add column is_formula boolean not null default false,
  add column formula text null,
  add column formula_id text null unique;

-- 3. Seed built-in formula rows
insert into public.column_settings
  (user_id, column_id, name, description, is_formula, formula_id, formula, format_type)
values
  (null, 'r_multiple', 'R+/-', 'Realised PnL divided by planned risk',
   true, 'r_multiple',
   'return risk !== 0 && pnl != null ? pnl / risk : null',
   'number'),

  (null, 'deviation', 'Deviation', 'How much the realised loss exceeded planned risk',
   true, 'deviation',
   'if (realised_loss == null) return null
const d = (realised_loss - risk) / risk * 100
return d > 0 ? d : null',
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

-- 4. Drop old all-in-one RLS policy, replace with split policies
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

---

## File Changes

| File | Action | Responsibility |
|---|---|---|
| `lib/trades/types.ts` | Modify | Add `is_formula`, `formula`, `formula_id` to `ColumnSetting`; add `FormulaRow` type; simplify `EnrichedTrade` |
| `lib/trades/formula-engine.ts` | Create | `compileFormula`, `topoSort`, built-in param name list |
| `lib/trades/built-in-formulas.ts` | Create | Typed list of built-in formula column IDs (`AUTO_GENERATED_COLS` replacement) |
| `lib/trades/calculations.ts` | Modify | `enrichTrades` accepts `FormulaColumn[]`; computes primitives only; formula engine does the rest |
| `lib/trades/actions.ts` | Modify | `getColumnSettings` query removes `user_id` filter so built-ins are included; `createColumnSetting` / `updateColumnSetting` validate `formula_id` uniqueness |
| `components/trades/trades-client.tsx` | Modify | Build `formulaColumns` list (memoized); pass to `enrichTrades` |
| `components/trades/add-column-dialog.tsx` | Modify | Add Auto-calculate toggle, Variable ID field, CodeMirror code panel |
| `components/trades/trades-table.tsx` | Modify | Remove `AUTO_GENERATED_COLS` set; replace all `AUTO_GENERATED_COLS.has(colId)` checks with `columnSettings.find(s => s.column_id === colId)?.is_formula === true`; cell renderers reading `enrichedTrade.r_multiple` etc. now read `enrichedTrade.custom_data?.r_multiple`; add `SquareFunction` icon to formula column headers |
| `messages/en.json` + `messages/ar.json` | Modify | Add i18n keys for new UI strings |

---

## Types

### Updated `ColumnSetting`

```ts
export type ColumnSetting = {
  id: string
  column_id: string
  name: string
  description: string | null
  format_type: FormatType
  is_formula: boolean          // new
  formula: string | null       // new — the function body
  formula_id: string | null    // new — camelCase variable name for cross-referencing
  created_at: string
  updated_at: string
}
```

### `FormulaRow` (parameter object passed to every formula)

```ts
export type FormulaRow = {
  // Raw trade fields
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
  // Cross-row primitives (pre-computed by enrichTrades before any formula runs)
  pnl: number | null           // realised_win ?? -realised_loss
  prev_risk: number | null     // risk of the previous row (null for row 0)
  running_pnl: number          // cumulative PnL of all rows before this one
  running_r: number            // cumulative R of all rows before this one
  row_index: number            // 0-based position in the patch
  // Formula column results (populated in topo order; earlier formulas visible to later ones)
  [key: string]: unknown
}
```

### Updated `EnrichedTrade`

`r_multiple`, `deviation`, `risk_volatility`, `cumulative_pnl`, `cumulative_r` are removed as typed fields — they now live in `custom_data` like any other formula column result. `EnrichedTrade` retains the primitives:

```ts
export type EnrichedTrade = RawTrade & {
  pnl: number | null
  prev_risk: number | null
  running_pnl: number
  running_r: number
  row_index: number
}
```

Cell renderers that previously read `enrichedTrade.r_multiple` now read `enrichedTrade.custom_data?.r_multiple`.

---

## Formula Engine (`lib/trades/formula-engine.ts`)

### Built-in parameter names (reserved — cannot be used as `formula_id`)

```ts
export const BUILT_IN_PARAM_NAMES = new Set([
  'avg_entry', 'avg_exit', 'stop_loss', 'risk',
  'realised_win', 'realised_loss', 'direction', 'ticker',
  'trade_date', 'trade_time', 'rules_followed', 'setup_type', 'trade_number',
  'pnl', 'prev_risk', 'running_pnl', 'running_r', 'row_index',
])
```

### `compileFormula`

```ts
export function compileFormula(code: string): (row: FormulaRow) => unknown {
  return new Function(
    '{ avg_entry, avg_exit, stop_loss, risk, realised_win, realised_loss, ' +
    'direction, ticker, trade_date, trade_time, rules_followed, setup_type, trade_number, ' +
    'pnl, prev_risk, running_pnl, running_r, row_index, ...rest }',
    code
  ) as (row: FormulaRow) => unknown
}
```

### `topoSort`

Scans each formula's code string for occurrences of known `formula_id` values. Builds a dependency graph and returns columns in evaluation order. Circular dependencies are detected and broken (the later node in the cycle evaluates with `undefined` for the circular dep).

```ts
export function topoSort(columns: ColumnSetting[]): ColumnSetting[] {
  // 1. Build set of known formula_ids
  // 2. For each column, find which formula_ids appear in its formula string
  // 3. Kahn's algorithm topological sort
  // 4. Return sorted list (columns with no deps first)
}
```

### `FormulaColumn` (runtime shape passed to `enrichTrades`)

```ts
export type FormulaColumn = {
  columnId: string    // e.g. "custom_abc123" or "r_multiple" — where result is stored
  formulaId: string   // e.g. "coinSize" or "r_multiple" — the variable name in FormulaRow
  fn: (row: FormulaRow) => unknown
}
```

---

## Enrichment Pipeline (`lib/trades/calculations.ts`)

```ts
export function enrichTrades(
  trades: RawTrade[],
  formulaColumns: FormulaColumn[] = []
): EnrichedTrade[] {
  let running_pnl = 0
  let running_r = 0

  return trades.map((trade, index) => {
    const prev = index > 0 ? trades[index - 1] : null
    const pnl = trade.realised_win ?? (trade.realised_loss != null ? -trade.realised_loss : null)

    const primitives = {
      pnl,
      prev_risk: prev?.risk ?? null,
      running_pnl,    // sum of pnl BEFORE this row
      running_r,      // sum of r_multiple BEFORE this row
      row_index: index,
    }

    const formulaRow: FormulaRow = { ...trade, ...primitives }
    const newCustomData: Record<string, string> = { ...(trade.custom_data ?? {}) }

    for (const col of formulaColumns) {
      try {
        const result = col.fn(formulaRow)
        if (result != null) {
          newCustomData[col.columnId] = String(result)
          ;(formulaRow as Record<string, unknown>)[col.formulaId] = result
        }
      } catch {
        // formula error → cell shows blank, no crash
      }
    }

    // accumulate running totals using formula results
    running_pnl += (pnl ?? 0)
    running_r += (formulaRow['r_multiple'] as number ?? 0)

    return { ...trade, ...primitives, custom_data: newCustomData }
  })
}
```

---

## `trades-client.tsx` Changes

```ts
// Memoize formula compilation — only recompiles when columnSettings changes
const formulaColumns = useMemo<FormulaColumn[]>(() => {
  const formulas = columnSettings.filter(s => s.is_formula && s.formula)
  return topoSort(formulas).map(s => ({
    columnId: s.column_id,
    formulaId: s.formula_id ?? s.column_id,
    fn: compileFormula(s.formula!),
  }))
}, [columnSettings])

const enriched = useMemo(
  () => enrichTrades(rawTrades, formulaColumns),
  [rawTrades, formulaColumns]
)
```

---

## UI: Column Settings Dialog

### Dialog width

- No code panel (non-formula column): `sm:max-w-2xl` (unchanged)
- Code panel visible (formula column): `sm:max-w-5xl`, two-column flex layout

### Left panel

Existing fields: Column Name, Description, Cell Type, dropdown options list.

For custom columns only, a new **Auto-calculate section** at the bottom of the left panel:

```
── Auto-calculate ──────────────────────────────
[toggle] Enable formula for this column

[visible only when toggle is on]
Variable ID
[_____________] e.g. coinSize
Hint: Use this name to reference this column
in other formulas. Cannot be changed later.
```

- Toggle maps to `is_formula` on save
- Variable ID maps to `formula_id`; validated on blur (unique + no built-in conflict + no other custom formula_id conflict)
- Variable ID field is disabled for edit after first save (formula_id is immutable once set — changing it would silently break other formulas that reference it)
- Built-in formula columns: toggle shown as permanently on and disabled; no Variable ID field shown

### Right panel (CodeMirror)

Appears when `is_formula = true` (built-in or user).

- Header: "Formula" label + collapsed "Available parameters" hint showing all `FormulaRow` keys
- Built-in columns: `readOnly={true}`, formula string from the DB row
- User formula columns: editable, formula string saved to DB on "Save Changes"
- Theme: `oneDark` in dark mode, default in light mode (via `useTheme()`)
- Starter template for new formula columns:
  ```ts
  // Return the computed value for this cell.
  // Return null to show a blank cell.
  return null
  ```

---

## UI: Formula Icon in Column Headers

A `SquareFunction` (Lucide) icon appears in the column header next to the column name for any column where `is_formula = true`. Visible for both built-in and user formula columns. Clicking it opens the column settings dialog (same as the existing settings gear).

---

## `formula_id` Validation Rules

| Rule | Where enforced |
|---|---|
| Matches `/^[a-zA-Z_][a-zA-Z0-9_]*$/` | Client (on blur) + server (before insert) |
| Not in `BUILT_IN_PARAM_NAMES` | Client + server |
| Not equal to any other `column_settings.formula_id` for this user | Client (check existing columnSettings) + server (DB UNIQUE constraint) |
| Immutable after first save | Client (field disabled) + server (update ignores `formula_id` if already set) |

---

## i18n Keys Required

```json
"trades.formula.toggle": "Auto-calculate",
"trades.formula.toggleHint": "Compute this column's value from a formula instead of manual input.",
"trades.formula.variableId": "Variable ID",
"trades.formula.variableIdHint": "Use this name to reference this column in other formulas.",
"trades.formula.variableIdImmutableHint": "Variable ID cannot be changed after the column is saved.",
"trades.formula.panel": "Formula",
"trades.formula.availableParams": "Available parameters",
"trades.formula.builtIn": "This is a built-in formula. You can view it but not edit it.",
"trades.formula.starterComment": "// Return the computed value for this cell.\n// Return null to show a blank cell.",
"trades.formula.errorVariableIdRequired": "Variable ID is required when formula is enabled.",
"trades.formula.errorVariableIdFormat": "Only letters, numbers, and underscores. Must start with a letter.",
"trades.formula.errorVariableIdReserved": "This name is reserved. Choose a different variable ID.",
"trades.formula.errorVariableIdTaken": "This variable ID is already used by another column."
```
