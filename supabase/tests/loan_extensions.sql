-- Loan extensions: borrower asks, owner answers, dates and bookings are respected.
begin;

create function pg_temp.expect_error(p_sql text, p_message text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected "%" from: %', p_message, p_sql;
exception
  when others then
    if sqlerrm not like p_message || '%' then
      raise exception 'FAIL: expected "%" but got "%" from: %', p_message, sqlerrm, p_sql;
    end if;
end;
$$;
grant execute on function pg_temp.expect_error(text, text) to public;

create temp table ext_context(owner_id uuid, borrower_id uuid, other_id uuid, item_id uuid, loan_id uuid, ext_id uuid);
grant all on ext_context to authenticated, anon;

do $$
declare
  v_owner uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_item uuid; v_request uuid; v_loan uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_owner, 'ext-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Ext QA owner"}'),
    (v_borrower, 'ext-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Ext QA borrower"}'),
    (v_other, 'ext-qa-' || v_other || '@bennett.edu.in', '{"full_name":"Ext QA other"}');
  update public.profiles set verification_status = 'verified' where id in (v_owner, v_borrower, v_other);

  insert into public.items(owner_id, category_id, title, max_loan_days)
    select v_owner, id, 'Ext QA tripod', 7 from public.categories order by sort_order limit 1 returning id into v_item;

  -- The borrower's loan: today .. today+2, active.
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date, status)
    values (v_item, v_borrower, current_date, current_date + 2, 'approved') returning id into v_request;
  insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status)
    values (v_request, v_item, v_owner, v_borrower, current_date, current_date + 2, 'active') returning id into v_loan;

  -- Someone else has it from today+6.
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date, status)
    values (v_item, v_other, current_date + 6, current_date + 7, 'approved') returning id into v_request;
  insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status)
    values (v_request, v_item, v_owner, v_other, current_date + 6, current_date + 7, 'awaiting_pickup');

  -- The owner blocked today+4.
  insert into public.availability_blocks(item_id, start_date, end_date, created_by)
    values (v_item, current_date + 4, current_date + 4, v_owner);

  insert into ext_context(owner_id, borrower_id, other_id, item_id, loan_id) values (v_owner, v_borrower, v_other, v_item, v_loan);
end;
$$;

set local role authenticated;

-- Borrower: the rules on what can be asked.
select set_config('request.jwt.claims', json_build_object('sub', borrower_id)::text, true) from ext_context;
do $$
declare v ext_context; v_ext public.loan_extensions;
begin
  select * into v from ext_context;
  perform pg_temp.expect_error(format('select public.request_loan_extension(%L, current_date + 2)', v.loan_id), 'Pick a date after the current due date');
  perform pg_temp.expect_error(format('select public.request_loan_extension(%L, current_date + 7)', v.loan_id), 'That would make the loan longer');
  perform pg_temp.expect_error(format('select public.request_loan_extension(%L, current_date + 6)', v.loan_id), 'Someone else has booked');
  perform pg_temp.expect_error(format('select public.request_loan_extension(%L, current_date + 4)', v.loan_id), 'The owner has blocked');

  v_ext := public.request_loan_extension(v.loan_id, current_date + 3, '  Need it for the weekend shoot  ');
  if v_ext.status <> 'pending' or v_ext.previous_due_date <> current_date + 2 or v_ext.message <> 'Need it for the weekend shoot' then
    raise exception 'FAIL: extension row is wrong: %', row_to_json(v_ext);
  end if;
  update ext_context set ext_id = v_ext.id;

  perform pg_temp.expect_error(format('select public.request_loan_extension(%L, current_date + 3)', v.loan_id), 'You already have an extension request waiting');
  perform pg_temp.expect_error(format('select public.respond_loan_extension(%L, true)', v_ext.id), 'Only the owner can answer');

  -- No direct writes, even to your own row.
  begin
    insert into public.loan_extensions(loan_id, requested_by, previous_due_date, new_due_date) values (v.loan_id, v.borrower_id, current_date + 2, current_date + 3);
    raise exception 'FAIL: direct insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.loan_extensions set status = 'approved' where id = v_ext.id;
    raise exception 'FAIL: direct update allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

-- Owner: cannot ask, sees the request, gets notified, approves.
select set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true) from ext_context;
do $$
declare v ext_context; v_ext public.loan_extensions; v_due date;
begin
  select * into v from ext_context;
  perform pg_temp.expect_error(format('select public.request_loan_extension(%L, current_date + 3)', v.loan_id), 'Only the borrower can ask');
  if not exists (select 1 from public.loan_extensions where id = v.ext_id) then raise exception 'FAIL: owner cannot see the request'; end if;
  if not exists (select 1 from public.notifications where type = 'extension_requested' and payload ->> 'extension_id' = v.ext_id::text) then
    raise exception 'FAIL: owner was not notified';
  end if;

  v_ext := public.respond_loan_extension(v.ext_id, true);
  select due_date into v_due from public.loans where id = v.loan_id;
  if v_ext.status <> 'approved' or v_due <> current_date + 3 then raise exception 'FAIL: approval did not move the due date'; end if;
  perform pg_temp.expect_error(format('select public.respond_loan_extension(%L, false)', v.ext_id), 'This request was already answered');
end;
$$;

-- An outsider sees nothing.
select set_config('request.jwt.claims', json_build_object('sub', other_id)::text, true) from ext_context;
do $$ begin
  if exists (select 1 from public.loan_extensions) then raise exception 'FAIL: outsider can see extensions'; end if;
end; $$;

-- Borrower: notified of approval; withdraw one request, owner declines another.
select set_config('request.jwt.claims', json_build_object('sub', borrower_id)::text, true) from ext_context;
do $$
declare v ext_context; v_ext public.loan_extensions;
begin
  select * into v from ext_context;
  if not exists (select 1 from public.notifications where type = 'extension_approved' and payload ->> 'extension_id' = v.ext_id::text) then
    raise exception 'FAIL: borrower was not told about the approval';
  end if;
  v_ext := public.request_loan_extension(v.loan_id, current_date + 5);
  -- +5 skips over the owner's block on +4.
  raise exception 'FAIL: request over a blocked day accepted';
exception when others then
  if sqlerrm not like 'The owner has blocked%' then raise; end if;
end;
$$;

-- Lift the block (as the table owner), then test withdraw and decline.
reset role;
delete from public.availability_blocks where item_id = (select item_id from ext_context);
set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', borrower_id)::text, true) from ext_context;
do $$
declare v ext_context; v_ext public.loan_extensions;
begin
  select * into v from ext_context;
  v_ext := public.request_loan_extension(v.loan_id, current_date + 5);
  v_ext := public.cancel_loan_extension(v_ext.id);
  if v_ext.status <> 'cancelled' then raise exception 'FAIL: withdraw did not cancel'; end if;
  perform pg_temp.expect_error(format('select public.cancel_loan_extension(%L)', v_ext.id), 'No pending request to withdraw');

  v_ext := public.request_loan_extension(v.loan_id, current_date + 4);
  update ext_context set ext_id = v_ext.id;
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true) from ext_context;
do $$
declare v ext_context; v_ext public.loan_extensions; v_due date;
begin
  select * into v from ext_context;
  v_ext := public.respond_loan_extension(v.ext_id, false);
  select due_date into v_due from public.loans where id = v.loan_id;
  if v_ext.status <> 'declined' or v_due <> current_date + 3 then raise exception 'FAIL: decline changed the loan'; end if;
end;
$$;

-- Cron helpers stay service-only.
do $$ begin
  perform pg_temp.expect_error('select public.notify_upcoming_handovers()', 'permission denied');
end; $$;
reset role;

set local role anon;
do $$ begin
  perform pg_temp.expect_error(format('select public.request_loan_extension(%L, current_date + 3)', gen_random_uuid()), 'permission denied');
end; $$;
reset role;

-- The cron job finds a booked handover starting within 2 hours, once.
do $$
declare v ext_context; v_spot uuid; v_sent int;
begin
  select * into v from ext_context;
  select id into v_spot from public.pickup_locations order by name limit 1;
  insert into public.campus_appointments(host_id, recipient_id, loan_id, kind, starts_at, ends_at, pickup_location_id)
    values (v.owner_id, v.borrower_id, v.loan_id, 'return', now() + interval '90 minutes', now() + interval '105 minutes', v_spot);
  v_sent := public.notify_upcoming_handovers();
  if v_sent <> 2 then raise exception 'FAIL: expected 2 handover reminders, sent %', v_sent; end if;
  v_sent := public.notify_upcoming_handovers();
  if v_sent <> 0 then raise exception 'FAIL: reminders were sent twice'; end if;
end;
$$;

select 'PASS: extension rules (dates, max length, bookings, blocks, one pending), owner-only answers, notifications, no direct writes, outsider/anon denial, handover reminders once' as result;
rollback;
