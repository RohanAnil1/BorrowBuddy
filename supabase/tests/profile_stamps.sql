-- Member ID card stamps: each stamp earned and not earned, aggregate-only
-- visibility identical to get_public_profile_stats, and no anonymous access.
begin;
create temp table stamp_context(vet uuid, borrower uuid, rookie uuid, viewer uuid, pending uuid);
grant all on stamp_context to authenticated, anon;

-- Raises unless the caller sees exactly the expected state for one stamp.
create function pg_temp.expect_stamp(p_profile uuid, p_key text, p_earned boolean, p_progress int, p_goal int)
returns void language plpgsql as $$
declare v record;
begin
  select * into v from public.get_profile_stamps(p_profile) s where s.key = p_key;
  if not found then raise exception 'FAIL: stamp % missing', p_key; end if;
  if v.earned is distinct from p_earned or v.progress <> p_progress or v.goal <> p_goal then
    raise exception 'FAIL: % expected earned=% %/% but got earned=% %/%',
      p_key, p_earned, p_progress, p_goal, v.earned, v.progress, v.goal;
  end if;
end;
$$;
grant execute on function pg_temp.expect_stamp(uuid, text, boolean, int, int) to authenticated;

do $$
declare
  v_vet uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid(); v_rookie uuid := gen_random_uuid();
  v_viewer uuid := gen_random_uuid(); v_pending uuid := gen_random_uuid();
  v_category uuid; v_vet_item uuid; v_rookie_item uuid; v_request uuid; v_loan uuid; v_post uuid;
  v_vet_loans uuid[] := '{}'; v_rookie_loans uuid[] := '{}';
  v_due date := current_date - 30;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_vet, 'stamps-qa-' || v_vet || '@bennett.edu.in', '{"full_name":"Stamps QA veteran"}'),
    (v_borrower, 'stamps-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Stamps QA borrower"}'),
    (v_rookie, 'stamps-qa-' || v_rookie || '@bennett.edu.in', '{"full_name":"Stamps QA rookie"}'),
    (v_viewer, 'stamps-qa-' || v_viewer || '@bennett.edu.in', '{"full_name":"Stamps QA viewer"}'),
    (v_pending, 'stamps-qa-' || v_pending || '@bennett.edu.in', '{"full_name":"Stamps QA pending"}');
  update public.profiles set verification_status = 'verified' where id in (v_vet, v_borrower, v_rookie, v_viewer);
  select id into v_category from public.categories order by sort_order limit 1;
  insert into public.items(owner_id, category_id, title) values (v_vet, v_category, 'Stamps QA veteran item') returning id into v_vet_item;
  insert into public.items(owner_id, category_id, title) values (v_rookie, v_category, 'Stamps QA rookie item') returning id into v_rookie_item;

  -- Veteran lends to the borrower 11 times: 10 returned on or before the due date, 1 late.
  for i in 1..11 loop
    insert into public.borrow_requests(item_id, borrower_id, start_date, end_date)
      values (v_vet_item, v_borrower, v_due - 2, v_due) returning id into v_request;
    update public.borrow_requests set status = 'approved' where id = v_request;
    insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status, returned_at)
      values (v_request, v_vet_item, v_vet, v_borrower, v_due - 2, v_due, 'returned',
        case when i = 11 then (v_due + 3)::timestamptz when i = 10 then (v_due + time '23:30')::timestamptz else (v_due - 1)::timestamptz end)
      returning id into v_loan;
    v_vet_loans := v_vet_loans || v_loan;
  end loop;
  -- Unreturned loans never count.
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date)
    values (v_vet_item, v_borrower, current_date, current_date + 1) returning id into v_request;
  update public.borrow_requests set status = 'approved' where id = v_request;
  insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status)
    values (v_request, v_vet_item, v_vet, v_borrower, current_date, current_date + 1, 'active');

  -- Rookie lends to the borrower 4 times, all returned.
  for i in 1..4 loop
    insert into public.borrow_requests(item_id, borrower_id, start_date, end_date)
      values (v_rookie_item, v_borrower, v_due - 2, v_due) returning id into v_request;
    update public.borrow_requests set status = 'approved' where id = v_request;
    insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status, returned_at)
      values (v_request, v_rookie_item, v_rookie, v_borrower, v_due - 2, v_due, 'returned', v_due::timestamptz)
      returning id into v_loan;
    v_rookie_loans := v_rookie_loans || v_loan;
  end loop;

  -- Veteran's reviews, oldest first: 2, 5, 5, 5, 5, 5 -> latest five are all 5 stars.
  for i in 1..6 loop
    insert into public.reviews(loan_id, reviewer_id, reviewee_id, role, rating, created_at)
      values (v_vet_loans[i], v_borrower, v_vet, 'as_borrower', case when i = 1 then 2 else 5 end, now() - make_interval(days => 10 - i));
  end loop;
  -- Borrower's reviews, oldest first: 5, 5, 5, 3, 5, 5 -> streak of 2.
  for i in 1..6 loop
    insert into public.reviews(loan_id, reviewer_id, reviewee_id, role, rating, created_at)
      values (v_vet_loans[i], v_vet, v_borrower, 'as_owner', case when i = 4 then 3 else 5 end, now() - make_interval(days => 10 - i));
  end loop;
  -- Rookie has only four reviews, all 5 stars: a streak of 4 is not yet a stamp.
  for i in 1..4 loop
    insert into public.reviews(loan_id, reviewer_id, reviewee_id, role, rating, created_at)
      values (v_rookie_loans[i], v_borrower, v_rookie, 'as_borrower', 5, now() - make_interval(days => 10 - i));
  end loop;

  -- Campus exchange: the veteran completed a giveaway as host (rookie received it).
  insert into public.campus_posts(owner_id, kind, title, description, category_id, location, condition, images, status)
    values (v_vet, 'giveaway', 'Stamps QA lamp', 'A working desk lamp for anyone.', v_category, 'Block A', 'good', array['qa/lamp.jpg'], 'completed')
    returning id into v_post;
  insert into public.campus_transfers(post_id, host_id, recipient_id, status, completed_at)
    values (v_post, v_vet, v_rookie, 'completed', now());
  -- The borrower's found-item handovers were cancelled or are still active.
  insert into public.campus_posts(owner_id, kind, title, description, category_id, location, found_on, images, status)
    values (v_borrower, 'found', 'Stamps QA bottle', 'Blue bottle found near the library.', v_category, 'Library', current_date, array['qa/bottle.jpg'], 'reserved')
    returning id into v_post;
  insert into public.campus_transfers(post_id, host_id, recipient_id, status) values
    (v_post, v_borrower, v_viewer, 'cancelled'),
    (v_post, v_borrower, v_rookie, 'active');

  -- Trust scores are recomputed by triggers; pin them for the threshold checks.
  update public.profiles set trust_score = 90 where id in (v_vet, v_borrower);
  update public.profiles set trust_score = 95 where id = v_rookie;

  insert into stamp_context values (v_vet, v_borrower, v_rookie, v_viewer, v_pending);
end;
$$;

-- A verified, unrelated student sees the same aggregates for everyone.
select set_config('request.jwt.claims', json_build_object('sub', viewer)::text, true) from stamp_context;
set local role authenticated;
do $$
declare c stamp_context;
begin
  select * into c from stamp_context;
  if exists (select 1 from public.loans where owner_id = c.vet) then raise exception 'FAIL: private loans exposed'; end if;
  if (select array_agg(s.key) from public.get_profile_stamps(c.vet) s) <>
    array['first_lend', 'first_borrow', 'on_time_10', 'trusted_lender', 'five_star_streak', 'campus_helper'] then
    raise exception 'FAIL: stamp keys or order changed';
  end if;

  -- Veteran: lender stamps earned, never borrowed.
  perform pg_temp.expect_stamp(c.vet, 'first_lend', true, 1, 1);
  perform pg_temp.expect_stamp(c.vet, 'first_borrow', false, 0, 1);
  perform pg_temp.expect_stamp(c.vet, 'on_time_10', false, 0, 10);
  perform pg_temp.expect_stamp(c.vet, 'trusted_lender', true, 5, 5);
  perform pg_temp.expect_stamp(c.vet, 'five_star_streak', true, 5, 5);
  perform pg_temp.expect_stamp(c.vet, 'campus_helper', true, 1, 1);

  -- Borrower: 10 on-time returns (one same-day evening), one late; streak broken; campus not completed.
  perform pg_temp.expect_stamp(c.borrower, 'first_lend', false, 0, 1);
  perform pg_temp.expect_stamp(c.borrower, 'first_borrow', true, 1, 1);
  perform pg_temp.expect_stamp(c.borrower, 'on_time_10', true, 10, 10);
  perform pg_temp.expect_stamp(c.borrower, 'trusted_lender', false, 0, 5);
  perform pg_temp.expect_stamp(c.borrower, 'five_star_streak', false, 2, 5);
  perform pg_temp.expect_stamp(c.borrower, 'campus_helper', false, 0, 1);

  -- Rookie: high trust but only 4 lends, 4 perfect reviews, a giveaway recipient (not host).
  perform pg_temp.expect_stamp(c.rookie, 'first_lend', true, 1, 1);
  perform pg_temp.expect_stamp(c.rookie, 'trusted_lender', false, 4, 5);
  perform pg_temp.expect_stamp(c.rookie, 'five_star_streak', false, 4, 5);
  perform pg_temp.expect_stamp(c.rookie, 'campus_helper', false, 0, 1);

  -- A fresh profile has every stamp locked at zero.
  if exists (select 1 from public.get_profile_stamps(c.viewer) s where s.earned or s.progress <> 0) then
    raise exception 'FAIL: empty profile has progress';
  end if;

  begin
    perform public.get_profile_stamps(c.pending);
    raise exception 'FAIL: pending profile discoverable';
  exception when others then if sqlerrm <> 'Student profile not found' then raise; end if; end;
  begin
    perform public.get_profile_stamps(gen_random_uuid());
    raise exception 'FAIL: missing profile accepted';
  exception when others then if sqlerrm <> 'Student profile not found' then raise; end if; end;
end;
$$;

-- Trust below 85 locks trusted_lender even with enough lends.
reset role;
update public.profiles set trust_score = 84.99 where id = (select vet from stamp_context);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_stamp((select vet from stamp_context), 'trusted_lender', false, 5, 5);
end; $$;

-- Unverified callers are rejected, even for their own profile.
select set_config('request.jwt.claims', json_build_object('sub', pending)::text, true) from stamp_context;
do $$ begin
  begin perform public.get_profile_stamps((select vet from stamp_context));
    raise exception 'FAIL: unverified viewer accepted';
  exception when others then if sqlerrm <> 'Only verified students can view reputation' then raise; end if; end;
  begin perform public.get_profile_stamps((select pending from stamp_context));
    raise exception 'FAIL: unverified self view accepted';
  exception when others then if sqlerrm <> 'Only verified students can view reputation' then raise; end if; end;
end; $$;
reset role;

-- Anonymous visitors cannot execute the function at all.
set local role anon;
do $$ begin
  begin perform public.get_profile_stamps((select vet from stamp_context));
    raise exception 'FAIL: anonymous stamp access';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

do $$ begin
  if has_function_privilege('anon', 'public.get_profile_stamps(uuid)', 'execute') then raise exception 'FAIL: anon can execute'; end if;
  if has_function_privilege('public', 'public.get_profile_stamps(uuid)', 'execute') then raise exception 'FAIL: PUBLIC can execute'; end if;
  if not has_function_privilege('authenticated', 'public.get_profile_stamps(uuid)', 'execute') then raise exception 'FAIL: authenticated cannot execute'; end if;
  if not has_function_privilege('service_role', 'public.get_profile_stamps(uuid)', 'execute') then raise exception 'FAIL: service_role cannot execute'; end if;
end; $$;

select 'PASS: profile stamps earned/locked per rule, aggregate-only, pending/missing/unverified/anonymous rejection' as result;
rollback;
