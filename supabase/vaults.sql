-- BudgetFlow sync: one row per person, holding their encrypted expenses.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- The row only ever contains a sealed box made on the device
-- (src/crypto/vault.ts). Without the passphrase it is unreadable,
-- even to whoever runs the database.

create table public.vaults (
  -- Filled in from whoever is signed in, so nobody can claim someone else's row.
  -- Deleting the account deletes the row.
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  -- The encrypted box. Capped at 1 MB (yours will be a few KB) so the
  -- free quota can't be stuffed.
  sealed_box jsonb not null
    check (pg_column_size(sealed_box) < 1000000),
  -- Goes up with every save, so a device can tell a newer save exists
  -- before overwriting it.
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- The most important line: without it, the publishable key could read every row.
alter table public.vaults enable row level security;

-- Each rule: only the signed-in owner of the row.
create policy "Owner can read their vault"
  on public.vaults for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owner can create their vault"
  on public.vaults for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owner can update their vault"
  on public.vaults for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner can delete their vault"
  on public.vaults for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Visitors who are not signed in get no access at all; signed-in people get
-- only what the rules above allow.
revoke all on public.vaults from anon;
grant select, insert, update, delete on public.vaults to authenticated;
