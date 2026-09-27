-- ===========================================================================
-- Row Level Security
-- Every table is locked down; all writes that matter go through RPCs.
-- ===========================================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.pickup_locations enable row level security;
alter table public.items enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.borrow_requests enable row level security;
alter table public.loans enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_photos enable row level security;
alter table public.fines enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or verification_status = 'verified'
  or public.is_admin((select auth.uid()))
);

create policy profiles_insert_self on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- categories & pickup locations (read-only reference data)
-- ---------------------------------------------------------------------------

create policy categories_select on public.categories
for select to authenticated
using (true);

create policy pickup_locations_select on public.pickup_locations
for select to authenticated
using (is_active or public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

create policy items_select on public.items
for select to authenticated
using (
  status <> 'draft'
  or owner_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

create policy items_insert_own on public.items
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and public.is_verified((select auth.uid()))
);

create policy items_update_own on public.items
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy items_delete_own on public.items
for delete to authenticated
using (owner_id = (select auth.uid()) or public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- availability blocks
-- ---------------------------------------------------------------------------

create policy availability_blocks_select on public.availability_blocks
for select to authenticated
using (true);

create policy availability_blocks_insert_own on public.availability_blocks
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.items i
    where i.id = item_id and i.owner_id = (select auth.uid())
  )
);

create policy availability_blocks_update_own on public.availability_blocks
for update to authenticated
using (
  exists (
    select 1 from public.items i
    where i.id = item_id and i.owner_id = (select auth.uid())
  )
);

create policy availability_blocks_delete_own on public.availability_blocks
for delete to authenticated
using (
  exists (
    select 1 from public.items i
    where i.id = item_id and i.owner_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- borrow requests
-- ---------------------------------------------------------------------------

create policy borrow_requests_select on public.borrow_requests
for select to authenticated
using (
  borrower_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
  or exists (
    select 1 from public.items i
    where i.id = item_id and i.owner_id = (select auth.uid())
  )
);

create policy borrow_requests_insert_own on public.borrow_requests
for insert to authenticated
with check (borrower_id = (select auth.uid()) and status = 'pending');

-- No update/delete policies: transitions happen through RPCs only.

-- ---------------------------------------------------------------------------
-- loans
-- ---------------------------------------------------------------------------

create policy loans_select on public.loans
for select to authenticated
using (
  owner_id = (select auth.uid())
  or borrower_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

-- No write policies: all transitions happen through RPCs only.

-- ---------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------

create policy waitlist_select on public.waitlist_entries
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
  or exists (
    select 1 from public.items i
    where i.id = item_id and i.owner_id = (select auth.uid())
  )
);

create policy waitlist_insert_own on public.waitlist_entries
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy waitlist_update_own on public.waitlist_entries
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and status in ('waiting', 'notified', 'cancelled')
);

create policy waitlist_delete_own on public.waitlist_entries
for delete to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- conversations & messages
-- ---------------------------------------------------------------------------

create policy conversations_select on public.conversations
for select to authenticated
using (
  type = 'community'
  or public.is_conversation_member(id, (select auth.uid()))
  or public.is_admin((select auth.uid()))
);

create policy conversation_members_select on public.conversation_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_conversation_member(conversation_id, (select auth.uid()))
  or public.is_admin((select auth.uid()))
);

create policy messages_select on public.messages
for select to authenticated
using (
  public.is_conversation_member(conversation_id, (select auth.uid()))
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.type = 'community'
  )
);

create policy messages_insert on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    public.is_conversation_member(conversation_id, (select auth.uid()))
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.type = 'community'
    )
  )
);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------

create policy reviews_select on public.reviews
for select to authenticated
using (true);

create policy reviews_insert_own on public.reviews
for insert to authenticated
with check (reviewer_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- incidents
-- ---------------------------------------------------------------------------

create policy incidents_select on public.incidents
for select to authenticated
using (
  reporter_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
  or public.is_loan_party(loan_id, (select auth.uid()))
);

-- No write policies: incidents are opened and resolved through RPCs.

create policy incident_photos_select on public.incident_photos
for select to authenticated
using (
  public.is_admin((select auth.uid()))
  or exists (
    select 1 from public.incidents i
    where i.id = incident_id
      and (
        i.reporter_id = (select auth.uid())
        or public.is_loan_party(i.loan_id, (select auth.uid()))
      )
  )
);

-- ---------------------------------------------------------------------------
-- fines
-- ---------------------------------------------------------------------------

create policy fines_select on public.fines
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

-- No write policies: fines are created by jobs/RPCs and settled by admins.

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

create policy notifications_select_own on public.notifications
for select to authenticated
using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

create policy reports_select on public.reports
for select to authenticated
using (
  reporter_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

create policy reports_insert_own on public.reports
for insert to authenticated
with check (reporter_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- audit log (admins read; writes only from SECURITY DEFINER functions)
-- ---------------------------------------------------------------------------

create policy audit_log_select_admin on public.audit_log
for select to authenticated
using (public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- Privileges (RLS still gates every row)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Profiles: clients may only write these columns. trust_score,
-- verification_status, verification_note, is_admin and email can only be
-- changed by SECURITY DEFINER functions or the service role.
revoke update on public.profiles from authenticated;
revoke insert on public.profiles from authenticated;
grant insert (id, email, full_name, phone, department, year_of_study, avatar_path, student_id_path)
  on public.profiles to authenticated;
grant update (full_name, phone, department, year_of_study, avatar_path, student_id_path)
  on public.profiles to authenticated;
