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
