-- More chat: announcement-only groups, @mentions, pinned messages, muting,
-- photos, polls and a typing indicator.
--
-- * Announcement-only groups (posting = 'admins'): only admins post; members
--   still react and vote in polls.
-- * @mentions: the client sends the mentioned students' ids; members who
--   haven't muted the chat get an in-app notification.
-- * Pins: admins pin in groups; either student pins in a loan chat.
-- * Mute: no unread count and no mention notifications for that chat.
-- * Photos: chat-images can now only be read by the uploader or by students
--   who can read a message that uses the photo.
-- * Polls: admins create them in groups; one vote per student (changeable),
--   results update live like reactions, on the message row.
-- * Typing: a private Realtime broadcast channel per chat ("typing:<id>"),
--   authorised by policies on realtime.messages.
--
-- Apps that are already installed keep working: new RPC parameters have
-- defaults, new columns are ignored by older clients, and get_chat_inbox only
-- gains columns.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column posting text not null default 'everyone' check (posting in ('everyone', 'admins'));

alter table public.conversations drop constraint conversations_group_settings;
alter table public.conversations
  add constraint conversations_group_settings check (
    type = 'community'
    or (description is null and visibility = 'open' and archived_at is null and posting = 'everyone')
  );

alter table public.conversation_members
  add column muted boolean not null default false;

alter table public.messages
  add column mentions uuid[] not null default '{}' check (cardinality(mentions) <= 20),
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles (id) on delete set null,
  add column poll jsonb check (poll is null or jsonb_typeof(poll) = 'object');

create index messages_pinned_idx on public.messages (conversation_id, pinned_at desc) where pinned_at is not null;
create index messages_pinned_by_idx on public.messages (pinned_by) where pinned_by is not null;
create index messages_image_path_idx on public.messages (image_path) where image_path is not null;

-- Students may also send mentions; pins and polls only come from the RPCs.
grant insert (mentions) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who can post, react and read
-- ---------------------------------------------------------------------------
-- React (and vote): a verified member of a chat that isn't archived.
create or replace function public.can_react_conversation(p_conversation_id uuid, p_user_id uuid)
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

-- Post: as above, and in announcement-only groups only admins.
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
      and (c.posting = 'everyone' or p.is_admin)
  );
$$;

revoke execute on function public.can_react_conversation(uuid, uuid) from public, anon;
grant execute on function public.can_react_conversation(uuid, uuid) to authenticated, service_role;

-- New messages: replies stay in the chat, photos must be the sender's own
-- upload, and mentions are de-duplicated without the sender.
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
  if new.image_path is not null and split_part(new.image_path, '/', 1) <> new.sender_id::text then
    raise exception 'Attach a photo you uploaded';
  end if;
  new.mentions := coalesce(array(
    select distinct u from unnest(new.mentions) as u where u is not null and u <> new.sender_id
  ), '{}');
  return new;
end;
$$;
revoke execute on function public.messages_before_insert() from public, anon, authenticated;

-- Mention notifications for members who haven't muted the chat.
create or replace function public.messages_notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_sender text;
begin
  if cardinality(new.mentions) = 0 then return new; end if;
  select coalesce(c.title, 'a loan chat') into v_title from public.conversations c where c.id = new.conversation_id;
  select nullif(split_part(p.full_name, ' ', 1), '') into v_sender from public.profiles p where p.id = new.sender_id;
  insert into public.notifications (user_id, type, title, body, payload)
  select m.user_id, 'new_message', format('Mentioned in %s', v_title),
    format('%s: %s', coalesce(v_sender, 'Someone'), left(coalesce(nullif(new.body, ''), 'Photo'), 140)),
    jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = new.conversation_id
    and m.user_id = any (new.mentions)
    and not m.muted
    and p.verification_status = 'verified';
  return new;
end;
$$;
revoke execute on function public.messages_notify_mentions() from public, anon, authenticated;

drop trigger if exists messages_notify_mentions on public.messages;
create trigger messages_notify_mentions
after insert on public.messages
for each row execute function public.messages_notify_mentions();

-- Reactions use the react rule, so members can react in announcement-only groups.
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
  if not public.can_react_conversation(v_msg.conversation_id, v_uid) then
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

-- Deleting also unpins and removes a poll.
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
  set deleted_at = now(), body = '', image_path = null, reactions = '{}'::jsonb,
      mentions = '{}', pinned_at = null, pinned_by = null, poll = null
  where id = p_message_id;
  if v_msg.sender_id <> v_uid then
    perform public.write_audit('message.deleted', 'message', p_message_id::text,
      jsonb_build_object('conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Inbox: adds muted and posting; muted chats count no unread messages
-- ---------------------------------------------------------------------------
drop function public.get_chat_inbox();
create function public.get_chat_inbox()
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
  counterpart_avatar_path text,
  muted boolean,
  posting text,
  last_message_has_image boolean
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
    select c.*, m.user_id is not null as member, m.last_read_at as my_read, coalesce(m.muted, false) as my_muted, me.uid
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
    case when v.member and not v.my_muted then (
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
    cp.id, cp.full_name, cp.avatar_path,
    v.my_muted, v.posting, h.image_path is not null
  from visible v
  left join lateral (
    select msg.id, msg.body, msg.sender_id, msg.created_at, msg.deleted_at, msg.image_path
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
-- 4. Mute, pin
-- ---------------------------------------------------------------------------
create or replace function public.set_conversation_muted(p_conversation_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.conversation_members set muted = coalesce(p_muted, false)
  where conversation_id = p_conversation_id and user_id = auth.uid();
  if not found then raise exception 'You are not a member of this conversation'; end if;
end;
$$;

-- Admins pin in groups; either student pins in a loan chat.
create or replace function public.pin_message(p_message_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_type public.conversation_type;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_msg from public.messages where id = p_message_id for update;
  if not found or v_msg.deleted_at is not null then raise exception 'Message not found'; end if;
  select type into v_type from public.conversations where id = v_msg.conversation_id;
  if v_type = 'community' then
    if not (public.is_admin(v_uid) and public.can_read_conversation(v_msg.conversation_id, v_uid)) then
      raise exception 'Only admins can pin messages in groups';
    end if;
  elsif not public.can_react_conversation(v_msg.conversation_id, v_uid) then
    raise exception 'You are not a member of this conversation';
  end if;
  update public.messages
  set pinned_at = case when coalesce(p_pinned, false) then coalesce(pinned_at, now()) end,
      pinned_by = case when coalesce(p_pinned, false) then coalesce(pinned_by, v_uid) end
  where id = p_message_id;
end;
$$;

revoke execute on function public.set_conversation_muted(uuid, boolean) from public, anon;
revoke execute on function public.pin_message(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated, service_role;
grant execute on function public.pin_message(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Polls: { question, options: [..], votes: { "<index>": [user ids] }, closed }
-- ---------------------------------------------------------------------------
create or replace function public.create_poll(p_conversation_id uuid, p_question text, p_options text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_question text := btrim(coalesce(p_question, ''));
  v_options text[];
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin(v_uid) then raise exception 'Only admins can create polls'; end if;
  if not exists (select 1 from public.conversations where id = p_conversation_id and type = 'community') then
    raise exception 'Polls are for groups';
  end if;
  if not public.can_post_conversation(p_conversation_id, v_uid) then
    raise exception 'Join this group to post a poll';
  end if;
  if char_length(v_question) not between 1 and 300 then raise exception 'Ask a question of up to 300 characters'; end if;
  select coalesce(array_agg(o order by n), '{}') into v_options
  from (
    select btrim(o) as o, min(n) as n
    from unnest(p_options) with ordinality as t(o, n)
    where btrim(coalesce(o, '')) <> ''
    group by btrim(o)
  ) d;
  if cardinality(v_options) not between 2 and 10 then raise exception 'Give 2 to 10 different options'; end if;
  if exists (select 1 from unnest(v_options) o where char_length(o) > 100) then
    raise exception 'Keep each option under 100 characters';
  end if;
  insert into public.messages (conversation_id, sender_id, body, poll)
  values (p_conversation_id, v_uid, v_question,
    jsonb_build_object('question', v_question, 'options', to_jsonb(v_options), 'votes', '{}'::jsonb, 'closed', false))
  returning id into v_id;
  return v_id;
end;
$$;

-- One vote per student; voting for your current choice takes it back.
create or replace function public.vote_poll(p_message_id uuid, p_option integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_votes jsonb := '{}'::jsonb;
  v_had boolean;
  v_key text;
  v_users jsonb;
  v_poll jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_msg from public.messages where id = p_message_id for update;
  if not found or v_msg.deleted_at is not null or v_msg.poll is null then raise exception 'Poll not found'; end if;
  if coalesce((v_msg.poll ->> 'closed')::boolean, false) then raise exception 'This poll is closed'; end if;
  if not public.can_react_conversation(v_msg.conversation_id, v_uid) then raise exception 'Join this group to vote'; end if;
  if p_option is null or p_option < 0 or p_option >= jsonb_array_length(v_msg.poll -> 'options') then
    raise exception 'Choose one of the options';
  end if;
  v_had := coalesce(v_msg.poll -> 'votes' -> p_option::text, '[]'::jsonb) ? v_uid::text;
  -- Remove the student's vote everywhere, then add it to the chosen option.
  for v_key, v_users in select key, value from jsonb_each(coalesce(v_msg.poll -> 'votes', '{}'::jsonb)) loop
    select coalesce(jsonb_agg(u), '[]'::jsonb) into v_users
    from jsonb_array_elements_text(v_users) as e(u) where u <> v_uid::text;
    if jsonb_array_length(v_users) > 0 then v_votes := v_votes || jsonb_build_object(v_key, v_users); end if;
  end loop;
  if not v_had then
    v_votes := jsonb_set(v_votes, array[p_option::text],
      coalesce(v_votes -> p_option::text, '[]'::jsonb) || jsonb_build_array(v_uid::text), true);
  end if;
  v_poll := jsonb_set(v_msg.poll, '{votes}', v_votes, true);
  update public.messages set poll = v_poll where id = p_message_id;
  return v_poll;
end;
$$;

-- The poll's author or an admin closes (or reopens) it.
create or replace function public.close_poll(p_message_id uuid, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_msg from public.messages where id = p_message_id for update;
  if not found or v_msg.deleted_at is not null or v_msg.poll is null then raise exception 'Poll not found'; end if;
  if v_msg.sender_id <> v_uid and not public.is_admin(v_uid) then raise exception 'Only the poll’s author or an admin can close it'; end if;
  update public.messages set poll = jsonb_set(poll, '{closed}', to_jsonb(coalesce(p_closed, true)), true)
  where id = p_message_id;
end;
$$;

revoke execute on function public.create_poll(uuid, text, text[]) from public, anon;
revoke execute on function public.vote_poll(uuid, integer) from public, anon;
revoke execute on function public.close_poll(uuid, boolean) from public, anon;
grant execute on function public.create_poll(uuid, text, text[]) to authenticated, service_role;
grant execute on function public.vote_poll(uuid, integer) to authenticated, service_role;
grant execute on function public.close_poll(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Admin settings: who can post. Old 3- and 5-argument calls still resolve.
-- ---------------------------------------------------------------------------
drop function public.admin_create_group(text, text, text);
create function public.admin_create_group(
  p_title text,
  p_description text default null,
  p_visibility text default 'open',
  p_posting text default 'everyone'
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
  v_posting text := coalesce(p_posting, 'everyone');
  v_id uuid;
begin
  if not public.is_admin(v_uid) then raise exception 'Only admins can manage groups'; end if;
  if char_length(v_title) not between 1 and 80 then raise exception 'Give the group a name of up to 80 characters'; end if;
  if char_length(v_description) > 500 then raise exception 'Keep the description under 500 characters'; end if;
  if coalesce(p_visibility, '') not in ('open', 'invite') then raise exception 'Choose public or private'; end if;
  if v_posting not in ('everyone', 'admins') then raise exception 'Choose who can post'; end if;
  begin
    insert into public.conversations (type, title, description, visibility, posting, created_by)
    values ('community', v_title, v_description, p_visibility, v_posting, v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A group with that name already exists';
  end;
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (v_id, v_uid, now());
  perform public.write_audit('group.created', 'conversation', v_id::text,
    jsonb_build_object('title', v_title, 'visibility', p_visibility, 'posting', v_posting));
  return v_id;
end;
$$;

drop function public.admin_update_group(uuid, text, text, text, boolean);
create function public.admin_update_group(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_visibility text,
  p_archived boolean,
  p_posting text default null
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
  if coalesce(p_visibility, '') not in ('open', 'invite') then raise exception 'Choose public or private'; end if;
  if p_posting is not null and p_posting not in ('everyone', 'admins') then raise exception 'Choose who can post'; end if;
  begin
    update public.conversations
    set title = v_title,
        description = v_description,
        visibility = p_visibility,
        posting = coalesce(p_posting, posting),
        archived_at = case when coalesce(p_archived, false) then coalesce(archived_at, now()) end,
        updated_at = now()
    where id = p_group_id and type = 'community';
  exception when unique_violation then
    raise exception 'A group with that name already exists';
  end;
  if not found then raise exception 'Group not found'; end if;
  perform public.write_audit('group.updated', 'conversation', p_group_id::text,
    jsonb_build_object('title', v_title, 'visibility', p_visibility, 'archived', coalesce(p_archived, false), 'posting', p_posting));
end;
$$;

drop function public.admin_list_groups();
create function public.admin_list_groups()
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
  last_message_at timestamptz,
  posting text,
  pinned_count integer
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
      (select max(g.created_at) from public.messages g where g.conversation_id = c.id),
      c.posting,
      (select count(*)::integer from public.messages g where g.conversation_id = c.id and g.pinned_at is not null)
    from public.conversations c
    where c.type = 'community'
    order by c.archived_at is not null, lower(c.title);
end;
$$;

revoke execute on function public.admin_create_group(text, text, text, text) from public, anon;
revoke execute on function public.admin_update_group(uuid, text, text, text, boolean, text) from public, anon;
revoke execute on function public.admin_list_groups() from public, anon;
grant execute on function public.admin_create_group(text, text, text, text) to authenticated, service_role;
grant execute on function public.admin_update_group(uuid, text, text, text, boolean, text) to authenticated, service_role;
grant execute on function public.admin_list_groups() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Photos: readable by the uploader and by students who can read the message
-- ---------------------------------------------------------------------------
drop policy if exists chat_images_read on storage.objects;
create policy chat_images_read on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.messages m
      where m.image_path = objects.name
        and public.can_read_conversation(m.conversation_id, (select auth.uid()))
    )
  )
);

-- ---------------------------------------------------------------------------
-- 8. Typing indicator: private broadcast channels named "typing:<chat id>"
-- ---------------------------------------------------------------------------
-- Listening needs read access to the chat; sending needs permission to post.
create or replace function public.chat_topic_allowed(p_topic text, p_send boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or p_topic is null
     or p_topic !~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := substr(p_topic, 8)::uuid;
  return case when coalesce(p_send, false)
    then public.can_post_conversation(v_id, auth.uid())
    else public.can_read_conversation(v_id, auth.uid()) end;
end;
$$;
revoke execute on function public.chat_topic_allowed(text, boolean) from public, anon;
grant execute on function public.chat_topic_allowed(text, boolean) to authenticated, service_role;

do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists chat_typing_listen on realtime.messages';
    execute 'drop policy if exists chat_typing_send on realtime.messages';
    execute $policy$
      create policy chat_typing_listen on realtime.messages
      for select to authenticated
      using (extension = 'broadcast' and public.chat_topic_allowed(realtime.topic(), false))
    $policy$;
    execute $policy$
      create policy chat_typing_send on realtime.messages
      for insert to authenticated
      with check (extension = 'broadcast' and public.chat_topic_allowed(realtime.topic(), true))
    $policy$;
  else
    raise notice 'realtime.messages not present: typing policies skipped';
  end if;
end;
$$;
