-- Group chats and message features: admin-only management, open vs invite-only
-- access, archive, verified-only reading/posting, replies, reactions, edits,
-- deletes, unread counts, search and anonymous denial. Rolls back.
begin;
create temp table group_test_context(admin_id uuid, member_id uuid, other_id uuid, pending_id uuid,
  owner_id uuid, borrower_id uuid, open_id uuid, invite_id uuid, private_id uuid,
  admin_msg uuid, private_msg uuid);
grant select, update on group_test_context to authenticated, anon;

-- Signs in as the given user for the rest of the transaction (or until reset).
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated, anon;

do $$
declare
  v_admin uuid := gen_random_uuid(); v_member uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid(); v_owner uuid := gen_random_uuid(); v_borrower uuid := gen_random_uuid();
  v_item uuid; v_request uuid; v_loan public.loans; v_private uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_admin, 'group-qa-' || v_admin || '@bennett.edu.in', '{"full_name":"Group QA admin"}'),
    (v_member, 'group-qa-' || v_member || '@bennett.edu.in', '{"full_name":"Group QA member"}'),
    (v_other, 'group-qa-' || v_other || '@bennett.edu.in', '{"full_name":"Group QA other"}'),
    (v_pending, 'group-qa-' || v_pending || '@bennett.edu.in', '{"full_name":"Group QA pending"}'),
    (v_owner, 'group-qa-' || v_owner || '@bennett.edu.in', '{"full_name":"Group QA owner"}'),
    (v_borrower, 'group-qa-' || v_borrower || '@bennett.edu.in', '{"full_name":"Group QA borrower"}');
  update public.profiles set verification_status = 'verified' where id in (v_admin, v_member, v_other, v_owner, v_borrower);
  update public.profiles set is_admin = true where id = v_admin;

  insert into public.items(owner_id, category_id, title, description, max_loan_days)
    select v_owner, id, 'Group QA fixture', 'Rollback-only fixture', 14 from public.categories order by sort_order limit 1
    returning id into v_item;
  perform pg_temp.as_user(v_borrower);
  insert into public.borrow_requests(item_id, borrower_id, start_date, end_date)
    values (v_item, v_borrower, current_date, current_date + 1) returning id into v_request;
  perform pg_temp.as_user(v_owner);
  v_loan := public.approve_request(v_request);
  select id into v_private from public.conversations where loan_id = v_loan.id;

  insert into group_test_context(admin_id, member_id, other_id, pending_id, owner_id, borrower_id, private_id)
    values (v_admin, v_member, v_other, v_pending, v_owner, v_borrower, v_private);
end;
$$;

-- 1. Only admins manage groups.
select pg_temp.as_user(member_id) from group_test_context;
set local role authenticated;
do $$
begin
  begin perform public.admin_create_group('Nope', null, 'open'); raise exception 'FAIL: student created a group';
  exception when others then if sqlerrm <> 'Only admins can manage groups' then raise; end if; end;
  begin perform public.create_community_conversation('Nope'); raise exception 'FAIL: student used legacy create';
  exception when others then if sqlerrm <> 'Only admins can create community channels' then raise; end if; end;
  begin perform public.admin_list_groups(); raise exception 'FAIL: student listed groups as admin';
  exception when others then if sqlerrm <> 'Only admins can manage groups' then raise; end if; end;
  begin insert into public.conversations(type, title) values ('community', 'Direct'); raise exception 'FAIL: direct conversation insert';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

select pg_temp.as_user(admin_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context; v_open uuid; v_invite uuid; v_msg uuid;
begin
  select * into v_ctx from group_test_context;
  v_open := public.admin_create_group('  Group QA open  ', 'Anyone can join', 'open');
  v_invite := public.admin_create_group('Group QA invite', null, 'invite');
  if (select title from public.conversations where id = v_open) <> 'Group QA open' then raise exception 'FAIL: title not trimmed'; end if;
  if not public.is_conversation_member(v_open, v_ctx.admin_id) then raise exception 'FAIL: creator is not a member'; end if;
  begin perform public.admin_create_group('Group QA open', null, 'open'); raise exception 'FAIL: duplicate group name';
  exception when others then if sqlerrm <> 'A group with that name already exists' then raise; end if; end;
  begin perform public.admin_create_group('', null, 'open'); raise exception 'FAIL: empty name';
  exception when others then if sqlerrm <> 'Give the group a name of up to 80 characters' then raise; end if; end;
  begin perform public.admin_create_group('Bad', null, 'secret'); raise exception 'FAIL: bad visibility';
  exception when others then if sqlerrm <> 'Choose open or invite-only' then raise; end if; end;
  insert into public.messages(conversation_id, sender_id, body) values (v_open, v_ctx.admin_id, 'Welcome 100% of you_all') returning id into v_msg;
  update group_test_context set open_id = v_open, invite_id = v_invite, admin_msg = v_msg;
end;
$$;
reset role;

-- 2. Open group: verified non-members see and read it, join to post, leave again.
select pg_temp.as_user(other_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context; v_row record;
begin
  select * into v_ctx from group_test_context;
  select * into v_row from public.get_chat_inbox() where conversation_id = v_ctx.open_id;
  if not found or v_row.is_member or v_row.unread_count <> 0 or v_row.member_count <> 1 or v_row.description <> 'Anyone can join' then
    raise exception 'FAIL: open group not listed for a non-member (%)', v_row; end if;
  if exists (select 1 from public.get_chat_inbox() where conversation_id = v_ctx.invite_id) or
     exists (select 1 from public.conversations where id = v_ctx.invite_id) then
    raise exception 'FAIL: invite-only group visible to a non-member'; end if;
  if not exists (select 1 from public.messages where conversation_id = v_ctx.open_id) then
    raise exception 'FAIL: verified student cannot preview an open group'; end if;
  begin insert into public.messages(conversation_id, sender_id, body) values (v_ctx.open_id, v_ctx.other_id, 'not joined');
    raise exception 'FAIL: non-member posted';
  exception when insufficient_privilege then null; end;
  begin perform public.toggle_message_reaction(v_ctx.admin_msg, '👍'); raise exception 'FAIL: non-member reacted';
  exception when others then if sqlerrm <> 'Join this chat to react' then raise; end if; end;
  begin perform public.join_group(v_ctx.invite_id); raise exception 'FAIL: joined an invite-only group';
  exception when others then if sqlerrm <> 'This group is invite-only' then raise; end if; end;
  begin perform public.mark_conversation_read(v_ctx.invite_id); raise exception 'FAIL: read cursor joined an invite-only group';
  exception when others then if sqlerrm <> 'You are not a member of this conversation' then raise; end if; end;
  if exists (select 1 from public.messages where conversation_id = v_ctx.invite_id) or
     exists (select 1 from public.search_conversation_messages(v_ctx.invite_id, 'welcome')) then
    raise exception 'FAIL: invite-only messages leak'; end if;
  begin perform public.get_group_members(v_ctx.invite_id); raise exception 'FAIL: invite member list leaked';
  exception when others then if sqlerrm <> 'Group not found' then raise; end if; end;

  perform public.join_group(v_ctx.open_id);
  perform public.join_group(v_ctx.open_id); -- idempotent
  insert into public.messages(conversation_id, sender_id, body) values (v_ctx.open_id, v_ctx.other_id, 'joined and posting');
  if (select count(*) from public.get_group_members(v_ctx.open_id)) <> 2 then raise exception 'FAIL: member list'; end if;
  perform public.leave_group(v_ctx.open_id);
  begin insert into public.messages(conversation_id, sender_id, body) values (v_ctx.open_id, v_ctx.other_id, 'after leaving');
    raise exception 'FAIL: posted after leaving';
  exception when insufficient_privilege then null; end;
  begin perform public.leave_group(v_ctx.private_id); raise exception 'FAIL: left a loan chat';
  exception when others then if sqlerrm <> 'Group not found' then raise; end if; end;
end;
$$;
reset role;

-- 3. Invite-only: admin adds a member, who is notified and can read and post.
select pg_temp.as_user(admin_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context;
begin
  select * into v_ctx from group_test_context;
  perform public.admin_add_group_member(v_ctx.invite_id, v_ctx.member_id);
  perform public.admin_add_group_member(v_ctx.invite_id, v_ctx.member_id); -- idempotent
  begin perform public.admin_add_group_member(v_ctx.invite_id, v_ctx.pending_id); raise exception 'FAIL: added an unverified student';
  exception when others then if sqlerrm <> 'Only verified students can join groups' then raise; end if; end;
  insert into public.messages(conversation_id, sender_id, body) values (v_ctx.invite_id, v_ctx.admin_id, 'invite hello');
end;
$$;
reset role;
-- now() is fixed for the whole transaction: put the new member's cursor before the message.
update public.conversation_members set last_read_at = now() - interval '1 minute'
where (conversation_id, user_id) = (select invite_id, member_id from group_test_context);

select pg_temp.as_user(member_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context; v_reply uuid; v_edited public.messages; v_reactions jsonb; v_row record;
begin
  select * into v_ctx from group_test_context;
  if (select count(*) from public.notifications where user_id = v_ctx.member_id and payload ->> 'conversation_id' = v_ctx.invite_id::text) <> 1 then
    raise exception 'FAIL: added member not notified exactly once'; end if;
  select * into v_row from public.get_chat_inbox() where conversation_id = v_ctx.invite_id;
  if not found or not v_row.is_member or v_row.unread_count <> 1 or v_row.last_message_body <> 'invite hello' then
    raise exception 'FAIL: invite inbox row (%)', v_row; end if;
  if exists (select 1 from public.get_group_members(v_ctx.invite_id) m where m.user_id is null) then raise exception 'FAIL: members'; end if;

  -- Replies stay inside the chat.
  insert into public.messages(conversation_id, sender_id, body, reply_to_id)
    select v_ctx.invite_id, v_ctx.member_id, 'reply', id from public.messages where conversation_id = v_ctx.invite_id limit 1
    returning id into v_reply;
  begin insert into public.messages(conversation_id, sender_id, body, reply_to_id) values (v_ctx.invite_id, v_ctx.member_id, 'cross', v_ctx.admin_msg);
    raise exception 'FAIL: cross-chat reply accepted';
  exception when others then if sqlerrm <> 'You can only reply to a message in the same chat' then raise; end if; end;

  -- Students can't set moderation columns, backdate, or write directly.
  begin insert into public.messages(conversation_id, sender_id, body, reactions) values (v_ctx.invite_id, v_ctx.member_id, 'x', '{"👍":["x"]}');
    raise exception 'FAIL: inserted reactions';
  exception when insufficient_privilege then null; end;
  begin insert into public.messages(conversation_id, sender_id, body, created_at) values (v_ctx.invite_id, v_ctx.member_id, 'x', now() - interval '1 year');
    raise exception 'FAIL: backdated a message';
  exception when insufficient_privilege then null; end;
  begin update public.messages set body = 'direct' where id = v_reply; raise exception 'FAIL: direct update';
  exception when insufficient_privilege then null; end;
  begin delete from public.messages where id = v_reply; raise exception 'FAIL: direct delete';
  exception when insufficient_privilege then null; end;

  -- Edit your own, not others'.
  v_edited := public.edit_message(v_reply, '  edited reply  ');
  if v_edited.body <> 'edited reply' or v_edited.edited_at is null then raise exception 'FAIL: edit'; end if;
  begin perform public.edit_message((select id from public.messages where conversation_id = v_ctx.invite_id and sender_id = v_ctx.admin_id limit 1), 'hijack');
    raise exception 'FAIL: edited someone else';
  exception when others then if sqlerrm <> 'You can only edit your own messages' then raise; end if; end;
  begin perform public.edit_message(v_reply, '   '); raise exception 'FAIL: blank edit';
  exception when others then if sqlerrm <> 'Write a message of up to 2000 characters' then raise; end if; end;

  -- Reactions toggle, from the fixed set only.
  v_reactions := public.toggle_message_reaction(v_reply, '👍');
  v_reactions := public.toggle_message_reaction(v_reply, '❤️');
  if v_reactions <> jsonb_build_object('👍', jsonb_build_array(v_ctx.member_id::text), '❤️', jsonb_build_array(v_ctx.member_id::text)) then
    raise exception 'FAIL: reactions add (%)', v_reactions; end if;
  v_reactions := public.toggle_message_reaction(v_reply, '👍');
  if v_reactions ? '👍' then raise exception 'FAIL: reaction toggle off'; end if;
  begin perform public.toggle_message_reaction(v_reply, '💩'); raise exception 'FAIL: unsupported reaction';
  exception when others then if sqlerrm <> 'Unsupported reaction' then raise; end if; end;

  -- Search.
  if not exists (select 1 from public.search_conversation_messages(v_ctx.invite_id, 'EDITED')) then raise exception 'FAIL: search'; end if;
  if exists (select 1 from public.search_conversation_messages(v_ctx.invite_id, 'e')) then raise exception 'FAIL: 1-char search'; end if;

  -- Reading clears the unread count.
  perform public.mark_conversation_read(v_ctx.invite_id);
  if (select unread_count from public.get_chat_inbox() where conversation_id = v_ctx.invite_id) <> 0 then raise exception 'FAIL: unread after read'; end if;

  -- Delete your own; not others'.
  begin perform public.delete_message((select id from public.messages where conversation_id = v_ctx.invite_id and sender_id = v_ctx.admin_id limit 1));
    raise exception 'FAIL: student deleted someone else';
  exception when others then if sqlerrm <> 'You can only delete your own messages' then raise; end if; end;
  perform public.delete_message(v_reply);
  if exists (select 1 from public.messages where id = v_reply and (deleted_at is null or body <> '' or reactions <> '{}'::jsonb)) then
    raise exception 'FAIL: soft delete'; end if;
  begin perform public.edit_message(v_reply, 'zombie'); raise exception 'FAIL: edited a deleted message';
  exception when others then if sqlerrm <> 'Message not found' then raise; end if; end;
  if exists (select 1 from public.search_conversation_messages(v_ctx.invite_id, 'edited')) then raise exception 'FAIL: deleted message searchable'; end if;
end;
$$;
reset role;

-- 4. Search escapes LIKE wildcards; unread counts only others' live messages.
select pg_temp.as_user(other_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context;
begin
  select * into v_ctx from group_test_context;
  if (select count(*) from public.search_conversation_messages(v_ctx.open_id, '100%')) <> 1 then raise exception 'FAIL: literal %% search'; end if;
  if (select count(*) from public.search_conversation_messages(v_ctx.open_id, 'u_a')) <> 1 then raise exception 'FAIL: literal _ search'; end if;
  if (select count(*) from public.search_conversation_messages(v_ctx.open_id, 'o%e')) <> 0 then raise exception 'FAIL: wildcard not escaped'; end if;
end;
$$;
reset role;

-- 5. Admin moderation: delete any message, archive, edit, list counts, remove members.
select pg_temp.as_user(admin_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context; v_msg uuid; v_row record;
begin
  select * into v_ctx from group_test_context;
  select id into v_msg from public.messages where conversation_id = v_ctx.open_id and sender_id = v_ctx.other_id;
  perform public.delete_message(v_msg);
  if not exists (select 1 from public.messages where id = v_msg and deleted_at is not null) then raise exception 'FAIL: admin delete'; end if;
  if not exists (select 1 from public.audit_log where action = 'message.deleted' and entity_id = v_msg::text) then raise exception 'FAIL: moderation audit'; end if;

  select * into v_row from public.admin_list_groups() where id = v_ctx.invite_id;
  if v_row.member_count <> 2 or v_row.message_count <> 1 or v_row.visibility <> 'invite' then raise exception 'FAIL: admin counts (%)', v_row; end if;

  -- Admins see invite-only groups and their messages, but never private loan chats' messages.
  if not exists (select 1 from public.messages where conversation_id = v_ctx.invite_id) then raise exception 'FAIL: admin cannot read group'; end if;
  begin insert into public.messages(conversation_id, sender_id, body) values (v_ctx.private_id, v_ctx.admin_id, 'x');
    raise exception 'FAIL: admin posted into a loan chat';
  exception when insufficient_privilege then null; end;
end;
$$;
do $$
declare v_ctx group_test_context;
begin
  select * into v_ctx from group_test_context;
  if exists (select 1 from public.messages where conversation_id = v_ctx.private_id) then raise exception 'FAIL: admin reads loan chat'; end if;
  perform public.admin_update_group(v_ctx.invite_id, 'Group QA invite renamed', 'Now with a description', 'invite', true);
  perform public.admin_update_group(v_ctx.open_id, 'Group QA open', null, 'open', true);
  begin perform public.admin_update_group(v_ctx.invite_id, 'Group QA open', null, 'invite', true); raise exception 'FAIL: rename collision';
  exception when others then if sqlerrm <> 'A group with that name already exists' then raise; end if; end;
  perform public.admin_remove_group_member(v_ctx.invite_id, v_ctx.member_id);
  perform public.admin_add_group_member(v_ctx.invite_id, v_ctx.member_id);
end;
$$;
reset role;

-- 6. Archived groups are read-only and leave the open directory.
select pg_temp.as_user(member_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context; v_msg uuid;
begin
  select * into v_ctx from group_test_context;
  if not exists (select 1 from public.messages where conversation_id = v_ctx.invite_id) then raise exception 'FAIL: member lost archived history'; end if;
  begin insert into public.messages(conversation_id, sender_id, body) values (v_ctx.invite_id, v_ctx.member_id, 'archived');
    raise exception 'FAIL: posted in an archived group';
  exception when insufficient_privilege then null; end;
  select id into v_msg from public.messages where conversation_id = v_ctx.invite_id and deleted_at is null limit 1;
  begin perform public.toggle_message_reaction(v_msg, '🎉'); raise exception 'FAIL: reacted in an archived group';
  exception when others then if sqlerrm <> 'Join this chat to react' then raise; end if; end;
end;
$$;
reset role;
select pg_temp.as_user(other_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context;
begin
  select * into v_ctx from group_test_context;
  if exists (select 1 from public.get_chat_inbox() where conversation_id = v_ctx.open_id) or
     exists (select 1 from public.messages where conversation_id = v_ctx.open_id) then
    raise exception 'FAIL: archived open group still public'; end if;
  begin perform public.join_group(v_ctx.open_id); raise exception 'FAIL: joined an archived group';
  exception when others then if sqlerrm <> 'Group not found' and sqlerrm <> 'This group is archived' then raise; end if; end;
  -- Loan chats: unread counts and counterpart names.
end;
$$;
reset role;

-- 7. Loan chats keep working: members only, counterpart, unread counts.
select pg_temp.as_user(owner_id) from group_test_context;
set local role authenticated;
insert into public.messages(conversation_id, sender_id, body) select private_id, owner_id, 'pickup at 5?' from group_test_context;
update group_test_context set private_msg = (select id from public.messages where body = 'pickup at 5?');
reset role;
select pg_temp.as_user(borrower_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context; v_row record;
begin
  select * into v_ctx from group_test_context;
  select * into v_row from public.get_chat_inbox() where conversation_id = v_ctx.private_id;
  if v_row.unread_count <> 1 or v_row.counterpart_id <> v_ctx.owner_id or v_row.counterpart_name <> 'Group QA owner' or v_row.member_count is not null then
    raise exception 'FAIL: loan chat inbox row (%)', v_row; end if;
  insert into public.messages(conversation_id, sender_id, body, reply_to_id) values (v_ctx.private_id, v_ctx.borrower_id, 'yes', v_ctx.private_msg);
  perform public.toggle_message_reaction(v_ctx.private_msg, '🙏');
end;
$$;
reset role;
select pg_temp.as_user(other_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context;
begin
  select * into v_ctx from group_test_context;
  if exists (select 1 from public.search_conversation_messages(v_ctx.private_id, 'pickup')) then raise exception 'FAIL: outsider searched a loan chat'; end if;
  begin perform public.toggle_message_reaction(v_ctx.private_msg, '👍'); raise exception 'FAIL: outsider reacted in a loan chat';
  exception when others then if sqlerrm <> 'Join this chat to react' then raise; end if; end;
end;
$$;
reset role;

-- 8. Unverified and anonymous callers get nothing.
select pg_temp.as_user(pending_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context;
begin
  select * into v_ctx from group_test_context;
  if exists (select 1 from public.get_chat_inbox()) then raise exception 'FAIL: unverified inbox'; end if;
  begin perform public.join_group(v_ctx.invite_id); raise exception 'FAIL: unverified joined';
  exception when others then if sqlerrm <> 'Only verified students can join groups' then raise; end if; end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin perform public.get_chat_inbox(); raise exception 'FAIL: anonymous inbox';
  exception when insufficient_privilege then null; end;
  begin perform public.join_group(gen_random_uuid()); raise exception 'FAIL: anonymous join';
  exception when insufficient_privilege then null; end;
  begin perform public.toggle_message_reaction(gen_random_uuid(), '👍'); raise exception 'FAIL: anonymous reaction';
  exception when insufficient_privilege then null; end;
  begin perform public.search_conversation_messages(gen_random_uuid(), 'hello'); raise exception 'FAIL: anonymous search';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_list_groups(); raise exception 'FAIL: anonymous admin list';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- 9. Deleting a group removes its members and messages.
select pg_temp.as_user(admin_id) from group_test_context;
set local role authenticated;
do $$
declare v_ctx group_test_context;
begin
  select * into v_ctx from group_test_context;
  perform public.admin_delete_group(v_ctx.invite_id);
  begin perform public.admin_delete_group(v_ctx.private_id); raise exception 'FAIL: deleted a loan chat as a group';
  exception when others then if sqlerrm <> 'Group not found' then raise; end if; end;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from public.messages m join group_test_context c on m.conversation_id = c.invite_id) or
     exists (select 1 from public.conversation_members m join group_test_context c on m.conversation_id = c.invite_id) then
    raise exception 'FAIL: group delete did not cascade'; end if;
end;
$$;

select 'PASS: admin-only group management, open/invite/archived access, verified-only reading and posting, replies, reactions, edits, deletes, moderation, unread counts, search and anonymous denial' as result;
rollback;
