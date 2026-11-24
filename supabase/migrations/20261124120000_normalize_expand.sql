-- Normalization, step 1 of 2: expand.
--
-- Moves every value that was stored as a list inside one cell, or as a
-- repeated group of columns, into its own table:
--
--   items.images, campus_posts.images      -> item_photos, campus_post_photos
--   messages.mentions                      -> message_mentions
--   messages.reactions                     -> message_reactions
--   messages.poll                          -> polls, poll_options, poll_votes
--   campus_schedules.weekly / exceptions   -> campus_schedule_windows, campus_schedule_exceptions
--   loans.handover_* / return_*            -> loan_handovers
--   handover_secrets.pickup_hash/return_hash -> borrowbuddy_private.handover_codes
--   profiles.department (free text)        -> departments lookup + profiles.department_id
--   reports.target + target_id (no FK)     -> reported_item_id / reported_user_id / reported_message_id
--
-- It also makes the copied loan columns provably consistent (composite FKs)
-- and points wishlist_items / assistant_usage at profiles instead of auth.users.
--
-- The new tables are the source of truth from now on. The old columns stay
-- for one release so the Android app already installed on phones keeps
-- working: functions and triggers keep them filled in from the new tables,
-- and the few columns old clients still write directly (items.images,
-- messages.mentions, profiles.department, campus_posts.images and the
-- schedule JSON written by campus_api) are copied into the new tables by
-- triggers. Step 2 (contract) drops the old columns and those triggers once
-- the web app and a new Android release read the new tables.

-- ---------------------------------------------------------------------------
-- 1. Departments: a lookup table instead of free text
-- ---------------------------------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  sort_order integer not null default 1000,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index departments_name_key on public.departments (lower(name));

insert into public.departments (name, sort_order)
values
  ('Computer Science', 10),
  ('Electronics & Communication', 20),
  ('Mechanical Engineering', 30),
  ('Civil Engineering', 40),
  ('Biotechnology', 50),
  ('Business & Management', 60),
  ('Law', 70),
  ('Design', 80),
  ('Other', 900)
on conflict ((lower(name))) do nothing;

-- Values students typed before the list existed (2 to 80 characters).
insert into public.departments (name, is_active)
select distinct on (lower(btrim(p.department))) btrim(p.department), false
from public.profiles p
where char_length(btrim(coalesce(p.department, ''))) between 2 and 80
on conflict ((lower(name))) do nothing;

alter table public.profiles
  add column department_id uuid references public.departments (id) on delete set null;
create index profiles_department_idx on public.profiles (department_id);

update public.profiles p
set department_id = d.id
from public.departments d
where lower(d.name) = lower(btrim(p.department));

alter table public.departments enable row level security;
create policy departments_read on public.departments for select using (true);
revoke all on public.departments from anon, authenticated;
grant select on public.departments to anon, authenticated;

grant select (department_id) on public.profiles to anon, authenticated;
grant insert (department_id), update (department_id) on public.profiles to authenticated;

-- Keeps department_id and the old text column in step either way: new
-- clients set department_id, the installed Android app and
-- admin_update_student still set the text. Removed in step 2.
create function public.profiles_sync_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.department_id is not null
     and (tg_op = 'INSERT' or new.department_id is distinct from old.department_id) then
    select d.name into new.department from public.departments d where d.id = new.department_id;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.department_id is null and old.department_id is not null
     and new.department is not distinct from old.department then
    new.department := null;
    return new;
  end if;
  if tg_op = 'INSERT' or new.department is distinct from old.department then
    new.department := nullif(btrim(coalesce(new.department, '')), '');
    if new.department is null then
      new.department_id := null;
    else
      if char_length(new.department) between 2 and 80 then
        insert into public.departments (name, is_active) values (new.department, false)
        on conflict ((lower(name))) do nothing;
      end if;
      select d.id, d.name into new.department_id, new.department
      from public.departments d where lower(d.name) = lower(new.department);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_sync_department() from public, anon, authenticated;

create trigger profiles_sync_department
  before insert or update of department, department_id on public.profiles
  for each row execute function public.profiles_sync_department();

-- ---------------------------------------------------------------------------
-- 2. Photos: one row per photo instead of a text[] per item / post
-- ---------------------------------------------------------------------------

create table public.item_photos (
  item_id uuid not null references public.items (id) on delete cascade,
  position smallint not null check (position between 0 and 5),
  path text not null unique check (char_length(path) between 3 and 300),
  primary key (item_id, position)
);

create table public.campus_post_photos (
  post_id uuid not null references public.campus_posts (id) on delete cascade,
  position smallint not null check (position between 0 and 5),
  path text not null unique check (char_length(path) between 3 and 300),
  primary key (post_id, position)
);

insert into public.item_photos (item_id, position, path)
select i.id, (t.n - 1)::smallint, t.path
from public.items i, unnest(i.images) with ordinality as t(path, n);

insert into public.campus_post_photos (post_id, position, path)
select p.id, (t.n - 1)::smallint, t.path
from public.campus_posts p, unnest(p.images) with ordinality as t(path, n);

alter table public.item_photos enable row level security;
alter table public.campus_post_photos enable row level security;
-- A photo is visible exactly when its item / post is (their own RLS applies).
create policy item_photos_read on public.item_photos for select
  using (exists (select 1 from public.items i where i.id = item_id));
create policy campus_post_photos_read on public.campus_post_photos for select
  using (exists (select 1 from public.campus_posts p where p.id = post_id));
revoke all on public.item_photos, public.campus_post_photos from anon, authenticated;
grant select on public.item_photos to anon, authenticated;
grant select on public.campus_post_photos to authenticated;

-- Copies a direct write of the old images column into the photo table.
create function public.items_sync_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.item_photos where item_id = new.id;
  insert into public.item_photos (item_id, position, path)
  select new.id, (t.n - 1)::smallint, t.path
  from unnest(new.images) with ordinality as t(path, n);
  return null;
end;
$$;

create function public.campus_posts_sync_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.campus_post_photos where post_id = new.id;
  insert into public.campus_post_photos (post_id, position, path)
  select new.id, (t.n - 1)::smallint, t.path
  from unnest(new.images) with ordinality as t(path, n);
  return null;
end;
$$;
revoke all on function public.items_sync_photos(), public.campus_posts_sync_photos() from public, anon, authenticated;

create trigger items_sync_photos
  after insert or update of images on public.items
  for each row execute function public.items_sync_photos();
create trigger campus_posts_sync_photos
  after insert or update of images on public.campus_posts
  for each row execute function public.campus_posts_sync_photos();

-- How clients set an item's photos from now on (order = display order,
-- first = cover). In step 1 it writes through the old column so the
-- installed Android app sees the change; step 2 writes item_photos directly.
create function public.set_item_photos(p_item_id uuid, p_paths text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_paths text[];
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select i.owner_id into v_owner from public.items i where i.id = p_item_id for update;
  if v_owner is null or v_owner <> v_uid then raise exception 'Item not found'; end if;

  select coalesce(array_agg(d.path order by d.n), '{}') into v_paths
  from (
    select btrim(t.path) as path, min(t.n) as n
    from unnest(coalesce(p_paths, '{}')) with ordinality as t(path, n)
    where btrim(coalesce(t.path, '')) <> ''
    group by btrim(t.path)
  ) d;

  if cardinality(v_paths) > 6 then raise exception 'Add up to 6 photos'; end if;
  if exists (
    select 1 from unnest(v_paths) as p(path)
    where split_part(p.path, '/', 1) <> v_uid::text
      and not exists (select 1 from public.item_photos ph where ph.item_id = p_item_id and ph.path = p.path)
  ) then
    raise exception 'Use photos you uploaded';
  end if;

  update public.items set images = v_paths where id = p_item_id;
  return v_paths;
end;
$$;
revoke all on function public.set_item_photos(uuid, text[]) from public, anon;
grant execute on function public.set_item_photos(uuid, text[]) to authenticated;

-- Storage rules now look a photo up by its path (unique index) instead of
-- scanning every post's array.
drop policy campus_photo_read on storage.objects;
drop policy campus_photo_delete on storage.objects;
create policy campus_photo_read on storage.objects for select to authenticated using (
  bucket_id = 'campus-photos' and public.is_verified((select auth.uid())) and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.campus_post_photos ph where ph.path = name)
  )
);
create policy campus_photo_delete on storage.objects for delete to authenticated using (
  bucket_id = 'campus-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.campus_post_photos ph where ph.path = name)
);

-- ---------------------------------------------------------------------------
-- 3. Chat: mentions, reactions and polls get their own tables
-- ---------------------------------------------------------------------------

-- Bumped whenever a reaction or vote changes, so Realtime subscribers to
-- messages still hear about it once the old JSON columns are gone.
alter table public.messages add column activity_at timestamptz;

create table public.message_mentions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (message_id, user_id)
);
create index message_mentions_user_idx on public.message_mentions (user_id);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji = any (array['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉'])),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index message_reactions_user_idx on public.message_reactions (user_id);

create table public.polls (
  message_id uuid primary key references public.messages (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 300),
  closed_at timestamptz
);

create table public.poll_options (
  poll_id uuid not null references public.polls (message_id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  label text not null check (char_length(label) between 1 and 100),
  primary key (poll_id, position),
  unique (poll_id, label)
);

-- The primary key is what allows one vote per student per poll.
create table public.poll_votes (
  poll_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_position smallint not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (poll_id, option_position) references public.poll_options (poll_id, position) on delete cascade
);
create index poll_votes_option_idx on public.poll_votes (poll_id, option_position);
create index poll_votes_user_idx on public.poll_votes (user_id);

-- Backfill (before any trigger below exists, so no notifications are sent).
insert into public.message_mentions (message_id, user_id)
select m.id, u.user_id
from public.messages m, unnest(m.mentions) as u(user_id)
where exists (select 1 from public.profiles p where p.id = u.user_id)
on conflict do nothing;

insert into public.message_reactions (message_id, user_id, emoji, created_at)
select m.id, u.user_id::uuid, e.key, m.created_at + (u.n * interval '1 microsecond')
from public.messages m,
  jsonb_each(m.reactions) as e(key, value),
  jsonb_array_elements_text(e.value) with ordinality as u(user_id, n)
where e.key = any (array['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉'])
  and exists (select 1 from public.profiles p where p.id::text = u.user_id)
on conflict do nothing;

insert into public.polls (message_id, question, closed_at)
select m.id, left(coalesce(nullif(btrim(m.poll ->> 'question'), ''), nullif(btrim(m.body), ''), 'Poll'), 300),
  case when coalesce((m.poll ->> 'closed')::boolean, false) then m.created_at end
from public.messages m
where m.poll is not null;

insert into public.poll_options (poll_id, position, label)
select m.id, (o.n - 1)::smallint, left(o.label, 100)
from public.messages m, jsonb_array_elements_text(m.poll -> 'options') with ordinality as o(label, n)
where m.poll is not null and o.n <= 10
on conflict do nothing;

insert into public.poll_votes (poll_id, user_id, option_position, created_at)
select m.id, u.user_id::uuid, v.key::smallint, m.created_at + (u.n * interval '1 microsecond')
from public.messages m,
  jsonb_each(coalesce(m.poll -> 'votes', '{}'::jsonb)) as v(key, value),
  jsonb_array_elements_text(v.value) with ordinality as u(user_id, n)
where m.poll is not null
  and v.key ~ '^[0-9]$'
  and exists (select 1 from public.poll_options o where o.poll_id = m.id and o.position = v.key::smallint)
  and exists (select 1 from public.profiles p where p.id::text = u.user_id)
on conflict do nothing;

alter table public.message_mentions enable row level security;
alter table public.message_reactions enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
-- Readable by whoever can read the message (messages RLS applies).
create policy message_mentions_read on public.message_mentions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));
create policy message_reactions_read on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));
create policy polls_read on public.polls for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));
create policy poll_options_read on public.poll_options for select to authenticated
  using (exists (select 1 from public.messages m where m.id = poll_id));
create policy poll_votes_read on public.poll_votes for select to authenticated
  using (exists (select 1 from public.messages m where m.id = poll_id));
-- Written only by the functions below.
revoke all on public.message_mentions, public.message_reactions, public.polls,
  public.poll_options, public.poll_votes from anon, authenticated;
grant select on public.message_mentions, public.message_reactions, public.polls,
  public.poll_options, public.poll_votes to authenticated;

-- Rebuild today's JSON shapes from the tables, for the read view and for
-- the functions that return them.
create function public.message_reactions_json(p_message_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(g.emoji, g.users), '{}'::jsonb)
  from (
    select r.emoji, jsonb_agg(r.user_id::text order by r.created_at, r.user_id) as users
    from public.message_reactions r
    where r.message_id = p_message_id
    group by r.emoji
  ) g;
$$;

create function public.message_mentions_array(p_message_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(mm.user_id order by mm.user_id), '{}')
  from public.message_mentions mm
  where mm.message_id = p_message_id;
$$;

create function public.message_poll_json(p_message_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'question', p.question,
    'options', coalesce((
      select jsonb_agg(o.label order by o.position)
      from public.poll_options o where o.poll_id = p.message_id
    ), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_object_agg(g.k, g.users)
      from (
        select v.option_position::text as k,
          jsonb_agg(v.user_id::text order by v.created_at, v.user_id) as users
        from public.poll_votes v
        where v.poll_id = p.message_id
        group by v.option_position
      ) g
    ), '{}'::jsonb),
    'closed', p.closed_at is not null
  )
  from public.polls p
  where p.message_id = p_message_id;
$$;
revoke all on function public.message_reactions_json(uuid), public.message_mentions_array(uuid),
  public.message_poll_json(uuid) from public, anon;
grant execute on function public.message_reactions_json(uuid), public.message_mentions_array(uuid),
  public.message_poll_json(uuid) to authenticated;

-- What clients read messages from: the stored columns plus reactions,
-- mentions and poll rebuilt from their tables. security_invoker keeps the
-- reader's own row security.
create view public.message_feed
with (security_invoker = true)
as
select
  m.id, m.conversation_id, m.sender_id, m.body, m.image_path, m.created_at,
  m.reply_to_id, m.edited_at, m.deleted_at, m.pinned_at, m.pinned_by, m.activity_at,
  public.message_reactions_json(m.id) as reactions,
  public.message_mentions_array(m.id) as mentions,
  public.message_poll_json(m.id) as poll
from public.messages m;
revoke all on public.message_feed from anon, authenticated;
grant select on public.message_feed to authenticated;

-- New messages: same checks as before, and clear the activity marker.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.edited_at := null;
  new.deleted_at := null;
  new.activity_at := null;
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

-- Mentions written in the old column become rows; the notification now
-- fires per mention row.
drop trigger messages_notify_mentions on public.messages;
drop function public.messages_notify_mentions();

create function public.messages_copy_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(new.mentions) > 0 then
    insert into public.message_mentions (message_id, user_id)
    select new.id, u.user_id
    from unnest(new.mentions) as u(user_id)
    where exists (select 1 from public.profiles p where p.id = u.user_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create function public.message_mentions_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.messages;
  v_title text;
  v_sender text;
begin
  select * into v_msg from public.messages where id = new.message_id;
  if not exists (
    select 1
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    where m.conversation_id = v_msg.conversation_id
      and m.user_id = new.user_id
      and not m.muted
      and p.verification_status = 'verified'
  ) then
    return null;
  end if;
  select coalesce(c.title, 'a loan chat') into v_title from public.conversations c where c.id = v_msg.conversation_id;
  select nullif(split_part(p.full_name, ' ', 1), '') into v_sender from public.profiles p where p.id = v_msg.sender_id;
  insert into public.notifications (user_id, type, title, body, payload)
  values (
    new.user_id, 'new_message', format('Mentioned in %s', v_title),
    format('%s: %s', coalesce(v_sender, 'Someone'), left(coalesce(nullif(v_msg.body, ''), 'Photo'), 140)),
    jsonb_build_object('conversation_id', v_msg.conversation_id, 'message_id', v_msg.id)
  );
  return null;
end;
$$;
revoke all on function public.messages_copy_mentions(), public.message_mentions_notify() from public, anon, authenticated;

create trigger messages_copy_mentions
  after insert on public.messages
  for each row execute function public.messages_copy_mentions();
create trigger message_mentions_notify
  after insert on public.message_mentions
  for each row execute function public.message_mentions_notify();

-- Sending a message with mentions (replaces writing messages.mentions
-- directly). Same rule as the messages_insert policy; the before-insert
-- trigger still checks replies, photos and cleans the mention list.
create function public.post_message(
  p_conversation_id uuid,
  p_body text,
  p_image_path text default null,
  p_reply_to_id uuid default null,
  p_mentions uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.can_post_conversation(p_conversation_id, v_uid) then
    raise exception 'You can no longer post in this chat';
  end if;
  if cardinality(coalesce(p_mentions, '{}')) > 20 then raise exception 'Mention up to 20 people'; end if;
  insert into public.messages (conversation_id, sender_id, body, image_path, reply_to_id, mentions)
  values (p_conversation_id, v_uid, coalesce(p_body, ''), p_image_path, p_reply_to_id, coalesce(p_mentions, '{}'))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.post_message(uuid, text, text, uuid, uuid[]) from public, anon;
grant execute on function public.post_message(uuid, text, text, uuid, uuid[]) to authenticated;

create or replace function public.toggle_message_reaction(p_message_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
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

  delete from public.message_reactions
  where message_id = p_message_id and user_id = v_uid and emoji = p_emoji;
  if not found then
    insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, v_uid, p_emoji);
  end if;

  v_reactions := public.message_reactions_json(p_message_id);
  -- The old column is kept in step until step 2; this UPDATE is also what
  -- tells Realtime subscribers the message changed.
  update public.messages set reactions = v_reactions, activity_at = now() where id = p_message_id;
  return v_reactions;
end;
$$;

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

  insert into public.polls (message_id, question) values (v_id, v_question);
  insert into public.poll_options (poll_id, position, label)
  select v_id, (t.n - 1)::smallint, t.label
  from unnest(v_options) with ordinality as t(label, n);
  return v_id;
end;
$$;

create or replace function public.vote_poll(p_message_id uuid, p_option integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_poll public.polls;
  v_previous smallint;
  v_json jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_msg from public.messages where id = p_message_id for update;
  if not found or v_msg.deleted_at is not null then raise exception 'Poll not found'; end if;
  select * into v_poll from public.polls where message_id = p_message_id;
  if not found then raise exception 'Poll not found'; end if;
  if v_poll.closed_at is not null then raise exception 'This poll is closed'; end if;
  if not public.can_react_conversation(v_msg.conversation_id, v_uid) then raise exception 'Join this group to vote'; end if;
  if p_option is null or p_option < 0 or p_option > 9 or not exists (
    select 1 from public.poll_options o where o.poll_id = p_message_id and o.position = p_option
  ) then
    raise exception 'Choose one of the options';
  end if;

  -- One vote per student (primary key): choosing the same option again takes it back.
  delete from public.poll_votes where poll_id = p_message_id and user_id = v_uid
  returning option_position into v_previous;
  if v_previous is distinct from p_option then
    insert into public.poll_votes (poll_id, user_id, option_position)
    values (p_message_id, v_uid, p_option::smallint);
  end if;

  v_json := public.message_poll_json(p_message_id);
  update public.messages set poll = v_json, activity_at = now() where id = p_message_id;
  return v_json;
end;
$$;

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
  if not found or v_msg.deleted_at is not null
     or not exists (select 1 from public.polls where message_id = p_message_id) then
    raise exception 'Poll not found';
  end if;
  if v_msg.sender_id <> v_uid and not public.is_admin(v_uid) then raise exception 'Only the poll’s author or an admin can close it'; end if;
  update public.polls
  set closed_at = case when coalesce(p_closed, true) then coalesce(closed_at, now()) end
  where message_id = p_message_id;
  update public.messages set poll = public.message_poll_json(p_message_id), activity_at = now()
  where id = p_message_id;
end;
$$;

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
  delete from public.message_reactions where message_id = p_message_id;
  delete from public.message_mentions where message_id = p_message_id;
  delete from public.polls where message_id = p_message_id;
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

-- Now returns a message_feed row, so the reactions and poll it carries come
-- from the new tables (and keep working after step 2).
drop function public.edit_message(uuid, text);
create function public.edit_message(p_message_id uuid, p_body text)
returns public.message_feed
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_body text := btrim(coalesce(p_body, ''));
  v_row public.message_feed;
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
    update public.messages set body = v_body, edited_at = now() where id = p_message_id;
  end if;
  select * into v_row from public.message_feed where id = p_message_id;
  return v_row;
end;
$$;
revoke all on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Campus pickup schedules: one row per weekday / exception date
-- ---------------------------------------------------------------------------

create table public.campus_schedule_windows (
  host_id uuid not null references public.campus_schedules (host_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts time not null,
  ends time not null,
  primary key (host_id, weekday),
  check (starts < ends)
);

create table public.campus_schedule_exceptions (
  host_id uuid not null references public.campus_schedules (host_id) on delete cascade,
  on_date date not null,
  blocked boolean not null default false,
  starts time,
  ends time,
  primary key (host_id, on_date),
  check (
    (blocked and starts is null and ends is null)
    or (not blocked and starts is not null and ends is not null and starts < ends)
  )
);

create function public.campus_schedules_sync_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.campus_schedule_windows where host_id = new.host_id;
  delete from public.campus_schedule_exceptions where host_id = new.host_id;
  insert into public.campus_schedule_windows (host_id, weekday, starts, ends)
  select new.host_id, (w ->> 'day')::smallint, (w ->> 'start')::time, (w ->> 'end')::time
  from jsonb_array_elements(new.weekly) as w
  where not coalesce((w ->> 'blocked')::boolean, false)
  on conflict do nothing;
  insert into public.campus_schedule_exceptions (host_id, on_date, blocked, starts, ends)
  select new.host_id, (x ->> 'date')::date, coalesce((x ->> 'blocked')::boolean, false),
    case when coalesce((x ->> 'blocked')::boolean, false) then null else (x ->> 'start')::time end,
    case when coalesce((x ->> 'blocked')::boolean, false) then null else (x ->> 'end')::time end
  from jsonb_array_elements(new.exceptions) as x
  on conflict do nothing;
  return null;
end;
$$;
revoke all on function public.campus_schedules_sync_rows() from public, anon, authenticated;

-- campus_api('save_schedule') still writes the JSON columns in step 1; this
-- turns each save into rows. Step 2 makes campus_api write the rows itself.
create trigger campus_schedules_sync_rows
  after insert or update of weekly, exceptions on public.campus_schedules
  for each row execute function public.campus_schedules_sync_rows();

-- Backfill by touching every schedule once.
update public.campus_schedules set weekly = weekly;

alter table public.campus_schedule_windows enable row level security;
alter table public.campus_schedule_exceptions enable row level security;
create policy campus_schedule_windows_read on public.campus_schedule_windows for select to authenticated
  using (public.is_verified((select auth.uid())));
create policy campus_schedule_exceptions_read on public.campus_schedule_exceptions for select to authenticated
  using (public.is_verified((select auth.uid())));
revoke all on public.campus_schedule_windows, public.campus_schedule_exceptions from anon, authenticated;
grant select on public.campus_schedule_windows, public.campus_schedule_exceptions to authenticated;

-- The editors' read model: the rows put back into the weekly / exceptions
-- shape they already understand.
create view public.campus_schedule_view
with (security_invoker = true)
as
select
  s.host_id, s.pickup_location_id, s.slot_minutes, s.updated_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'day', w.weekday, 'start', to_char(w.starts, 'HH24:MI'), 'end', to_char(w.ends, 'HH24:MI')
    ) order by w.weekday)
    from public.campus_schedule_windows w where w.host_id = s.host_id
  ), '[]'::jsonb) as weekly,
  coalesce((
    select jsonb_agg(case
      when e.blocked then jsonb_build_object('date', to_char(e.on_date, 'YYYY-MM-DD'), 'blocked', true)
      else jsonb_build_object('date', to_char(e.on_date, 'YYYY-MM-DD'), 'blocked', false,
        'start', to_char(e.starts, 'HH24:MI'), 'end', to_char(e.ends, 'HH24:MI'))
    end order by e.on_date)
    from public.campus_schedule_exceptions e where e.host_id = s.host_id
  ), '[]'::jsonb) as exceptions
from public.campus_schedules s;
revoke all on public.campus_schedule_view from anon, authenticated;
grant select on public.campus_schedule_view to authenticated;

create or replace function public.campus_slots(p_host uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.campus_schedules;
  v_found boolean;
  v_blocked boolean;
  v_start time;
  v_end time;
  first_at timestamptz;
  last_at timestamptz;
  result jsonb;
begin
  if auth.uid() is null or not public.is_verified(auth.uid()) then raise exception 'Verified membership required'; end if;
  if not public.is_verified(p_host) or p_date < (now() at time zone 'Asia/Kolkata')::date
     or p_date > (now() at time zone 'Asia/Kolkata')::date + 30 then
    return '[]';
  end if;
  select * into s from public.campus_schedules where host_id = p_host;
  if s.host_id is null or not exists (select 1 from public.pickup_locations where id = s.pickup_location_id and is_active) then
    return '[]';
  end if;

  -- A dated exception wins over the weekly window for that weekday.
  select true, e.blocked, e.starts, e.ends into v_found, v_blocked, v_start, v_end
  from public.campus_schedule_exceptions e where e.host_id = p_host and e.on_date = p_date;
  if v_found is null then
    select true, false, w.starts, w.ends into v_found, v_blocked, v_start, v_end
    from public.campus_schedule_windows w
    where w.host_id = p_host and w.weekday = extract(dow from p_date)::smallint;
  end if;
  if v_found is null or v_blocked then return '[]'; end if;

  first_at := (p_date + v_start) at time zone 'Asia/Kolkata';
  last_at := (p_date + v_end) at time zone 'Asia/Kolkata';
  select coalesce(jsonb_agg(jsonb_build_object(
      'starts_at', slot, 'ends_at', slot + make_interval(mins => s.slot_minutes),
      'pickup_location_id', s.pickup_location_id) order by slot), '[]')
  into result
  from generate_series(first_at, last_at - make_interval(mins => s.slot_minutes), make_interval(mins => s.slot_minutes)) slot
  where slot > now()
    and not exists (
      select 1 from borrowbuddy_private.campus_occupancy o
      where o.user_id in (p_host, auth.uid())
        and o.during && tstzrange(slot, slot + make_interval(mins => s.slot_minutes), '[)')
    );
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Handovers: one row per loan and kind instead of pickup_* / return_* columns
-- ---------------------------------------------------------------------------

create table public.loan_handovers (
  loan_id uuid not null references public.loans (id) on delete cascade,
  kind public.handover_kind not null,
  expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  confirmed_at timestamptz,
  primary key (loan_id, kind)
);

insert into public.loan_handovers (loan_id, kind, expires_at, attempts, confirmed_at)
select id, 'pickup'::public.handover_kind, handover_token_expires_at, handover_attempts, pickup_confirmed_at
from public.loans
where handover_token_expires_at is not null or handover_attempts > 0 or pickup_confirmed_at is not null
union all
select id, 'return'::public.handover_kind, return_token_expires_at, return_attempts, return_confirmed_at
from public.loans
where return_token_expires_at is not null or return_attempts > 0 or return_confirmed_at is not null;

alter table public.loan_handovers enable row level security;
create policy loan_handovers_read on public.loan_handovers for select to authenticated
  using (public.is_loan_party(loan_id, (select auth.uid())) or public.is_admin((select auth.uid())));
revoke all on public.loan_handovers from anon, authenticated;
grant select on public.loan_handovers to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.loan_handovers;
  end if;
end;
$$;

create table borrowbuddy_private.handover_codes (
  loan_id uuid not null references public.loans (id) on delete cascade,
  kind public.handover_kind not null,
  hash text not null,
  primary key (loan_id, kind)
);
revoke all on borrowbuddy_private.handover_codes from public, anon, authenticated;

insert into borrowbuddy_private.handover_codes (loan_id, kind, hash)
select loan_id, 'pickup'::public.handover_kind, pickup_hash from borrowbuddy_private.handover_secrets where pickup_hash is not null
union all
select loan_id, 'return'::public.handover_kind, return_hash from borrowbuddy_private.handover_secrets where return_hash is not null;

-- The two hash columns on loans have been empty (and forced empty by a
-- check) since the hashes moved to the private schema.
alter table public.loans drop constraint loans_no_public_handover_secrets;
alter table public.loans drop column handover_token_hash, drop column return_token_hash;

create or replace function public.generate_handover_token(p_loan_id uuid, p_kind public.handover_kind)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_code text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_verified(v_uid) then raise exception 'Only verified students can generate handover codes'; end if;
  if p_kind is null then raise exception 'Choose pickup or return'; end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found'; end if;

  if p_kind = 'pickup' then
    if v_uid <> v_loan.borrower_id then raise exception 'Only the borrower can show the pickup code'; end if;
    if v_loan.status <> 'awaiting_pickup' then raise exception 'This loan is not awaiting pickup'; end if;
  else
    if v_uid <> v_loan.owner_id then raise exception 'Only the owner can show the return code'; end if;
    if v_loan.status not in ('active', 'return_pending', 'overdue') then
      raise exception 'This item is not currently out on loan';
    end if;
  end if;

  v_code := public.random_digits(6);

  insert into public.loan_handovers (loan_id, kind, expires_at, attempts)
  values (p_loan_id, p_kind, v_expires, 0)
  on conflict (loan_id, kind) do update set expires_at = excluded.expires_at, attempts = 0;

  insert into borrowbuddy_private.handover_codes (loan_id, kind, hash)
  values (p_loan_id, p_kind, encode(extensions.digest(v_code, 'sha256'), 'hex'))
  on conflict (loan_id, kind) do update set hash = excluded.hash;

  -- Old columns, kept in step until step 2.
  if p_kind = 'pickup' then
    update public.loans set handover_token_expires_at = v_expires, handover_attempts = 0 where id = p_loan_id;
  else
    update public.loans set return_token_expires_at = v_expires, return_attempts = 0 where id = p_loan_id;
  end if;

  return v_code;
end;
$$;

-- A wrong code: count the attempt (and keep the old column in step).
create function borrowbuddy_private.count_handover_attempt(p_loan_id uuid, p_kind public.handover_kind)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.loan_handovers set attempts = attempts + 1 where loan_id = p_loan_id and kind = p_kind;
  update public.loans
  set handover_attempts = handover_attempts + case when p_kind = 'pickup' then 1 else 0 end,
      return_attempts = return_attempts + case when p_kind = 'return' then 1 else 0 end
  where id = p_loan_id;
$$;
revoke all on function borrowbuddy_private.count_handover_attempt(uuid, public.handover_kind) from public, anon, authenticated;

create or replace function public.confirm_handover(p_loan_id uuid, p_token text, p_kind public.handover_kind)
returns public.loans
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_hash text;
  v_expires timestamptz;
  v_attempts int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found'; end if;

  if p_kind = 'pickup' and v_uid <> v_loan.owner_id then
    raise exception 'Only the owner can confirm the pickup';
  end if;
  if p_kind = 'return' and v_uid <> v_loan.borrower_id then
    raise exception 'Only the borrower can confirm the return';
  end if;

  select c.hash into v_hash from borrowbuddy_private.handover_codes c where c.loan_id = p_loan_id and c.kind = p_kind;
  select h.expires_at, h.attempts into v_expires, v_attempts
  from public.loan_handovers h where h.loan_id = p_loan_id and h.kind = p_kind;

  if v_hash is null then raise exception 'Ask the other student to show a fresh code'; end if;
  if v_expires is null or v_expires <= now() then raise exception 'That code has expired — ask for a new one'; end if;
  if coalesce(v_attempts, 0) >= 5 then raise exception 'Too many incorrect attempts — ask for a new code'; end if;

  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then
    perform borrowbuddy_private.count_handover_attempt(p_loan_id, p_kind);
    raise exception 'Incorrect code';
  end if;

  update public.loan_handovers
  set confirmed_at = now(), expires_at = null, attempts = 0
  where loan_id = p_loan_id and kind = p_kind;

  if p_kind = 'pickup' then
    update public.loans
    set status = 'active',
        pickup_confirmed_at = now(),
        handover_token_expires_at = null,
        handover_attempts = 0
    where id = p_loan_id
    returning * into v_loan;

    perform public.create_notification(
      v_loan.borrower_id, 'handover_confirmed', 'Pickup confirmed',
      format('Enjoy! Please return the item by %s.', to_char(v_loan.due_date, 'DD Mon YYYY')),
      jsonb_build_object('loan_id', v_loan.id)
    );
  else
    update public.loans
    set status = 'returned',
        returned_at = now(),
        return_confirmed_at = now(),
        return_token_expires_at = null,
        return_attempts = 0
    where id = p_loan_id
    returning * into v_loan;

    perform public.create_notification(
      v_loan.owner_id, 'loan_returned', 'Item returned',
      'The borrower confirmed the return. Leave a rating for them.',
      jsonb_build_object('loan_id', v_loan.id)
    );
    perform public.create_notification(
      v_loan.borrower_id, 'loan_returned', 'Return confirmed',
      'Thanks for returning the item. Leave a rating for the owner.',
      jsonb_build_object('loan_id', v_loan.id)
    );
    perform public.notify_waitlist_for_item(v_loan.item_id);
  end if;

  delete from borrowbuddy_private.handover_codes where loan_id = p_loan_id;
  return v_loan;
end;
$$;

create or replace function public.confirm_handover_v2(p_loan_id uuid, p_token text, p_kind public.handover_kind)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans;
  v_hash text;
  v_expires timestamptz;
  v_attempts int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_verified(v_uid) then raise exception 'Only verified students can confirm handovers'; end if;
  if p_kind is null then raise exception 'Choose pickup or return'; end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan is null then raise exception 'Loan not found'; end if;

  if p_kind = 'pickup' then
    if v_uid <> v_loan.owner_id then raise exception 'Only the owner can confirm the pickup'; end if;
    if v_loan.status <> 'awaiting_pickup' then
      return jsonb_build_object('ok', false, 'error', 'This loan is not awaiting pickup');
    end if;
  else
    if v_uid <> v_loan.borrower_id then raise exception 'Only the borrower can confirm the return'; end if;
    if v_loan.status not in ('active', 'return_pending', 'overdue') then
      return jsonb_build_object('ok', false, 'error', 'This item is not currently out on loan');
    end if;
  end if;

  select c.hash into v_hash from borrowbuddy_private.handover_codes c where c.loan_id = p_loan_id and c.kind = p_kind;
  select h.expires_at, h.attempts into v_expires, v_attempts
  from public.loan_handovers h where h.loan_id = p_loan_id and h.kind = p_kind;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Ask the other student to show a fresh code');
  end if;
  if v_expires is null or v_expires <= now() then
    return jsonb_build_object('ok', false, 'error', 'That code has expired — ask for a new one');
  end if;
  if coalesce(v_attempts, 0) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts — ask for a new code');
  end if;

  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then
    perform borrowbuddy_private.count_handover_attempt(p_loan_id, p_kind);
    return jsonb_build_object('ok', false, 'error', 'Incorrect code');
  end if;

  v_loan := public.confirm_handover(p_loan_id, p_token, p_kind);
  return jsonb_build_object('ok', true, 'loan_id', v_loan.id, 'status', v_loan.status);
end;
$$;

drop table borrowbuddy_private.handover_secrets;

-- ---------------------------------------------------------------------------
-- 6. Reports: a real foreign key per kind of target
-- ---------------------------------------------------------------------------

alter table public.reports
  add column reported_item_id uuid references public.items (id) on delete cascade,
  add column reported_user_id uuid references public.profiles (id) on delete cascade,
  add column reported_message_id uuid references public.messages (id) on delete cascade;

update public.reports r
set reported_item_id = case when r.target = 'item' and exists (select 1 from public.items i where i.id = r.target_id) then r.target_id end,
    reported_user_id = case when r.target = 'user' and exists (select 1 from public.profiles p where p.id = r.target_id) then r.target_id end,
    reported_message_id = case when r.target = 'message' and exists (select 1 from public.messages m where m.id = r.target_id) then r.target_id end;

-- Reports whose target was already deleted can't satisfy the new rule.
delete from public.reports
where num_nonnulls(reported_item_id, reported_user_id, reported_message_id) = 0;

-- target / target_id are now derived from the foreign keys, so the admin
-- reports page keeps working; step 2 drops target_id.
alter table public.reports drop column target, drop column target_id;
alter table public.reports
  add constraint reports_one_target
    check (num_nonnulls(reported_item_id, reported_user_id, reported_message_id) = 1),
  add column target public.report_target generated always as (
    case
      when reported_item_id is not null then 'item'::public.report_target
      when reported_user_id is not null then 'user'::public.report_target
      else 'message'::public.report_target
    end
  ) stored,
  add column target_id uuid generated always as (
    coalesce(reported_item_id, reported_user_id, reported_message_id)
  ) stored;

create index reports_item_idx on public.reports (reported_item_id) where reported_item_id is not null;
create index reports_user_idx on public.reports (reported_user_id) where reported_user_id is not null;
create index reports_message_idx on public.reports (reported_message_id) where reported_message_id is not null;

-- ---------------------------------------------------------------------------
-- 7. Loans: the copied columns must match the request and the item
-- ---------------------------------------------------------------------------
-- loans keeps item_id, owner_id, borrower_id and start_date: the
-- no-double-booking exclusion constraint needs item_id and start_date on the
-- same row, and the access rules read owner_id / borrower_id. The existing
-- single-column foreign keys are widened (same names, so API embeds that
-- name them keep working) so a loan can never disagree with its request or
-- its item. A change to the request or item flows down to the loan.

alter table public.borrow_requests
  add constraint borrow_requests_loan_copy_key unique (id, item_id, borrower_id, start_date);
alter table public.items
  add constraint items_id_owner_key unique (id, owner_id);

alter table public.loans
  drop constraint loans_request_id_fkey,
  drop constraint loans_item_id_fkey,
  add constraint loans_request_id_fkey
    foreign key (request_id, item_id, borrower_id, start_date)
    references public.borrow_requests (id, item_id, borrower_id, start_date) on update cascade on delete restrict,
  add constraint loans_item_id_fkey
    foreign key (item_id, owner_id)
    references public.items (id, owner_id) on update cascade on delete restrict;

-- ---------------------------------------------------------------------------
-- 8. Per-student rows point at profiles, so deleting a student removes them
-- ---------------------------------------------------------------------------

delete from public.wishlist_items w where not exists (select 1 from public.profiles p where p.id = w.user_id);
delete from public.assistant_usage a where not exists (select 1 from public.profiles p where p.id = a.user_id);

alter table public.wishlist_items
  drop constraint wishlist_items_user_id_fkey,
  add constraint wishlist_items_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.assistant_usage
  drop constraint assistant_usage_user_id_fkey,
  add constraint assistant_usage_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 9. Deleting a student also returns their campus photos for storage cleanup
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_student(p_profile_id uuid, p_confirm_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_open integer;
  v_loans integer;
  v_items integer;
  v_others uuid[];
  v_item_images text[];
  v_campus_images text[];
  v_other uuid;
begin
  perform public.admin_assert_can_manage(p_profile_id);

  select * into v_profile from public.profiles p where p.id = p_profile_id for update;

  if lower(trim(coalesce(p_confirm_email, ''))) <> lower(v_profile.email) then
    raise exception 'Type the student''s email exactly to confirm';
  end if;

  select count(*) into v_open
  from public.loans l
  where (l.borrower_id = p_profile_id or l.owner_id = p_profile_id)
    and l.status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed');
  if v_open > 0 then
    raise exception 'This student has % loan(s) in progress. Finish or cancel them first.', v_open;
  end if;

  select coalesce(array_agg(distinct case when l.borrower_id = p_profile_id then l.owner_id else l.borrower_id end), '{}')
  into v_others
  from public.loans l
  where l.borrower_id = p_profile_id or l.owner_id = p_profile_id;

  select coalesce(array_agg(ph.path), '{}') into v_item_images
  from public.item_photos ph
  join public.items i on i.id = ph.item_id
  where i.owner_id = p_profile_id;

  select coalesce(array_agg(ph.path), '{}') into v_campus_images
  from public.campus_post_photos ph
  join public.campus_posts cp on cp.id = ph.post_id
  where cp.owner_id = p_profile_id;

  select count(*) into v_items from public.items i where i.owner_id = p_profile_id;
  select count(*) into v_loans from public.loans l where l.borrower_id = p_profile_id or l.owner_id = p_profile_id;

  -- Write the record first: the audit row survives the profile.
  perform public.write_audit('profile.deleted', 'profile', p_profile_id::text, jsonb_build_object(
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'verification_status', v_profile.verification_status,
    'items', v_items,
    'loans', v_loans
  ));

  delete from public.loans l where l.borrower_id = p_profile_id or l.owner_id = p_profile_id;

  update public.campus_claims set reviewed_by = null where reviewed_by = p_profile_id;

  delete from public.profiles where id = p_profile_id;

  foreach v_other in array v_others loop
    if exists (select 1 from public.profiles p where p.id = v_other) then
      perform public.recompute_trust_score(v_other);
    end if;
  end loop;

  return jsonb_build_object(
    'loans_removed', v_loans,
    'items_removed', v_items,
    'avatar_path', v_profile.avatar_path,
    'student_id_path', v_profile.student_id_path,
    'item_images', to_jsonb(v_item_images),
    'campus_images', to_jsonb(v_campus_images)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Backfill check: the new tables hold exactly what the old columns did
-- ---------------------------------------------------------------------------

do $$
begin
  if (select count(*) from public.item_photos) <> (select coalesce(sum(cardinality(images)), 0) from public.items) then
    raise exception 'item_photos backfill does not match items.images';
  end if;
  if (select count(*) from public.campus_post_photos) <> (select coalesce(sum(cardinality(images)), 0) from public.campus_posts) then
    raise exception 'campus_post_photos backfill does not match campus_posts.images';
  end if;
  if exists (
    select 1 from public.messages m
    where m.poll is not null and not exists (select 1 from public.polls p where p.message_id = m.id)
  ) then
    raise exception 'polls backfill missed a poll';
  end if;
  if exists (
    select 1 from public.campus_schedules s
    where (select count(*) from jsonb_array_elements(s.weekly) w where not coalesce((w ->> 'blocked')::boolean, false))
      <> (select count(*) from public.campus_schedule_windows w where w.host_id = s.host_id)
  ) then
    raise exception 'campus_schedule_windows backfill does not match weekly';
  end if;
  if exists (
    select 1 from public.profiles p
    where char_length(btrim(coalesce(p.department, ''))) between 2 and 80 and p.department_id is null
  ) then
    raise exception 'profiles.department_id backfill missed a department';
  end if;
end;
$$;
