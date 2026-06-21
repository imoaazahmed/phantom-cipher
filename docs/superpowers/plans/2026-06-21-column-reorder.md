# Column Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to drag table columns into any order, persisted per-patch in the database, with duplicate preserving column order.

**Architecture:** Store `column_order` (JSONB array of column key strings, excluding the pinned `trade_number` column) on the `patches` table. A utility resolves saved order against live columns. `@dnd-kit/sortable` drives horizontal header drag; TanStack Table's `columnOrder` state controls rendering. `TradesClient` owns persistence; `TradesTable` owns drag UI.

**Tech Stack:** Next.js App Router, Supabase, TanStack Table, @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities (all already installed), TypeScript, Tailwind CSS v4.

## Global Constraints

- No hardcoded strings in JSX — all visible text via `t()` (no new visible text added in this feature)
- Server actions in `lib/trades/actions.ts`, client components in `components/trades/`
- `trade_number` is always the first column and is never stored in `column_order` nor draggable
- Column keys = `accessorKey` values from TanStack column definitions (stable identifiers)
- No test framework exists in this project — skip test steps
- `updatePatch` uses fire-and-forget pattern (no loading state on column reorder)
- Optimistically update `patches` state in `TradesClient` so the saved order survives patch switching without a page reload

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/database-migrations.md` | Modify | Add `column_order` migration |
| `docs/database-queries.md` | Modify | Add `column_order` to patches schema |
| `lib/trades/types.ts` | Modify | Add `column_order` to `Patch` type |
| `lib/trades/actions.ts` | Modify | Add `column_order` to `updatePatch` + `duplicatePatch` |
| `lib/trades/column-order.ts` | Create | `DEFAULT_COLUMN_ORDER`, `PINNED_COLUMN`, `resolveColumnOrder` |
| `components/trades/trades-table.tsx` | Modify | Drag UI, TanStack `columnOrder` state, new props |
| `components/trades/trades-client.tsx` | Modify | Column order wiring, `handleColumnReorder`, `key` prop |

---

## Task 1: Database docs, types, and actions

**Files:**
- Modify: `docs/database-migrations.md`
- Modify: `docs/database-queries.md`
- Modify: `lib/trades/types.ts`
- Modify: `lib/trades/actions.ts`

**Interfaces:**
- Produces: `Patch.column_order: string[] | null`, `updatePatch` accepting `column_order`, `duplicatePatch` copying it

- [ ] **Step 1: Add migration to `docs/database-migrations.md`**

Append this section at the end of the file:

```markdown
---

## 2026-06-21 — Add column_order to patches

```sql
alter table public.patches
  add column if not exists column_order jsonb null;
```

`null` means default column order. Value is an ordered array of column key
strings (accessorKey values), excluding the always-pinned `trade_number` column.
```

- [ ] **Step 2: Update `docs/database-queries.md` patches table definition**

In the `patches` `create table` block inside `database-queries.md`, add the column before `created_at`:

```sql
  column_order jsonb null,
```

- [ ] **Step 3: Add `column_order` to `Patch` type in `lib/trades/types.ts`**

```ts
export type Patch = {
  id: string
  user_id: string
  patch_number: number
  name: string
  patch_limit: number
  is_hidden: boolean
  sort_order: number
  column_order: string[] | null
  created_at: string
}
```

- [ ] **Step 4: Add `column_order` to `updatePatch` in `lib/trades/actions.ts`**

Change the `updates` parameter type:

```ts
export async function updatePatch(
  patchId: string,
  updates: Partial<{ name: string; patch_limit: number; is_hidden: boolean; sort_order: number; column_order: string[] | null }>
): Promise<{ error: string | null }> {
```

No other change needed — `supabase.from('patches').update(updates)` already handles the new field.

- [ ] **Step 5: Update `duplicatePatch` in `lib/trades/actions.ts` to copy `column_order`**

In the `.insert({...})` call that creates the new patch, add `column_order`:

```ts
const { data: newPatch, error: patchError } = await supabase
  .from('patches')
  .insert({
    user_id: user.id,
    patch_number: nextNumber,
    name: `Copy of ${source.name}`,
    patch_limit: source.patch_limit,
    column_order: source.column_order ?? null,
    sort_order: nextNumber,
  })
  .select()
  .single()
```

- [ ] **Step 6: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run the migration in Supabase**

In the Supabase SQL editor (dev project `trading-logs-dev`), run:

```sql
alter table public.patches
  add column if not exists column_order jsonb null;
```

Then run the same on the prod project `trading-logs-prod`.

- [ ] **Step 8: Commit**

```bash
git add docs/database-migrations.md docs/database-queries.md lib/trades/types.ts lib/trades/actions.ts
git commit -m "feat: add column_order to patches — DB, types, actions"
```

---

## Task 2: Column order utility

**Files:**
- Create: `lib/trades/column-order.ts`

**Interfaces:**
- Produces:
  - `PINNED_COLUMN: string` — `'trade_number'`
  - `DEFAULT_COLUMN_ORDER: string[]` — all non-pinned column keys in definition order
  - `resolveColumnOrder(saved: string[] | null, allKeys: string[]): string[]`

- [ ] **Step 1: Create `lib/trades/column-order.ts`**

```ts
export const PINNED_COLUMN = 'trade_number'

// All non-pinned column keys in default definition order.
// Keep this in sync with the column definitions in trades-table.tsx.
export const DEFAULT_COLUMN_ORDER: string[] = [
  'trade_date',
  'trade_time',
  'ticker',
  'direction',
  'order_type',
  'avg_entry',
  'stop_loss',
  'avg_exit',
  'risk',
  'realised_loss',
  'realised_win',
  'deviation',
  'r_multiple',
  'risk_volatility',
  'cumulative_pnl',
  'cumulative_r',
  'rules_followed',
  'setup_type',
]

/**
 * Merges a saved column order with the live column list.
 *
 * - Saved IDs that no longer exist in allKeys are dropped.
 * - New IDs in allKeys not present in saved are appended at the end.
 * - trade_number (pinned) is never included — callers prepend it separately.
 */
export function resolveColumnOrder(
  saved: string[] | null,
  allKeys: string[]
): string[] {
  if (!saved || saved.length === 0) return allKeys
  const allSet = new Set(allKeys)
  const savedSet = new Set(saved)
  const kept = saved.filter((id) => allSet.has(id))
  const appended = allKeys.filter((id) => !savedSet.has(id))
  return [...kept, ...appended]
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/trades/column-order.ts
git commit -m "feat: add resolveColumnOrder utility"
```

---

## Task 3: TradesTable — drag-to-reorder UI

**Files:**
- Modify: `components/trades/trades-table.tsx`

**Interfaces:**
- Consumes from Task 2: `PINNED_COLUMN`, `DEFAULT_COLUMN_ORDER`, `resolveColumnOrder`
- Produces:
  - Updated `Props`: adds `initialColumnOrder: string[] | null`, `onColumnReorder: (order: string[]) => void`
  - Draggable header cells for all columns except `trade_number`

- [ ] **Step 1: Add dnd-kit imports to `trades-table.tsx`**

Add these imports at the top:

```ts
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PINNED_COLUMN, DEFAULT_COLUMN_ORDER, resolveColumnOrder } from '@/lib/trades/column-order'
```

Also add `useState` to the existing React import:

```ts
import { useMemo, useState } from 'react'
```

- [ ] **Step 2: Update `Props` type**

```ts
type Props = {
  trades: EnrichedTrade[]
  scrolledX?: boolean
  scrolledY?: boolean
  initialColumnOrder: string[] | null
  onColumnReorder: (order: string[]) => void
}
```

- [ ] **Step 3: Add `DraggableHeader` component above `TradesTable`**

```tsx
type DraggableHeaderProps = {
  id: string
  className?: string
  children: React.ReactNode
}

function DraggableHeader({ id, className, children }: DraggableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <TableHead
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
      }}
      className={className}
      {...attributes}
      {...listeners}
    >
      {children}
    </TableHead>
  )
}
```

- [ ] **Step 4: Update `TradesTable` signature and add column order state**

Update the function signature and initialise TanStack's `columnOrder` state:

```tsx
export function TradesTable({ trades, scrolledX, scrolledY, initialColumnOrder, onColumnReorder }: Props) {
  const { t } = useTranslation()

  const resolved = resolveColumnOrder(initialColumnOrder, DEFAULT_COLUMN_ORDER)
  const [columnOrder, setColumnOrder] = useState<string[]>([PINNED_COLUMN, ...resolved])

  const sensors = useSensors(useSensor(PointerSensor))
```

- [ ] **Step 5: Wire `columnOrder` into `useReactTable`**

Update the `useReactTable` call:

```tsx
const table = useReactTable({
  data: trades,
  columns,
  getCoreRowModel: getCoreRowModel(),
  state: { columnOrder },
  onColumnOrderChange: setColumnOrder,
})
```

- [ ] **Step 6: Add `handleDragEnd`**

Add this function inside `TradesTable`, after `sensors`:

```tsx
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  setColumnOrder((prev) => {
    const oldIndex = prev.indexOf(active.id as string)
    const newIndex = prev.indexOf(over.id as string)
    const next = arrayMove(prev, oldIndex, newIndex)
    // Persist order without the pinned column
    onColumnReorder(next.filter((id) => id !== PINNED_COLUMN))
    return next
  })
}
```

- [ ] **Step 7: Wrap header in `DndContext` + `SortableContext` and use `DraggableHeader`**

Replace the current header render:

```tsx
<TableHeader>
  <DndContext
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragEnd={handleDragEnd}
  >
    {table.getHeaderGroups().map((hg) => (
      <TableRow key={hg.id}>
        <SortableContext
          items={columnOrder.filter((id) => id !== PINNED_COLUMN)}
          strategy={horizontalListSortingStrategy}
        >
          {hg.headers.map((h, index) => {
            const isPinned = h.column.id === PINNED_COLUMN
            const headClassName = cn(
              'sticky top-0 z-10 bg-background',
              scrolledY && rowShadow,
              isPinned && 'inset-s-0 z-20 w-12.5 min-w-12.5',
              !isPinned && 'min-w-20',
              isPinned && scrolledX && colShadow,
            )
            if (isPinned) {
              return (
                <TableHead key={h.id} className={headClassName}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              )
            }
            return (
              <DraggableHeader key={h.id} id={h.column.id} className={headClassName}>
                {flexRender(h.column.columnDef.header, h.getContext())}
              </DraggableHeader>
            )
          })}
        </SortableContext>
      </TableRow>
    ))}
  </DndContext>
</TableHeader>
```

- [ ] **Step 8: Update body cell rendering to use `isPinned` check instead of `index === 0`**

The body cells use `index === 0` to detect the pinned column. Replace with a column id check so it stays correct regardless of order:

```tsx
{table.getRowModel().rows.length === 0 ? (
  Array.from({ length: 5 }).map((_, i) => (
    <TableRow key={i}>
      {table.getAllLeafColumns().map((col) => {
        const isPinned = col.id === PINNED_COLUMN
        return (
          <TableCell
            key={col.id}
            className={cn(isPinned && cn('sticky inset-s-0 z-10 w-12.5 min-w-12.5 bg-background', scrolledX && colShadow))}
          >
            &nbsp;
          </TableCell>
        )
      })}
    </TableRow>
  ))
) : (
  table.getRowModel().rows.map((row) => (
    <TableRow key={row.id}>
      {row.getVisibleCells().map((cell) => {
        const isPinned = cell.column.id === PINNED_COLUMN
        return (
          <TableCell
            key={cell.id}
            className={cn(isPinned && cn('sticky inset-s-0 z-10 w-12.5 min-w-12.5 bg-background', scrolledX && colShadow))}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        )
      })}
    </TableRow>
  ))
)}
```

- [ ] **Step 9: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add components/trades/trades-table.tsx
git commit -m "feat: draggable column reorder in TradesTable"
```

---

## Task 4: TradesClient wiring

**Files:**
- Modify: `components/trades/trades-client.tsx`

**Interfaces:**
- Consumes from Task 3: `TradesTable` props `initialColumnOrder`, `onColumnReorder`
- Consumes from Task 1: `updatePatch` accepting `column_order`

- [ ] **Step 1: Add `handleColumnReorder` in `TradesClient`**

Add this function alongside the other patch handlers:

```tsx
async function handleColumnReorder(order: string[]) {
  const id = activePatchId
  // Optimistic update so order survives patch switching without reload
  setPatches((prev) =>
    prev.map((p) => (p.id === id ? { ...p, column_order: order } : p))
  )
  await updatePatch(id, { column_order: order })
}
```

- [ ] **Step 2: Pass `key`, `initialColumnOrder`, and `onColumnReorder` to `TradesTable`**

Update the `TradesTable` render:

```tsx
<TradesTable
  key={activePatchId}
  trades={enriched}
  scrolledX={scrolledX}
  scrolledY={scrolledY}
  initialColumnOrder={activePatch?.column_order ?? null}
  onColumnReorder={handleColumnReorder}
/>
```

The `key={activePatchId}` unmounts and remounts `TradesTable` on patch switch, resetting its internal `columnOrder` state to the new patch's saved order.

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

1. Open the Trades page with at least one patch that has trades.
2. Drag a column header (e.g. "Ticker") to a new position — it should move live.
3. Refresh the page — column order should be restored.
4. Switch to another patch — it should have its own (default) column order.
5. Switch back — the first patch's custom order should be preserved.
6. Duplicate the patch — the copy should have the same column order.
7. Drag `trade_number` header — it should not be draggable (no cursor change, no movement).

- [ ] **Step 5: Commit**

```bash
git add components/trades/trades-client.tsx
git commit -m "feat: wire column reorder persistence in TradesClient"
```
