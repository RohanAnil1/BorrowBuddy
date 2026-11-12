-- Impact stats: aggregates add up, personal scope is the caller's own, rates are admin-only.
begin;
create temp table impact_context(owner_id uuid, borrower_id uuid, outsider_id uuid, pending_id uuid, before jsonb);
grant all on impact_context to authenticated, anon;
do $$
declare
  v_owner uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid(); v_pending uuid := gen_random_uuid();
  v_cam uuid; v_book uuid; v_item uuid; v_item2 uuid; v_request uuid; v_loan uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_owner, 'impact-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Impact QA owner"}'),
    (v_borrower, 'impact-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Impact QA borrower"}'),
    (v_outsider, 'impact-qa-' || v_outsider || '@bennett.edu.in', '{"full_name":"Impact QA outsider"}'),
    (v_pending, 'impact-qa-' || v_pending || '@bennett.edu.in', '{"full_name":"Impact QA pending"}');
  update public.profiles set verification_status = 'verified' where id in (v_owner, v_borrower, v_outsider);

  select id into v_cam from public.categories where slug = 'cameras-audio';
  select id into v_book from public.categories where slug = 'books-stationery';
  if (select daily_value from public.impact_category_rates where category_id = v_cam) is distinct from 250 then
    raise exception 'FAIL: seed rates missing';
  end if;

  insert into impact_context(owner_id, borrower_id, outsider_id, pending_id) values (v_owner, v_borrower, v_outsider, v_pending);
  -- Campus totals before our fixtures, read as a verified student.
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
  update impact_context set before = public.get_impact_stats('campus');

  -- Loan 1: camera, 3 days, returned clean (deposit 500).
  insert into public.items(owner_id, category_id, title, deposit_amount) values (v_owner, v_cam, 'Impact QA camera', 500) returning id into v_item;
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date, status)
    values (v_item, v_borrower, current_date - 4, current_date - 2, 'approved') returning id into v_request;
  insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status, returned_at)
    values (v_request, v_item, v_owner, v_borrower, current_date - 4, current_date - 2, 'returned', (current_date - 2)::timestamptz);

  -- Loan 2: book, 2 days, returned with a damage fine (its deposit is not "safely returned").
  insert into public.items(owner_id, category_id, title, deposit_amount) values (v_owner, v_book, 'Impact QA book', 100) returning id into v_item2;
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date, status)
    values (v_item2, v_borrower, current_date - 3, current_date - 2, 'approved') returning id into v_request;
  insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status, returned_at)
    values (v_request, v_item2, v_owner, v_borrower, current_date - 3, current_date - 2, 'returned', (current_date - 2)::timestamptz)
    returning id into v_loan;
  insert into public.fines(loan_id, user_id, amount, source, reason) values (v_loan, v_borrower, 50, 'damage', 'Torn cover');

  -- Loan 3: still active, must not count.
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date, status)
    values (v_item, v_outsider, current_date, current_date + 1, 'approved') returning id into v_request;
  insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status)
    values (v_request, v_item, v_owner, v_outsider, current_date, current_date + 1, 'active');
end;
$$;

set local role authenticated;

-- Borrower's own view.
select set_config('request.jwt.claims', json_build_object('sub', borrower_id)::text, true) from impact_context;
do $$
declare s jsonb := public.get_impact_stats('me');
begin
  -- 3 days x 250 + 2 days x 20 = 790
  if (s->>'completed_loans')::int <> 2 or (s->>'borrow_days')::int <> 5 or (s->>'money_saved')::int <> 790 then
    raise exception 'FAIL: borrower totals wrong: %', s;
  end if;
  if (s->>'borrowed_loans')::int <> 2 or (s->>'borrowed_saved')::int <> 790 or (s->>'borrowed_days')::int <> 5 or (s->>'lent_loans')::int <> 0 then
    raise exception 'FAIL: borrower split wrong: %', s;
  end if;
  if (s->>'deposits_returned')::int <> 500 then raise exception 'FAIL: damaged deposit counted: %', s; end if;
  if jsonb_array_length(s->'categories') <> 2 or s->'categories'->0->>'slug' <> 'cameras-audio' then
    raise exception 'FAIL: categories wrong: %', s->'categories';
  end if;
end;
$$;

-- Owner's own view: lending side.
select set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true) from impact_context;
do $$
declare s jsonb := public.get_impact_stats('me');
begin
  if (s->>'lent_loans')::int <> 2 or (s->>'lent_saved')::int <> 790 or (s->>'students_helped')::int <> 1
     or (s->>'listed_items')::int <> 2 or (s->>'borrowed_days')::int <> 0 then
    raise exception 'FAIL: owner split wrong: %', s;
  end if;
end;
$$;

-- Outsider: personal view is empty; campus view grew by exactly our fixtures.
select set_config('request.jwt.claims', json_build_object('sub', outsider_id)::text, true) from impact_context;
do $$
declare me jsonb := public.get_impact_stats('me'); c jsonb := public.get_impact_stats('campus'); b jsonb;
begin
  select before into b from impact_context;
  if (me->>'completed_loans')::int <> 0 or (me->>'money_saved')::int <> 0 or jsonb_array_length(me->'categories') <> 0 then
    raise exception 'FAIL: outsider sees others'' loans: %', me;
  end if;
  if (c->>'completed_loans')::int - (b->>'completed_loans')::int <> 2
     or (c->>'money_saved')::int - (b->>'money_saved')::int <> 790
     or (c->>'borrow_days')::int - (b->>'borrow_days')::int <> 5 then
    raise exception 'FAIL: campus totals did not grow by the fixtures: before % after %', b, c;
  end if;
  if c::text ~ 'Impact QA' then raise exception 'FAIL: campus stats leak row details'; end if;

  begin
    perform public.get_impact_stats('everyone');
    raise exception 'FAIL: unknown scope accepted';
  exception when others then
    if sqlerrm <> 'Unknown scope' then raise; end if;
  end;

  update public.impact_category_rates set daily_value = 1;
  if found then raise exception 'FAIL: non-admin changed rates'; end if;
end;
$$;

-- Unverified and anonymous are refused.
select set_config('request.jwt.claims', json_build_object('sub', pending_id)::text, true) from impact_context;
do $$ begin
  begin
    perform public.get_impact_stats('campus');
    raise exception 'FAIL: unverified student read impact';
  exception when others then
    if sqlerrm <> 'Only verified students can view impact stats' then raise; end if;
  end;
end; $$;
reset role;

set local role anon;
do $$ begin
  begin
    perform public.get_impact_stats('campus');
    raise exception 'FAIL: anonymous impact access';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

select 'PASS: impact totals and estimates, damaged deposits excluded, active loans ignored, personal scope isolated, admin-only rates, unverified/anonymous refused' as result;
rollback;
