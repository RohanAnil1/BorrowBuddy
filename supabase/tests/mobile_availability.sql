-- Regression: calendars expose occupied dates without exposing private loans.
-- All fixtures and changes are rolled back. Run after migration 15.
begin;
create temp table mobile_test_context (
  owner_id uuid, borrower_id uuid, observer_id uuid, pending_id uuid,
  item_id uuid, loan_id uuid, start_date date
);
grant all on mobile_test_context to authenticated, anon;
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_borrower uuid := gen_random_uuid();
  v_observer uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
  v_item uuid;
  v_request uuid;
  v_loan public.loans;
  v_start date := current_date + 2;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_owner, 'android-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Android QA owner"}'),
    (v_borrower, 'android-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Android QA borrower"}'),
    (v_observer, 'android-qa-' || v_observer || '@bennett.edu.in', '{"full_name":"Android QA observer"}'),
    (v_pending, 'android-qa-' || v_pending || '@bennett.edu.in', '{"full_name":"Android QA pending"}');
  update public.profiles set verification_status = 'verified'
    where id in (v_owner, v_borrower, v_observer);
  insert into public.items (owner_id, category_id, title, description, max_loan_days)
    select v_owner, id, 'Android QA availability', 'Isolated rollback-only availability fixture', 14
    from public.categories order by sort_order limit 1 returning id into v_item;
  if v_item is null then raise exception 'FAIL: seed categories missing'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_borrower)::text, true);
  insert into public.borrow_requests (item_id, borrower_id, start_date, end_date)
    values (v_item, v_borrower, v_start, v_start + 2) returning id into v_request;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  v_loan := public.approve_request(v_request);
  insert into public.availability_blocks (item_id, start_date, end_date, created_by)
    values (v_item, v_start + 5, v_start + 6, v_owner);
  insert into mobile_test_context values (v_owner, v_borrower, v_observer, v_pending, v_item, v_loan.id, v_start);
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', observer_id)::text, true)
from mobile_test_context;
set local role authenticated;
do $$
declare v_context mobile_test_context;
begin
  select * into v_context from mobile_test_context;
  if exists (select 1 from public.loans where id = v_context.loan_id) then
    raise exception 'FAIL: unrelated student can read private loan';
  end if;
  if (select count(*) from public.get_item_availability(v_context.item_id)) <> 2 then
    raise exception 'FAIL: unrelated verified student cannot see both occupied windows';
  end if;
  if not exists (select 1 from public.get_busy_item_ids(v_context.start_date + 2, v_context.start_date + 3)
                 where item_id = v_context.item_id) then
    raise exception 'FAIL: inclusive loan end date does not block search';
  end if;
  if exists (select 1 from public.get_busy_item_ids(v_context.start_date + 3, v_context.start_date + 4)
             where item_id = v_context.item_id) then
    raise exception 'FAIL: free gap is reported busy';
  end if;
  if not exists (select 1 from public.get_busy_item_ids(v_context.start_date + 6, v_context.start_date + 7)
                 where item_id = v_context.item_id) then
    raise exception 'FAIL: inclusive manual block end date does not block search';
  end if;
  begin
    perform public.get_busy_item_ids(v_context.start_date + 1, v_context.start_date);
    raise exception 'FAIL: invalid date range accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm <> 'Pick a valid date range' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', pending_id)::text, true)
from mobile_test_context;
do $$
begin
  begin
    perform public.get_item_availability((select item_id from mobile_test_context));
    raise exception 'FAIL: unverified student can read availability';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm <> 'Only verified students can view availability' then raise; end if;
  end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.get_item_availability((select item_id from mobile_test_context));
    raise exception 'FAIL: anonymous availability access allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select 'PASS: private loans stay private; verified campus calendars and inclusive date search work; invalid ranges, pending accounts and anonymous access are rejected' as result;
rollback;
