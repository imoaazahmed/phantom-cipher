# Insert Trade Before / After

**Date:** 2026-06-23
**Status:** Approved

---

## Overview

Add "Insert Trade Before" and "Insert Trade After" to the row context menu. Each inserts a blank editable row at the chosen position. The row is only persisted to the DB when the user fills at least one cell (matching existing draft behavior). To support arbitrary insertion order, a `sort_order float8` column is added to the `trades` table.

---

## Database

### Migration

Add `sort_order float8 NOT NULL DEFAULT 0` to `trades`:

```sql
ALTER TABLE public.trades ADD COLUMN sort_order float8 NOT NULL DEFAULT 0;
UPDATE public.trades SET sort_order = trade_number;
CREATE INDEX trades_sort_order_idx ON public.trades (patch_id, sort_order);
```

### Ordering

All queries that fetch trades switch from `ORDER BY trade_number ASC` to `ORDER BY sort_order ASC`. This affects `getPatchTrades` and `getPatchDraftTrades` in `lib/trades/actions.ts`.

### trade_number field

`trade_number` is kept in the DB and continues to be assigned at creation (next max + 1) for the unique constraint `(patch_id, trade_number)`. It is no longer used for display or sorting. The displayed `#` column becomes the row's rank position (1, 2, 3…) computed client-side as the array index in the sort_order-sorted list.

### sort_order values

| Operation | sort_order assigned |
|---|---|
| Append (regular new trade) | `max(sort_order) + 1.0` |
| Insert Before first trade | `trade[0].sort_order - 1.0` |
| Insert Before trade at index i | `(trade[i-1].sort_order + trade[i].sort_order) / 2` |
| Insert After last trade | `trade[N-1].sort_order + 1.0` |
| Insert After trade at index i | `(trade[i].sort_order + trade[i+1].sort_order) / 2` |

Precision degrades after ~50 consecutive midpoint splits in the same gap. For a 100-trade patch limit this is not a practical concern.

### Delete behavior

Deleting a trade does not require updating any sort_order values. The `#` column (computed rank) automatically adjusts after the next refetch. The existing `handleDeleteTrade` already performs a background refetch — no change needed.

---

## Types

Add `sort_order: number` to `RawTrade` in `lib/trades/types.ts`.

Remove `trade_number` from the fields that drive display ordering — it remains in the type as a DB-assigned creation sequence.

---

## Server Actions

### `createDraftTrade(patchId, sortOrder?)`

Add an optional `sortOrder` parameter. When provided, use it directly. When omitted (regular append from bottom), compute `max(sort_order) + 1.0` as before.

### No new actions needed

No action needed to update sort_orders on delete. No action needed to renumber on insert.

---

## Component: TradesTable

### New local state: `insertedBlanks`

```ts
type InsertedBlank = {
  localId: string        // crypto.randomUUID(), used as React key
  sortOrder: number      // pre-computed midpoint / boundary value
  fields: Partial<RawTrade>
  filledFields: string[]
  draftId: string | null // null until first cell fill triggers createDraftTrade
}

const [insertedBlanks, setInsertedBlanks] = useState<InsertedBlank[]>([])
```

### Unified display list

Replace the separate "real rows" + "blank rows at bottom" rendering with a single merged display list:

```ts
type DisplayRow =
  | { kind: 'real'; trade: EnrichedTrade; rank: number }
  | { kind: 'inserted'; blank: InsertedBlank; rank: number }
  | { kind: 'draft'; index: number; rank: number }   // existing bottom blanks
```

Computed by merging:
1. Real trades (sorted by sort_order, already ordered from server)
2. Inserted blanks (sorted by their sortOrder, interleaved with real trades)
3. Bottom blank rows (always after all real + inserted, same as today)

Ranks are assigned 1..N across the merged list (skipping bottom blanks — those get N+1, N+2 as before).

### Insert handler

```ts
function handleInsertTrade(tradeId: string, position: 'before' | 'after') {
  const idx = trades.findIndex(t => t.id === tradeId)
  // compute sort_order based on neighbors
  // push new InsertedBlank into insertedBlanks state
}
```

### Cell fill for inserted blanks

When a cell is filled in an inserted blank row and `draftId` is null:
1. Call `onCreateTrade(sortOrder)` — which calls `createDraftTrade(patchId, sortOrder)`
2. Store the returned `draftId` on the blank entry
3. Call `onPatchTrade(draftId, fields)` as usual

When a cell is cleared back to empty and `filledFields` becomes empty — the draft remains in DB (same behavior as existing bottom drafts when emptied).

### Props change

```ts
onCreateTrade: (sortOrder?: number) => Promise<RawTrade | null>
```

### Context menu

In the real-row context menu, under the "Trade" section, before "Duplicate Trade":

```
Insert Trade Before   (ArrowUp icon)
Insert Trade After    (ArrowDown icon)
```

These items do NOT appear in the draft-row context menu (bottom blank rows).

---

## Component: TradesClient

`handleCreateTrade` accepts optional `sortOrder` and passes it to `createDraftTrade`:

```ts
async function handleCreateTrade(sortOrder?: number): Promise<RawTrade | null> {
  const { data } = await createDraftTrade(activePatchId, sortOrder)
  ...
}
```

---

## i18n keys

```json
"trades.insertTradeBefore": "Insert Trade Before",
"trades.insertTradeAfter": "Insert Trade After"
```

Both in `messages/en.json` and `messages/ar.json`.

---

## Out of scope

- Drag-to-reorder rows (future, sort_order column already supports it)
- Insert Before/After on draft/blank rows at the bottom
- Compacting sort_order values (not needed within patch limits)
