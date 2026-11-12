-- Loan extensions: the borrower asks for more days, the owner approves or
-- declines. Approval moves loans.due_date, so the existing loans_no_overlap
-- exclusion constraint is the final word on clashes with later bookings.
--
-- Rules (enforced in the RPCs; the table takes no direct writes):
--   * only the borrower asks, only the owner answers
--   * the loan must be awaiting pickup or active
--   * the new due date must be later than the current one, and the whole loan
--     must still fit the item's max_loan_days
--   * the added days must not overlap another booking or an owner block
--   * one pending extension per loan

create table public.loan_extensions (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  previous_due_date date not null,
  new_due_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'cancelled')),
  message text check (char_length(message) <= 300),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (new_due_date > previous_due_date)
);

comment on table public.loan_extensions is 'Borrower requests for more days on a loan. Written only through RPCs.';

create unique index loan_extensions_one_pending on public.loan_extensions (loan_id) where status = 'pending';
create index loan_extensions_loan_id_idx on public.loan_extensions (loan_id, created_at desc);
create index loan_extensions_requested_by_idx on public.loan_extensions (requested_by);

alter table public.loan_extensions enable row level security;

create policy loan_extensions_select_party on public.loan_extensions
for select to authenticated
using (
  public.is_loan_party(loan_id, (select auth.uid()))
  or public.is_admin((select auth.uid()))
);

revoke all on public.loan_extensions from public, anon, authenticated;
grant select on public.loan_extensions to authenticated;
grant all on public.loan_extensions to service_role;

-- Realtime so the other party's loan page updates without a reload.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.loan_extensions;
  end if;
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- request_loan_extension
-- ---------------------------------------------------------------------------
create or replace function public.request_loan_extension(
  p_loan_id uuid,
  p_new_due_date date,
  p_message text default null
)
returns public.loan_extensions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_item public.items;
  v_ext public.loan_extensions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan.id is null then
    raise exception 'Loan not found';
  end if;
  if v_loan.borrower_id <> v_uid then
    raise exception 'Only the borrower can ask for more days';
  end if;
  if not public.is_verified(v_uid) then
    raise exception 'Only verified students can extend loans';
  end if;
  if v_loan.status not in ('awaiting_pickup', 'active') then
    raise exception 'This loan can no longer be extended';
  end if;
  if p_new_due_date is null or p_new_due_date <= v_loan.due_date then
    raise exception 'Pick a date after the current due date';
  end if;

  select * into v_item from public.items where id = v_loan.item_id;
  if (p_new_due_date - v_loan.start_date) + 1 > v_item.max_loan_days then
    raise exception 'That would make the loan longer than this item''s maximum of % days', v_item.max_loan_days;
  end if;

  if exists (
    select 1 from public.loan_extensions e where e.loan_id = p_loan_id and e.status = 'pending'
  ) then
    raise exception 'You already have an extension request waiting';
  end if;

  if exists (
    select 1 from public.loans l
    where l.item_id = v_loan.item_id
      and l.id <> v_loan.id
      and l.status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed', 'lost')
      and daterange(l.start_date, l.due_date, '[]') && daterange(v_loan.due_date + 1, p_new_due_date, '[]')
  ) then
    raise exception 'Someone else has booked this item for those days';
  end if;

  if exists (
    select 1 from public.availability_blocks b
    where b.item_id = v_loan.item_id
      and daterange(b.start_date, b.end_date, '[]') && daterange(v_loan.due_date + 1, p_new_due_date, '[]')
  ) then
    raise exception 'The owner has blocked some of those days';
  end if;

  insert into public.loan_extensions (loan_id, requested_by, previous_due_date, new_due_date, message)
  values (p_loan_id, v_uid, v_loan.due_date, p_new_due_date, nullif(trim(p_message), ''))
  returning * into v_ext;

  perform public.create_notification(
    v_loan.owner_id,
    'extension_requested',
    'More days requested',
    format('Your borrower asked to keep "%s" until %s.', v_item.title, to_char(p_new_due_date, 'DD Mon')),
    jsonb_build_object('loan_id', v_loan.id, 'extension_id', v_ext.id)
  );

  return v_ext;
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_loan_extension
-- ---------------------------------------------------------------------------
create or replace function public.respond_loan_extension(p_extension_id uuid, p_approve boolean)
returns public.loan_extensions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ext public.loan_extensions;
  v_loan public.loans;
  v_title text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_ext from public.loan_extensions where id = p_extension_id for update;
  if v_ext.id is null then
    raise exception 'Extension request not found';
  end if;

  select * into v_loan from public.loans where id = v_ext.loan_id for update;
  if v_loan.owner_id <> v_uid then
    raise exception 'Only the owner can answer this request';
  end if;
  if v_ext.status <> 'pending' then
    raise exception 'This request was already answered';
  end if;

  select title into v_title from public.items where id = v_loan.item_id;

  if p_approve then
    if v_loan.status not in ('awaiting_pickup', 'active') then
      raise exception 'This loan can no longer be extended';
    end if;
    -- The due date may have moved since the request; only extend forward.
    if v_ext.new_due_date <= v_loan.due_date then
      raise exception 'The loan is already due on or after that date';
    end if;
    if exists (
      select 1 from public.availability_blocks b
      where b.item_id = v_loan.item_id
        and daterange(b.start_date, b.end_date, '[]') && daterange(v_loan.due_date + 1, v_ext.new_due_date, '[]')
    ) then
      raise exception 'You have blocked some of those days. Remove the block first.';
    end if;

    begin
      update public.loans set due_date = v_ext.new_due_date, updated_at = now() where id = v_loan.id;
    exception
      when exclusion_violation then
        raise exception 'Someone else has booked this item for those days';
    end;

    update public.loan_extensions
    set status = 'approved', responded_at = now()
    where id = v_ext.id
    returning * into v_ext;

    perform public.create_notification(
      v_loan.borrower_id,
      'extension_approved',
      'Extension approved',
      format('You can keep "%s" until %s.', coalesce(v_title, 'the item'), to_char(v_ext.new_due_date, 'DD Mon')),
      jsonb_build_object('loan_id', v_loan.id, 'extension_id', v_ext.id)
    );
  else
    update public.loan_extensions
    set status = 'declined', responded_at = now()
    where id = v_ext.id
    returning * into v_ext;

    perform public.create_notification(
      v_loan.borrower_id,
      'extension_declined',
      'Extension declined',
      format('"%s" is still due on %s.', coalesce(v_title, 'The item'), to_char(v_loan.due_date, 'DD Mon')),
      jsonb_build_object('loan_id', v_loan.id, 'extension_id', v_ext.id)
    );
  end if;

  return v_ext;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_loan_extension (borrower withdraws a pending request)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_loan_extension(p_extension_id uuid)
returns public.loan_extensions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ext public.loan_extensions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.loan_extensions
  set status = 'cancelled', responded_at = now()
  where id = p_extension_id and requested_by = auth.uid() and status = 'pending'
  returning * into v_ext;

  if v_ext.id is null then
    raise exception 'No pending request to withdraw';
  end if;
  return v_ext;
end;
$$;

-- ---------------------------------------------------------------------------
-- Due-soon reminders: dedupe per due date, so an extended loan gets a fresh
-- "due tomorrow" for its new date. Older rows have no due_date in the payload;
-- treat those as covering the last 36 hours only.
-- ---------------------------------------------------------------------------
create or replace function public.notify_due_soon()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan record;
  v_count int := 0;
  v_title text;
begin
  for v_loan in
    select * from public.loans
    where status = 'active' and due_date = current_date + 1
  loop
    if exists (
      select 1 from public.notifications n
      where n.type = 'loan_due_soon'
        and n.payload ->> 'loan_id' = v_loan.id::text
        and (
          n.payload ->> 'due_date' = v_loan.due_date::text
          or (n.payload ->> 'due_date' is null and n.created_at > now() - interval '36 hours')
        )
    ) then
      continue;
    end if;

    select title into v_title from public.items where id = v_loan.item_id;

    perform public.create_notification(
      v_loan.borrower_id,
      'loan_due_soon',
      'Due tomorrow',
      format('"%s" is due back tomorrow.', coalesce(v_title, 'Your borrowed item')),
      jsonb_build_object('loan_id', v_loan.id, 'due_date', v_loan.due_date)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Handover reminders: an in-app nudge to both people ~2 hours before a
-- booked loan pickup/return slot. Runs every 15 minutes; one reminder per
-- appointment per person.
-- ---------------------------------------------------------------------------
create or replace function public.notify_upcoming_handovers()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt record;
  v_person uuid;
  v_count int := 0;
begin
  for v_appt in
    select a.id, a.loan_id, a.kind, a.starts_at, a.host_id, a.recipient_id,
           i.title, p.name as spot
    from public.campus_appointments a
    join public.loans l on l.id = a.loan_id
    join public.items i on i.id = l.item_id
    join public.pickup_locations p on p.id = a.pickup_location_id
    where a.status = 'booked'
      and a.loan_id is not null
      and a.starts_at > now()
      and a.starts_at <= now() + interval '2 hours'
      and l.status in ('awaiting_pickup', 'active', 'return_pending', 'overdue')
  loop
    foreach v_person in array array[v_appt.host_id, v_appt.recipient_id] loop
      if exists (
        select 1 from public.notifications n
        where n.user_id = v_person
          and n.type = 'handover_reminder'
          and n.payload ->> 'appointment_id' = v_appt.id::text
      ) then
        continue;
      end if;

      perform public.create_notification(
        v_person,
        'handover_reminder',
        case when v_appt.kind = 'return' then 'Return coming up' else 'Pickup coming up' end,
        format('"%s" at %s, %s.', v_appt.title, v_appt.spot,
          to_char(v_appt.starts_at at time zone 'Asia/Kolkata', 'HH12:MI AM')),
        jsonb_build_object('loan_id', v_appt.loan_id, 'appointment_id', v_appt.id)
      );
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'borrowbuddy-handover-reminders',
      '*/15 * * * *',
      $job$select public.notify_upcoming_handovers()$job$
    );
  end if;
exception
  when others then
    raise notice 'cron scheduling skipped: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: students call the three extension RPCs; cron jobs are service-only.
-- ---------------------------------------------------------------------------
revoke all on function public.request_loan_extension(uuid, date, text) from public, anon;
revoke all on function public.respond_loan_extension(uuid, boolean) from public, anon;
revoke all on function public.cancel_loan_extension(uuid) from public, anon;
grant execute on function public.request_loan_extension(uuid, date, text) to authenticated, service_role;
grant execute on function public.respond_loan_extension(uuid, boolean) to authenticated, service_role;
grant execute on function public.cancel_loan_extension(uuid) to authenticated, service_role;

revoke all on function public.notify_due_soon() from public, anon, authenticated;
revoke all on function public.notify_upcoming_handovers() from public, anon, authenticated;
grant execute on function public.notify_due_soon() to service_role;
grant execute on function public.notify_upcoming_handovers() to service_role;
