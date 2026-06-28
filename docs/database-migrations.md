# Database Migrations

Incremental changes for an **existing** database. Run only the sections that haven't been applied yet.

Each migration is dated and idempotent (`if not exists` / `or replace`) where possible.

---

## 2026-06-08 — Initial trades schema

### patches table

Run if `patches` does not exist yet:

```sql
create table public.patches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  patch_number int not null,
  name text not null default 'New Patch',
  patch_limit int not null default 100,
  is_hidden boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz default now() not null,
  unique (user_id, patch_number)
);

alter table public.patches enable row level security;

create policy "Users can view their own patches"
  on public.patches for select using (auth.uid() = user_id);

create policy "Users can insert their own patches"
  on public.patches for insert with check (auth.uid() = user_id);

create policy "Users can update their own patches"
  on public.patches for update using (auth.uid() = user_id);

create policy "Users can delete their own patches"
  on public.patches for delete using (auth.uid() = user_id);

create index patches_user_id_idx on public.patches (user_id);
```

If `patches` already exists but is missing the new columns, run instead:

```sql
alter table public.patches add column if not exists name text not null default 'New Patch';
alter table public.patches add column if not exists patch_limit int not null default 100;
alter table public.patches add column if not exists is_hidden boolean not null default false;
alter table public.patches add column if not exists sort_order int not null default 0;
```

Also add the missing update policy if it doesn't exist:

```sql
create policy "Users can update their own patches"
  on public.patches for update using (auth.uid() = user_id);
```

### trades table (redesign — drops old placeholder)

> **Warning:** This drops the existing `trades` table. The original schema was a placeholder with no real data.

```sql
drop table if exists public.trades cascade;

create table public.trades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  patch_id uuid references public.patches(id) on delete cascade not null,
  trade_number int not null,
  trade_date date not null,
  trade_time time not null,
  coin text not null,
  direction text check (direction in ('long', 'short')) not null,
  order_type text check (order_type in ('market', 'limit')) not null,
  avg_entry numeric(20, 8) not null,
  stop_loss numeric(20, 8) not null,
  avg_exit numeric(20, 8) not null,
  risk numeric(12, 2) not null,
  rules_followed boolean not null,
  setup_type text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (patch_id, trade_number)
);

alter table public.trades enable row level security;

create policy "Users can view their own trades"
  on public.trades for select using (auth.uid() = user_id);

create policy "Users can insert their own trades"
  on public.trades for insert with check (auth.uid() = user_id);

create policy "Users can update their own trades"
  on public.trades for update using (auth.uid() = user_id);

create policy "Users can delete their own trades"
  on public.trades for delete using (auth.uid() = user_id);

create index trades_user_id_idx on public.trades (user_id);
create index trades_patch_id_idx on public.trades (patch_id);
create index trades_patch_trade_number_idx on public.trades (patch_id, trade_number);
create index trades_trade_date_idx on public.trades (trade_date desc);
```

---

## 2026-06-08 — Rename max_trades to patch_limit

Run if the `patches` column is still named `max_trades`:

```sql
alter table public.patches rename column max_trades to patch_limit;
```

---

## 2026-06-20 — Rename coin to ticker in trades

```sql
alter table public.trades rename column coin to ticker;
```

---

## 2026-06-21 — Add column_order to patches

```sql
alter table public.patches
  add column if not exists column_order jsonb null;
```

`null` means default column order. Value is an ordered array of column key
strings (accessorKey values), excluding the always-pinned `trade_number` column.

---

## 2026-06-21 — Add column_settings table

Stores per-user column metadata: custom columns added by the user, and overrides for built-in column settings (format type, description, etc.).

```sql
create table public.column_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  column_id text not null,
  name text not null,
  description text,
  format_type text not null default 'auto'
    check (format_type in ('auto', 'text', 'currency', 'number', 'percent', 'date', 'time')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, column_id)
);

alter table public.column_settings enable row level security;

create policy "Users can manage their own column settings"
  on public.column_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index column_settings_user_id_idx on public.column_settings (user_id);
```

Custom columns have a `column_id` prefixed with `custom_` (e.g. `custom_<uuid>`).
Built-in column overrides use the column's `accessorKey` as `column_id` (e.g. `avg_entry`).

---

## 2026-06-21 — Add column_visibility to patches

Same pattern as `column_order`. When updated, all patches for the user are written at once so visibility stays global. A future flag can make it per-patch without any schema change.

```sql
alter table public.patches
  add column if not exists column_visibility jsonb null;
```

`null` means all columns visible (default). Value is a `Record<string, boolean>` — `false` means hidden, `true` or absent means visible.

---

## 2026-06-22 — Add 'dropdown' and 'time24' to column_settings.format_type

`dropdown` enables menu-style cells. `time24` is the 24-hour variant of the time format — the default `time` value means 12-hour.

```sql
alter table public.column_settings drop constraint if exists column_settings_format_type_check;
alter table public.column_settings add constraint column_settings_format_type_check
  check (format_type in ('auto', 'text', 'currency', 'number', 'percent', 'date', 'time', 'time24', 'dropdown'));
```

---

## 2026-06-22 — Add custom_data to trades

Stores per-trade values for user-created custom columns. Key is the `column_id` (e.g. `custom_<uuid>`), value is always a string.

```sql
alter table public.trades
  add column if not exists custom_data jsonb null;
```

---

## 2026-06-22 — Add is_draft and draft_fields to trades

Tracks which trades are in-progress (not yet complete) and which fields the user has explicitly filled.
`draft_fields` is a jsonb array of field names the user has intentionally entered, used to restore blank-row display correctly after reload.

```sql
alter table public.trades
  add column if not exists is_draft boolean not null default false;

alter table public.trades
  add column if not exists draft_fields jsonb null;
```

---

## 2026-06-22 — Add column_options table

Stores per-user options for menu columns (ticker, order_type, rules_followed, setup_type). When rows exist for a `column_id`, they replace the hardcoded defaults in `lib/trades/column-options.ts`. The save strategy is delete-then-insert for a given `(user_id, column_id)` pair, so order is controlled via the `position` field.

```sql
create table public.column_options (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  column_id text not null,
  value text not null,
  label text not null,
  position integer not null default 0,
  created_at timestamptz default now() not null,
  unique (user_id, column_id, value)
);

alter table public.column_options enable row level security;

create policy "Users can manage their own column options"
  on public.column_options for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index column_options_user_id_idx on public.column_options (user_id);
create index column_options_user_column_idx on public.column_options (user_id, column_id);
```

---

## 2026-06-22 — Add realised_win and realised_loss to trades

`realised_win` and `realised_loss` are now manually entered by the user (actual P&L after fees).
`null` means the user hasn't entered a value; the UI falls back to the price-computed value for display.

```sql
alter table public.trades
  add column if not exists realised_win numeric(12, 2) null,
  add column if not exists realised_loss numeric(12, 2) null;
```

---

## 2026-06-23 — Add sort_order to trades

Enables position-aware row insertion (Insert Trade Before / After). Existing rows get `sort_order = trade_number` so current order is preserved. All trade queries now `ORDER BY sort_order` instead of `trade_number`.

```sql
ALTER TABLE public.trades ADD COLUMN sort_order float8 NOT NULL DEFAULT 0;
UPDATE public.trades SET sort_order = trade_number;
CREATE INDEX trades_sort_order_idx ON public.trades (patch_id, sort_order);
```

---

## 2026-06-23 — Formula columns in column_settings

Adds formula support to `column_settings`. Built-in formula columns (direction, r_multiple, etc.) are stored as rows with `user_id = NULL`, giving the app a single formula engine for all columns.

### Step 1: Schema changes

```sql
-- Allow user_id to be null so built-in rows can exist without an owner
ALTER TABLE public.column_settings ALTER COLUMN user_id DROP NOT NULL;

-- Formula fields
ALTER TABLE public.column_settings
  ADD COLUMN IF NOT EXISTS is_formula boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS formula   text NULL,
  ADD COLUMN IF NOT EXISTS formula_id text NULL;

-- One built-in row per column_id (NULL != NULL in unique constraints, so a partial index is needed)
CREATE UNIQUE INDEX IF NOT EXISTS column_settings_builtin_column_id_idx
  ON public.column_settings (column_id)
  WHERE user_id IS NULL;

-- formula_id must be globally unique across all users and built-ins (NULLs are excluded automatically)
CREATE UNIQUE INDEX IF NOT EXISTS column_settings_formula_id_idx
  ON public.column_settings (formula_id)
  WHERE formula_id IS NOT NULL;
```

### Step 2: Split RLS policies

The old "for all" policy only allowed users to see their own rows. Replace it so users can also read the built-in rows (`user_id IS NULL`).

```sql
DROP POLICY IF EXISTS "Users can manage their own column settings" ON public.column_settings;

CREATE POLICY "Users can view their column settings and built-ins"
  ON public.column_settings FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert their own column settings"
  ON public.column_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own column settings"
  ON public.column_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own column settings"
  ON public.column_settings FOR DELETE
  USING (auth.uid() = user_id);
```

### Step 3: Insert built-in formula rows

```sql
INSERT INTO public.column_settings
  (user_id, column_id, name, description, format_type, is_formula, formula_id, formula)
VALUES
  (NULL, 'direction', 'Direction',
   'Long or short, derived from avg entry vs stop loss.',
   'auto', true, 'direction',
   'if (!avg_entry || !stop_loss) return null;
return avg_entry > stop_loss ? ''long'' : ''short'';'),

  (NULL, 'r_multiple', 'R+/-',
   'Profit or loss in R multiples. Max possible loss should be 1R.',
   'auto', true, 'r_multiple',
   'if (pnl == null || !risk) return null;
return pnl / risk;'),

  (NULL, 'deviation', 'Deviation',
   'How much your Realised Loss exceeded your Risk due to slippage. 0% means you lost exactly your risk amount.',
   'percent', true, 'deviation',
   'if (realised_loss == null || !risk) return null;
return ((realised_loss - risk) / risk) * 100;'),

  (NULL, 'risk_volatility', 'Risk Volatility',
   'Tracks trade-to-trade risk scaling consistency.',
   'percent', true, 'risk_volatility',
   'if (prev_risk == null || !risk) return null;
return ((risk - prev_risk) / prev_risk) * 100;'),

  (NULL, 'cumulative_pnl', 'Cumulative PnL $',
   'Total profit or loss in USD$ up to this trade.',
   'currency', true, 'cumulative_pnl',
   'return running_pnl + (pnl ?? 0);'),

  (NULL, 'cumulative_r', 'Cumulative R',
   'Total profit or loss in R multiples up to this trade.',
   'auto', true, 'cumulative_r',
   'const rm = typeof rest.r_multiple === ''number'' ? rest.r_multiple : 0;
return running_r + rm;')

ON CONFLICT (column_id) WHERE user_id IS NULL DO NOTHING;
```

---

## 2026-06-23 — delete_column_data function

Cleans up all traces of a custom column when it is deleted: removes its key from `custom_data` in every trade, strips it from `column_order` arrays, and removes it from `column_visibility` objects across all patches.

```sql
CREATE OR REPLACE FUNCTION public.delete_column_data(p_column_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Remove column values from every trade owned by the calling user
  UPDATE public.trades
  SET custom_data = custom_data - p_column_id
  WHERE user_id = auth.uid()
    AND custom_data ? p_column_id;

  -- Remove column from column_order arrays in patches
  UPDATE public.patches
  SET column_order = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements_text(column_order) AS elem
    WHERE elem <> p_column_id
  )
  WHERE user_id = auth.uid()
    AND column_order IS NOT NULL
    AND column_order @> to_jsonb(p_column_id);

  -- Remove column from column_visibility objects in patches
  UPDATE public.patches
  SET column_visibility = column_visibility - p_column_id
  WHERE user_id = auth.uid()
    AND column_visibility ? p_column_id;
END;
$$;
```

---

## 2026-06-23 — Unify column_id and formula_id for custom columns

Custom columns now use the user's slug (e.g. `fees`) as `column_id` directly instead of `custom_<uuid>`. This migration renames existing UUID-based column IDs to match their `formula_id`.

Run once in the Supabase SQL editor (as `postgres` role so RLS is bypassed):

```sql
DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT column_id, formula_id
    FROM public.column_settings
    WHERE user_id IS NOT NULL
      AND formula_id IS NOT NULL
      AND column_id <> formula_id
  LOOP
    -- Rename key in trades.custom_data
    UPDATE public.trades
    SET custom_data = (custom_data - col.column_id)
      || jsonb_build_object(col.formula_id, custom_data -> col.column_id)
    WHERE custom_data ? col.column_id;

    -- Rename entry in patches.column_order
    UPDATE public.patches
    SET column_order = (
      SELECT jsonb_agg(
        CASE WHEN elem::text = col.column_id THEN to_jsonb(col.formula_id) ELSE elem END
      )
      FROM jsonb_array_elements(column_order) AS elem
    )
    WHERE column_order IS NOT NULL
      AND column_order @> to_jsonb(col.column_id);

    -- Rename key in patches.column_visibility
    UPDATE public.patches
    SET column_visibility = (column_visibility - col.column_id)
      || jsonb_build_object(col.formula_id, column_visibility -> col.column_id)
    WHERE column_visibility ? col.column_id;

    -- Finally update column_settings.column_id
    UPDATE public.column_settings
    SET column_id = col.formula_id
    WHERE column_id = col.column_id;
  END LOOP;
END;
$$;
```

After running the above, drop the now-redundant column:

```sql
ALTER TABLE public.column_settings DROP COLUMN IF EXISTS formula_id;
```

---

## 2026-06-23 — Seed non-formula built-in columns into column_settings

All built-in columns now live in the database as a single source of truth.

```sql
insert into public.column_settings
  (user_id, column_id, name, description, format_type, is_formula, formula)
values
  (null, 'trade_number', '#',          'Trade number', 'number', false, null),
  (null, 'trade_date',  'Date',        'The date when the trade was placed or position was opened', 'date', false, null),
  (null, 'trade_time',  'Time',        'The time when the trade was placed or position was opened', 'time', false, null),
  (null, 'ticker',      'Ticker',      'The trading symbol, e.g. BTC, ETH', 'dropdown', false, null),
  (null, 'order_type',  'Order Type',  'Market / Limit', 'dropdown', false, null),
  (null, 'avg_entry',   'Avg Entry',   'Entry price for a single entry, or average entry price across partial entries', 'currency', false, null),
  (null, 'stop_loss',   'Stop Loss',   'The price level where your stop loss was set', 'currency', false, null),
  (null, 'avg_exit',    'Avg Exit',    'Final average price at which you exited the trade (win or loss)', 'currency', false, null),
  (null, 'risk',        'Risk',        'Risk in USD$ including slippage and fees', 'currency', false, null),
  (null, 'realised_loss', 'Realised Loss', 'Your PnL in USD$ if the trade was a loss', 'currency', false, null),
  (null, 'realised_win',  'Realised Win',  'Your PnL in USD$ if the trade was a win', 'currency', false, null),
  (null, 'rules_followed', 'Rules?',   'Did you follow the rules exactly? If NO, the challenge is considered failed', 'dropdown', false, null),
  (null, 'setup_type',  'Setup Type',  'Strategy category, e.g. Trend Following, Pullback', 'dropdown', false, null)
on conflict do nothing;
```

---

## 2026-06-23 — Unique column names per user (case-insensitive)

Prevents two custom columns from having the same name (e.g. "Fees" and "fees").

```sql
CREATE UNIQUE INDEX column_settings_user_name_unique_idx
  ON public.column_settings (user_id, lower(name))
  WHERE user_id IS NOT NULL;
```

---

## 2026-06-24 — Fix cumulative formula columns to return null when no PnL data

`cumulative_pnl` and `cumulative_r` previously returned `0` for rows with no realised values, showing `$0.00` / `0.00R` instead of the formula indicator icon.

```sql
UPDATE public.column_settings
SET formula = 'if (pnl == null) return null;
return running_pnl + pnl;'
WHERE column_id = 'cumulative_pnl' AND user_id IS NULL;

UPDATE public.column_settings
SET formula = 'if (typeof rest.r_multiple !== ''number'') return null;
return running_r + rest.r_multiple;'
WHERE column_id = 'cumulative_r' AND user_id IS NULL;
```

---

## 2026-06-23 — Remove is_draft/draft_fields, make trade fields nullable

Replaces the draft system with nullable fields. Partial trades are now regular rows with null values. No dummy defaults are inserted on row creation.

```sql
-- Drop draft columns
ALTER TABLE public.trades DROP COLUMN IF EXISTS is_draft;
ALTER TABLE public.trades DROP COLUMN IF EXISTS draft_fields;

-- Make all user-entered fields nullable
ALTER TABLE public.trades
  ALTER COLUMN trade_date    DROP NOT NULL,
  ALTER COLUMN trade_time    DROP NOT NULL,
  ALTER COLUMN ticker        DROP NOT NULL,
  ALTER COLUMN direction     DROP NOT NULL,
  ALTER COLUMN order_type    DROP NOT NULL,
  ALTER COLUMN avg_entry     DROP NOT NULL,
  ALTER COLUMN stop_loss     DROP NOT NULL,
  ALTER COLUMN avg_exit      DROP NOT NULL,
  ALTER COLUMN risk          DROP NOT NULL,
  ALTER COLUMN rules_followed DROP NOT NULL,
  ALTER COLUMN setup_type    DROP NOT NULL;
```
