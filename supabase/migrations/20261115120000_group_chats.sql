-- Group chats and richer messaging.
--
-- Groups are the existing "community" conversations, now managed by admins:
-- a name, a description, open (any verified student can join and leave) or
-- invite-only (admins add members), and archived (read-only) or active.
-- Existing community channels become open groups and keep their members.
--
-- Every chat (group or loan) also gets replies, emoji reactions, editing and
-- deleting your own messages, admin moderation deletes, per-chat unread counts
-- and server-side message search.
--
-- Reactions live on the message row so a single UPDATE event, already
-- filterable by conversation_id in Realtime, carries every change.

-- ---------------------------------------------------------------------------
-- 1. Group settings
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column description text check (char_length(description) <= 500),
  add column visibility text not null default 'open' check (visibility in ('open', 'invite')),
  add column archived_at timestamptz,
  add column created_by uuid references public.profiles (id) on delete set null,
  add column updated_at timestamptz not null default now();

alter table public.conversations
  add constraint conversations_group_settings check (
    type = 'community' or (description is null and visibility = 'open' and archived_at is null)
  );

create index conversations_created_by_idx on public.conversations (created_by) where created_by is not null;

-- ---------------------------------------------------------------------------
-- 2. Message features
-- ---------------------------------------------------------------------------
alter table public.messages
  add column reply_to_id uuid references public.messages (id) on delete set null,
  add column edited_at timestamptz,
  add column deleted_at timestamptz,
  add column reactions jsonb not null default '{}'::jsonb;

-- A deleted message keeps its row (so replies still say what they answered)
-- but loses its text and image.
alter table public.messages drop constraint messages_check;
alter table public.messages
  add constraint messages_content_present check (
    deleted_at is not null or char_length(body) > 0 or image_path is not null
  ),
  add constraint messages_reactions_object check (jsonb_typeof(reactions) = 'object');

create index messages_reply_to_idx on public.messages (reply_to_id) where reply_to_id is not null;

-- Students insert messages directly (older app versions too), but may only
-- set these columns. Edits, deletes and reactions go through the RPCs below.
revoke insert, update, delete on public.messages from authenticated;
grant insert (conversation_id, sender_id, body, image_path, reply_to_id) on public.messages to authenticated;

-- Conversations and memberships change only through security-definer RPCs.
revoke insert, update, delete on public.conversations, public.conversation_members from authenticated;

create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.edited_at := null;
  new.deleted_at := null;
  new.reactions := '{}'::jsonb;
  if new.reply_to_id is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to_id and m.conversation_id = new.conversation_id
  ) then
    raise exception 'You can only reply to a message in the same chat';
  end if;
  return new;
end;
$$;
revoke execute on function public.messages_before_insert() from public, anon, authenticated;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
before insert on public.messages
for each row execute function public.messages_before_insert();

-- ---------------------------------------------------------------------------
-- 3. Who can read and post
-- ---------------------------------------------------------------------------
-- Read: a verified member, any verified student for an active open group,
-- and admins for any group. Loan chats stay members-only.
create or replace function public.can_read_conversation(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.conversations c on c.id = p_conversation_id
    where p.id = p_user_id
      and p.verification_status = 'verified'
      and (
        exists (
          select 1 from public.conversation_members m
          where m.conversation_id = c.id and m.user_id = p_user_id
        )
        or (c.type = 'community' and (
          (c.visibility = 'open' and c.archived_at is null) or p.is_admin
        ))
      )
  );
$$;

-- Post (and react): a verified member of a chat that isn't archived.
create or replace function public.can_post_conversation(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.conversation_members m on m.user_id = p.id and m.conversation_id = p_conversation_id
    join public.conversations c on c.id = m.conversation_id
    where p.id = p_user_id
      and p.verification_status = 'verified'
      and c.archived_at is null
  );
$$;

revoke execute on function public.can_read_conversation(uuid, uuid) from public, anon;
revoke execute on function public.can_post_conversation(uuid, uuid) from public, anon;
grant execute on function public.can_read_conversation(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_post_conversation(uuid, uuid) to authenticated, service_role;

alter policy conversations_select on public.conversations using (
  public.is_verified((select auth.uid())) and (
    public.is_conversation_member(id, (select auth.uid()))
    or public.is_admin((select auth.uid()))
    or (type = 'community' and visibility = 'open' and archived_at is null)
  )
);

alter policy messages_select on public.messages using (
  public.can_read_conversation(conversation_id, (select auth.uid()))
);

alter policy messages_insert on public.messages with check (
  sender_id = (select auth.uid())
  and public.can_post_conversation(conversation_id, (select auth.uid()))
);

-- Opening an active open group you haven't joined still joins it, as older
-- app versions expect. Invite-only and archived groups need membership.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_verified(v_uid) then raise exception 'Only verified students can read conversations'; end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then raise exception 'Conversation not found'; end if;

  update public.conversation_members
  set last_read_at = greatest(coalesce(last_read_at, '-infinity'::timestamptz), now())
  where conversation_id = p_conversation_id and user_id = v_uid;
  if found then return; end if;

  if v_conv.type = 'community' and v_conv.visibility = 'open' and v_conv.archived_at is null then
    insert into public.conversation_members (conversation_id, user_id, last_read_at)
    values (p_conversation_id, v_uid, now())
    on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  else
    raise exception 'You are not a member of this conversation';
  end if;
end;
$$;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Inbox: every chat you can see, with unread counts
-- ---------------------------------------------------------------------------
-- Members get an unread count (others' live messages after their read cursor,
-- capped at 100). Active open groups you haven't joined are listed with
-- is_member = false. Other students' read cursors are never returned.
create or replace function public.get_chat_inbox()
returns table (
  conversation_id uuid,
  type public.conversation_type,
  title text,
  description text,
  visibility text,
  archived_at timestamptz,
  loan_id uuid,
  created_at timestamptz,
  is_member boolean,
  member_count integer,
  unread_count integer,
  last_message_id uuid,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_sender_name text,
  last_message_at timestamptz,
  last_message_deleted boolean,
  counterpart_id uuid,
  counterpart_name text,
  counterpart_avatar_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid
    where public.is_verified(auth.uid())
  ),
  visible as (
    select c.*, m.user_id is not null as member, m.last_read_at as my_read, me.uid
    from me
    cross join public.conversations c
    left join public.conversation_members m on m.conversation_id = c.id and m.user_id = me.uid
    where m.user_id is not null
      or (c.type = 'community' and c.visibility = 'open' and c.archived_at is null)
  )
  select
    v.id, v.type, v.title, v.description, v.visibility, v.archived_at, v.loan_id, v.created_at,
    v.member,
    case when v.type = 'community' then
      (select count(*)::integer from public.conversation_members x where x.conversation_id = v.id)
    end,
    case when v.member then (
      select count(*)::integer from (
        select 1 from public.messages u
        where u.conversation_id = v.id
          and u.sender_id <> v.uid
          and u.deleted_at is null
          and (v.my_read is null or u.created_at > v.my_read)
        limit 100
      ) unread
    ) else 0 end,
    h.id, h.body, h.sender_id, hp.full_name, h.created_at, h.deleted_at is not null,
    cp.id, cp.full_name, cp.avatar_path
  from visible v
  left join lateral (
    select msg.id, msg.body, msg.sender_id, msg.created_at, msg.deleted_at
    from public.messages msg
    where msg.conversation_id = v.id
    order by msg.created_at desc, msg.id desc
    limit 1
  ) h on true
  left join public.profiles hp on hp.id = h.sender_id
  left join lateral (
    select p.id, p.full_name, p.avatar_path
    from public.conversation_members o
    join public.profiles p on p.id = o.user_id
    where v.type = 'private' and o.conversation_id = v.id and o.user_id <> v.uid
    order by o.joined_at
    limit 1
  ) cp on true
  order by coalesce(h.created_at, v.created_at) desc;
$$;
revoke execute on function public.get_chat_inbox() from public, anon;
grant execute on function public.get_chat_inbox() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Joining, leaving and member lists
-- ---------------------------------------------------------------------------
create or replace function public.join_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_verified(v_uid) then raise exception 'Only verified students can join groups'; end if;
  select * into v_conv from public.conversations where id = p_group_id and type = 'community';
  if not found then raise exception 'Group not found'; end if;
  if not public.is_admin(v_uid) then
    if v_conv.archived_at is not null then raise exception 'This group is archived'; end if;
    if v_conv.visibility <> 'open' then raise exception 'This group is invite-only'; end if;
  end if;
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (p_group_id, v_uid, now())
  on conflict (conversation_id, user_id) do nothing;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.conversations where id = p_group_id and type = 'community') then
    raise exception 'Group not found';
  end if;
  delete from public.conversation_members where conversation_id = p_group_id and user_id = v_uid;
end;
$$;

-- Public profile fields only; no read cursors.
create or replace function public.get_group_members(p_group_id uuid)
returns table (user_id uuid, full_name text, avatar_path text, is_admin boolean, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin(auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.conversations where id = p_group_id and type = 'community')
     or not public.can_read_conversation(p_group_id, v_uid) then
    raise exception 'Group not found';
  end if;
  return query
    select m.user_id, p.full_name, p.avatar_path, p.is_admin, m.joined_at
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    where m.conversation_id = p_group_id
      and (v_admin or p.verification_status = 'verified' or p.id = v_uid)
    order by p.full_name, m.user_id;
end;
$$;

revoke execute on function public.join_group(uuid) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.get_group_members(uuid) from public, anon;
grant execute on function public.join_group(uuid) to authenticated, service_role;
grant execute on function public.leave_group(uuid) to authenticated, service_role;
grant execute on function public.get_group_members(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Admin management
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_groups()
returns table (
  id uuid,
  title text,
  description text,
  visibility text,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  member_count integer,
  message_count integer,
  last_message_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Only admins can manage groups'; end if;
  return query
    select c.id, c.title, c.description, c.visibility, c.archived_at, c.created_at, c.updated_at,
      (select count(*)::integer from public.conversation_members m where m.conversation_id = c.id),
      (select count(*)::integer from public.messages g where g.conversation_id = c.id and g.deleted_at is null),
      (select max(g.created_at) from public.messages g where g.conversation_id = c.id)
    from public.conversations c
    where c.type = 'community'
    order by c.archived_at is not null, lower(c.title);
end;
$$;

create or replace function public.admin_create_group(
  p_title text,
  p_description text default null,
  p_visibility text default 'open'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
begin
  if not public.is_admin(v_uid) then raise exception 'Only admins can manage groups'; end if;
  if char_length(v_title) not between 1 and 80 then raise exception 'Give the group a name of up to 80 characters'; end if;
  if char_length(v_description) > 500 then raise exception 'Keep the description under 500 characters'; end if;
  if coalesce(p_visibility, '') not in ('open', 'invite') then raise exception 'Choose open or invite-only'; end if;
  begin
    insert into public.conversations (type, title, description, visibility, created_by)
    values ('community', v_title, v_description, p_visibility, v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A group with that name already exists';
  end;
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (v_id, v_uid, now());
  perform public.write_audit('group.created', 'conversation', v_id::text,
    jsonb_build_object('title', v_title, 'visibility', p_visibility));
  return v_id;
end;
$$;

create or replace function public.admin_update_group(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_visibility text,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not public.is_admin(auth.uid()) then raise exception 'Only admins can manage groups'; end if;
  if char_length(v_title) not between 1 and 80 then raise exception 'Give the group a name of up to 80 characters'; end if;
  if char_length(v_description) > 500 then raise exception 'Keep the description under 500 characters'; end if;
  if coalesce(p_visibility, '') not in ('open', 'invite') then raise exception 'Choose open or invite-only'; end if;
  begin
    update public.conversations
    set title = v_title,
        description = v_description,
        visibility = p_visibility,
        archived_at = case when coalesce(p_archived, false) then coalesce(archived_at, now()) end,
        updated_at = now()
    where id = p_group_id and type = 'community';
  exception when unique_violation then
    raise exception 'A group with that name already exists';
  end;
  if not found then raise exception 'Group not found'; end if;
  perform public.write_audit('group.updated', 'conversation', p_group_id::text,
    jsonb_build_object('title', v_title, 'visibility', p_visibility, 'archived', coalesce(p_archived, false)));
end;
$$;

create or replace function public.admin_delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Only admins can manage groups'; end if;
  delete from public.conversations where id = p_group_id and type = 'community';
  if not found then raise exception 'Group not found'; end if;
  perform public.write_audit('group.deleted', 'conversation', p_group_id::text);
end;
$$;

create or replace function public.admin_add_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Only admins can manage groups'; end if;
  select title into v_title from public.conversations where id = p_group_id and type = 'community';
  if not found then raise exception 'Group not found'; end if;
  if not public.is_verified(p_user_id) then raise exception 'Only verified students can join groups'; end if;
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (p_group_id, p_user_id, now())
  on conflict (conversation_id, user_id) do nothing;
  if found and p_user_id <> auth.uid() then
    perform public.create_notification(p_user_id, 'new_message', 'Added to a group',
      format('You were added to %s.', v_title), jsonb_build_object('conversation_id', p_group_id));
  end if;
  perform public.write_audit('group.member_added', 'conversation', p_group_id::text,
    jsonb_build_object('user_id', p_user_id));
end;
$$;

create or replace function public.admin_remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Only admins can manage groups'; end if;
  if not exists (select 1 from public.conversations where id = p_group_id and type = 'community') then
    raise exception 'Group not found';
  end if;
  delete from public.conversation_members where conversation_id = p_group_id and user_id = p_user_id;
  perform public.write_audit('group.member_removed', 'conversation', p_group_id::text,
    jsonb_build_object('user_id', p_user_id));
end;
$$;

revoke execute on function public.admin_list_groups() from public, anon;
revoke execute on function public.admin_create_group(text, text, text) from public, anon;
revoke execute on function public.admin_update_group(uuid, text, text, text, boolean) from public, anon;
revoke execute on function public.admin_delete_group(uuid) from public, anon;
revoke execute on function public.admin_add_group_member(uuid, uuid) from public, anon;
revoke execute on function public.admin_remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.admin_list_groups() to authenticated, service_role;
grant execute on function public.admin_create_group(text, text, text) to authenticated, service_role;
grant execute on function public.admin_update_group(uuid, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_group(uuid) to authenticated, service_role;
grant execute on function public.admin_add_group_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_remove_group_member(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Editing, deleting and reacting
-- ---------------------------------------------------------------------------
create or replace function public.edit_message(p_message_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_msg from public.messages where id = p_message_id for update;
  if not found or v_msg.deleted_at is not null then raise exception 'Message not found'; end if;
  if v_msg.sender_id <> v_uid then raise exception 'You can only edit your own messages'; end if;
  if not public.can_post_conversation(v_msg.conversation_id, v_uid) then
    raise exception 'You can no longer post in this chat';
  end if;
  if char_length(v_body) > 2000 or (char_length(v_body) = 0 and v_msg.image_path is null) then
    raise exception 'Write a message of up to 2000 characters';
  end if;
  if v_body is distinct from v_msg.body then
    update public.messages set body = v_body, edited_at = now()
    where id = p_message_id
    returning * into v_msg;
  end if;
  return v_msg;
end;
$$;

-- Your own messages anywhere; admins can delete any message.
create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_admin boolean := public.is_admin(auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_msg from public.messages where id = p_message_id for update;
  if not found then raise exception 'Message not found'; end if;
  if v_msg.sender_id <> v_uid and not v_admin then
    raise exception 'You can only delete your own messages';
  end if;
  if v_msg.deleted_at is not null then return; end if;
  update public.messages
  set deleted_at = now(), body = '', image_path = null, reactions = '{}'::jsonb
  where id = p_message_id;
  if v_msg.sender_id <> v_uid then
    perform public.write_audit('message.deleted', 'message', p_message_id::text,
      jsonb_build_object('conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id));
  end if;
end;
$$;

-- Reactions: { "<emoji>": ["<user id>", ...] }, from a fixed set of emoji.
create or replace function public.toggle_message_reaction(p_message_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_users jsonb;
  v_reactions jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_emoji is null or not (p_emoji = any (array['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉'])) then
    raise exception 'Unsupported reaction';
  end if;
  select * into v_msg from public.messages where id = p_message_id for update;
  if not found or v_msg.deleted_at is not null then raise exception 'Message not found'; end if;
  if not public.can_post_conversation(v_msg.conversation_id, v_uid) then
    raise exception 'Join this chat to react';
  end if;
  v_users := coalesce(v_msg.reactions -> p_emoji, '[]'::jsonb);
  if v_users ? v_uid::text then
    select coalesce(jsonb_agg(u), '[]'::jsonb) into v_users
    from jsonb_array_elements_text(v_users) as e(u)
    where u <> v_uid::text;
  else
    v_users := v_users || jsonb_build_array(v_uid::text);
  end if;
  if jsonb_array_length(v_users) = 0 then
    v_reactions := v_msg.reactions - p_emoji;
  else
    v_reactions := jsonb_set(v_msg.reactions, array[p_emoji], v_users, true);
  end if;
  update public.messages set reactions = v_reactions where id = p_message_id;
  return v_reactions;
end;
$$;

revoke execute on function public.edit_message(uuid, text) from public, anon;
revoke execute on function public.delete_message(uuid) from public, anon;
revoke execute on function public.toggle_message_reaction(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated, service_role;
grant execute on function public.delete_message(uuid) to authenticated, service_role;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Search within a chat
-- ---------------------------------------------------------------------------
-- INVOKER: the caller's messages policy decides what can be found.
create or replace function public.search_conversation_messages(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 30
)
returns table (id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.sender_id, p.full_name, m.body, m.created_at
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and char_length(btrim(coalesce(p_query, ''))) between 2 and 100
    and m.body ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;
revoke execute on function public.search_conversation_messages(uuid, text, integer) from public, anon;
grant execute on function public.search_conversation_messages(uuid, text, integer) to authenticated, service_role;
