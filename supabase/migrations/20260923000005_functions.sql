-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = p_user_id), false);
$$;

create or replace function public.is_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select verification_status = 'verified' from public.profiles where id = p_user_id),
    false
  );
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$;

create or replace function public.is_loan_party(p_loan_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.loans
    where id = p_loan_id and (owner_id = p_user_id or borrower_id = p_user_id)
  );
$$;

create or replace function public.random_digits(p_length int default 6)
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_num bigint;
begin
  v_num := (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint)
    % (power(10, p_length)::bigint);
  return lpad(v_num::text, p_length, '0');
end;
$$;

create or replace function public.create_notification(
  p_user_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text default '',
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, type, title, body, payload)
  values (p_user_id, p_type, p_title, p_body, p_payload)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.write_audit(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_metadata);
$$;

-- ---------------------------------------------------------------------------
-- Signup: create a profile for every auth user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();

create trigger loans_set_updated_at
before update on public.loans
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile field protection.
-- Sensitive columns (trust_score, verification_status, is_admin, email) are
-- protected by column-level privileges granted in the RLS migration. This
-- trigger adds the conditional rule: a verified student ID is locked.
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.student_id_path is distinct from old.student_id_path
     and old.verification_status = 'verified'
     and not public.is_admin(auth.uid())
  then
    raise exception 'Your student ID is locked after verification — contact an admin';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_fields
before update on public.profiles
for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------------
-- Loan state machine: only allowed transitions, every change audited.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_loan_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'awaiting_pickup' then array['active', 'cancelled', 'disputed']
    when 'active' then array['return_pending', 'returned', 'overdue', 'disputed', 'lost']
    when 'return_pending' then array['returned', 'overdue', 'disputed', 'lost']
    when 'overdue' then array['return_pending', 'returned', 'disputed', 'lost']
    when 'disputed' then array['returned', 'lost', 'cancelled']
    else array[]::text[]
  end;

  if not (new.status::text = any (v_allowed)) then
    raise exception 'Invalid loan transition: % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger loans_enforce_transition
before update on public.loans
for each row execute function public.enforce_loan_transition();

create or replace function public.audit_loan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> old.status then
    insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
    values (
      auth.uid(),
      'loan.status_changed',
      'loan',
      new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger loans_audit_change
after update on public.loans
for each row execute function public.audit_loan_change();

-- ---------------------------------------------------------------------------
-- Borrow request validation: no self-borrowing, item must be available,
-- borrower must be verified.
-- ---------------------------------------------------------------------------

create or replace function public.validate_borrow_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
begin
  select * into v_item from public.items where id = new.item_id;
  if v_item is null then
    raise exception 'Item not found';
  end if;
  if v_item.owner_id = new.borrower_id then
    raise exception 'You cannot borrow your own item';
  end if;
  if v_item.status <> 'available' then
    raise exception 'This item is not available right now';
  end if;
  if not public.is_verified(new.borrower_id) then
    raise exception 'Only verified students can borrow items';
  end if;

  -- Clients cannot set their way around the approval flow.
  new.status := 'pending';
  new.expires_at := now() + interval '48 hours';
  new.responded_at := null;
  new.decline_reason := null;

  return new;
end;
$$;

create trigger borrow_requests_validate
before insert on public.borrow_requests
for each row execute function public.validate_borrow_request();

-- ---------------------------------------------------------------------------
-- Reviews: only the two parties, only after the item is returned, one each.
-- ---------------------------------------------------------------------------

create or replace function public.validate_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans;
  v_expected uuid;
  v_role public.review_role;
begin
  select * into v_loan from public.loans where id = new.loan_id;
  if v_loan is null then
    raise exception 'Loan not found';
  end if;
  if v_loan.status <> 'returned' then
    raise exception 'You can review only after the item has been returned';
  end if;
  if new.reviewer_id not in (v_loan.owner_id, v_loan.borrower_id) then
    raise exception 'You are not a party to this loan';
  end if;

  if new.reviewer_id = v_loan.owner_id then
    v_expected := v_loan.borrower_id;
    v_role := 'as_owner';
  else
    v_expected := v_loan.owner_id;
    v_role := 'as_borrower';
  end if;

  if new.reviewee_id <> v_expected then
    raise exception 'You can only review the other party';
  end if;

  new.role := v_role;
  return new;
end;
$$;

create trigger reviews_validate
before insert on public.reviews
for each row execute function public.validate_review();

-- ---------------------------------------------------------------------------
-- Trust score
-- ---------------------------------------------------------------------------

create or replace function public.recompute_trust_score(p_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rating numeric;
  v_total_returns int;
  v_on_time int;
  v_incidents int;
  v_completed int;
  v_verified boolean;
  v_on_time_rate numeric;
  v_score numeric;
begin
  select avg(rating) into v_rating
  from public.reviews where reviewee_id = p_user_id;

  select count(*) into v_completed
  from public.loans
  where (owner_id = p_user_id or borrower_id = p_user_id) and status = 'returned';

  select
    count(*) filter (where returned_at::date <= due_date),
    count(*)
  into v_on_time, v_total_returns
  from public.loans
  where borrower_id = p_user_id and status = 'returned' and returned_at is not null;

  select count(*) into v_incidents
  from public.incidents i
  join public.loans l on l.id = i.loan_id
  where l.borrower_id = p_user_id
    and i.status <> 'rejected'
    and i.type in ('damage', 'lost', 'late', 'no_show');

  select (verification_status = 'verified') into v_verified
  from public.profiles where id = p_user_id;

  v_on_time_rate := case
    when coalesce(v_total_returns, 0) = 0 then 0.8
    else v_on_time::numeric / v_total_returns
  end;

  v_score := 70
    + (coalesce(v_rating, 3.5) - 3.5) * 8
    + (v_on_time_rate - 0.8) * 20
    + least(coalesce(v_completed, 0) * 0.5, 10)
    + case when coalesce(v_verified, false) then 5 else 0 end
    - coalesce(v_incidents, 0) * 8;

  v_score := greatest(0, least(100, round(v_score, 2)));

  update public.profiles set trust_score = v_score where id = p_user_id;
  return v_score;
end;
$$;

create or replace function public.trg_trust_on_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_trust_score(new.reviewee_id);
  return new;
end;
$$;

create trigger reviews_recompute_trust
after insert or update on public.reviews
for each row execute function public.trg_trust_on_review();

create or replace function public.trg_trust_on_loan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'returned' and old.status <> 'returned' then
    perform public.recompute_trust_score(new.owner_id);
    perform public.recompute_trust_score(new.borrower_id);
  end if;
  return new;
end;
$$;

create trigger loans_recompute_trust
after update on public.loans
for each row execute function public.trg_trust_on_loan();

create or replace function public.trg_trust_on_incident()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrower uuid;
begin
  select borrower_id into v_borrower from public.loans where id = new.loan_id;
  if v_borrower is not null then
    perform public.recompute_trust_score(v_borrower);
  end if;
  return new;
end;
$$;

create trigger incidents_recompute_trust
after insert or update on public.incidents
for each row execute function public.trg_trust_on_incident();

create or replace function public.trg_trust_on_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status <> old.verification_status then
    perform public.recompute_trust_score(new.id);
  end if;
  return new;
end;
$$;

create trigger profiles_recompute_trust
after update on public.profiles
for each row execute function public.trg_trust_on_verification();

-- ---------------------------------------------------------------------------
-- Waitlist promotion: notify waiting students when their dates become free.
-- ---------------------------------------------------------------------------

create or replace function public.notify_waitlist_for_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.waitlist_entries;
begin
  for v_entry in
    select * from public.waitlist_entries
    where item_id = p_item_id and status = 'waiting'
  loop
    if not exists (
      select 1 from public.loans l
      where l.item_id = p_item_id
        and l.status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed', 'lost')
        and daterange(l.start_date, l.due_date, '[]')
          && daterange(v_entry.desired_start, v_entry.desired_end, '[]')
    ) and not exists (
      select 1 from public.availability_blocks b
      where b.item_id = p_item_id
        and daterange(b.start_date, b.end_date, '[]')
          && daterange(v_entry.desired_start, v_entry.desired_end, '[]')
    ) then
      update public.waitlist_entries set status = 'notified' where id = v_entry.id;
      perform public.create_notification(
        v_entry.user_id,
        'waitlist_available',
        'Your dates just opened up',
        'An item you are waiting for is now free for your requested dates.',
        jsonb_build_object('item_id', p_item_id, 'waitlist_entry_id', v_entry.id)
      );
    end if;
  end loop;
end;
$$;
