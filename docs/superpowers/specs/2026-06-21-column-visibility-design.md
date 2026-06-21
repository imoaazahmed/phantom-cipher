# Column Visibility Design

**Date:** 2026-06-21
**Status:** Approved

## Overview

Allow users to hide and show table columns via two entry points:
1. **Right-click context menu** on any non-pinned column header — "Hide" and disabled "Delete"
2. **Columns dialog** (`Columns3Cog` icon button) in the patch name row — shows all non-pinned columns with checkboxes

Column visibility is **global** (same across all patches) for now. The data shape is designed so per-patch visibility can be added later by changing where the state is read/written.

---

## Storage

- **Key:** `trading-logs:column-visibility`
- **Location:** `localStorage`
- **Format:** `Record<string, boolean>` — column ID → `true` (visible) / `false` (hidden)
- **Default:** missing key = visible. An empty object `{}` means all columns visible.
- **Pinned column:** `trade_number` is always visible and never stored in this record.

**Future per-patch path:** Replace localStorage read/write in `TradesClient` with a `column_visibility jsonb` column on `patches` (same pattern as `column_order`). No component API changes needed.

---

## New Files

### `components/ui/checkbox.tsx`

Standard shadcn Checkbox component. Install via:
```
npx shadcn@latest add checkbox
```

### `components/trades/columns-dialog.tsx`

Self-contained component. Renders:
- A `<Button variant="ghost" size="icon">` with `<Columns3Cog className="size-4" />` as the trigger
- A shadcn `Dialog` containing a scrollable list of all non-pinned columns
- Each row: `<Checkbox>` (checked = visible) + column label via `t(COLUMN_LABELS[id])`
- Toggling a checkbox calls `onVisibilityChange(columnId, checked)` immediately — no save/cancel
- `trade_number` excluded from the list

**Props:**
```ts
type ColumnsDialogProps = {
  columnVisibility: Record<string, boolean>
  onVisibilityChange: (columnId: string, visible: boolean) => void
}
```

---

## Modified Files

### `lib/trades/column-order.ts`

Add:
```ts
export const COLUMN_LABELS: Record<string, string> = {
  trade_date:     'trades.columns.date',
  trade_time:     'trades.columns.time',
  ticker:         'trades.columns.ticker',
  direction:      'trades.columns.direction',
  order_type:     'trades.columns.orderType',
  avg_entry:      'trades.columns.avgEntry',
  stop_loss:      'trades.columns.stopLoss',
  avg_exit:       'trades.columns.avgExit',
  risk:           'trades.columns.risk',
  realised_loss:  'trades.columns.realisedLoss',
  realised_win:   'trades.columns.realisedWin',
  deviation:      'trades.columns.deviation',
  r_multiple:     'trades.columns.rMultiple',
  risk_volatility:'trades.columns.riskVolatility',
  cumulative_pnl: 'trades.columns.cumulativePnl',
  cumulative_r:   'trades.columns.cumulativeR',
  rules_followed: 'trades.columns.rulesFollowed',
  setup_type:     'trades.columns.setupType',
}
```

Keys must match `DEFAULT_COLUMN_ORDER` exactly.

### `components/trades/trades-table.tsx`

**New props:**
```ts
columnVisibility: Record<string, boolean>
onHideColumn: (columnId: string) => void
```

**TanStack wiring:**

Add `columnVisibility` to the `state` object. Do not pass `onColumnVisibilityChange` — visibility is fully controlled externally via the prop, TanStack just reads it.

```ts
const table = useReactTable({
  ...
  state: { columnOrder, columnVisibility },
})
```

**Context menu on non-pinned headers:**

Wrap each `DraggableHeader` in `ContextMenu`:
- **"Hide column"** — calls `onHideColumn(columnId)`, enabled
- **"Delete column"** — always `disabled`, uses `ContextMenuPrimitive.Item` with `disabled` prop

The pinned `trade_number` header has no context menu (always visible, cannot be hidden or deleted).

### `components/trades/trades-client.tsx`

**Visibility state:**
```ts
const COLUMN_VISIBILITY_KEY = "trading-logs:column-visibility"

const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
})
```

**Handlers:**
```ts
function handleVisibilityChange(columnId: string, visible: boolean) {
  setColumnVisibility((prev) => {
    const next = { ...prev, [columnId]: visible }
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(next))
    return next
  })
}

function handleHideColumn(columnId: string) {
  handleVisibilityChange(columnId, false)
}
```

**Patch name row** (the `px-4 py-3` div): add `<ColumnsDialog>` on the right side:
```tsx
<div className="px-4 py-3 flex items-center justify-between">
  <h1 className="text-sm font-semibold">{activePatch.name}</h1>
  <ColumnsDialog
    columnVisibility={columnVisibility}
    onVisibilityChange={handleVisibilityChange}
  />
</div>
```

Pass to `TradesTable`:
```tsx
<TradesTable
  ...
  columnVisibility={columnVisibility}
  onHideColumn={handleHideColumn}
/>
```

---

## Context Menu Items

| Item | State | Action |
|---|---|---|
| Hide column | Enabled | Calls `onHideColumn(columnId)` |
| Delete column | Disabled (greyed) | No action — disabled prop on the item |

No tooltip needed on the disabled Delete item — future user-created columns will enable it.

---

## Constraints & Edge Cases

| Scenario | Behaviour |
|---|---|
| All columns hidden | Table shows only the pinned `trade_number` column |
| Columns dialog when loading | Button still visible and functional (visibility is global, not patch-specific) |
| `trade_number` | Never in visibility record, never in dialog, always rendered |
| New column added in code | Defaults to visible (missing key = visible) |
| Deleted column key in storage | Ignored silently |
