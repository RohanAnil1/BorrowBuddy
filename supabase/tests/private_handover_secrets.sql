-- Real authenticated/anonymous roles, full public rows and RPCs. Fixtures roll back.
begin;
create temp table private_handover_context(owner_id uuid, borrower_id uuid, outsider_id uuid,
  loan_id uuid, code text, cancelled_loan_id uuid, cancelled_code text);
grant select on private_handover_context to authenticated, anon;
do $$
declare
  v_owner uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid(); v_item uuid; v_request uuid;
  v_loan public.loans; v_cancelled public.loans; v_code text; v_cancelled_code text;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_owner, 'secret-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Secret QA owner"}'),
    (v_borrower, 'secret-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Secret QA borrower"}'),
    (v_outsider, 'secret-qa-' || v_outsider || '@bennett.edu.in', '{"full_name":"Secret QA outsider"}');
  update public.profiles set verification_status = 'verified' where id in (v_owner, v_borrower);
  insert into public.items(owner_id, category_id, title, description, max_loan_days)
    select v_owner, id, 'Private handover QA item', 'Rollback-only secret regression', 14
    from public.categories order by sort_order limit 1 returning id into v_item;
  perform set_config('request.jwt.claims', json_build_object('sub', v_borrower)::text, true);
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date)
    values(v_item, v_borrower, current_date, current_date + 1) returning id into v_request;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  v_loan := public.approve_request(v_request);
  perform set_config('request.jwt.claims', json_build_object('sub', v_borrower)::text, true);
  v_code := public.generate_handover_token(v_loan.id, 'pickup');
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date)
    values(v_item, v_borrower, current_date + 3, current_date + 4) returning id into v_request;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  v_cancelled := public.approve_request(v_request);
  perform set_config('request.jwt.claims', json_build_object('sub', v_borrower)::text, true);
  v_cancelled_code := public.generate_handover_token(v_cancelled.id, 'pickup');
  insert into private_handover_context values(v_owner, v_borrower, v_outsider, v_loan.id,
    v_code, v_cancelled.id, v_cancelled_code);
end;
$$;

-- Verify private secrets. The pre-deployment check inserts migration 18 here,
-- after generating old-format codes, to prove they survive migration unchanged.
do $$
declare v_context private_handover_context;
begin
  select * into v_context from private_handover_context;
  if (select pickup_hash from borrowbuddy_private.handover_secrets where loan_id = v_context.loan_id)
      is distinct from encode(extensions.digest(v_context.code, 'sha256'), 'hex') then
    raise exception 'FAIL: active pickup code was not preserved privately';
  end if;
  begin
    update public.loans set handover_token_hash = 'forbidden' where id = v_context.loan_id;
    raise exception 'FAIL: public code hashes can be reintroduced';
  exception when check_violation then null;
  end;
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true) from private_handover_context;
set local role authenticated;
do $$
declare v_context private_handover_context; v_loan public.loans; v_result jsonb;
begin
  select * into v_context from private_handover_context;
  select * into strict v_loan from public.loans where id = v_context.loan_id;
  if v_loan.handover_token_hash is not null or v_loan.return_token_hash is not null then
    raise exception 'FAIL: a full public loan row exposes code hashes';
  end if;
  if not has_schema_privilege(current_user, 'borrowbuddy_private', 'USAGE') then
    null;
  else raise exception 'FAIL: client has private handover privileges'; end if;
  begin
    perform * from borrowbuddy_private.handover_secrets;
    raise exception 'FAIL: authenticated client can read private secrets';
  exception when insufficient_privilege then null;
  end;
  v_result := public.confirm_handover_v2(v_context.loan_id, v_context.code, 'pickup');
  if v_result ->> 'ok' <> 'true' then raise exception 'FAIL: existing code no longer confirms pickup'; end if;
  v_loan := public.cancel_loan(v_context.cancelled_loan_id, 'Synthetic privacy regression');
  if v_loan.status <> 'cancelled' or v_loan.handover_token_hash is not null or v_loan.return_token_hash is not null then
    raise exception 'FAIL: cancellation RPC leaks a code hash or fails';
  end if;
end;
$$;
reset role;
do $$
begin
  if exists(select 1 from borrowbuddy_private.handover_secrets where loan_id = (select loan_id from private_handover_context)) then
    raise exception 'FAIL: confirmed pickup retains a private code';
  end if;
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true) from private_handover_context;
update private_handover_context set code = public.generate_handover_token(loan_id, 'return');
select set_config('request.jwt.claims', json_build_object('sub', borrower_id)::text, true) from private_handover_context;
set local role authenticated;
do $$
declare v_context private_handover_context; v_loan public.loans; v_result jsonb;
begin
  select * into v_context from private_handover_context;
  select * into strict v_loan from public.loans where id = v_context.loan_id;
  if v_loan.return_token_hash is not null then raise exception 'FAIL: return code hash exposed'; end if;
  v_result := public.confirm_handover_v2(v_context.loan_id, v_context.code, 'return');
  if v_result ->> 'status' <> 'returned' then raise exception 'FAIL: private return code no longer works'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', outsider_id)::text, true) from private_handover_context;
set local role authenticated;
do $$
begin
  if exists(select 1 from public.loans where id in (select loan_id from private_handover_context)) then
    raise exception 'FAIL: unrelated student can read a private loan';
  end if;
  begin
    perform public.generate_handover_token((select loan_id from private_handover_context), 'return');
    raise exception 'FAIL: unverified caller can generate codes';
  exception when others then
    if sqlerrm <> 'Only verified students can generate handover codes' then raise; end if;
  end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform * from borrowbuddy_private.handover_secrets;
    raise exception 'FAIL: anonymous client can read private secrets';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.generate_handover_token((select loan_id from private_handover_context), 'pickup');
    raise exception 'FAIL: anonymous client can call code generation';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
delete from public.loans where id in (select cancelled_loan_id from private_handover_context);
do $$
begin
  if exists(select 1 from borrowbuddy_private.handover_secrets where loan_id = (select cancelled_loan_id from private_handover_context)) then
    raise exception 'FAIL: deleted fixture leaves a private secret';
  end if;
end;
$$;
select 'PASS: private handover storage, public rows, RPCs, role boundaries, code compatibility and cleanup' as result;
rollback;
