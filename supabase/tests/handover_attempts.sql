-- Wrong-code RPC results preserve attempts across calls. Fixtures roll back.
begin;
create temp table handover_test_context(owner_id uuid, borrower_id uuid, outsider_id uuid, loan_id uuid, code text);
grant all on handover_test_context to authenticated;
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_borrower uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_item uuid;
  v_request uuid;
  v_loan public.loans;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_owner, 'handover-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Handover QA owner"}'),
    (v_borrower, 'handover-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Handover QA borrower"}'),
    (v_outsider, 'handover-qa-' || v_outsider || '@bennett.edu.in', '{"full_name":"Handover QA outsider"}');
  update public.profiles set verification_status = 'verified' where id in (v_owner, v_borrower, v_outsider);
  insert into public.items (owner_id, category_id, title, description, max_loan_days)
    select v_owner, id, 'Handover QA item', 'Rollback-only handover regression fixture', 14
    from public.categories order by sort_order limit 1 returning id into v_item;
  perform set_config('request.jwt.claims', json_build_object('sub', v_borrower)::text, true);
  insert into public.borrow_requests (item_id, borrower_id, start_date, end_date)
    values (v_item, v_borrower, current_date, current_date + 2) returning id into v_request;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  v_loan := public.approve_request(v_request);
  perform set_config('request.jwt.claims', json_build_object('sub', v_borrower)::text, true);
  insert into handover_test_context values (v_owner, v_borrower, v_outsider, v_loan.id, public.generate_handover_token(v_loan.id, 'pickup'));
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true) from handover_test_context;
set local role authenticated;
do $$
declare v_context handover_test_context; v_result jsonb; v_wrong text; v_count int;
begin
  select * into v_context from handover_test_context;
  v_wrong := case when v_context.code = '000000' then '111111' else '000000' end;
  for v_count in 1..5 loop
    v_result := public.confirm_handover_v2(v_context.loan_id, v_wrong, 'pickup');
    if v_result ->> 'ok' <> 'false' or v_result ->> 'error' <> 'Incorrect code' then
      raise exception 'FAIL: invalid pickup did not return a failure result';
    end if;
    if (select handover_attempts from public.loans where id = v_context.loan_id) <> v_count then
      raise exception 'FAIL: pickup attempt counter rolled back';
    end if;
  end loop;
  v_result := public.confirm_handover_v2(v_context.loan_id, v_context.code, 'pickup');
  if v_result ->> 'error' <> 'Too many incorrect attempts — ask for a new code' then
    raise exception 'FAIL: correct pickup code was accepted after five wrong attempts';
  end if;
  if (select status from public.loans where id = v_context.loan_id) <> 'awaiting_pickup' then
    raise exception 'FAIL: failed pickup changed loan state';
  end if;
  begin
    perform public.confirm_handover(v_context.loan_id, v_context.code, 'pickup');
    raise exception 'FAIL: authenticated caller can bypass the result RPC';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', outsider_id)::text, true) from handover_test_context;
set local role authenticated;
do $$
begin
  begin
    perform public.confirm_handover_v2((select loan_id from handover_test_context), '000000', 'pickup');
    raise exception 'FAIL: outsider can attempt a handover';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm <> 'Only the owner can confirm the pickup' then raise; end if;
  end;
end;
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', borrower_id)::text, true) from handover_test_context;
update handover_test_context set code = public.generate_handover_token(loan_id, 'pickup');
select set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true) from handover_test_context;
do $$
declare v_context handover_test_context; v_result jsonb;
begin
  select * into v_context from handover_test_context;
  if (select handover_attempts from public.loans where id = v_context.loan_id) <> 0 then
    raise exception 'FAIL: regeneration did not reset attempts';
  end if;
  update public.loans set handover_token_expires_at = now() - interval '1 second' where id = v_context.loan_id;
  v_result := public.confirm_handover_v2(v_context.loan_id, v_context.code, 'pickup');
  if v_result ->> 'error' <> 'That code has expired — ask for a new one' then raise exception 'FAIL: expired pickup code accepted'; end if;
  update public.loans set handover_token_expires_at = now() + interval '15 minutes' where id = v_context.loan_id;
  v_result := public.confirm_handover_v2(v_context.loan_id, v_context.code, 'pickup');
  if v_result ->> 'ok' <> 'true' or v_result ->> 'status' <> 'active' then raise exception 'FAIL: regenerated pickup did not activate loan'; end if;
  if v_result ? 'handover_token_hash' or v_result ? 'return_token_hash' then raise exception 'FAIL: token hashes leaked in RPC result'; end if;
  v_result := public.confirm_handover_v2(v_context.loan_id, v_context.code, 'pickup');
  if v_result ->> 'ok' <> 'false' then raise exception 'FAIL: pickup code reused'; end if;
end;
$$;
update handover_test_context set code = public.generate_handover_token(loan_id, 'return');
select set_config('request.jwt.claims', json_build_object('sub', borrower_id)::text, true) from handover_test_context;
set local role authenticated;
do $$
declare v_context handover_test_context; v_result jsonb; v_wrong text; v_count int;
begin
  select * into v_context from handover_test_context;
  v_wrong := case when v_context.code = '000000' then '111111' else '000000' end;
  for v_count in 1..5 loop
    v_result := public.confirm_handover_v2(v_context.loan_id, v_wrong, 'return');
    if v_result ->> 'ok' <> 'false' or (select return_attempts from public.loans where id = v_context.loan_id) <> v_count then
      raise exception 'FAIL: return attempt counter rolled back';
    end if;
  end loop;
  v_result := public.confirm_handover_v2(v_context.loan_id, v_context.code, 'return');
  if v_result ->> 'error' <> 'Too many incorrect attempts — ask for a new code' then raise exception 'FAIL: return lockout bypassed'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true) from handover_test_context;
update handover_test_context set code = public.generate_handover_token(loan_id, 'return');
select set_config('request.jwt.claims', json_build_object('sub', borrower_id)::text, true) from handover_test_context;
do $$
declare v_context handover_test_context; v_result jsonb;
begin
  select * into v_context from handover_test_context;
  v_result := public.confirm_handover_v2(v_context.loan_id, v_context.code, 'return');
  if v_result ->> 'ok' <> 'true' or v_result ->> 'status' <> 'returned' then raise exception 'FAIL: return did not complete loan'; end if;
  if (select return_token_hash from public.loans where id = v_context.loan_id) is not null then raise exception 'FAIL: return token not consumed'; end if;
end;
$$;
select 'PASS: persistent pickup/return attempts, five-attempt lockout, regeneration, expiry, single use and caller authorization' as result;
rollback;
