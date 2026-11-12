-- Saved items ("wishlist"): a private bookmark list per student.
--
-- Rows are visible only to their owner. Saving requires a verified student
-- and an item the student can already see (items RLS applies inside the
-- policy's subquery), so drafts of other students cannot be probed.

create table public.wishlist_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

comment on table public.wishlist_items is 'Items a student saved for later. Private to that student.';

-- The primary key covers lookups by user; this one serves the item cascade.
create index wishlist_items_item_id_idx on public.wishlist_items (item_id);

alter table public.wishlist_items enable row level security;

create policy wishlist_items_select_own on public.wishlist_items
for select to authenticated
using (user_id = (select auth.uid()));

create policy wishlist_items_insert_own on public.wishlist_items
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_verified((select auth.uid()))
  and exists (select 1 from public.items i where i.id = item_id)
);

create policy wishlist_items_delete_own on public.wishlist_items
for delete to authenticated
using (user_id = (select auth.uid()));

-- Least privilege: no updates (rows are add/remove only), nothing for anon.
revoke all on public.wishlist_items from public, anon, authenticated;
grant select, insert, delete on public.wishlist_items to authenticated;
grant all on public.wishlist_items to service_role;
