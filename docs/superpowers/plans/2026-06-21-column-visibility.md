# Column Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add column hide/show — right-click context menu on column headers + a Columns dialog — with visibility stored globally in `localStorage`.

**Architecture:** Four tasks in order: (1) install the Checkbox UI primitive and add i18n keys + `COLUMN_LABELS`; (2) build the self-contained `ColumnsDialog` component; (3) wire context menu + visibility into `TradesTable`; (4) add visibility state and render the dialog in `TradesClient`. Each task compiles and ships independently.

**Tech Stack:** Next.js App Router, TypeScript, TanStack Table, shadcn/ui (Checkbox, Dialog, ContextMenu), react-i18next, Tailwind CSS v4, Lucide.

## Global Constraints

- Every visible string must use `t("key")` — no hardcoded English or Arabic in JSX.
- New i18n keys go in both `messages/en.json` AND `messages/ar.json`.
- The pinned column (`trade_number`) is always visible; never appears in the dialog or context menu.
- Column visibility is global (same across all patches) via `localStorage` key `trading-logs:column-visibility`.
- Storage format: `Record<string, boolean>` — a missing key means visible (default). `false` = hidden.
- Use `"use client"` only on components that need it (hooks, event handlers).
- All imports must use `@/` aliases.
- Follow shadcn/ui patterns already in the codebase (`components/ui/`).
- No new dependencies beyond `shadcn@latest add checkbox` (Radix Checkbox).
- `trade_number` never stored in the visibility record and never shown in the dialog.

---

### Task 1: Checkbox component + COLUMN_LABELS + i18n keys

**Files:**
- Create: `components/ui/checkbox.tsx` (via shadcn CLI)
- Modify: `lib/trades/column-order.ts` — add `COLUMN_LABELS`
- Modify: `messages/en.json` — add 3 new keys under `trades.columns`
- Modify: `messages/ar.json` — add 3 new Arabic translations

**Interfaces:**
- Produces: `Checkbox` default-export from `@/components/ui/checkbox`
- Produces: `COLUMN_LABELS: Record<string, string>` named export from `@/lib/trades/column-order`
- Produces: i18n keys `trades.columns.hide`, `trades.columns.delete`, `trades.columns.manageColumns`

---

- [ ] **Step 1: Install the Checkbox shadcn component**

Run from the repo root:

```bash
npx shadcn@latest add checkbox
```

Expected output: `✔ Done!` with `components/ui/checkbox.tsx` created. If the CLI prompts about overwriting, choose yes. If the CLI is unavailable, create the file manually:

```tsx
// components/ui/checkbox.tsx
"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
```

- [ ] **Step 2: Add `COLUMN_LABELS` to `lib/trades/column-order.ts`**

Append the following export to the bottom of the file (after `resolveColumnOrder`):

```ts
export const COLUMN_LABELS: Record<string, string> = {
  trade_date:      'trades.columns.date',
  trade_time:      'trades.columns.time',
  ticker:          'trades.columns.ticker',
  direction:       'trades.columns.direction',
  order_type:      'trades.columns.orderType',
  avg_entry:       'trades.columns.avgEntry',
  stop_loss:       'trades.columns.stopLoss',
  avg_exit:        'trades.columns.avgExit',
  risk:            'trades.columns.risk',
  realised_loss:   'trades.columns.realisedLoss',
  realised_win:    'trades.columns.realisedWin',
  deviation:       'trades.columns.deviation',
  r_multiple:      'trades.columns.rMultiple',
  risk_volatility: 'trades.columns.riskVolatility',
  cumulative_pnl:  'trades.columns.cumulativePnl',
  cumulative_r:    'trades.columns.cumulativeR',
  rules_followed:  'trades.columns.rulesFollowed',
  setup_type:      'trades.columns.setupType',
}
```

Keys must match `DEFAULT_COLUMN_ORDER` entries exactly. `trade_number` is intentionally excluded.

- [ ] **Step 3: Add English i18n keys to `messages/en.json`**

Inside the `trades.columns` object (which already has entries like `"hide"` may not exist yet), add these three keys:

```json
"hide": "Hide",
"delete": "Delete",
"manageColumns": "Manage Columns"
```

The full `trades.columns` block should look like:

```json
"columns": {
  "number": "#",
  "date": "Date",
  "time": "Time",
  "ticker": "Ticker",
  "direction": "Direction",
  "orderType": "Order Type",
  "avgEntry": "Avg Entry",
  "stopLoss": "Stop Loss",
  "avgExit": "Avg Exit",
  "risk": "Risk",
  "realisedLoss": "Realised Loss",
  "realisedWin": "Realised Win",
  "deviation": "Deviation",
  "rMultiple": "R+/-",
  "riskVolatility": "Risk Volatility",
  "cumulativePnl": "Cumulative PnL $",
  "cumulativeR": "Cumulative R",
  "rulesFollowed": "Rules?",
  "setupType": "Setup Type",
  "actions": "Actions",
  "hide": "Hide",
  "delete": "Delete",
  "manageColumns": "Manage Columns"
}
```

- [ ] **Step 4: Add Arabic i18n keys to `messages/ar.json`**

Inside the `trades.columns` object, add:

```json
"hide": "إخفاء",
"delete": "حذف",
"manageColumns": "إدارة الأعمدة"
```

- [ ] **Step 5: Verify TypeScript compiles**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors. If `@radix-ui/react-checkbox` is missing, run `npm install @radix-ui/react-checkbox` first.

- [ ] **Step 6: Commit**

```bash
git add components/ui/checkbox.tsx lib/trades/column-order.ts messages/en.json messages/ar.json
git commit -m "feat: add Checkbox UI, COLUMN_LABELS, and column visibility i18n keys"
```

---

### Task 2: ColumnsDialog component

**Files:**
- Create: `components/trades/columns-dialog.tsx`

**Interfaces:**
- Consumes: `DEFAULT_COLUMN_ORDER`, `COLUMN_LABELS` from `@/lib/trades/column-order`
- Consumes: `Checkbox` from `@/components/ui/checkbox`
- Consumes: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger` from `@/components/ui/dialog`
- Consumes: `Button` from `@/components/ui/button`
- Consumes: `Label` from `@/components/ui/label`
- Consumes: `Columns3Cog` from `lucide-react`
- Consumes: `useTranslation` from `react-i18next`
- Produces: `ColumnsDialog` named export with props `{ columnVisibility: Record<string, boolean>; onVisibilityChange: (columnId: string, visible: boolean) => void }`

---

- [ ] **Step 1: Create `components/trades/columns-dialog.tsx`**

```tsx
"use client"

import { Columns3Cog } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { DEFAULT_COLUMN_ORDER, COLUMN_LABELS } from '@/lib/trades/column-order'

type ColumnsDialogProps = {
  columnVisibility: Record<string, boolean>
  onVisibilityChange: (columnId: string, visible: boolean) => void
}

export function ColumnsDialog({ columnVisibility, onVisibilityChange }: ColumnsDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('trades.columns.manageColumns')}>
          <Columns3Cog className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('trades.columns.manageColumns')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {DEFAULT_COLUMN_ORDER.map((id) => {
            const checked = columnVisibility[id] !== false
            return (
              <div key={id} className="flex items-center gap-3">
                <Checkbox
                  id={`col-${id}`}
                  checked={checked}
                  onCheckedChange={(value) => onVisibilityChange(id, value === true)}
                />
                <Label htmlFor={`col-${id}`} className="cursor-pointer font-normal">
                  {t(COLUMN_LABELS[id])}
                </Label>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Logic note:** `columnVisibility[id] !== false` means a missing key (default) is treated as visible. Setting `value === true` guards against the Radix `CheckedState` indeterminate value.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/trades/columns-dialog.tsx
git commit -m "feat: add ColumnsDialog for toggling column visibility"
```

---

### Task 3: TradesTable — visibility prop + context menu

**Files:**
- Modify: `components/trades/trades-table.tsx`

**Interfaces:**
- Consumes (new props):
  ```ts
  columnVisibility: Record<string, boolean>
  onHideColumn: (columnId: string) => void
  ```
- Consumes: `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem` from `@/components/ui/context-menu`
- Produces: non-pinned column headers right-click → shows Hide (enabled) + Delete (disabled) menu items
- Produces: TanStack Table filters out hidden columns from `getRowModel().rows`

---

- [ ] **Step 1: Add new props to the `Props` type in `trades-table.tsx`**

Find the existing `Props` type:

```ts
type Props = {
  trades: EnrichedTrade[]
  scrolledX?: boolean
  scrolledY?: boolean
  initialColumnOrder: string[] | null
  onColumnReorder: (order: string[]) => void
}
```

Replace with:

```ts
type Props = {
  trades: EnrichedTrade[]
  scrolledX?: boolean
  scrolledY?: boolean
  initialColumnOrder: string[] | null
  onColumnReorder: (order: string[]) => void
  columnVisibility: Record<string, boolean>
  onHideColumn: (columnId: string) => void
}
```

- [ ] **Step 2: Destructure new props in the component function**

Find:

```ts
export function TradesTable({ trades, scrolledX, scrolledY, initialColumnOrder, onColumnReorder }: Props) {
```

Replace with:

```ts
export function TradesTable({ trades, scrolledX, scrolledY, initialColumnOrder, onColumnReorder, columnVisibility, onHideColumn }: Props) {
```

- [ ] **Step 3: Add `columnVisibility` to the TanStack `state` object**

Find:

```ts
  const table = useReactTable({
    data: trades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnOrder },
    onColumnOrderChange: setColumnOrder,
  })
```

Replace with:

```ts
  const table = useReactTable({
    data: trades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnOrder, columnVisibility },
    onColumnOrderChange: setColumnOrder,
  })
```

TanStack reads `columnVisibility` from `state` to filter visible columns. No `onColumnVisibilityChange` is needed — visibility is fully controlled externally via the prop.

- [ ] **Step 4: Add context menu imports**

In the imports block at the top of the file, add:

```ts
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
```

- [ ] **Step 5: Wrap non-pinned headers with a context menu**

Find the section that renders non-pinned headers (the `return` inside the `.map` after the `if (isPinned)` branch):

```tsx
                  return (
                    <DraggableHeader key={h.id} id={h.column.id} className={headClassName}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </DraggableHeader>
                  )
```

Replace with:

```tsx
                  return (
                    <DraggableHeader key={h.id} id={h.column.id} className={headClassName}>
                      <ContextMenu>
                        <ContextMenuTrigger className="flex w-full items-center justify-center">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => onHideColumn(h.column.id)}>
                            {t('trades.columns.hide')}
                          </ContextMenuItem>
                          <ContextMenuItem disabled>
                            {t('trades.columns.delete')}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </DraggableHeader>
                  )
```

**Why inner wrap:** `ContextMenuTrigger` (without `asChild`) renders a `<span>` inside the `<th>`, which is valid HTML. The `contextmenu` event bubbles up from any click inside the cell. This avoids the need to forward refs through `DraggableHeader`.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual smoke test**

Start the dev server (`npm run dev`), open the Trades page. Right-click on any non-pinned column header:
- Context menu appears with "Hide" (clickable) and "Delete" (greyed out, not clickable).
- Right-clicking the `#` (trade_number) column shows no context menu.

Note: "Hide" won't do anything visible yet — `onHideColumn` will be wired in Task 4.

- [ ] **Step 8: Commit**

```bash
git add components/trades/trades-table.tsx
git commit -m "feat: add column visibility prop and right-click context menu to trades table"
```

---

### Task 4: TradesClient — visibility state, handlers, dialog in header

**Files:**
- Modify: `components/trades/trades-client.tsx`

**Interfaces:**
- Consumes: `ColumnsDialog` from `@/components/trades/columns-dialog`
- Produces: visibility state persisted to `localStorage` key `trading-logs:column-visibility`
- Produces: `ColumnsDialog` rendered alongside the patch name in the header row
- Produces: `columnVisibility` and `onHideColumn` passed to `TradesTable`

---

- [ ] **Step 1: Add the localStorage key constant**

Below the existing `const LAST_PATCH_KEY = "trading-logs:last-patch"` line, add:

```ts
const COLUMN_VISIBILITY_KEY = "trading-logs:column-visibility"
```

- [ ] **Step 2: Add `columnVisibility` state**

After the `loadingTrades` state declaration, add:

```ts
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

The lazy initializer runs only once on mount (client-side only). If `localStorage` throws (e.g. in incognito with strict settings), it falls back to `{}` (all columns visible).

- [ ] **Step 3: Add visibility handlers**

After `handleColumnReorder`, add:

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

- [ ] **Step 4: Add `ColumnsDialog` import**

In the imports block at the top of the file, add:

```ts
import { ColumnsDialog } from "./columns-dialog"
```

- [ ] **Step 5: Add the `ColumnsDialog` to the patch name row**

Find the existing patch name row:

```tsx
      {activePatch && !noPatches && !allHidden && (
        <div className="px-4 py-3">
          <h1 className="text-sm font-semibold">{activePatch.name}</h1>
        </div>
      )}
```

Replace with:

```tsx
      {activePatch && !noPatches && !allHidden && (
        <div className="flex items-center justify-between px-4 py-1.5">
          <h1 className="text-sm font-semibold">{activePatch.name}</h1>
          <ColumnsDialog
            columnVisibility={columnVisibility}
            onVisibilityChange={handleVisibilityChange}
          />
        </div>
      )}
```

Note: `py-1.5` (instead of `py-3`) because the `Button` inside `ColumnsDialog` adds its own padding, keeping the row height balanced.

- [ ] **Step 6: Pass new props to `TradesTable`**

Find the existing `TradesTable` render call:

```tsx
              <TradesTable key={activePatchId} trades={enriched} scrolledX={scrolledX} scrolledY={scrolledY} initialColumnOrder={activePatch?.column_order ?? null} onColumnReorder={handleColumnReorder} />
```

Replace with:

```tsx
              <TradesTable
                key={activePatchId}
                trades={enriched}
                scrolledX={scrolledX}
                scrolledY={scrolledY}
                initialColumnOrder={activePatch?.column_order ?? null}
                onColumnReorder={handleColumnReorder}
                columnVisibility={columnVisibility}
                onHideColumn={handleHideColumn}
              />
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Full manual test**

Start the dev server (`npm run dev`) and test all scenarios:

1. **Columns dialog opens:** Click the `Columns3Cog` icon next to the patch name. Dialog shows all non-pinned columns with checkboxes. `trade_number` is not listed.

2. **Hide via dialog:** Uncheck a column (e.g. "Risk"). Dialog stays open. The column disappears from the table immediately.

3. **Show via dialog:** Re-check the column. It reappears in the table.

4. **Hide via context menu:** Right-click a column header → click "Hide". The column disappears.

5. **Delete is disabled:** Right-click → "Delete" is greyed out and does nothing.

6. **Persistence across reload:** Hide a column, refresh the page. The column stays hidden.

7. **Global across patches:** Hide a column in patch A, switch to patch B — the column is still hidden.

8. **trade_number always visible:** The `#` column is always rendered regardless of visibility state.

9. **RTL:** Switch language to Arabic. Dialog title and context menu items render in Arabic (`إخفاء`, `حذف`, `إدارة الأعمدة`). Layout is RTL.

- [ ] **Step 9: Commit**

```bash
git add components/trades/trades-client.tsx
git commit -m "feat: wire column visibility state and ColumnsDialog into TradesClient"
```
