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
  trade_date date not null,
  trade_time time not null,
  ticker text not null,
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

## Checklist

- [ ] Run `profiles` table + trigger first
- [ ] Run `patches` table second (trades references patches)
- [ ] Run `trades` table third
- [ ] Confirm RLS is enabled: Table Editor → each table → RLS badge shows "Enabled"
- [ ] Test with a real signup to confirm the profile trigger fires
