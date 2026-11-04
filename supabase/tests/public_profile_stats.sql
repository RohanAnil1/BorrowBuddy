-- Reputation aggregates are consistent for unrelated viewers; private loans stay hidden.
begin;
create temp table profile_stats_context(owner_id uuid, borrower_id uuid, viewer_id uuid, pending_id uuid);
grant all on profile_stats_context to authenticated, anon;
do $$
declare
  v_owner uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid();
  v_viewer uuid := gen_random_uuid(); v_pending uuid := gen_random_uuid();
  v_item uuid; v_request uuid; v_returned uuid; v_status public.loan_status; v_round int := 0;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_owner, 'stats-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Stats QA owner"}'),
    (v_borrower, 'stats-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Stats QA borrower"}'),
    (v_viewer, 'stats-qa-' || v_viewer || '@bennett.edu.in', '{"full_name":"Stats QA viewer"}'),
    (v_pending, 'stats-qa-' || v_pending || '@bennett.edu.in', '{"full_name":"Stats QA pending"}');
  update public.profiles set verification_status = 'verified' where id in (v_owner, v_borrower, v_viewer);
  insert into public.items(owner_id, category_id, title)
    select v_owner, id, 'Stats QA rollback fixture' from public.categories order by sort_order limit 1 returning id into v_item;
  foreach v_status in array array['returned', 'returned', 'active', 'cancelled']::public.loan_status[] loop
    insert into public.borrow_requests(item_id, borrower_id, start_date, end_date, status)
      values(v_item, v_borrower, current_date, current_date + 1, 'approved') returning id into v_request;
    update public.borrow_requests set status = 'approved' where id = v_request;
    insert into public.loans(request_id, item_id, owner_id, borrower_id, start_date, due_date, status)
      values(v_request, v_item, v_owner, v_borrower, current_date, current_date + 1, v_status);
    if v_status = 'returned' then
      v_round := v_round + 1;
      select id into v_returned from public.loans where request_id = v_request;
      insert into public.reviews(loan_id, reviewer_id, reviewee_id, role, rating) values
        (v_returned, v_borrower, v_owner, 'as_borrower', case when v_round = 1 then 5 else 3 end),
        (v_returned, v_owner, v_borrower, 'as_owner', case when v_round = 1 then 3 else 4 end);
    end if;
  end loop;
  insert into profile_stats_context values(v_owner, v_borrower, v_viewer, v_pending);
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', viewer_id)::text, true) from profile_stats_context;
set local role authenticated;
do $$
declare v_context profile_stats_context; v_stats record;
begin
  select * into v_context from profile_stats_context;
  if exists(select 1 from public.loans where owner_id = v_context.owner_id) then raise exception 'FAIL: private loans exposed'; end if;
  select * into v_stats from public.get_public_profile_stats(v_context.owner_id);
  if v_stats.completed_loans <> 2 or v_stats.review_count <> 2 or v_stats.rating_average <> 4 then raise exception 'FAIL: owner aggregate mismatch'; end if;
  select * into v_stats from public.get_public_profile_stats(v_context.borrower_id);
  if v_stats.completed_loans <> 2 or v_stats.review_count <> 2 or v_stats.rating_average <> 3.5 then raise exception 'FAIL: borrower aggregate mismatch'; end if;
  select * into v_stats from public.get_public_profile_stats(v_context.viewer_id);
  if v_stats.completed_loans <> 0 or v_stats.review_count <> 0 or v_stats.rating_average is not null then raise exception 'FAIL: empty reputation mismatch'; end if;
  begin
    perform public.get_public_profile_stats(v_context.pending_id);
    raise exception 'FAIL: pending profile discoverable';
  exception when others then if sqlerrm <> 'Student profile not found' then raise; end if; end;
  begin
    perform public.get_public_profile_stats(gen_random_uuid());
    raise exception 'FAIL: missing profile accepted';
  exception when others then if sqlerrm <> 'Student profile not found' then raise; end if; end;
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', pending_id)::text, true) from profile_stats_context;
do $$ begin
  begin perform public.get_public_profile_stats((select owner_id from profile_stats_context));
    raise exception 'FAIL: unverified viewer accepted';
  exception when others then if sqlerrm <> 'Only verified students can view reputation' then raise; end if; end;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.get_public_profile_stats((select owner_id from profile_stats_context));
    raise exception 'FAIL: anonymous reputation access';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'PASS: campus aggregate reputation, private loan isolation, empty profiles, pending/missing/anonymous rejection' as result;
rollback;
