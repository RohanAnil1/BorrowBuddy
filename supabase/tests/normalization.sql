-- Normalized tables (step 1, expand): departments, photos, mentions,
-- reactions, polls, schedules, handovers, reports, the loan copy keys and
-- the profile cascades. Real authenticated role for client paths. Rolls back.
begin;
create temp table norm_ctx(admin_id uuid, member_id uuid, owner_id uuid, borrower_id uuid,
  item_id uuid, loan_id uuid, group_id uuid, poll_id uuid, msg_id uuid);
grant select, update on norm_ctx to authenticated, anon;

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
$$;

do $$
declare
  v_admin uuid := gen_random_uuid(); v_member uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid();
  v_item uuid; v_request uuid; v_loan public.loans;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_admin, 'norm-qa-' || v_admin || '@bennett.edu.in', '{"full_name":"Norm Admin"}'),
    (v_member, 'norm-qa-' || v_member || '@bennett.edu.in', '{"full_name":"Maya Member"}'),
    (v_owner, 'norm-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Olu Owner"}'),
    (v_borrower, 'norm-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Bea Borrower"}');
  update public.profiles set verification_status = 'verified' where id in (v_admin, v_member, v_owner, v_borrower);
  update public.profiles set is_admin = true where id = v_admin;
  insert into public.items(owner_id, category_id, title, description, max_loan_days, images)
    select v_owner, id, 'Normalization QA item', 'Rollback-only fixture', 14,
      array[v_owner || '/a.jpg', v_owner || '/b.jpg']
    from public.categories order by sort_order limit 1
    returning id into v_item;
  perform pg_temp.as_user(v_borrower);
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date)
    values (v_item, v_borrower, current_date, current_date + 1) returning id into v_request;
  perform pg_temp.as_user(v_owner);
  v_loan := public.approve_request(v_request);
  insert into norm_ctx(admin_id, member_id, owner_id, borrower_id, item_id, loan_id)
    values (v_admin, v_member, v_owner, v_borrower, v_item, v_loan.id);
end;
$$;

-- 1. Departments: either column can be written, the other follows.
do $$
declare v_ctx norm_ctx; v_cs uuid;
begin
  select * into v_ctx from norm_ctx;
  select id into v_cs from public.departments where name = 'Computer Science';
  if v_cs is null then raise exception 'FAIL: departments not seeded'; end if;
  update public.profiles set department = 'computer science' where id = v_ctx.member_id;
  if (select department_id from public.profiles where id = v_ctx.member_id) is distinct from v_cs then
    raise exception 'FAIL: department text did not set department_id';
  end if;
  if (select department from public.profiles where id = v_ctx.member_id) <> 'Computer Science' then
    raise exception 'FAIL: department text not normalized to the lookup name';
  end if;
  update public.profiles set department_id = (select id from public.departments where name = 'Law')
  where id = v_ctx.member_id;
  if (select department from public.profiles where id = v_ctx.member_id) <> 'Law' then
    raise exception 'FAIL: department_id did not update the text';
  end if;
  update public.profiles set department_id = null where id = v_ctx.member_id;
  if (select department from public.profiles where id = v_ctx.member_id) is not null then
    raise exception 'FAIL: clearing department_id left the text';
  end if;
end;
$$;
set local role anon;
do $$
begin
  if (select count(*) from public.departments where is_active) < 9 then raise exception 'FAIL: anon cannot list departments'; end if;
end;
$$;
reset role;

-- 2. Photos: one row per photo, kept in order; only the owner sets them.
do $$
declare v_ctx norm_ctx;
begin
  select * into v_ctx from norm_ctx;
  if (select array_agg(path order by position) from public.item_photos where item_id = v_ctx.item_id)
     <> array[v_ctx.owner_id || '/a.jpg', v_ctx.owner_id || '/b.jpg'] then
    raise exception 'FAIL: images were not copied into item_photos in order';
  end if;
end;
$$;
select pg_temp.as_user(owner_id) from norm_ctx;
set local role authenticated;
do $$
declare v_ctx norm_ctx; v_paths text[];
begin
  select * into v_ctx from norm_ctx;
  v_paths := public.set_item_photos(v_ctx.item_id,
    array[v_ctx.owner_id || '/b.jpg', v_ctx.owner_id || '/c.jpg', v_ctx.owner_id || '/b.jpg', ' ']);
  if v_paths <> array[v_ctx.owner_id || '/b.jpg', v_ctx.owner_id || '/c.jpg'] then
    raise exception 'FAIL: set_item_photos did not trim and dedupe';
  end if;
  if (select array_agg(path order by position) from public.item_photos where item_id = v_ctx.item_id) <> v_paths then
    raise exception 'FAIL: item_photos not updated';
  end if;
  if (select images from public.items where id = v_ctx.item_id) <> v_paths then
    raise exception 'FAIL: old images column not kept in step';
  end if;
  if (select public.photo_paths(i) from public.items i where i.id = v_ctx.item_id) <> v_paths then
    raise exception 'FAIL: photo_paths does not read item_photos in order';
  end if;
  begin
    perform public.set_item_photos(v_ctx.item_id, array['someone-else/x.jpg']);
    raise exception 'FAIL: foreign photo path accepted';
  exception when others then if sqlerrm <> 'Use photos you uploaded' then raise; end if; end;
  begin
    insert into public.item_photos(item_id, position, path) values (v_ctx.item_id, 5, v_ctx.owner_id || '/z.jpg');
    raise exception 'FAIL: client wrote item_photos directly';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select pg_temp.as_user(borrower_id) from norm_ctx;
set local role authenticated;
do $$
declare v_ctx norm_ctx;
begin
  select * into v_ctx from norm_ctx;
  begin
    perform public.set_item_photos(v_ctx.item_id, '{}');
    raise exception 'FAIL: non-owner changed photos';
  exception when others then if sqlerrm <> 'Item not found' then raise; end if; end;
  if (select count(*) from public.item_photos where item_id = v_ctx.item_id) <> 2 then
    raise exception 'FAIL: photos of a visible item are not readable';
  end if;
end;
$$;
reset role;

-- Campus post photos follow the post.
do $$
declare v_ctx norm_ctx; v_post uuid;
begin
  select * into v_ctx from norm_ctx;
  insert into public.campus_posts(owner_id, kind, title, description, category_id, location, condition, images, status)
    select v_ctx.owner_id, 'giveaway', 'Norm QA lamp', 'A working desk lamp for anyone.', id, 'Block A', 'good',
      array[v_ctx.owner_id || '/p1/1.webp', v_ctx.owner_id || '/p1/2.webp'], 'open'
    from public.categories order by sort_order limit 1
    returning id into v_post;
  if (select count(*) from public.campus_post_photos where post_id = v_post) <> 2 then
    raise exception 'FAIL: campus post photos not copied';
  end if;
  delete from public.campus_posts where id = v_post;
  if exists (select 1 from public.campus_post_photos where post_id = v_post) then
    raise exception 'FAIL: campus post photos not removed with the post';
  end if;
end;
$$;

-- 3. Chat: mentions, reactions and polls in their own tables; the feed view
-- returns the same shapes as before.
select pg_temp.as_user(admin_id) from norm_ctx;
set local role authenticated;
do $$
declare v_ctx norm_ctx; v_group uuid; v_poll uuid;
begin
  select * into v_ctx from norm_ctx;
  v_group := public.admin_create_group('Normalization QA', null, 'open');
  perform public.admin_add_group_member(v_group, v_ctx.member_id);
  v_poll := public.create_poll(v_group, 'Lunch?', array['Pizza', 'Dosa', ' pizza ', 'Pizza']);
  update norm_ctx set group_id = v_group, poll_id = v_poll;
end;
$$;
reset role;

select pg_temp.as_user(member_id) from norm_ctx;
set local role authenticated;
do $$
declare v_ctx norm_ctx; v_msg uuid; v_feed public.message_feed; v_map jsonb; v_poll jsonb;
begin
  select * into v_ctx from norm_ctx;

  -- Mentions
  v_msg := public.post_message(v_ctx.group_id, 'hi @Norm', null, null, array[v_ctx.admin_id, v_ctx.member_id, v_ctx.admin_id]);
  update norm_ctx set msg_id = v_msg;
  if (select array_agg(user_id) from public.message_mentions where message_id = v_msg) <> array[v_ctx.admin_id] then
    raise exception 'FAIL: mentions not stored once, without the sender';
  end if;
  select * into v_feed from public.message_feed where id = v_msg;
  if v_feed.mentions <> array[v_ctx.admin_id] or v_feed.reactions <> '{}'::jsonb or v_feed.poll is not null then
    raise exception 'FAIL: message_feed shape for a plain message';
  end if;

  -- Reactions: on, a second emoji, off again; one row per (message, user, emoji).
  v_map := public.toggle_message_reaction(v_msg, '👍');
  v_map := public.toggle_message_reaction(v_msg, '🎉');
  if v_map <> jsonb_build_object('👍', jsonb_build_array(v_ctx.member_id::text), '🎉', jsonb_build_array(v_ctx.member_id::text)) then
    raise exception 'FAIL: reaction map shape %', v_map;
  end if;
  v_map := public.toggle_message_reaction(v_msg, '👍');
  if v_map <> jsonb_build_object('🎉', jsonb_build_array(v_ctx.member_id::text)) then raise exception 'FAIL: reaction toggle off'; end if;
  if (select reactions from public.message_feed where id = v_msg) <> v_map then raise exception 'FAIL: feed reactions'; end if;
  if (select activity_at from public.messages where id = v_msg) is null then raise exception 'FAIL: activity_at not bumped'; end if;
  begin
    insert into public.message_reactions(message_id, user_id, emoji) values (v_msg, v_ctx.member_id, '😂');
    raise exception 'FAIL: client wrote a reaction directly';
  exception when insufficient_privilege then null; end;

  -- Polls: options deduped, one vote per student, same option again takes it back.
  if (select array_agg(label order by position) from public.poll_options where poll_id = v_ctx.poll_id)
     <> array['Pizza', 'Dosa', 'pizza'] then
    raise exception 'FAIL: poll options';
  end if;
  v_poll := public.vote_poll(v_ctx.poll_id, 0);
  v_poll := public.vote_poll(v_ctx.poll_id, 1);
  if v_poll -> 'votes' <> jsonb_build_object('1', jsonb_build_array(v_ctx.member_id::text)) then
    raise exception 'FAIL: changing a vote %', v_poll;
  end if;
  if (select count(*) from public.poll_votes where poll_id = v_ctx.poll_id) <> 1 then raise exception 'FAIL: more than one vote row'; end if;
  if (select poll from public.message_feed where id = v_ctx.poll_id) <> v_poll then raise exception 'FAIL: feed poll'; end if;
  v_poll := public.vote_poll(v_ctx.poll_id, 1);
  if v_poll -> 'votes' <> '{}'::jsonb then raise exception 'FAIL: taking a vote back'; end if;
  begin perform public.vote_poll(v_ctx.poll_id, 3); raise exception 'FAIL: voted for a missing option';
  exception when others then if sqlerrm <> 'Choose one of the options' then raise; end if; end;
end;
$$;
reset role;

-- Mention notification, closing a poll, deleting a message.
do $$
declare v_ctx norm_ctx;
begin
  select * into v_ctx from norm_ctx;
  if not exists (select 1 from public.notifications where user_id = v_ctx.admin_id and payload ->> 'message_id' = v_ctx.msg_id::text) then
    raise exception 'FAIL: mention notification missing';
  end if;
end;
$$;
select pg_temp.as_user(admin_id) from norm_ctx;
set local role authenticated;
do $$
declare v_ctx norm_ctx;
begin
  select * into v_ctx from norm_ctx;
  perform public.close_poll(v_ctx.poll_id, true);
  if not ((select poll from public.message_feed where id = v_ctx.poll_id) ->> 'closed')::boolean then
    raise exception 'FAIL: poll not closed';
  end if;
  perform public.delete_message(v_ctx.msg_id);
end;
$$;
reset role;
do $$
declare v_ctx norm_ctx;
begin
  select * into v_ctx from norm_ctx;
  if exists (select 1 from public.message_reactions where message_id = v_ctx.msg_id)
     or exists (select 1 from public.message_mentions where message_id = v_ctx.msg_id) then
    raise exception 'FAIL: deleted message kept its reactions or mentions';
  end if;
end;
$$;

-- 4. Campus schedules: rows per weekday / date, view in the old shape.
do $$
declare v_ctx norm_ctx; v_view public.campus_schedule_view;
begin
  select * into v_ctx from norm_ctx;
  insert into public.campus_schedules(host_id, pickup_location_id, slot_minutes, weekly, exceptions)
  values (v_ctx.owner_id, (select id from public.pickup_locations order by name limit 1), 30,
    '[{"day":1,"start":"09:00","end":"11:00"},{"day":3,"start":"14:00","end":"15:30"}]',
    '[{"date":"2030-01-07","blocked":true},{"date":"2030-01-09","start":"10:00","end":"12:00","blocked":false}]');
  if (select count(*) from public.campus_schedule_windows where host_id = v_ctx.owner_id) <> 2
     or (select count(*) from public.campus_schedule_exceptions where host_id = v_ctx.owner_id) <> 2 then
    raise exception 'FAIL: schedule rows';
  end if;
  select * into v_view from public.campus_schedule_view where host_id = v_ctx.owner_id;
  if v_view.weekly <> '[{"day":1,"start":"09:00","end":"11:00"},{"day":3,"start":"14:00","end":"15:30"}]'::jsonb then
    raise exception 'FAIL: weekly view shape %', v_view.weekly;
  end if;
  if v_view.exceptions <> '[{"date":"2030-01-07","blocked":true},{"date":"2030-01-09","start":"10:00","end":"12:00","blocked":false}]'::jsonb then
    raise exception 'FAIL: exceptions view shape %', v_view.exceptions;
  end if;
  begin
    insert into public.campus_schedule_windows(host_id, weekday, starts, ends) values (v_ctx.owner_id, 5, '12:00', '11:00');
    raise exception 'FAIL: window ending before it starts';
  exception when check_violation then null; end;
end;
$$;

-- 5. Handovers: one row per loan and kind.
select pg_temp.as_user(borrower_id) from norm_ctx;
do $$
declare v_ctx norm_ctx; v_code text;
begin
  select * into v_ctx from norm_ctx;
  v_code := public.generate_handover_token(v_ctx.loan_id, 'pickup');
  if not exists (select 1 from public.loan_handovers where loan_id = v_ctx.loan_id and kind = 'pickup' and expires_at > now() and attempts = 0) then
    raise exception 'FAIL: loan_handovers row not written';
  end if;
  if (select handover_token_expires_at from public.loans where id = v_ctx.loan_id)
     is distinct from (select expires_at from public.loan_handovers where loan_id = v_ctx.loan_id and kind = 'pickup') then
    raise exception 'FAIL: old expiry column not kept in step';
  end if;
  perform pg_temp.as_user(v_ctx.owner_id);
  if (public.confirm_handover_v2(v_ctx.loan_id, v_code, 'pickup') ->> 'status') <> 'active' then
    raise exception 'FAIL: pickup with the new tables';
  end if;
  if (select confirmed_at from public.loan_handovers where loan_id = v_ctx.loan_id and kind = 'pickup') is null then
    raise exception 'FAIL: confirmed_at not recorded';
  end if;
end;
$$;

-- 6. Reports: exactly one real target; target / target_id derived.
do $$
declare v_ctx norm_ctx; v_report public.reports;
begin
  select * into v_ctx from norm_ctx;
  insert into public.reports(reporter_id, reported_item_id, reason)
    values (v_ctx.member_id, v_ctx.item_id, 'Looks broken in photos') returning * into v_report;
  if v_report.target <> 'item' or v_report.target_id <> v_ctx.item_id then raise exception 'FAIL: derived target'; end if;
  begin
    insert into public.reports(reporter_id, reported_item_id, reported_user_id, reason)
      values (v_ctx.member_id, v_ctx.item_id, v_ctx.owner_id, 'Two targets at once');
    raise exception 'FAIL: report with two targets';
  exception when check_violation then null; end;
  begin
    insert into public.reports(reporter_id, reported_user_id, reason)
      values (v_ctx.member_id, gen_random_uuid(), 'Nobody at all');
    raise exception 'FAIL: report about a missing user';
  exception when foreign_key_violation then null; end;
end;
$$;

-- 7. Loans can't disagree with their request or item.
do $$
declare v_ctx norm_ctx; v_loan public.loans;
begin
  select * into v_ctx from norm_ctx;
  select * into v_loan from public.loans where id = v_ctx.loan_id;
  begin
    update public.loans set owner_id = v_ctx.member_id where id = v_loan.id;
    raise exception 'FAIL: loan owner differs from the item owner';
  exception when foreign_key_violation then null; end;
  begin
    update public.loans set start_date = start_date + 1 where id = v_loan.id;
    raise exception 'FAIL: loan start differs from the request';
  exception when foreign_key_violation then null; end;
  update public.borrow_requests set start_date = start_date - 1 where id = v_loan.request_id;
  if (select start_date from public.loans where id = v_loan.id) <> v_loan.start_date - 1 then
    raise exception 'FAIL: request date change did not flow to the loan';
  end if;
end;
$$;

-- 8. Deleting a profile removes their saved items (FK now on profiles).
do $$
declare v_ctx norm_ctx;
begin
  select * into v_ctx from norm_ctx;
  insert into public.wishlist_items(user_id, item_id) values (v_ctx.member_id, v_ctx.item_id);
  delete from public.profiles where id = v_ctx.member_id;
  if exists (select 1 from public.wishlist_items where user_id = v_ctx.member_id) then
    raise exception 'FAIL: saved items outlived the profile';
  end if;
end;
$$;

select 'PASS: normalized tables, sync with old columns, feed and schedule views, keys and cascades' as result;
rollback;
