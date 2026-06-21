# Column Reorder Design

**Date:** 2026-06-21
**Status:** Approved

## Overview

Allow users to drag table columns into any order. Each patch stores its own column order independently. Duplicating a patch copies the column order. Order is persisted to the database so it survives device/browser changes.

---

## Database

### Schema change — `patches` table

Add a nullable JSONB column to `patches`:

```sql
alter table public.patches
  add column if not exists column_order jsonb null;
```

- `null` means "default order" — no migration needed for existing patches.
- Value is an ordered array of stable column key strings:
  `["trade_number", "trade_date", "trade_time", "ticker", ...]`
- Column keys are the `accessorKey` values from the TanStack column definitions.

### Files to update

- `docs/database-migrations.md` — new dated migration section
- `docs/database-queries.md` — add `column_order` to the `patches` table definition

---

## Column Order Resolution (Merge Logic)

At render time, given `savedOrder: string[] | null` and the live column definitions:

1. Start with `savedOrder` filtered to only IDs that still exist in the live columns.
2. Append any live column IDs not present in the saved order (new columns appear at the end).

This makes the design forward-compatible with future column management:
- **Add column** → appears at the end of the order.
- **Delete column** → silently dropped from the resolved order.
- **Rename column** → no effect (ID is stable; display label comes from the column def).

The merge runs client-side before passing the order to TanStack Table.

---

## Pinned Column

`trade_number` is always first and is non-draggable. It is excluded from the column order array in the DB — the merge logic prepends it unconditionally. This keeps the sticky first-column behaviour intact and simplifies the drag implementation.

---

## Server Actions

### `updatePatch`

Add `column_order` to the `Partial<>` updates type:

```ts
updates: Partial<{
  name: string
  patch_limit: number
  is_hidden: boolean
  sort_order: number
  column_order: string[] | null
}>
```

No other changes needed — existing `updatePatch` already handles partial updates.

### `duplicatePatch`

Copy `column_order` from source patch alongside `patch_limit`:

```ts
column_order: source.column_order ?? null,
```

### `Patch` type (`lib/trades/types.ts`)

Add the field:

```ts
column_order: string[] | null
```

---

## UI — Drag to Reorder

### Library

`@dnd-kit` — already in the project (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`). Same setup as `PatchTabs`.

### Drag target

Drag handles are on `<th>` header cells only. Body cells do not participate in drag. A grab cursor indicates draggability.

### TanStack Table integration

Use TanStack Table's built-in `columnOrder` state:
- Initialise with the resolved column order on mount.
- On drop, call `setColumnOrder(newOrder)` to update the table immediately.
- Persist to DB via `updatePatch({ column_order: newOrder })` (fire-and-forget, same pattern as patch tab reorder).

### State flow

```
TradesClient
  ├── owns patch state (patches, activePatchId)
  ├── resolves columnOrder from activePatch.column_order
  ├── passes columnOrder + onColumnReorder to TradesTable
  └── onColumnReorder → updatePatch({ column_order })

TradesTable
  ├── receives columnOrder (string[])
  ├── initialises TanStack columnOrder state
  ├── renders DndContext + SortableContext over <th> cells
  └── on drop → calls onColumnReorder(newOrder)
```

### Patch switching — resetting column order

When the active patch changes, `TradesTable` must reset its internal TanStack `columnOrder` state to the new patch's order. This is achieved by passing `key={activePatchId}` to `TradesTable` from `TradesClient`, which unmounts and remounts the component with fresh state on each patch switch.

### Visual behaviour

- While dragging: column moves live (TanStack `columnOrder` updates immediately via optimistic state in `TradesTable`).
- On drop: new order is persisted; no loading state shown (same as patch tab reorder).
- `trade_number` header: no drag handle, no cursor change.

---

## Constraints & Edge Cases

| Scenario | Behaviour |
|---|---|
| First visit / null column_order | Default order (definition order in code) |
| New column added to code | Appended after all saved columns |
| Column removed from code | Silently dropped from resolved order |
| Duplicate patch | Copies `column_order` exactly |
| Switch between patches | Table re-initialises with each patch's own order |
