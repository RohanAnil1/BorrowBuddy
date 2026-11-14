-- Announcement-only groups, @mentions, pins, muting, photos, polls and the
-- typing channel's Realtime authorization. Rolls back.
begin;
create temp table feature_ctx(admin_id uuid, member_id uuid, other_id uuid, pending_id uuid, owner_id uuid, borrower_id uuid,
  open_id uuid, news_id uuid, private_id uuid, loan_chat uuid, admin_msg uuid, news_msg uuid, poll_id uuid, loan_msg uuid);
grant select, update on feature_ctx to authenticated, anon;
grant usage on schema storage to authenticated;
grant select on storage.objects to authenticated;

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
$$;

do $$
declare
  v_admin uuid := gen_random_uuid(); v_member uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid(); v_owner uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid();
  v_item uuid; v_request uuid; v_loan public.loans;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_admin, 'feat-qa-' || v_admin || '@bennett.edu.in', '{"full_name":"Feature Admin"}'),
    (v_member, 'feat-qa-' || v_member || '@bennett.edu.in', '{"full_name":"Meera Member"}'),
    (v_other, 'feat-qa-' || v_other || '@bennett.edu.in', '{"full_name":"Omar Other"}'),
    (v_pending, 'feat-qa-' || v_pending || '@bennett.edu.in', '{"full_name":"Pending Person"}'),
    (v_owner, 'feat-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Owen Owner"}'),
    (v_borrower, 'feat-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Bina Borrower"}');
  update public.profiles set verification_status = 'verified' where id in (v_admin, v_member, v_other, v_owner, v_borrower);
  update public.profiles set is_admin = true where id = v_admin;
  insert into public.items(owner_id, category_id, title, description, max_loan_days)
    select v_owner, id, 'Feature QA fixture', 'Rollback-only fixture', 14 from public.categories order by sort_order limit 1
    returning id into v_item;
  perform pg_temp.as_user(v_borrower);
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date)
    values (v_item, v_borrower, current_date, current_date + 1) returning id into v_request;
  perform pg_temp.as_user(v_owner);
  v_loan := public.approve_request(v_request);
  insert into feature_ctx(admin_id, member_id, other_id, pending_id, owner_id, borrower_id, loan_chat)
    select v_admin, v_member, v_other, v_pending, v_owner, v_borrower, id from public.conversations where loan_id = v_loan.id;
end;
$$;

-- 1. Admin settings; older 3- and 5-argument calls still work.
select pg_temp.as_user(admin_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx; v_open uuid; v_news uuid; v_private uuid; v_msg uuid; v_news_msg uuid;
begin
  select * into v_ctx from feature_ctx;
  v_open := public.admin_create_group('Feature open', 'Public group', 'open');
  v_news := public.admin_create_group('Feature news', null, 'open', 'admins');
  v_private := public.admin_create_group('Feature private', null, 'invite');
  if (select posting from public.conversations where id = v_open) <> 'everyone' then raise exception 'FAIL: default posting'; end if;
  if (select posting from public.conversations where id = v_news) <> 'admins' then raise exception 'FAIL: announcement posting'; end if;
  perform public.admin_update_group(v_news, 'Feature news', 'Announcements', 'open', false);
  if (select posting from public.conversations where id = v_news) <> 'admins' then raise exception 'FAIL: 5-argument update reset posting'; end if;
  begin perform public.admin_update_group(v_news, 'Feature news', null, 'open', false, 'nobody'); raise exception 'FAIL: bad posting';
  exception when others then if sqlerrm <> 'Choose who can post' then raise; end if; end;
  if (select posting from public.admin_list_groups() where id = v_news) <> 'admins' then raise exception 'FAIL: admin list posting'; end if;
  perform public.admin_add_group_member(v_private, v_ctx.member_id);
  perform public.admin_add_group_member(v_news, v_ctx.member_id);
  perform public.admin_add_group_member(v_open, v_ctx.member_id);
  -- Mentions: the sender, duplicates and non-members never get a notification.
  insert into public.messages(conversation_id, sender_id, body, mentions)
    values (v_open, v_ctx.admin_id, '@Meera @Omar hello', array[v_ctx.member_id, v_ctx.member_id, v_ctx.other_id, v_ctx.admin_id])
    returning id into v_msg;
  if (select mentions from public.messages where id = v_msg) @> array[v_ctx.admin_id] then raise exception 'FAIL: sender kept in mentions'; end if;
  if (select cardinality(mentions) from public.messages where id = v_msg) <> 2 then raise exception 'FAIL: mentions not de-duplicated'; end if;
  insert into public.messages(conversation_id, sender_id, body) values (v_news, v_ctx.admin_id, 'Exam schedule is up') returning id into v_news_msg;
  update feature_ctx set open_id = v_open, news_id = v_news, private_id = v_private, admin_msg = v_msg, news_msg = v_news_msg;
end;
$$;
reset role;

do $$
declare v_ctx feature_ctx;
begin
  select * into v_ctx from feature_ctx;
  if (select count(*) from public.notifications where user_id = v_ctx.member_id and title = 'Mentioned in Feature open'
      and payload ->> 'message_id' = v_ctx.admin_msg::text) <> 1 then raise exception 'FAIL: member mention notification'; end if;
  if exists (select 1 from public.notifications where user_id in (v_ctx.other_id, v_ctx.admin_id) and title like 'Mentioned in%') then
    raise exception 'FAIL: non-member or sender notified'; end if;
end;
$$;

-- 2. Announcement-only: members react and read but can't post or type.
select pg_temp.as_user(member_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx; v_row record;
begin
  select * into v_ctx from feature_ctx;
  begin insert into public.messages(conversation_id, sender_id, body) values (v_ctx.news_id, v_ctx.member_id, 'not allowed');
    raise exception 'FAIL: member posted in an announcement group';
  exception when insufficient_privilege then null; end;
  perform public.toggle_message_reaction(v_ctx.news_msg, '👍');
  select * into v_row from public.get_chat_inbox() where conversation_id = v_ctx.news_id;
  if v_row.posting <> 'admins' or v_row.muted then raise exception 'FAIL: inbox posting/muted (%)', v_row; end if;

  -- Typing: listen where you can read, send only where you can post.
  perform set_config('realtime.topic', 'typing:' || v_ctx.open_id, true);
  insert into realtime.messages(topic, extension, event, payload) values ('typing:' || v_ctx.open_id, 'broadcast', 'typing', '{}');
  if not exists (select 1 from realtime.messages) then raise exception 'FAIL: member cannot listen to typing'; end if;
  perform set_config('realtime.topic', 'typing:' || v_ctx.news_id, true);
  begin insert into realtime.messages(topic, extension, event, payload) values ('typing:' || v_ctx.news_id, 'broadcast', 'typing', '{}');
    raise exception 'FAIL: typing sent in an announcement group';
  exception when insufficient_privilege then null; end;
  perform set_config('realtime.topic', 'typing:not-a-chat', true);
  begin insert into realtime.messages(topic, extension, event, payload) values ('typing:not-a-chat', 'broadcast', 'typing', '{}');
    raise exception 'FAIL: malformed topic accepted';
  exception when insufficient_privilege then null; end;

  -- Mute: no unread count, then unmute.
  perform public.set_conversation_muted(v_ctx.open_id, true);
  select * into v_row from public.get_chat_inbox() where conversation_id = v_ctx.open_id;
  if not v_row.muted or v_row.unread_count <> 0 then raise exception 'FAIL: muted inbox row (%)', v_row; end if;
  begin perform public.set_conversation_muted(v_ctx.loan_chat, true); raise exception 'FAIL: muted a chat you are not in';
  exception when others then if sqlerrm <> 'You are not a member of this conversation' then raise; end if; end;

  -- Pins: only admins pin in groups.
  begin perform public.pin_message(v_ctx.admin_msg, true); raise exception 'FAIL: member pinned in a group';
  exception when others then if sqlerrm <> 'Only admins can pin messages in groups' then raise; end if; end;

  -- Students can't forge pins or polls.
  begin insert into public.messages(conversation_id, sender_id, body, poll) values (v_ctx.open_id, v_ctx.member_id, 'x', '{"question":"x"}');
    raise exception 'FAIL: inserted a poll directly';
  exception when insufficient_privilege then null; end;
  begin insert into public.messages(conversation_id, sender_id, body, pinned_at) values (v_ctx.open_id, v_ctx.member_id, 'x', now());
    raise exception 'FAIL: inserted a pin directly';
  exception when insufficient_privilege then null; end;
  begin perform public.create_poll(v_ctx.open_id, 'Mine?', array['a', 'b']); raise exception 'FAIL: student created a poll';
  exception when others then if sqlerrm <> 'Only admins can create polls' then raise; end if; end;

  -- Photos: only your own uploads.
  begin insert into public.messages(conversation_id, sender_id, body, image_path) values (v_ctx.open_id, v_ctx.member_id, '', v_ctx.admin_id || '/x.jpg');
    raise exception 'FAIL: attached someone else''s photo';
  exception when others then if sqlerrm <> 'Attach a photo you uploaded' then raise; end if; end;
  insert into public.messages(conversation_id, sender_id, body, image_path) values (v_ctx.open_id, v_ctx.member_id, '', v_ctx.member_id || '/' || v_ctx.open_id || '/a.jpg');
end;
$$;
reset role;

-- A muted member isn't notified of mentions.
select pg_temp.as_user(admin_id) from feature_ctx;
set local role authenticated;
insert into public.messages(conversation_id, sender_id, body, mentions) select open_id, admin_id, 'muted ping', array[member_id] from feature_ctx;
reset role;
do $$ begin
  if exists (select 1 from public.notifications n join feature_ctx c on n.user_id = c.member_id where n.body like '%muted ping%') then
    raise exception 'FAIL: muted member notified'; end if;
end $$;

-- 3. Photo access: the uploader, and students who can read the message.
insert into storage.objects(bucket_id, name, owner)
  select 'chat-images', member_id || '/' || open_id || '/a.jpg', member_id from feature_ctx
  union all select 'chat-images', member_id || '/' || open_id || '/unsent.jpg', member_id from feature_ctx
  union all select 'chat-images', member_id || '/' || private_id || '/p.jpg', member_id from feature_ctx;
insert into public.messages(conversation_id, sender_id, body, image_path)
  select private_id, member_id, '', member_id || '/' || private_id || '/p.jpg' from feature_ctx;
insert into realtime.messages(topic, extension, event, payload)
  select 'typing:' || private_id, 'broadcast', 'typing', '{}' from feature_ctx;
select pg_temp.as_user(other_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx;
begin
  select * into v_ctx from feature_ctx;
  if not exists (select 1 from storage.objects where bucket_id = 'chat-images' and name like '%/a.jpg') then raise exception 'FAIL: public group photo hidden'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'chat-images' and name like '%/unsent.jpg') then raise exception 'FAIL: unsent photo readable'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'chat-images' and name like '%/p.jpg') then raise exception 'FAIL: private group photo readable'; end if;
  -- Typing: can't listen to a private group you aren't in.
  perform set_config('realtime.topic', 'typing:' || v_ctx.private_id, true);
  if exists (select 1 from realtime.messages) then raise exception 'FAIL: listened to a private group'; end if;
end;
$$;
reset role;

-- 4. Polls and pins as an admin.
select pg_temp.as_user(admin_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx; v_poll uuid; v_row public.messages;
begin
  select * into v_ctx from feature_ctx;
  v_poll := public.create_poll(v_ctx.news_id, '  Movie night?  ', array['Friday', ' Friday ', 'Saturday', '', null]);
  select * into v_row from public.messages where id = v_poll;
  if v_row.body <> 'Movie night?' or v_row.poll -> 'options' <> '["Friday", "Saturday"]'::jsonb then raise exception 'FAIL: poll shape (%)', v_row.poll; end if;
  begin perform public.create_poll(v_ctx.news_id, 'One?', array['only']); raise exception 'FAIL: one-option poll';
  exception when others then if sqlerrm <> 'Give 2 to 10 different options' then raise; end if; end;
  begin perform public.create_poll(v_ctx.loan_chat, 'Loan?', array['a', 'b']); raise exception 'FAIL: poll in a loan chat';
  exception when others then if sqlerrm <> 'Polls are for groups' then raise; end if; end;
  perform public.pin_message(v_ctx.news_msg, true);
  if (select pinned_by from public.messages where id = v_ctx.news_msg) <> v_ctx.admin_id then raise exception 'FAIL: admin pin'; end if;
  if (select pinned_count from public.admin_list_groups() where id = v_ctx.news_id) <> 1 then raise exception 'FAIL: pinned count'; end if;
  update feature_ctx set poll_id = v_poll;
end;
$$;
reset role;

select pg_temp.as_user(member_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx; v_poll jsonb;
begin
  select * into v_ctx from feature_ctx;
  v_poll := public.vote_poll(v_ctx.poll_id, 0);
  if v_poll -> 'votes' <> jsonb_build_object('0', jsonb_build_array(v_ctx.member_id::text)) then raise exception 'FAIL: first vote (%)', v_poll; end if;
  v_poll := public.vote_poll(v_ctx.poll_id, 1);
  if v_poll -> 'votes' <> jsonb_build_object('1', jsonb_build_array(v_ctx.member_id::text)) then raise exception 'FAIL: changed vote (%)', v_poll; end if;
  v_poll := public.vote_poll(v_ctx.poll_id, 1);
  if v_poll -> 'votes' <> '{}'::jsonb then raise exception 'FAIL: retracted vote (%)', v_poll; end if;
  begin perform public.vote_poll(v_ctx.poll_id, 5); raise exception 'FAIL: out-of-range vote';
  exception when others then if sqlerrm <> 'Choose one of the options' then raise; end if; end;
  perform public.vote_poll(v_ctx.poll_id, 0);
  begin perform public.close_poll(v_ctx.poll_id, true); raise exception 'FAIL: member closed a poll';
  exception when others then if sqlerrm <> 'Only the poll’s author or an admin can close it' then raise; end if; end;
end;
$$;
reset role;

select pg_temp.as_user(other_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx;
begin
  select * into v_ctx from feature_ctx;
  begin perform public.vote_poll(v_ctx.poll_id, 0); raise exception 'FAIL: non-member voted';
  exception when others then if sqlerrm <> 'Join this group to vote' then raise; end if; end;
end;
$$;
reset role;

select pg_temp.as_user(admin_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx;
begin
  select * into v_ctx from feature_ctx;
  perform public.close_poll(v_ctx.poll_id, true);
end;
$$;
reset role;
select pg_temp.as_user(member_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx;
begin
  select * into v_ctx from feature_ctx;
  begin perform public.vote_poll(v_ctx.poll_id, 1); raise exception 'FAIL: voted on a closed poll';
  exception when others then if sqlerrm <> 'This poll is closed' then raise; end if; end;
  if (select jsonb_array_length(poll -> 'votes' -> '0') from public.messages where id = v_ctx.poll_id) <> 1 then raise exception 'FAIL: votes kept after close'; end if;
end;
$$;
reset role;

-- 5. Loan chats: either student pins; outsiders can't; deleting unpins.
select pg_temp.as_user(borrower_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx; v_msg uuid;
begin
  select * into v_ctx from feature_ctx;
  insert into public.messages(conversation_id, sender_id, body) values (v_ctx.loan_chat, v_ctx.borrower_id, 'Pickup at gate 2') returning id into v_msg;
  perform public.pin_message(v_msg, true);
  update feature_ctx set loan_msg = v_msg;
end;
$$;
reset role;
select pg_temp.as_user(other_id) from feature_ctx;
set local role authenticated;
do $$
begin
  begin perform public.pin_message((select loan_msg from feature_ctx), false); raise exception 'FAIL: outsider unpinned';
  exception when others then if sqlerrm <> 'You are not a member of this conversation' then raise; end if; end;
end;
$$;
reset role;
select pg_temp.as_user(owner_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx;
begin
  select * into v_ctx from feature_ctx;
  perform public.pin_message(v_ctx.loan_msg, false);
  if (select pinned_at from public.messages where id = v_ctx.loan_msg) is not null then raise exception 'FAIL: owner unpin'; end if;
  perform public.pin_message(v_ctx.loan_msg, true);
end;
$$;
reset role;
select pg_temp.as_user(borrower_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx;
begin
  select * into v_ctx from feature_ctx;
  perform public.delete_message(v_ctx.loan_msg);
  if (select pinned_at from public.messages where id = v_ctx.loan_msg) is not null then raise exception 'FAIL: deleted message still pinned'; end if;
end;
$$;
reset role;

-- 6. Unverified and anonymous callers.
select pg_temp.as_user(pending_id) from feature_ctx;
set local role authenticated;
do $$
declare v_ctx feature_ctx;
begin
  select * into v_ctx from feature_ctx;
  perform set_config('realtime.topic', 'typing:' || v_ctx.open_id, true);
  if exists (select 1 from realtime.messages) then raise exception 'FAIL: unverified student listened to typing'; end if;
  begin perform public.vote_poll(v_ctx.poll_id, 0); raise exception 'FAIL: unverified vote';
  exception when others then if sqlerrm not in ('Join this group to vote', 'This poll is closed') then raise; end if; end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin perform public.pin_message(gen_random_uuid(), true); raise exception 'FAIL: anonymous pin';
  exception when insufficient_privilege then null; end;
  begin perform public.create_poll(gen_random_uuid(), 'q', array['a', 'b']); raise exception 'FAIL: anonymous poll';
  exception when insufficient_privilege then null; end;
  begin perform public.set_conversation_muted(gen_random_uuid(), true); raise exception 'FAIL: anonymous mute';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

select 'PASS: announcement-only posting, mentions (deduped, members only, muted skipped), mute, pins, polls, photo access and typing channel authorization' as result;
rollback;
