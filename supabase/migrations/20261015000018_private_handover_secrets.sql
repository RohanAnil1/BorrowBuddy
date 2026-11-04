-- Handover codes have only one million possibilities. Even SHA-256 digests must
-- stay private: loan parties must not be able to brute-force them offline.
-- Preserve existing codes while removing secrets from API/RPC/realtime rows.
create schema if not exists borrowbuddy_private;
revoke all on schema borrowbuddy_private from public, anon, authenticated;

create table borrowbuddy_private.handover_secrets (
  loan_id uuid primary key references public.loans(id) on delete cascade,
  pickup_hash text,
  return_hash text
);
alter table borrowbuddy_private.handover_secrets enable row level security;
revoke all on borrowbuddy_private.handover_secrets from public, anon, authenticated;

insert into borrowbuddy_private.handover_secrets (loan_id, pickup_hash, return_hash)
select id, handover_token_hash, return_token_hash from public.loans
where handover_token_hash is not null or return_token_hash is not null;

update public.loans set handover_token_hash = null, return_token_hash = null
where handover_token_hash is not null or return_token_hash is not null;

-- Retain null compatibility columns for older clients selecting the full row.
-- This constraint also prevents future RPCs from reintroducing public hashes.
alter table public.loans add constraint loans_no_public_handover_secrets
  check (handover_token_hash is null and return_token_hash is null);
comment on column public.loans.handover_token_hash is 'Retired compatibility field; always null. Secrets are private.';
comment on column public.loans.return_token_hash is 'Retired compatibility field; always null. Secrets are private.';

create or replace function public.generate_handover_token(
  p_loan_id uuid,
  p_kind public.handover_kind
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_code text;
  v_hash text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_verified(v_uid) then raise exception 'Only verified students can generate handover codes'; end if;
  if p_kind is null then raise exception 'Choose pickup or return'; end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then
    raise exception 'Loan not found';
  end if;

  if p_kind = 'pickup' then
    if v_uid <> v_loan.borrower_id then
      raise exception 'Only the borrower can show the pickup code';
    end if;
    if v_loan.status <> 'awaiting_pickup' then
      raise exception 'This loan is not awaiting pickup';
    end if;
  else
    if v_uid <> v_loan.owner_id then
      raise exception 'Only the owner can show the return code';
    end if;
    if v_loan.status not in ('active', 'return_pending', 'overdue') then
      raise exception 'This item is not currently out on loan';
    end if;
  end if;

  v_code := public.random_digits(6);
  v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

  if p_kind = 'pickup' then
    update public.loans
    set handover_token_expires_at = now() + interval '15 minutes',
        handover_attempts = 0
    where id = p_loan_id;
  else
    update public.loans
    set return_token_expires_at = now() + interval '15 minutes',
        return_attempts = 0
    where id = p_loan_id;
  end if;

  insert into borrowbuddy_private.handover_secrets (loan_id, pickup_hash, return_hash)
  values (p_loan_id, case when p_kind = 'pickup' then v_hash end,
                     case when p_kind = 'return' then v_hash end)
  on conflict (loan_id) do update set
    pickup_hash = case when p_kind = 'pickup' then excluded.pickup_hash else handover_secrets.pickup_hash end,
    return_hash = case when p_kind = 'return' then excluded.return_hash else handover_secrets.return_hash end;

  return v_code;
end;
$$;

create or replace function public.confirm_handover(
  p_loan_id uuid,
  p_token text,
  p_kind public.handover_kind
)
returns public.loans
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_hash text;
  v_expires timestamptz;
  v_attempts int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then
    raise exception 'Loan not found';
  end if;

  if p_kind = 'pickup' then
    if v_uid <> v_loan.owner_id then
      raise exception 'Only the owner can confirm the pickup';
    end if;
    select pickup_hash into v_hash from borrowbuddy_private.handover_secrets where loan_id = p_loan_id;
    v_expires := v_loan.handover_token_expires_at;
    v_attempts := v_loan.handover_attempts;
  else
    if v_uid <> v_loan.borrower_id then
      raise exception 'Only the borrower can confirm the return';
    end if;
    select return_hash into v_hash from borrowbuddy_private.handover_secrets where loan_id = p_loan_id;
    v_expires := v_loan.return_token_expires_at;
    v_attempts := v_loan.return_attempts;
  end if;

  if v_hash is null then
    raise exception 'Ask the other student to show a fresh code';
  end if;
  if v_expires is null or v_expires <= now() then
    raise exception 'That code has expired — ask for a new one';
  end if;
  if v_attempts >= 5 then
    raise exception 'Too many incorrect attempts — ask for a new code';
  end if;

  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then
    if p_kind = 'pickup' then
      update public.loans set handover_attempts = handover_attempts + 1 where id = p_loan_id;
    else
      update public.loans set return_attempts = return_attempts + 1 where id = p_loan_id;
    end if;
    raise exception 'Incorrect code';
  end if;

  if p_kind = 'pickup' then
    update public.loans
    set status = 'active',
        pickup_confirmed_at = now(),
        handover_token_hash = null,
        handover_token_expires_at = null,
        handover_attempts = 0
    where id = p_loan_id
    returning * into v_loan;

    perform public.create_notification(
      v_loan.borrower_id,
      'handover_confirmed',
      'Pickup confirmed',
      format('Enjoy! Please return the item by %s.', to_char(v_loan.due_date, 'DD Mon YYYY')),
      jsonb_build_object('loan_id', v_loan.id)
    );
  else
    update public.loans
    set status = 'returned',
        returned_at = now(),
        return_confirmed_at = now(),
        return_token_hash = null,
        return_token_expires_at = null,
        return_attempts = 0
    where id = p_loan_id
    returning * into v_loan;

    perform public.create_notification(
      v_loan.owner_id,
      'loan_returned',
      'Item returned',
      'The borrower confirmed the return. Leave a rating for them.',
      jsonb_build_object('loan_id', v_loan.id)
    );
    perform public.create_notification(
      v_loan.borrower_id,
      'loan_returned',
      'Return confirmed',
      'Thanks for returning the item. Leave a rating for the owner.',
      jsonb_build_object('loan_id', v_loan.id)
    );
    perform public.notify_waitlist_for_item(v_loan.item_id);
  end if;

  delete from borrowbuddy_private.handover_secrets where loan_id = p_loan_id;
  return v_loan;
end;
$$;

create or replace function public.confirm_handover_v2(
  p_loan_id uuid,
  p_token text,
  p_kind public.handover_kind
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_hash text;
  v_expires timestamptz;
  v_attempts int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_verified(v_uid) then raise exception 'Only verified students can confirm handovers'; end if;
  if p_kind is null then raise exception 'Choose pickup or return'; end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found'; end if;

  if p_kind = 'pickup' then
    if v_uid <> v_loan.owner_id then raise exception 'Only the owner can confirm the pickup'; end if;
    if v_loan.status <> 'awaiting_pickup' then
      return jsonb_build_object('ok', false, 'error', 'This loan is not awaiting pickup');
    end if;
    select pickup_hash into v_hash from borrowbuddy_private.handover_secrets where loan_id = p_loan_id;
    v_expires := v_loan.handover_token_expires_at;
    v_attempts := v_loan.handover_attempts;
  else
    if v_uid <> v_loan.borrower_id then raise exception 'Only the borrower can confirm the return'; end if;
    if v_loan.status not in ('active', 'return_pending', 'overdue') then
      return jsonb_build_object('ok', false, 'error', 'This item is not currently out on loan');
    end if;
    select return_hash into v_hash from borrowbuddy_private.handover_secrets where loan_id = p_loan_id;
    v_expires := v_loan.return_token_expires_at;
    v_attempts := v_loan.return_attempts;
  end if;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Ask the other student to show a fresh code');
  end if;
  if v_expires is null or v_expires <= now() then
    return jsonb_build_object('ok', false, 'error', 'That code has expired — ask for a new one');
  end if;
  if v_attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts — ask for a new code');
  end if;

  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then
    if p_kind = 'pickup' then
      update public.loans set handover_attempts = handover_attempts + 1 where id = p_loan_id;
    else
      update public.loans set return_attempts = return_attempts + 1 where id = p_loan_id;
    end if;
    return jsonb_build_object('ok', false, 'error', 'Incorrect code');
  end if;

  v_loan := public.confirm_handover(p_loan_id, p_token, p_kind);
  return jsonb_build_object('ok', true, 'loan_id', v_loan.id, 'status', v_loan.status);
end;
$$;

-- Replacement preserves grants, but state the intended boundary explicitly.
revoke execute on function public.generate_handover_token(uuid, public.handover_kind) from public, anon;
grant execute on function public.generate_handover_token(uuid, public.handover_kind) to authenticated, service_role;
revoke execute on function public.confirm_handover(uuid, text, public.handover_kind) from public, anon, authenticated;
grant execute on function public.confirm_handover(uuid, text, public.handover_kind) to service_role;
revoke execute on function public.confirm_handover_v2(uuid, text, public.handover_kind) from public, anon;
grant execute on function public.confirm_handover_v2(uuid, text, public.handover_kind) to authenticated, service_role;
