# Insert Trade Before / After Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Insert Trade Before" and "Insert Trade After" to the real-trade row context menu, inserting a blank editable row inline at the chosen position, persisted to DB only when the user fills at least one cell.

**Architecture:** Add `sort_order float8` to the `trades` table; queries order by it instead of `trade_number`. The table maintains an `insertedBlanks` local state for purely-local blank rows between real trades. A `mergedRows` memo merges real trades + inserted blanks sorted by `sort_order`. The `#` column shows each row's rank in that merged list (computed client-side). Cell-fill logic for inserted blanks mirrors existing draft-row logic: first fill creates a DB draft with the precomputed sort_order, subsequent fills patch it.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, TanStack Table, react-i18next, Tailwind CSS v4, Lucide icons

## Global Constraints

- No rounded borders — never use `rounded`, use `rounded-none` if overriding
- Every visible string must use `t()` with keys in both `messages/en.json` and `messages/ar.json`
- Server actions live in `lib/trades/actions.ts`, are `'use server'`
- No new npm packages

---

## File Map

| File | Change |
|---|---|
| `docs/database-migrations.md` | Add migration SQL for `sort_order` |
| `lib/trades/types.ts` | Add `sort_order: number` to `RawTrade` |
| `lib/trades/actions.ts` | Update `createDraftTrade` (add optional `sortOrder` param); switch `getPatchTrades` + `getPatchDraftTrades` to `ORDER BY sort_order` |
| `components/trades/trades-client.tsx` | Update `handleCreateTrade` to accept optional `sortOrder` |
| `components/trades/trades-table.tsx` | Add `InsertedBlank` type + state, `mergedRows` + `rankMap` memo, `computeInsertSortOrder`, `handleInsertTrade`, extract `renderDraftCell`/`getDraftCopyValue` as standalone fns, refactor `<TableBody>` to render from `mergedRows`, add inserted-blank row rendering + cell-fill logic, add context menu items |
| `messages/en.json` | Add `trades.insertTradeBefore`, `trades.insertTradeAfter` |
| `messages/ar.json` | Add Arabic translations |

---

### Task 1: DB migration + type + query updates

**Files:**
- Modify: `docs/database-migrations.md`
- Modify: `lib/trades/types.ts`
- Modify: `lib/trades/actions.ts`

**Interfaces:**
- Produces: `RawTrade.sort_order: number` — used by every subsequent task
- Produces: `createDraftTrade(patchId: string, sortOrder?: number)` — used by Tasks 3 and 4

- [ ] **Step 1: Run the DB migration in Supabase SQL Editor (dev project)**

```sql
ALTER TABLE public.trades ADD COLUMN sort_order float8 NOT NULL DEFAULT 0;
UPDATE public.trades SET sort_order = trade_number;
CREATE INDEX trades_sort_order_idx ON public.trades (patch_id, sort_order);
```

- [ ] **Step 2: Add migration to docs/database-migrations.md**

Append at the bottom of `docs/database-migrations.md`:

```markdown
## 2026-06-23 — Add sort_order to trades

```sql
ALTER TABLE public.trades ADD COLUMN sort_order float8 NOT NULL DEFAULT 0;
UPDATE public.trades SET sort_order = trade_number;
CREATE INDEX trades_sort_order_idx ON public.trades (patch_id, sort_order);
```
```

- [ ] **Step 3: Add sort_order to RawTrade**

In `lib/trades/types.ts`, add `sort_order: number` after `trade_number`:

```ts
export type RawTrade = {
  id: string
  patch_id: string
  trade_number: number
  sort_order: number        // ← add
  trade_date: string
  // ... rest unchanged
```

- [ ] **Step 4: Update getPatchTrades to ORDER BY sort_order**

In `lib/trades/actions.ts`, in `getPatchTrades`, change:

```ts
// before
.order('trade_number', { ascending: true })
// after
.order('sort_order', { ascending: true })
```

- [ ] **Step 5: Update getPatchDraftTrades to ORDER BY sort_order**

Same change in `getPatchDraftTrades`:

```ts
// before
.order('trade_number', { ascending: true })
// after
.order('sort_order', { ascending: true })
```

- [ ] **Step 6: Update createDraftTrade to accept optional sortOrder**

Replace the entire `createDraftTrade` function in `lib/trades/actions.ts`:

```ts
export async function createDraftTrade(
  patchId: string,
  sortOrder?: number,
): Promise<{ data: RawTrade | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  const { data: existing } = await supabase
    .from('trades')
    .select('trade_number, sort_order')
    .eq('patch_id', patchId)
    .order('trade_number', { ascending: false })
    .limit(1)

  const nextNumber = existing && existing.length > 0 ? existing[0].trade_number + 1 : 1
  const maxSortOrder = existing && existing.length > 0 ? (existing[0].sort_order as number) : 0
  const resolvedSortOrder = sortOrder ?? maxSortOrder + 1.0

  const now = new Date()
  const trade_date = now.toISOString().split('T')[0]
  const trade_time = now.toTimeString().slice(0, 8)

  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
      patch_id: patchId,
      trade_number: nextNumber,
      sort_order: resolvedSortOrder,
      trade_date,
      trade_time,
      ticker: '',
      direction: 'long',
      order_type: 'market',
      avg_entry: 0,
      stop_loss: 0,
      avg_exit: 0,
      risk: 0,
      rules_followed: false,
      setup_type: '',
      is_draft: true,
      draft_fields: [],
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: 'errors.generic' }
  return { data: data as RawTrade, error: null }
}
```

- [ ] **Step 7: Verify**

Run `npm run dev`. Open the trades page — trades should still display in the same order with correct numbers. Open Supabase Table Editor and confirm the `sort_order` column exists with values equal to `trade_number` for existing rows.

- [ ] **Step 8: Commit**

```bash
git add docs/database-migrations.md lib/trades/types.ts lib/trades/actions.ts
git commit -m "feat: add sort_order to trades for position-aware insertion"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/ar.json`

**Interfaces:**
- Produces: `t('trades.insertTradeBefore')`, `t('trades.insertTradeAfter')` — used in Task 4

- [ ] **Step 1: Add English keys**

In `messages/en.json`, inside the `"trades"` object, add after `"duplicateTrade"`:

```json
"insertTradeBefore": "Insert Trade Before",
"insertTradeAfter": "Insert Trade After",
```

- [ ] **Step 2: Add Arabic keys**

In `messages/ar.json`, add the same keys after `"duplicateTrade"`:

```json
"insertTradeBefore": "إدراج صفقة قبل",
"insertTradeAfter": "إدراج صفقة بعد",
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/ar.json
git commit -m "feat: add i18n keys for insert trade before/after"
```

---

### Task 3: TradesClient — thread sortOrder through handleCreateTrade

**Files:**
- Modify: `components/trades/trades-client.tsx`

**Interfaces:**
- Consumes: `createDraftTrade(patchId, sortOrder?)` from Task 1
- Produces: `handleCreateTrade(sortOrder?: number) => Promise<RawTrade | null>` — used by Task 4

- [ ] **Step 1: Update handleCreateTrade signature**

In `components/trades/trades-client.tsx`, update `handleCreateTrade`:

```ts
async function handleCreateTrade(sortOrder?: number): Promise<RawTrade | null> {
  const { data } = await createDraftTrade(activePatchId, sortOrder)
  if (data) {
    setDraftTradeCache((prev) => {
      const current = prev.get(activePatchId) ?? []
      return new Map(prev).set(activePatchId, [...current, data])
    })
  }
  return data ?? null
}
```

The `onCreateTrade={handleCreateTrade}` prop passed to `TradesTable` needs no change here — TypeScript will enforce the updated signature once `Props` is updated in Task 4.

- [ ] **Step 2: Commit**

```bash
git add components/trades/trades-client.tsx
git commit -m "feat: thread optional sortOrder through handleCreateTrade"
```

---

### Task 4: TradesTable — full implementation

This is the main task. It covers: updated props, `InsertedBlank` state, `mergedRows`/`rankMap`, insert handler, extracted helper functions, refactored `<TableBody>`, inserted blank row rendering, cell-fill logic, and context menu items.

**Files:**
- Modify: `components/trades/trades-table.tsx`

**Interfaces:**
- Consumes: `RawTrade.sort_order: number` from Task 1
- Consumes: `onCreateTrade(sortOrder?: number)` from Task 3
- Consumes: `t('trades.insertTradeBefore')`, `t('trades.insertTradeAfter')` from Task 2

- [ ] **Step 1: Add ArrowUp / ArrowDown to lucide imports**

At the top of `components/trades/trades-table.tsx`, add `ArrowDown` and `ArrowUp` to the existing lucide import:

```ts
import { ArrowDown, ArrowUp, Copy, EyeOff, Files, Info, Pencil, Plus, Settings2, SquareFunction, Trash2, X } from 'lucide-react'
```

- [ ] **Step 2: Update Props type**

In the `Props` type, update `onCreateTrade`:

```ts
onCreateTrade: (sortOrder?: number) => Promise<RawTrade | null>
```

- [ ] **Step 3: Add InsertedBlank type and state**

After the existing state declarations (after `const [blankRowCount, setBlankRowCount]`), add:

```ts
type InsertedBlank = {
  localId: string
  sortOrder: number
  id: string | null         // null until first cell fill creates a DB draft
  fields: Partial<RawTrade>
  filledFields: string[]
}
const [insertedBlanks, setInsertedBlanks] = useState<InsertedBlank[]>([])
const insertedBlanksRef = useRef<InsertedBlank[]>([])
insertedBlanksRef.current = insertedBlanks
```

- [ ] **Step 4: Add mergedRows + rankMap memo**

Add this after the `insertedBlanks` state. It merges real trades and inserted blanks by sort_order and assigns display ranks:

```ts
type MergedRow =
  | { type: 'real'; trade: EnrichedTrade }
  | { type: 'inserted'; blank: InsertedBlank }

const { mergedRows, rankMap } = useMemo(() => {
  const items: MergedRow[] = [
    ...trades.map<MergedRow>((trade) => ({ type: 'real', trade })),
    ...insertedBlanks.map<MergedRow>((blank) => ({ type: 'inserted', blank })),
  ].sort((a, b) => {
    const sa = a.type === 'real' ? a.trade.sort_order : a.blank.sortOrder
    const sb = b.type === 'real' ? b.trade.sort_order : b.blank.sortOrder
    return sa - sb
  })
  const map = new Map<string, number>()
  items.forEach((item, i) => {
    const key = item.type === 'real' ? item.trade.id : item.blank.localId
    map.set(key, i + 1)
  })
  return { mergedRows: items, rankMap: map }
}, [trades, insertedBlanks])
```

- [ ] **Step 5: Update the # column cell renderer to use rankMap**

In the `builtInColumns` useMemo, find the `trade_number` column and change its `cell`:

```ts
{
  accessorKey: 'trade_number',
  header: () => t('trades.columns.number'),
  cell: ({ row }) => (
    <span className="font-medium tabular-nums">
      {rankMap.get(row.original.id) ?? row.original.trade_number}
    </span>
  ),
},
```

Add `rankMap` to the `builtInColumns` dependency array: `[t, handleOpenColumnSettings, rankMap]`. Remove the `eslint-disable-next-line` comment above it.

- [ ] **Step 6: Add computeInsertSortOrder helper**

Add this function inside the component body, before the return:

```ts
function computeInsertSortOrder(tradeId: string, position: 'before' | 'after'): number {
  const allItems = [
    ...trades.map((t) => ({ id: t.id, sortOrder: t.sort_order })),
    ...insertedBlanksRef.current.map((b) => ({ id: b.localId, sortOrder: b.sortOrder })),
  ].sort((a, b) => a.sortOrder - b.sortOrder)

  const idx = allItems.findIndex((item) => item.id === tradeId)
  if (idx === -1) return (allItems.at(-1)?.sortOrder ?? 0) + 1.0

  if (position === 'after') {
    const next = allItems[idx + 1]
    return next ? (allItems[idx].sortOrder + next.sortOrder) / 2 : allItems[idx].sortOrder + 1.0
  } else {
    const prev = allItems[idx - 1]
    return prev ? (prev.sortOrder + allItems[idx].sortOrder) / 2 : allItems[idx].sortOrder - 1.0
  }
}
```

- [ ] **Step 7: Add handleInsertTrade**

```ts
function handleInsertTrade(tradeId: string, position: 'before' | 'after') {
  const sortOrder = computeInsertSortOrder(tradeId, position)
  setInsertedBlanks((prev) => [
    ...prev,
    { localId: crypto.randomUUID(), sortOrder, id: null, fields: {}, filledFields: [] },
  ])
}
```

- [ ] **Step 8: Update handleCellDoubleClick to handle inserted- row IDs**

The existing function handles `new-${i}` row IDs for bottom draft rows. Inserted blank rows use `inserted-${localId}`. Update `handleCellDoubleClick`:

```ts
function handleCellDoubleClick(rowId: string, columnId: string, currentValue: unknown) {
  const isEditable = EDITABLE_COLUMNS.has(columnId) || columnId.startsWith('custom_')
  if (!isEditable) {
    toast(t('trades.cell.readOnly'))
    return
  }
  setEditingCell({ rowId, columnId })
  if (rowId.startsWith('new-')) {
    const idx = parseInt(rowId.slice(4))
    const draft = draftRowsRef.current.get(idx)
    const draftVal = columnId.startsWith('custom_')
      ? draft?.fields.custom_data?.[columnId]
      : draft?.fields[columnId as keyof RawTrade]
    setEditValue(draftVal != null ? String(draftVal) : '')
  } else if (rowId.startsWith('inserted-')) {
    const localId = rowId.slice('inserted-'.length)
    const blank = insertedBlanksRef.current.find((b) => b.localId === localId)
    const val = columnId.startsWith('custom_')
      ? blank?.fields.custom_data?.[columnId]
      : blank?.fields[columnId as keyof RawTrade]
    setEditValue(val != null ? String(val) : '')
  } else {
    setEditValue(String(currentValue ?? ''))
  }
}
```

- [ ] **Step 9: Extract renderDraftCell and getDraftCopyValue as standalone functions**

Currently these are defined as `function renderDraftCell(colId)` and `function getDraftCopyValue(colId)` inside the `Array.from` block, closing over `df`, `hasPrices`, and `enrichedDraft` from that scope. Extract them as standalone functions that accept those values as parameters. Add these functions in the component body (before the return), replacing the inline definitions:

```ts
function renderDraftCellContent(
  colId: string,
  df: Partial<RawTrade>,
  hasPrices: boolean,
  enrichedDraft: EnrichedTrade,
): React.ReactNode {
  if (colId.startsWith('custom_')) {
    const val = df.custom_data?.[colId]
    return val ? <span className="text-sm">{val}</span> : <>&nbsp;</>
  }
  if (colId in df || AUTO_GENERATED_COLS.has(colId)) {
    if (colId === 'trade_date') return <span className="text-sm tabular-nums">{df.trade_date ? fmtDate(df.trade_date) : ''}</span>
    if (colId === 'trade_time') return <span className="text-sm tabular-nums">{df.trade_time ? fmtTime(String(df.trade_time), resolveFormatType('trade_time') === 'time24') : ''}</span>
    if (colId === 'ticker') return <span className="text-sm">{df.ticker ?? ''}</span>
    if (colId === 'order_type') return <span className="text-sm capitalize">{df.order_type ?? ''}</span>
    if (colId === 'avg_entry') return <span className="text-sm tabular-nums">{df.avg_entry != null ? fmtCurrency(df.avg_entry) : ''}</span>
    if (colId === 'stop_loss') return <span className="text-sm tabular-nums">{df.stop_loss != null ? fmtCurrency(df.stop_loss) : ''}</span>
    if (colId === 'avg_exit') return <span className="text-sm tabular-nums">{df.avg_exit != null ? fmtCurrency(df.avg_exit) : ''}</span>
    if (colId === 'risk') return <span className="text-sm tabular-nums">{df.risk != null ? fmtCurrency(df.risk) : ''}</span>
    if (colId === 'rules_followed') return <span className="text-sm">{df.rules_followed != null ? (df.rules_followed ? t('trades.form.rulesYes') : t('trades.form.rulesNo')) : ''}</span>
    if (colId === 'setup_type') return <span className="text-sm">{df.setup_type ?? ''}</span>
    if (colId === 'realised_win') return df.realised_win != null ? <span className="text-sm tabular-nums text-green-600 dark:text-green-400">{fmtCurrency(df.realised_win)}</span> : <></>
    if (colId === 'realised_loss') return df.realised_loss != null ? <span className="text-sm tabular-nums text-red-500">-{fmtCurrency(df.realised_loss)}</span> : <></>
    if (!hasPrices) return <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    if (colId === 'direction') return <span className={cn('text-sm font-medium', enrichedDraft.direction === 'long' ? 'text-green-500' : 'text-red-500')}>{enrichedDraft.direction === 'long' ? t('trades.direction.long') : t('trades.direction.short')}</span>
    if (colId === 'r_multiple') return enrichedDraft.r_multiple != null ? <span className={cn('text-sm tabular-nums', enrichedDraft.r_multiple >= 0 ? 'text-green-500' : 'text-red-500')}>{enrichedDraft.r_multiple.toFixed(2)}R</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    if (colId === 'deviation') return enrichedDraft.deviation != null ? <span className="text-sm tabular-nums">{fmtPercent(enrichedDraft.deviation)}</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    if (colId === 'risk_volatility') return enrichedDraft.risk_volatility != null ? <span className="text-sm tabular-nums">{fmtPercent(enrichedDraft.risk_volatility)}</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    if (colId === 'cumulative_pnl') return enrichedDraft.cumulative_pnl != null ? <span className={cn('text-sm tabular-nums', enrichedDraft.cumulative_pnl >= 0 ? 'text-green-500' : 'text-red-500')}>{fmtCurrency(enrichedDraft.cumulative_pnl)}</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
    if (colId === 'cumulative_r') return enrichedDraft.cumulative_r != null ? <span className={cn('text-sm tabular-nums', enrichedDraft.cumulative_r >= 0 ? 'text-green-500' : 'text-red-500')}>{enrichedDraft.cumulative_r.toFixed(2)}R</span> : <SquareFunction className="mx-auto size-4 text-muted-foreground/40" />
  }
  return <>&nbsp;</>
}

function getDraftCopyText(
  colId: string,
  df: Partial<RawTrade>,
  hasPrices: boolean,
  enrichedDraft: EnrichedTrade,
): string {
  if (colId.startsWith('custom_')) return df.custom_data?.[colId] ?? ''
  if (AUTO_GENERATED_COLS.has(colId)) {
    if (!hasPrices) return ''
    const v = enrichedDraft[colId as keyof typeof enrichedDraft]
    return v !== null && v !== undefined ? String(v) : ''
  }
  const v = df[colId as keyof typeof df]
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? t('trades.form.rulesYes') : t('trades.form.rulesNo')
  return String(v)
}
```

- [ ] **Step 10: Update the bottom blank row loop to use the extracted functions**

In the `Array.from({ length: blankRowCount }, ...)` block, replace calls to the old inline `renderDraftCell(col.id)` and `getDraftCopyValue(col.id)` with `renderDraftCellContent(col.id, df, hasPrices, enrichedDraft)` and `getDraftCopyText(col.id, df, hasPrices, enrichedDraft)`.

Also update the pinned # cell for bottom blank rows to use `mergedRows.length` instead of `trades.length`:

```tsx
// before
<span className="font-medium tabular-nums">{trades.length + i + 1}</span>
// after
<span className="font-medium tabular-nums">{mergedRows.length + i + 1}</span>
```

And the "Add Trade" row label:

```tsx
// before
{t('trades.addTrade')} #{trades.length + blankRowCount + 1}
// after
{t('trades.addTrade')} #{mergedRows.length + blankRowCount + 1}
```

- [ ] **Step 11: Add saveAndCloseInserted**

Add this function in the component body. It mirrors `saveAndClose` but operates on an `InsertedBlank` identified by `localId`:

```ts
function saveAndCloseInserted(localId: string, columnId: string, value: string) {
  setEditingCell(null)
  const blank = insertedBlanksRef.current.find((b) => b.localId === localId)
  if (!blank) return

  const isEmpty = !value.trim()
  const isCustom = columnId.startsWith('custom_')

  if (isCustom) {
    const mergedCustomData = { ...(blank.fields.custom_data ?? {}), [columnId]: value }
    setInsertedBlanks((prev) =>
      prev.map((b) =>
        b.localId === localId
          ? { ...b, fields: { ...b.fields, custom_data: mergedCustomData } }
          : b
      )
    )
    if (isEmpty) return
    if (blank.id) {
      onPatchTrade(blank.id, { custom_data: mergedCustomData })
    } else {
      onCreateTrade(blank.sortOrder).then((newTrade) => {
        if (!newTrade) return
        setInsertedBlanks((prev) =>
          prev.map((b) => (b.localId === localId ? { ...b, id: newTrade.id } : b))
        )
        onPatchTrade(newTrade.id, { custom_data: mergedCustomData })
      })
    }
    return
  }

  const fields = parseFieldForSave(columnId, value)
  const isRequiredNumeric = ['avg_entry', 'stop_loss', 'avg_exit', 'risk'].includes(columnId)
  const isOptionalNumeric = ['realised_win', 'realised_loss'].includes(columnId)
  const counterpart =
    columnId === 'realised_win' ? 'realised_loss' : columnId === 'realised_loss' ? 'realised_win' : null

  const newFilledFields = isEmpty
    ? blank.filledFields.filter((f) => f !== columnId)
    : [...new Set([...blank.filledFields.filter((f) => f !== counterpart), columnId])]

  setInsertedBlanks((prev) =>
    prev.map((b) => {
      if (b.localId !== localId) return b
      const newFields = { ...b.fields }
      if (isEmpty && (isRequiredNumeric || isOptionalNumeric)) {
        delete (newFields as Record<string, unknown>)[columnId]
      } else {
        Object.assign(newFields, fields)
        if (counterpart && !isEmpty) delete (newFields as Record<string, unknown>)[counterpart]
      }
      return { ...b, fields: newFields, filledFields: newFilledFields }
    })
  )

  if (isEmpty) {
    if (blank.id) {
      const clearFields: Partial<TradeFormData> = { draft_fields: newFilledFields }
      if (isOptionalNumeric) (clearFields as Record<string, unknown>)[columnId] = null
      else if (!isRequiredNumeric) Object.assign(clearFields, fields)
      onPatchTrade(blank.id, clearFields)
    }
    return
  }

  const patchFields = {
    ...fields,
    ...(counterpart ? { [counterpart]: null } : {}),
    draft_fields: newFilledFields,
  } as Partial<TradeFormData>

  if (blank.id) {
    onPatchTrade(blank.id, patchFields)
  } else {
    onCreateTrade(blank.sortOrder).then((newTrade) => {
      if (!newTrade) return
      setInsertedBlanks((prev) =>
        prev.map((b) => (b.localId === localId ? { ...b, id: newTrade.id } : b))
      )
      onPatchTrade(newTrade.id, patchFields)
    })
  }
}
```

- [ ] **Step 12: Add validateAndCommitInserted**

```ts
function validateAndCommitInserted(localId: string, columnId: string) {
  const fmt = resolveFormatType(columnId)
  const raw = editValue
  if ((fmt === 'number' || fmt === 'currency') && raw.trim() !== '') {
    const num = Number(raw.replace(/,/g, ''))
    if (isNaN(num)) {
      toast.error(t('trades.cell.invalidNumber'))
      setEditValue('')
      setEditingCell(null)
      return
    }
  }
  saveAndCloseInserted(localId, columnId, raw)
}
```

- [ ] **Step 13: Refactor <TableBody> — replace real-trade loop with mergedRows loop**

In the JSX `<TableBody>`, replace the current `{table.getRowModel().rows.map((row) => (...))}` block with a loop over `mergedRows`. Build a lookup map just before the return statement:

```ts
const tableRowMap = new Map(table.getRowModel().rows.map((r) => [r.original.id, r]))
```

Then in `<TableBody>`:

```tsx
{mergedRows.map((item) => {
  // ── Real trade row ──────────────────────────────────────────────
  if (item.type === 'real') {
    const row = tableRowMap.get(item.trade.id)
    if (!row) return null
    return (
      <TableRow key={row.id}>
        {/* PASTE the existing real-trade row cells here exactly as-is */}
        {/* The # column cell already uses rankMap via the builtInColumns definition */}
        {/* No other change needed to the real-trade cells */}
      </TableRow>
    )
  }

  // ── Inserted blank row ──────────────────────────────────────────
  const blank = item.blank
  const rowId = `inserted-${blank.localId}`
  const rank = rankMap.get(blank.localId) ?? 0
  const df = blank.fields

  const draftRaw: RawTrade = {
    id: blank.id ?? `__inserted_${blank.localId}`,
    patch_id: '',
    trade_number: rank,
    sort_order: blank.sortOrder,
    trade_date: df.trade_date ?? new Date().toISOString().split('T')[0],
    trade_time: df.trade_time ?? '00:00:00',
    ticker: df.ticker ?? '',
    direction: 'long',
    order_type: df.order_type ?? 'market',
    avg_entry: df.avg_entry ?? 0,
    stop_loss: df.stop_loss ?? 0,
    avg_exit: df.avg_exit ?? 0,
    risk: df.risk ?? 0,
    rules_followed: df.rules_followed ?? false,
    setup_type: df.setup_type ?? '',
    realised_win: df.realised_win ?? null,
    realised_loss: df.realised_loss ?? null,
    created_at: '',
    updated_at: '',
  }
  const allForEnrich = [...(trades as unknown as RawTrade[]), draftRaw]
  const enrichedBlank = enrichTrades(allForEnrich)[allForEnrich.length - 1]
  const hasPrices = draftRaw.avg_entry > 0 && draftRaw.stop_loss > 0 && draftRaw.avg_exit > 0

  return (
    <TableRow key={rowId}>
      {table.getVisibleLeafColumns().map((col) => {
        const isPinned = col.id === PINNED_COLUMN
        const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === col.id

        const cellContent = isEditing && col.id === 'trade_date' ? (
          <>
            {renderDraftCellContent(col.id, df, hasPrices, enrichedBlank)}
            <DateCellEditor
              value={editValue}
              open
              onClose={cancelEdit}
              onCommit={(v) => saveAndCloseInserted(blank.localId, col.id, v)}
            />
          </>
        ) : isEditing && isDropdownColumn(col.id) ? (
          <>
            {renderDraftCellContent(col.id, df, hasPrices, enrichedBlank)}
            <MenuCellEditor
              value={editValue}
              options={resolveOptions(col.id)}
              onClose={cancelEdit}
              onCommit={(v) => saveAndCloseInserted(blank.localId, col.id, v)}
            />
          </>
        ) : isEditing ? (
          <input
            autoFocus
            type={col.id === 'trade_time' ? 'time' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => validateAndCommitInserted(blank.localId, col.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') validateAndCommitInserted(blank.localId, col.id)
              if (e.key === 'Escape') cancelEdit()
            }}
            size={1}
            className="h-full w-full bg-transparent px-2 text-center text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
          />
        ) : isPinned ? (
          <span className="font-medium tabular-nums">{rank}</span>
        ) : (
          renderDraftCellContent(col.id, df, hasPrices, enrichedBlank)
        )

        if (isPinned) {
          return (
            <TableCell
              key={col.id}
              className={cn('sticky inset-s-0 z-10 w-12.5 min-w-12.5 bg-background', scrolledX && colShadow)}
            >
              {cellContent}
            </TableCell>
          )
        }

        return (
          <ContextMenu key={col.id}>
            <ContextMenuTrigger asChild>
              <TableCell
                className={cn(
                  isEditing && 'ring-1 ring-inset ring-primary',
                  isEditing && col.id !== 'trade_date' && !isDropdownColumn(col.id) && 'p-0',
                  isEditing && (col.id === 'trade_date' || isDropdownColumn(col.id)) && 'select-none cursor-default',
                )}
                onDoubleClick={() => handleCellDoubleClick(rowId, col.id, '')}
              >
                {cellContent}
              </TableCell>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() => navigator.clipboard.writeText(getDraftCopyText(col.id, df, hasPrices, enrichedBlank))}
              >
                <Copy className="size-4" />
                {t('trades.cell.copy')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuLabel>{t('trades.cell.sectionTrade')}</ContextMenuLabel>
              <ContextMenuItem
                variant="destructive"
                onClick={async () => {
                  if (blank.id) await onDeleteTrade(blank.id)
                  setInsertedBlanks((prev) => prev.filter((b) => b.localId !== blank.localId))
                }}
              >
                <Trash2 className="size-4" />
                {t('trades.deleteTrade', { number: rank })}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuLabel>{t('trades.cell.sectionColumn')}</ContextMenuLabel>
              <ContextMenuItem
                disabled={REQUIRED_COLUMNS.has(col.id)}
                onClick={() => onHideColumn(col.id)}
              >
                <EyeOff className="size-4" />
                {t('trades.columns.hide')}
              </ContextMenuItem>
              <ContextMenuItem disabled>
                <Pencil className="size-4" />
                {t('trades.columns.rename')}
              </ContextMenuItem>
              <ContextMenuItem disabled variant="destructive">
                <Trash2 className="size-4" />
                {t('trades.columns.delete')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </TableRow>
  )
})}
```

- [ ] **Step 14: Add Insert Before/After items to the real-trade row context menu**

In the real-trade row's `<ContextMenuContent>` (inside the `item.type === 'real'` branch), add these two items in the Trade section, **before** "Duplicate Trade":

```tsx
<ContextMenuItem onClick={() => handleInsertTrade(row.original.id, 'before')}>
  <ArrowUp className="size-4" />
  {t('trades.insertTradeBefore')}
</ContextMenuItem>
<ContextMenuItem onClick={() => handleInsertTrade(row.original.id, 'after')}>
  <ArrowDown className="size-4" />
  {t('trades.insertTradeAfter')}
</ContextMenuItem>
```

- [ ] **Step 15: Verify**

Run `npm run dev`. Test the following:

1. **Basic insert:** Right-click a real trade → "Insert Trade After" → blank row appears directly below it with the correct `#` rank. Other trade numbers shift up.
2. **Insert before first trade:** Right-click trade #1 → "Insert Trade Before" → blank row appears above it as the new #1.
3. **Multiple inserts:** Insert after trade #2 twice → two blank rows appear between #2 and what was #3.
4. **Cell fill → DB save:** Double-click a cell in an inserted blank → type a value → Enter. Open Supabase Table Editor → confirm a draft trade row was created with `sort_order` between the two adjacent real trades.
5. **Second cell fill → patch (no duplicate):** Fill a second cell in the same inserted blank → only one draft row exists in Supabase.
6. **Leave empty → no DB save:** Insert a blank, double-click a cell, press Escape without typing → nothing in Supabase.
7. **Delete inserted blank:** Right-click an inserted blank → delete → row removed.
8. **Delete inserted blank with data:** Fill one cell, then delete → draft row removed from Supabase.
9. **Context menu NOT on draft rows:** Right-click a bottom blank row → "Insert Trade Before/After" does NOT appear.
10. **After real trade delete:** Delete a real trade → remaining trade numbers resequence correctly.

- [ ] **Step 16: Commit**

```bash
git add components/trades/trades-table.tsx
git commit -m "feat: insert trade before/after with inline blank row and sort_order persistence"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Add sort_order float8 to trades | Task 1 |
| Queries ORDER BY sort_order | Task 1 |
| `#` column = display rank (not DB trade_number) | Task 4, Step 5 |
| computeInsertSortOrder midpoint / boundary logic | Task 4, Step 6 |
| Insert Before/After only on real rows (not drafts) | Task 4, Step 14 — items only in `item.type === 'real'` branch |
| Blank row saves to DB only when first cell filled | Task 4, Steps 11–12 |
| Delete inserted blank with data calls onDeleteTrade | Task 4, Step 13 (context menu delete handler) |
| Trade numbers update after real trade delete (refetch) | Existing handleDeleteTrade already refetches; rankMap recomputes from updated trades state automatically |
| i18n for both menu items | Task 2 |
| Migration documented | Task 1, Step 2 |

**Type consistency check:**

- `InsertedBlank.id: string | null` — matches usage in Steps 11 (saveAndCloseInserted), 13 (delete handler)
- `onCreateTrade(sortOrder?: number)` — defined in Step 2 (Props), produced in Task 3, consumed in Step 11
- `renderDraftCellContent(colId, df, hasPrices, enrichedDraft)` — defined in Step 9, used in Steps 10 and 13
- `getDraftCopyText(colId, df, hasPrices, enrichedDraft)` — defined in Step 9, used in Steps 10 and 13
- `computeInsertSortOrder(tradeId, position)` — defined Step 6, used Step 7
- `handleInsertTrade(tradeId, position)` — defined Step 7, used Step 14

**Placeholder scan:** No TBDs or incomplete steps found.
