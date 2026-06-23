# Database Schema

Complete SQL to run on a **fresh** database. Run sections in order.

Supabase SQL editor: Dashboard → SQL Editor → New query.

> For incremental changes to an existing database, see [`database-migrations.md`](database-migrations.md).

---

## Notes

- Supabase handles `auth.users` automatically — do not create it manually.
- All custom tables live in the `public` schema.
- Enable **Row Level Security (RLS)** on every table immediately after creation.
- Use `auth.uid()` in RLS policies to scope data to the logged-in user.

---

## 1. profiles

Extends `auth.users` with app-specific user data. Auto-created via trigger on signup.

```sql
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 2. patches

One row per batch of trades per user.

```sql
create table public.patches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  patch_number int not null,
  name text not null default 'New Patch',
  patch_limit int not null default 100,
  is_hidden boolean not null default false,
  sort_order int not null default 0,
  column_order jsonb null,
  column_visibility jsonb null,
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

---

## 3. trades

One row per manually logged trade, linked to a patch.

```sql
create table public.trades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  patch_id uuid references public.patches(id) on delete cascade not null,
  trade_number int not null,
  sort_order float8 not null default 0,
  trade_date date not null,
  trade_time time not null,
  ticker text not null,
  direction text check (direction in ('long', 'short')) not null,
  order_type text check (order_type in ('market', 'limit')) not null,
  avg_entry numeric(20, 8) not null,
  stop_loss numeric(20, 8) not null,
  avg_exit numeric(20, 8) not null,
  risk numeric(12, 2) not null,
  realised_win numeric(12, 2) null,
  realised_loss numeric(12, 2) null,
  rules_followed boolean not null,
  setup_type text not null,
  is_draft boolean not null default false,
  draft_fields jsonb null,
  custom_data jsonb null,
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
create index trades_sort_order_idx on public.trades (patch_id, sort_order);
create index trades_trade_date_idx on public.trades (trade_date desc);
```

---

## 4. column_settings

Stores per-user column metadata and built-in formula column definitions. Built-in rows have `user_id = NULL`; user rows carry the owner's UUID.

```sql
create table public.column_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade null,
  column_id text not null,
  name text not null,
  description text,
  format_type text not null default 'auto'
    check (format_type in ('auto', 'text', 'currency', 'number', 'percent', 'date', 'time', 'time24', 'dropdown')),
  is_formula boolean not null default false,
  formula text null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.column_settings enable row level security;

-- Users see their own rows AND the built-in rows (user_id IS NULL)
create policy "Users can view their column settings and built-ins"
  on public.column_settings for select
  using (auth.uid() = user_id or user_id is null);

create policy "Users can insert their own column settings"
  on public.column_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own column settings"
  on public.column_settings for update
  using (auth.uid() = user_id);

create policy "Users can delete their own column settings"
  on public.column_settings for delete
  using (auth.uid() = user_id);

create index column_settings_user_id_idx on public.column_settings (user_id);

-- One user row per column_id per user
create unique index column_settings_user_column_idx
  on public.column_settings (user_id, column_id)
  where user_id is not null;

-- One built-in row per column_id (NULL != NULL in standard UNIQUE, so a partial index is required)
create unique index column_settings_builtin_column_id_idx
  on public.column_settings (column_id)
  where user_id is null;

-- column_id must be globally unique across all users and built-ins
create unique index column_settings_column_id_global_idx
  on public.column_settings (column_id);
```

Then seed the six built-in formula rows:

```sql
insert into public.column_settings
  (user_id, column_id, name, description, format_type, is_formula, formula)
values
  (null, 'direction', 'Direction',
   'Long or short, derived from avg entry vs stop loss.',
   'auto', true,
   'if (!avg_entry || !stop_loss) return null;
return avg_entry > stop_loss ? ''long'' : ''short'';'),

  (null, 'r_multiple', 'R+/-',
   'Profit or loss in R multiples. Max possible loss should be 1R.',
   'auto', true,
   'if (pnl == null || !risk) return null;
return pnl / risk;'),

  (null, 'deviation', 'Deviation',
   'How much your Realised Loss exceeded your Risk due to slippage. 0% means you lost exactly your risk amount.',
   'percent', true,
   'if (realised_loss == null || !risk) return null;
return ((realised_loss - risk) / risk) * 100;'),

  (null, 'risk_volatility', 'Risk Volatility',
   'Tracks trade-to-trade risk scaling consistency.',
   'percent', true,
   'if (prev_risk == null || !risk) return null;
return ((risk - prev_risk) / prev_risk) * 100;'),

  (null, 'cumulative_pnl', 'Cumulative PnL $',
   'Total profit or loss in USD$ up to this trade.',
   'currency', true,
   'return running_pnl + (pnl ?? 0);'),

  (null, 'cumulative_r', 'Cumulative R',
   'Total profit or loss in R multiples up to this trade.',
   'auto', true,
   'const rm = typeof rest.r_multiple === ''number'' ? rest.r_multiple : 0;
return running_r + rm;')

on conflict (column_id) do nothing;
```

---

---

## 5. column_options

Per-user custom options for menu columns (ticker, order_type, rules_followed, setup_type). When a user has rows here for a given `column_id`, those rows replace the hardcoded defaults. When no rows exist, the app falls back to `DEFAULT_MENU_OPTIONS` in `lib/trades/column-options.ts`.

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

## 6. Functions

### delete_column_data

Cleans up all traces of a custom column when it is deleted. Removes its key from `custom_data` in every trade, strips it from `column_order` arrays, and removes it from `column_visibility` objects — all scoped to the calling user.

```sql
create or replace function public.delete_column_data(p_column_id text)
returns void
language plpgsql
as $$
begin
  -- Remove column values from every trade owned by the calling user
  update public.trades
  set custom_data = custom_data - p_column_id
  where user_id = auth.uid()
    and custom_data ? p_column_id;

  -- Remove column from column_order arrays in patches
  update public.patches
  set column_order = (
    select jsonb_agg(elem)
    from jsonb_array_elements_text(column_order) as elem
    where elem <> p_column_id
  )
  where user_id = auth.uid()
    and column_order is not null
    and column_order @> to_jsonb(p_column_id);

  -- Remove column from column_visibility objects in patches
  update public.patches
  set column_visibility = column_visibility - p_column_id
  where user_id = auth.uid()
    and column_visibility ? p_column_id;
end;
$$;
```

---

## Checklist

- [ ] Run `profiles` table + trigger first
- [ ] Run `patches` table second (trades references patches)
- [ ] Run `trades` table third
- [ ] Run `column_settings` table + indexes + built-in seed fourth
- [ ] Run `column_options` table fifth
- [ ] Run `delete_column_data` function sixth
- [ ] Confirm RLS is enabled: Table Editor → each table → RLS badge shows "Enabled"
- [ ] Test with a real signup to confirm the profile trigger fires
- [ ] Verify built-in rows: `select column_id from column_settings where user_id is null` should return 6 rows
