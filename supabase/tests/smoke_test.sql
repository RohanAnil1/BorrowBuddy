-- ===========================================================================
-- BorrowBuddy smoke test
-- Runs the full core loop against a migrated database and asserts the rules.
-- Everything happens inside a transaction that is rolled back at the end.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke_test.sql
-- ===========================================================================

begin;

create or replace function pg_temp.assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if cond is null or cond = false then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice 'PASS: %', msg;
end;
$$;

create temp table bb_test_kv (key text primary key, value text);
grant all on bb_test_kv to public;

-- ---------------------------------------------------------------------------
-- 1. Signup trigger creates profiles
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'owner@bu.ac.in',     '{"full_name":"Owner One"}'),
  ('22222222-2222-4222-8222-222222222222', 'borrower@bu.ac.in',  '{"full_name":"Borrower Two"}'),
  ('33333333-3333-4333-8333-333333333333', 'borrower2@bu.ac.in', '{"full_name":"Borrower Three"}'),
  ('44444444-4444-4444-8444-444444444444', 'admin@bu.ac.in',     '{"full_name":"Admin Four"}');

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.profiles
  where id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  );
  perform pg_temp.assert(v_count = 4, 'signup trigger creates a profile per user');
  perform pg_temp.assert(
    (select full_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Owner One',
    'signup trigger copies the full name'
  );
  perform pg_temp.assert(
    (select verification_status from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'pending',
    'new profiles start as pending'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Admin verifies students
-- ---------------------------------------------------------------------------
update public.profiles set is_admin = true
where id = '44444444-4444-4444-8444-444444444444';

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444"}', true);

do $$
begin
  perform public.admin_set_verification('11111111-1111-4111-8111-111111111111', 'verified');
  perform public.admin_set_verification('22222222-2222-4222-8222-222222222222', 'verified');
  perform public.admin_set_verification('33333333-3333-4333-8333-333333333333', 'verified');

  perform pg_temp.assert(
    (select verification_status from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'verified',
    'admin can verify students'
  );
  perform pg_temp.assert(
    (select count(*) from public.notifications
     where user_id = '11111111-1111-4111-8111-111111111111' and type = 'verification_approved') = 1,
    'verification sends a notification'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Owner lists an item
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);

insert into public.items (owner_id, category_id, title, description, images, max_loan_days)
select
  '11111111-1111-4111-8111-111111111111',
  c.id,
  'Sony Projector',
  'Portable projector with HDMI cable and remote.',
  array['11111111-1111-4111-8111-111111111111/projector.jpg'],
  14
from public.categories c
where c.slug = 'electronics';

-- ---------------------------------------------------------------------------
-- 4. Borrower requests; self-borrowing is rejected
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}', true);

insert into public.borrow_requests (item_id, borrower_id, start_date, end_date, message)
select i.id, '22222222-2222-4222-8222-222222222222', current_date + 2, current_date + 4,
       'Need it for a club event'
from public.items i
where i.title = 'Sony Projector';

do $$
begin
  begin
    insert into public.borrow_requests (item_id, borrower_id, start_date, end_date)
    select i.id, '11111111-1111-4111-8111-111111111111', current_date + 2, current_date + 3
    from public.items i
    where i.title = 'Sony Projector';
    raise exception 'FAIL: self-borrowing was allowed';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.assert(sqlerrm = 'You cannot borrow your own item', 'self-borrowing is rejected');
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Owner approves -> loan + conversation
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);

do $$
declare
  v_req_id uuid;
  v_loan public.loans;
  v_conv uuid;
begin
  select r.id into v_req_id
  from public.borrow_requests r
  where r.borrower_id = '22222222-2222-4222-8222-222222222222' and r.status = 'pending';

  v_loan := public.approve_request(v_req_id);

  perform pg_temp.assert(v_loan.status = 'awaiting_pickup', 'approval creates an awaiting_pickup loan');
  perform pg_temp.assert(v_loan.due_date = current_date + 4, 'loan keeps the requested dates');

  select c.id into v_conv from public.conversations c where c.loan_id = v_loan.id;
  perform pg_temp.assert(v_conv is not null, 'approval creates a private conversation');
  perform pg_temp.assert(
    (select count(*) from public.conversation_members where conversation_id = v_conv) = 2,
    'conversation includes both parties'
  );
  perform pg_temp.assert(
    (select count(*) from public.notifications
     where user_id = '22222222-2222-4222-8222-222222222222' and type = 'request_approved') = 1,
    'borrower is notified of approval'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Double-booking is impossible
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333"}', true);

insert into public.borrow_requests (item_id, borrower_id, start_date, end_date)
select i.id, '33333333-3333-4333-8333-333333333333', current_date + 3, current_date + 5
from public.items i
where i.title = 'Sony Projector';

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);

do $$
begin
  begin
    perform public.approve_request(r.id)
    from public.borrow_requests r
    where r.borrower_id = '33333333-3333-4333-8333-333333333333' and r.status = 'pending';
    raise exception 'FAIL: double-booking was allowed';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.assert(
        sqlerrm like 'Those dates are no longer available%',
        'double-booking blocked by the exclusion constraint'
      );
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Borrower can cancel a pending request
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333"}', true);

do $$
declare
  v_req_id uuid;
begin
  select id into v_req_id
  from public.borrow_requests
  where borrower_id = '33333333-3333-4333-8333-333333333333' and status = 'pending';

  perform public.cancel_request(v_req_id);

  perform pg_temp.assert(
    (select status from public.borrow_requests where id = v_req_id) = 'cancelled',
    'borrower can cancel a pending request'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Handover: pickup (borrower shows code, owner confirms)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}', true);

do $$
declare
  v_id uuid;
  v_code text;
begin
  select id into v_id from public.loans
  where borrower_id = '22222222-2222-4222-8222-222222222222' and status = 'awaiting_pickup';

  v_code := public.generate_handover_token(v_id, 'pickup');
  perform pg_temp.assert(v_code ~ '^[0-9]{6}$', 'pickup token is a 6-digit code');

  insert into bb_test_kv (key, value) values ('pickup_code', v_code);

  begin
    perform public.confirm_handover(v_id, v_code, 'pickup');
    raise exception 'FAIL: borrower was allowed to confirm their own pickup';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.assert(sqlerrm = 'Only the owner can confirm the pickup', 'only the owner can confirm pickup');
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);

do $$
declare
  v_id uuid;
  v_code text;
  v_loan public.loans;
begin
  select id into v_id from public.loans
  where borrower_id = '22222222-2222-4222-8222-222222222222' and status = 'awaiting_pickup';

  begin
    perform public.confirm_handover(v_id, '000000', 'pickup');
    raise exception 'FAIL: wrong pickup code was accepted';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.assert(sqlerrm = 'Incorrect code', 'wrong pickup code is rejected');
  end;

  select value into v_code from bb_test_kv where key = 'pickup_code';
  v_loan := public.confirm_handover(v_id, v_code, 'pickup');
  perform pg_temp.assert(v_loan.status = 'active', 'correct pickup code activates the loan');
  perform pg_temp.assert(v_loan.pickup_confirmed_at is not null, 'pickup timestamp recorded');
  perform pg_temp.assert(v_loan.handover_token_hash is null, 'pickup token is single-use');
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Waitlist is notified when the item frees up
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333"}', true);

insert into public.waitlist_entries (item_id, user_id, desired_start, desired_end)
select i.id, '33333333-3333-4333-8333-333333333333', current_date + 5, current_date + 6
from public.items i
where i.title = 'Sony Projector';

-- ---------------------------------------------------------------------------
-- 10. Handover: return (owner shows code, borrower confirms)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);

do $$
declare
  v_id uuid;
  v_code text;
begin
  select id into v_id from public.loans
  where borrower_id = '22222222-2222-4222-8222-222222222222' and status = 'active';

  v_code := public.generate_handover_token(v_id, 'return');
  insert into bb_test_kv (key, value) values ('return_code', v_code);
end;
$$;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}', true);

do $$
declare
  v_id uuid;
  v_code text;
  v_loan public.loans;
begin
  select id into v_id from public.loans
  where borrower_id = '22222222-2222-4222-8222-222222222222' and status = 'active';
  select value into v_code from bb_test_kv where key = 'return_code';

  v_loan := public.confirm_handover(v_id, v_code, 'return');
  perform pg_temp.assert(v_loan.status = 'returned', 'correct return code completes the loan');
  perform pg_temp.assert(v_loan.returned_at is not null, 'return timestamp recorded');

  perform pg_temp.assert(
    (select count(*) from public.notifications
     where user_id = '11111111-1111-4111-8111-111111111111' and type = 'loan_returned') = 1,
    'owner is notified of the return'
  );
  perform pg_temp.assert(
    (select status from public.waitlist_entries
     where user_id = '33333333-3333-4333-8333-333333333333') = 'notified',
    'waitlisted student is notified when dates free up'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Review -> trust score recomputed
-- ---------------------------------------------------------------------------
do $$
declare
  v_before numeric;
  v_after numeric;
  v_role public.review_role;
begin
  select trust_score into v_before from public.profiles
  where id = '11111111-1111-4111-8111-111111111111';

  insert into public.reviews (loan_id, reviewer_id, reviewee_id, rating, comment)
  select l.id, '22222222-2222-4222-8222-222222222222',
         '11111111-1111-4111-8111-111111111111', 5, 'Great projector, smooth pickup'
  from public.loans l
  where l.borrower_id = '22222222-2222-4222-8222-222222222222' and l.status = 'returned';

  select trust_score into v_after from public.profiles
  where id = '11111111-1111-4111-8111-111111111111';
  select role into v_role from public.reviews
  where reviewer_id = '22222222-2222-4222-8222-222222222222';

  perform pg_temp.assert(v_role = 'as_borrower', 'review role is derived automatically');
  perform pg_temp.assert(v_after > v_before, 'a 5-star review raises the trust score');
end;
$$;

do $$
begin
  begin
    insert into public.reviews (loan_id, reviewer_id, reviewee_id, rating)
    select l.id, '22222222-2222-4222-8222-222222222222',
           '11111111-1111-4111-8111-111111111111', 4
    from public.loans l
    where l.borrower_id = '22222222-2222-4222-8222-222222222222' and l.status = 'returned';
    raise exception 'FAIL: duplicate review was allowed';
  exception
    when unique_violation then
      perform pg_temp.assert(true, 'one review per party per loan');
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      raise;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Overdue scan creates a capped fine
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333"}', true);

insert into public.borrow_requests (item_id, borrower_id, start_date, end_date)
select i.id, '33333333-3333-4333-8333-333333333333', current_date + 10, current_date + 12
from public.items i
where i.title = 'Sony Projector';

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);

do $$
begin
  perform public.approve_request(r.id)
  from public.borrow_requests r
  where r.borrower_id = '33333333-3333-4333-8333-333333333333' and r.status = 'pending';
end;
$$;

-- backdate the loan and activate it, then run the overdue job
update public.loans
set start_date = current_date - 5, due_date = current_date - 3
where borrower_id = '33333333-3333-4333-8333-333333333333' and status = 'awaiting_pickup';

update public.loans
set status = 'active'
where borrower_id = '33333333-3333-4333-8333-333333333333' and status = 'awaiting_pickup';

select public.flag_overdue_loans();

do $$
declare
  v_fine public.fines;
  v_status public.loan_status;
begin
  select status into v_status from public.loans
  where borrower_id = '33333333-3333-4333-8333-333333333333' and due_date = current_date - 3;
  perform pg_temp.assert(v_status = 'overdue', 'overdue scan flips the loan status');

  select * into v_fine from public.fines
  where user_id = '33333333-3333-4333-8333-333333333333' and source = 'overdue';
  perform pg_temp.assert(v_fine.id is not null, 'overdue scan creates a fine');
  perform pg_temp.assert(v_fine.amount = 60, 'fine is INR 20 per day overdue (3 days = 60)');
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. RLS & protected fields
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}', true);

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.notifications
     where user_id = '11111111-1111-4111-8111-111111111111') = 0,
    'RLS: notifications are private to the recipient'
  );

  begin
    insert into public.items (owner_id, category_id, title, description, images)
    select '11111111-1111-4111-8111-111111111111', c.id, 'Sneaky item', 'not mine', array['x.jpg']
    from public.categories c
    where c.slug = 'other';
    raise exception 'FAIL: RLS allowed inserting an item for another user';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.assert(true, 'RLS: cannot insert items for another user');
  end;

  begin
    update public.profiles
    set trust_score = 100
    where id = '22222222-2222-4222-8222-222222222222';
    raise exception 'FAIL: trust_score was self-modifiable';
  exception
    when insufficient_privilege then
      perform pg_temp.assert(true, 'column privileges protect trust_score');
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      raise;
  end;

  begin
    update public.profiles
    set student_id_path = '22222222-2222-4222-8222-222222222222/new-id.jpg'
    where id = '22222222-2222-4222-8222-222222222222';
    raise exception 'FAIL: verified student ID was replaceable';
  exception
    when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.assert(
        sqlerrm like 'Your student ID is locked%',
        'verified student ID is locked'
      );
  end;
end;
$$;

reset role;

rollback;
