-- Invalid-code attempts must commit instead of being rolled back by an exception.
-- Keep the legacy success implementation private; both clients consume this result RPC.
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
    v_hash := v_loan.handover_token_hash;
    v_expires := v_loan.handover_token_expires_at;
    v_attempts := v_loan.handover_attempts;
  else
    if v_uid <> v_loan.borrower_id then raise exception 'Only the borrower can confirm the return'; end if;
    if v_loan.status not in ('active', 'return_pending', 'overdue') then
      return jsonb_build_object('ok', false, 'error', 'This item is not currently out on loan');
    end if;
    v_hash := v_loan.return_token_hash;
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

revoke execute on function public.confirm_handover(uuid, text, public.handover_kind) from public, anon, authenticated;
grant execute on function public.confirm_handover(uuid, text, public.handover_kind) to service_role;
revoke execute on function public.confirm_handover_v2(uuid, text, public.handover_kind) from public, anon;
grant execute on function public.confirm_handover_v2(uuid, text, public.handover_kind) to authenticated, service_role;
