-- Normalization, step 4 of 4 (contract).
--
-- Step 1 (20261124120000_normalize_expand) created the normalized tables and
-- kept the old list/JSON columns in sync with them so that Android 0.4.9 kept
-- working. The web app (step 2) and Android 0.5.0 (step 3) now read and write
-- only the new tables, so this migration:
--   * rewrites every function that still mirrored the old columns,
--   * drops the sync triggers,
--   * drops the old columns:
--       items.images, campus_posts.images            -> item_photos, campus_post_photos
--       messages.reactions / mentions / poll         -> message_reactions, message_mentions, polls/poll_options/poll_votes
--       campus_schedules.weekly / exceptions         -> campus_schedule_windows, campus_schedule_exceptions
--       profiles.department                          -> departments via profiles.department_id
--       loans.*_token_expires_at / *_attempts /
--             pickup_confirmed_at / return_confirmed_at -> loan_handovers
--   * indexes the two composite foreign keys on loans.
--
-- Apply only after Android 0.5.0 has replaced 0.4.9 on students' phones:
-- 0.4.9 selects and writes the dropped columns.

-- ---------------------------------------------------------------------------
-- 1. Sync triggers (old column -> new table) are no longer needed.
-- ---------------------------------------------------------------------------
drop trigger if exists items_sync_photos on public.items;
drop trigger if exists campus_posts_sync_photos on public.campus_posts;
drop trigger if exists campus_schedules_sync_rows on public.campus_schedules;
drop trigger if exists messages_copy_mentions on public.messages;
drop trigger if exists profiles_sync_department on public.profiles;

drop function if exists public.items_sync_photos();
drop function if exists public.campus_posts_sync_photos();
drop function if exists public.campus_schedules_sync_rows();
drop function if exists public.messages_copy_mentions();
drop function if exists public.profiles_sync_department();

-- ---------------------------------------------------------------------------
-- 2. Item photos: set_item_photos writes item_photos directly.
-- ---------------------------------------------------------------------------
create or replace function public.set_item_photos(p_item_id uuid, p_paths text[])
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

  delete from public.item_photos where item_id = p_item_id;
  insert into public.item_photos (item_id, position, path)
  select p_item_id, (t.n - 1)::smallint, t.path
  from unnest(v_paths) with ordinality as t(path, n);
  update public.items set updated_at = now() where id = p_item_id;
  return v_paths;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Chat: messages no longer carry reactions, mentions or a poll.
-- ---------------------------------------------------------------------------
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.edited_at := null;
  new.deleted_at := null;
  new.activity_at := null;
  if new.reply_to_id is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to_id and m.conversation_id = new.conversation_id
  ) then
    raise exception 'You can only reply to a message in the same chat';
  end if;
  if new.image_path is not null and split_part(new.image_path, '/', 1) <> new.sender_id::text then
    raise exception 'Attach a photo you uploaded';
  end if;
  return new;
end;
$$;

create or replace function public.post_message(
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

  insert into public.messages (conversation_id, sender_id, body, image_path, reply_to_id)
  values (p_conversation_id, v_uid, coalesce(p_body, ''), p_image_path, p_reply_to_id)
  returning id into v_id;

  -- One row per mentioned student; message_mentions_notify sends the notices.
  insert into public.message_mentions (message_id, user_id)
  select distinct v_id, u.user_id
  from unnest(coalesce(p_mentions, '{}')) as u(user_id)
  where u.user_id is not null
    and u.user_id <> v_uid
    and exists (select 1 from public.profiles p where p.id = u.user_id);
  return v_id;
end;
$$;

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

  -- Touching the message is what tells Realtime subscribers to re-read it.
  update public.messages set activity_at = now() where id = p_message_id;
  v_reactions := public.message_reactions_json(p_message_id);
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

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_uid, v_question)
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

  update public.messages set activity_at = now() where id = p_message_id;
  return public.message_poll_json(p_message_id);
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
  update public.messages set activity_at = now() where id = p_message_id;
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
  set deleted_at = now(), body = '', image_path = null, pinned_at = null, pinned_by = null
  where id = p_message_id;
  if v_msg.sender_id <> v_uid then
    perform public.write_audit('message.deleted', 'message', p_message_id::text,
      jsonb_build_object('conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Handovers: loan_handovers is the only record of codes and confirmations.
-- ---------------------------------------------------------------------------
create or replace function borrowbuddy_private.count_handover_attempt(p_loan_id uuid, p_kind public.handover_kind)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.loan_handovers set attempts = attempts + 1 where loan_id = p_loan_id and kind = p_kind;
$$;

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

  return v_code;
end;
$$;

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
    update public.loans set status = 'active' where id = p_loan_id
    returning * into v_loan;

    perform public.create_notification(
      v_loan.borrower_id, 'handover_confirmed', 'Pickup confirmed',
      format('Enjoy! Please return the item by %s.', to_char(v_loan.due_date, 'DD Mon YYYY')),
      jsonb_build_object('loan_id', v_loan.id)
    );
  else
    update public.loans set status = 'returned', returned_at = now() where id = p_loan_id
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

-- ---------------------------------------------------------------------------
-- 5. Campus: save_post and save_schedule write the photo and schedule rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campus_api(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare u uuid:=auth.uid(); p public.campus_posts; c public.campus_claims; t public.campus_transfers;
 a public.campus_appointments; l public.loans; secret borrowbuddy_private.campus_codes;
 ident uuid; v_id uuid; host uuid; recipient uuid; chosen jsonb; x jsonb; paths text[];
 code text; v_kind text; reason text; body text; starts timestamptz; ends timestamptz;
 schedule public.campus_schedules; count_rows int;
begin
 if u is null or not public.is_verified(u) then raise exception 'Verified membership required'; end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request'; end if;
 ident:=nullif(p_data->>'id','')::uuid;
 if p_action='save_post' then
  ident:=coalesce(ident,gen_random_uuid());
  select * into p from public.campus_posts where id=ident for update;
  if p.id is not null and (p.owner_id<>u or p.status<>'open') then raise exception 'This post cannot be edited'; end if;
  select coalesce(array_agg(value),'{}') into paths from jsonb_array_elements_text(p_data->'images');
  if cardinality(paths) not between 1 and 6 or exists(select 1 from unnest(paths) path where path not like u::text||'/'||ident::text||'/%' or not exists(select 1 from storage.objects o where o.bucket_id='campus-photos' and o.name=path)) then raise exception 'Upload one to six photos belonging to this post'; end if;
  v_kind:=p_data->>'kind';
  if p.id is not null and p.kind<>v_kind then raise exception 'Post type cannot change'; end if;
  if v_kind='found' and ((p_data->>'found_on')::date>(now() at time zone 'Asia/Kolkata')::date or char_length(trim(coalesce(p_data->>'identifying_notes','')))<5) then raise exception 'Add a valid found date and private identifying notes'; end if;
  insert into public.campus_posts(id,owner_id,kind,title,description,category_id,location,pickup_location_id,found_on,condition,hold_hours)
  values(ident,u,v_kind,trim(p_data->>'title'),trim(p_data->>'description'),(p_data->>'category_id')::uuid,trim(p_data->>'location'),nullif(p_data->>'pickup_location_id','')::uuid,nullif(p_data->>'found_on','')::date,nullif(p_data->>'condition',''),coalesce((p_data->>'hold_hours')::int,48))
  on conflict(id) do update set title=excluded.title,description=excluded.description,category_id=excluded.category_id,location=excluded.location,pickup_location_id=excluded.pickup_location_id,found_on=excluded.found_on,condition=excluded.condition,hold_hours=excluded.hold_hours,updated_at=now()
  where campus_posts.owner_id=u and campus_posts.status='open' and campus_posts.kind=excluded.kind returning id into v_id;
  if v_id is null then raise exception 'This post cannot be edited'; end if;
  -- Photos are rows in campus_post_photos, in display order (first = cover).
  delete from public.campus_post_photos where post_id=ident;
  insert into public.campus_post_photos(post_id,position,path)
  select ident,(ph.n-1)::smallint,ph.path from unnest(paths) with ordinality as ph(path,n);
  if v_kind='found' then insert into public.campus_post_notes values(ident,trim(p_data->>'identifying_notes')) on conflict(post_id) do update set identifying_notes=excluded.identifying_notes; end if;
  perform public.write_audit('campus.post.saved','campus_post',ident::text,'{}');
  return jsonb_build_object('id',ident);
 elsif p_action='claim' then
  select * into p from public.campus_posts where id=ident for update;
  if p.id is null or p.kind<>'found' or p.status<>'open' or p.owner_id=u or not public.is_verified(p.owner_id) then raise exception 'This item cannot be claimed'; end if;
  select id into v_id from public.campus_claims where post_id=p.id and claimant_id=u and status='pending';
  if v_id is not null then return jsonb_build_object('id',v_id); end if;
  insert into public.campus_claims(post_id,claimant_id,evidence) values(p.id,u,trim(p_data->>'evidence')) returning id into v_id;
  perform borrowbuddy_private.campus_notice(id,'Ownership claim needs review','Review the private claim evidence.',jsonb_build_object('campus_claim_id',v_id)) from public.profiles where is_admin and verification_status='verified';
  perform public.write_audit('campus.claim.submitted','campus_claim',v_id::text,'{}');
  return jsonb_build_object('id',v_id);
 elsif p_action='withdraw_claim' then
  update public.campus_claims set status='withdrawn' where id=ident and claimant_id=u and status='pending';
  if not found then raise exception 'Pending claim not found'; end if;
  return jsonb_build_object('id',ident);
 elsif p_action='review_claim' then
  if not public.is_admin(u) then raise exception 'Admin review required'; end if;
  select post_id into v_id from public.campus_claims where id=ident;
  select * into p from public.campus_posts where id=v_id for update;
  select * into c from public.campus_claims where id=ident for update;
  if c.id is null or c.claimant_id=u then raise exception 'You cannot review this claim'; end if;
  select * into t from public.campus_transfers where claim_id=c.id;
  if c.status='approved' and t.id is not null and p_data->>'decision'='approve' then return jsonb_build_object('id',t.id); end if;
  if c.status<>'pending' or p.status<>'open' or not public.is_verified(c.claimant_id) or not public.is_verified(p.owner_id) then raise exception 'This claim is no longer pending'; end if;
  reason:=trim(p_data->>'reason');
  if char_length(coalesce(reason,'')) not between 5 and 1000 then raise exception 'Add a review reason (5–1000 characters)'; end if;
  if p_data->>'decision'='approve' then
   update public.campus_claims set status='approved',decision_note=reason,reviewed_by=u,reviewed_at=now() where id=c.id;
   update public.campus_claims set status='closed',decision_note='Another claim was approved.' where post_id=p.id and id<>c.id and status='pending';
   insert into public.campus_transfers(post_id,claim_id,host_id,recipient_id) values(p.id,c.id,p.owner_id,c.claimant_id) returning id into v_id;
   update public.campus_posts set status='reserved',updated_at=now() where id=p.id;
   perform borrowbuddy_private.campus_notice(p.owner_id,'Found-item claim approved','Arrange collection in your private conversation.',jsonb_build_object('campus_transfer_id',v_id));
   perform borrowbuddy_private.campus_notice(c.claimant_id,'Your ownership claim was approved','Arrange collection and show your collection code.',jsonb_build_object('campus_transfer_id',v_id));
  elsif p_data->>'decision'='reject' then
   update public.campus_claims set status='rejected',decision_note=reason,reviewed_by=u,reviewed_at=now() where id=c.id;
   perform borrowbuddy_private.campus_notice(c.claimant_id,'Ownership claim reviewed','Open your claim to read the decision.',jsonb_build_object('campus_post_id',p.id));
   v_id:=p.id;
  else raise exception 'Choose approve or reject'; end if;
  perform public.write_audit('campus.claim.'||(p_data->>'decision'),'campus_claim',c.id::text,'{}');
  return jsonb_build_object('id',v_id);
 elsif p_action='reserve' then
  select * into p from public.campus_posts where id=ident for update;
  if p.id is null or p.kind<>'giveaway' or p.owner_id=u or not public.is_verified(p.owner_id) then raise exception 'This giveaway cannot be reserved'; end if;
  select * into t from public.campus_transfers where post_id=p.id and status='active' for update;
  if t.id is not null and t.expires_at<=now() then perform borrowbuddy_private.campus_close(t.id,'expired','The giveaway reservation expired.'); t:=null; p.status:='open'; end if;
  if t.id is not null and t.recipient_id=u then return jsonb_build_object('id',t.id); end if;
  if p.status<>'open' or t.id is not null then raise exception 'Another student has already reserved this item'; end if;
  insert into public.campus_transfers(post_id,host_id,recipient_id,expires_at) values(p.id,p.owner_id,u,now()+make_interval(hours=>p.hold_hours)) returning id into v_id;
  update public.campus_posts set status='reserved',updated_at=now() where id=p.id;
  perform borrowbuddy_private.campus_notice(p.owner_id,'Your giveaway was reserved','Arrange collection before the reservation expires.',jsonb_build_object('campus_transfer_id',v_id));
  perform public.write_audit('campus.giveaway.reserved','campus_transfer',v_id::text,'{}');
  return jsonb_build_object('id',v_id);
 elsif p_action in ('cancel_transfer','revoke_claim','generate_code','confirm_code','send_message','read_thread') then
  select post_id into v_id from public.campus_transfers where id=ident;
  perform 1 from public.campus_posts where id=v_id for update;
  select * into t from public.campus_transfers where id=ident for update;
  if t.id is null then raise exception 'Collection not found'; end if;
  if p_action='revoke_claim' then
   if not public.is_admin(u) or t.claim_id is null then raise exception 'Admin approval revocation required'; end if;
  elsif u not in(t.host_id,t.recipient_id) then raise exception 'This collection is private'; end if;
  if p_action='read_thread' then
   update public.campus_transfers set host_read_at=case when u=host_id then now() else host_read_at end,recipient_read_at=case when u=recipient_id then now() else recipient_read_at end where id=t.id;
   return jsonb_build_object('id',t.id);
  end if;
  if t.status<>'active' then raise exception 'This collection is read-only'; end if;
  if t.expires_at<=now() then
   perform borrowbuddy_private.campus_close(t.id,'expired','The giveaway reservation expired.');
   return jsonb_build_object('ok',false,'error','This reservation has expired.');
  end if;
  if p_action in ('cancel_transfer','revoke_claim') then
   reason:=trim(p_data->>'reason');
   if char_length(coalesce(reason,'')) not between 5 and 500 then raise exception 'Add a reason (5–500 characters)'; end if;
   perform borrowbuddy_private.campus_close(t.id,'cancelled',reason);
  elsif p_action='send_message' then
   if not public.is_verified(t.host_id) or not public.is_verified(t.recipient_id) then raise exception 'Both members must remain verified'; end if;
   body:=trim(p_data->>'body');
   insert into public.campus_messages(transfer_id,sender_id,client_id,body) values(t.id,u,(p_data->>'client_id')::uuid,body) on conflict(sender_id,client_id) do nothing returning id into v_id;
   if v_id is not null then perform borrowbuddy_private.campus_notice(case when u=t.host_id then t.recipient_id else t.host_id end,'New collection message','Open your private collection conversation.',jsonb_build_object('campus_transfer_id',t.id),true); end if;
  elsif p_action='generate_code' then
   if u<>t.recipient_id or not public.is_verified(t.host_id) then raise exception 'Only the authorized recipient can generate a code'; end if;
   code:=public.random_digits(6);
   insert into borrowbuddy_private.campus_codes values(t.id,encode(extensions.digest(code,'sha256'),'hex'),least(now()+interval '15 minutes',coalesce(t.expires_at,now()+interval '15 minutes')),0)
   on conflict(transfer_id) do update set hash=excluded.hash,expires_at=excluded.expires_at,attempts=0;
   return jsonb_build_object('id',t.id,'code',code,'expires_at',least(now()+interval '15 minutes',coalesce(t.expires_at,now()+interval '15 minutes')));
  elsif p_action='confirm_code' then
   if u<>t.host_id or not public.is_verified(t.recipient_id) then raise exception 'Only the finder or donor can confirm collection'; end if;
   select * into secret from borrowbuddy_private.campus_codes where transfer_id=t.id for update;
   if secret.transfer_id is null or secret.expires_at<=now() then return jsonb_build_object('ok',false,'error','Ask the recipient for a fresh collection code.'); end if;
   if secret.attempts>=5 then return jsonb_build_object('ok',false,'error','Five attempts used. Ask the recipient to regenerate their code.'); end if;
   if encode(extensions.digest(coalesce(p_data->>'code',''),'sha256'),'hex')<>secret.hash then
    update borrowbuddy_private.campus_codes set attempts=attempts+1 where transfer_id=t.id;
    return jsonb_build_object('ok',false,'error','Incorrect collection code.');
   end if;
   update public.campus_transfers set status='completed',completed_at=now() where id=t.id;
   update public.campus_posts set status='completed',updated_at=now() where id=t.post_id;
   update public.campus_appointments set status='completed' where transfer_id=t.id and status='booked';
   delete from borrowbuddy_private.campus_occupancy where appointment_id in(select id from public.campus_appointments where transfer_id=t.id);
   delete from borrowbuddy_private.campus_codes where transfer_id=t.id;
   perform borrowbuddy_private.campus_notice(t.recipient_id,'Collection complete','Your collection receipt is ready.',jsonb_build_object('campus_transfer_id',t.id));
   perform public.write_audit('campus.collection.completed','campus_transfer',t.id::text,'{}');
  end if;
  return jsonb_build_object('id',t.id,'ok',true);
 elsif p_action='hide_post' then
  select * into p from public.campus_posts where id=ident for update;
  if p.id is null or (p.owner_id<>u and not public.is_admin(u)) or p.status='completed' then raise exception 'This post cannot be hidden'; end if;
  reason:=trim(p_data->>'reason');
  if char_length(coalesce(reason,'')) not between 5 and 500 then raise exception 'Add a reason (5–500 characters)'; end if;
  if not public.is_admin(u) and exists(select 1 from public.campus_transfers where post_id=p.id and status='active') then raise exception 'Cancel the active collection before withdrawing your post'; end if;
  for t in select * from public.campus_transfers where post_id=p.id and status='active' loop perform borrowbuddy_private.campus_close(t.id,'cancelled',reason); end loop;
  update public.campus_posts set status='hidden',updated_at=now() where id=p.id;
  update public.campus_claims set status='closed',decision_note='This post was withdrawn.' where post_id=p.id and status='pending';
  perform public.write_audit('campus.post.hidden','campus_post',p.id::text,jsonb_build_object('reason',reason));
  return jsonb_build_object('id',p.id);
 elsif p_action='save_schedule' then
  if (p_data->>'slot_minutes')::int not in(15,30,60) then raise exception 'Choose 15, 30 or 60 minutes'; end if;
  if jsonb_typeof(p_data->'weekly')<>'array' or jsonb_typeof(p_data->'exceptions')<>'array' or jsonb_array_length(p_data->'weekly')>7 or jsonb_array_length(p_data->'exceptions')>90 then raise exception 'Invalid schedule'; end if;
  if not exists(select 1 from public.pickup_locations where id=(p_data->>'pickup_location_id')::uuid and is_active) then raise exception 'Choose an active pickup location'; end if;
  if (select count(distinct entry.value->>'day') from jsonb_array_elements(p_data->'weekly') as entry(value))<>jsonb_array_length(p_data->'weekly') or
     (select count(distinct entry.value->>'date') from jsonb_array_elements(p_data->'exceptions') as entry(value))<>jsonb_array_length(p_data->'exceptions') then raise exception 'Each weekday or date may appear once'; end if;
  for x in select value from jsonb_array_elements((p_data->'weekly')||(p_data->'exceptions')) loop
   if x ? 'day' then if (x->>'day')::int not between 0 and 6 then raise exception 'Invalid weekday'; end if;
   else if (x->>'date')::date is null then raise exception 'Invalid exception date'; end if; end if;
   if not coalesce((x->>'blocked')::boolean,false) then
    if coalesce(x->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(x->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (x->>'start')::time>=(x->>'end')::time then raise exception 'Windows must start and finish on the same day'; end if;
   end if;
  end loop;
  insert into public.campus_schedules(host_id,pickup_location_id,slot_minutes)
  values(u,(p_data->>'pickup_location_id')::uuid,(p_data->>'slot_minutes')::int)
  on conflict(host_id) do update set pickup_location_id=excluded.pickup_location_id,slot_minutes=excluded.slot_minutes,updated_at=now();
  -- The editor still sends JSON; the schedule is stored as one row per open
  -- weekday and one per dated exception. A blocked weekday is simply absent.
  delete from public.campus_schedule_windows where host_id=u;
  delete from public.campus_schedule_exceptions where host_id=u;
  insert into public.campus_schedule_windows(host_id,weekday,starts,ends)
  select u,(wk.e->>'day')::smallint,(wk.e->>'start')::time,(wk.e->>'end')::time
  from jsonb_array_elements(p_data->'weekly') as wk(e)
  where not coalesce((wk.e->>'blocked')::boolean,false);
  insert into public.campus_schedule_exceptions(host_id,on_date,blocked,starts,ends)
  select u,(ex.e->>'date')::date,coalesce((ex.e->>'blocked')::boolean,false),
    case when coalesce((ex.e->>'blocked')::boolean,false) then null else (ex.e->>'start')::time end,
    case when coalesce((ex.e->>'blocked')::boolean,false) then null else (ex.e->>'end')::time end
  from jsonb_array_elements(p_data->'exceptions') as ex(e);
  return jsonb_build_object('id',u);
 elsif p_action='cancel_appointment' then
  select * into a from public.campus_appointments where id=ident for update;
  if a.id is null or u not in(a.host_id,a.recipient_id) then raise exception 'Appointment not found'; end if;
  if a.status='booked' then
   update public.campus_appointments set status='cancelled' where id=a.id;
   delete from borrowbuddy_private.campus_occupancy where appointment_id=a.id;
   perform borrowbuddy_private.campus_notice(case when u=a.host_id then a.recipient_id else a.host_id end,'Handover cancelled','Choose another time in your handover details.',case when a.loan_id is not null then jsonb_build_object('loan_id',a.loan_id) else jsonb_build_object('campus_transfer_id',a.transfer_id) end);
  end if;
  return jsonb_build_object('id',a.id);
 elsif p_action='book' then
  v_kind:=p_data->>'kind';
  if nullif(p_data->>'loan_id','') is not null then
   select * into l from public.loans where id=(p_data->>'loan_id')::uuid for update;
   host:=l.owner_id; recipient:=l.borrower_id;
   if l.id is null or u not in(host,recipient) or (v_kind='pickup' and l.status<>'awaiting_pickup') or (v_kind='return' and l.status not in('active','return_pending','overdue')) or v_kind not in('pickup','return') then raise exception 'This loan cannot schedule that handover'; end if;
  else
   select post_id into v_id from public.campus_transfers where id=(p_data->>'transfer_id')::uuid;
   perform 1 from public.campus_posts where id=v_id for update;
   select * into t from public.campus_transfers where id=(p_data->>'transfer_id')::uuid for update;
   host:=t.host_id; recipient:=t.recipient_id;
   if t.id is null or u not in(host,recipient) or v_kind<>'collection' or t.status<>'active' then raise exception 'Collection not available'; end if;
   if t.expires_at<=now() then perform borrowbuddy_private.campus_close(t.id,'expired','The giveaway reservation expired.'); return jsonb_build_object('ok',false,'error','This reservation expired.'); end if;
  end if;
  if not public.is_verified(host) or not public.is_verified(recipient) then raise exception 'Both members must remain verified'; end if;
  -- Serialize every participating member, including reversed host/recipient roles.
  perform pg_advisory_xact_lock(hashtextextended(member.id::text,0)) from unnest(array[host,recipient]) as member(id) order by member.id;
  select * into a from public.campus_appointments where status='booked' and kind=v_kind and
   ((l.id is not null and loan_id=l.id) or (t.id is not null and transfer_id=t.id)) for update;
  starts:=(p_data->>'starts_at')::timestamptz;
  if a.id is not null and a.starts_at=starts then return jsonb_build_object('id',a.id); end if;
  if a.id is not null then
   update public.campus_appointments set status='cancelled' where id=a.id;
   delete from borrowbuddy_private.campus_occupancy where appointment_id=a.id;
  end if;
  select * into schedule from public.campus_schedules where host_id=host;
  -- Same validation as the rendered slots, under member locks.
  select value into chosen from jsonb_array_elements(public.campus_slots(host,(starts at time zone 'Asia/Kolkata')::date)) where (value->>'starts_at')::timestamptz=starts;
  if chosen is null then raise exception 'That time is no longer available. Choose another slot.'; end if;
  ends:=(chosen->>'ends_at')::timestamptz;
  if exists(select 1 from borrowbuddy_private.campus_occupancy where user_id in(host,recipient) and during && tstzrange(starts,ends,'[)')) then raise exception 'A participant already has a handover at that time'; end if;
  if t.expires_at is not null and ends>t.expires_at then raise exception 'Collection must finish before the reservation expires'; end if;
  if l.id is not null and ((starts at time zone 'Asia/Kolkata')::date<l.start_date or (v_kind='pickup' and (starts at time zone 'Asia/Kolkata')::date>l.due_date)) then raise exception 'Pickup must fit the loan dates'; end if;
  insert into public.campus_appointments(host_id,recipient_id,loan_id,transfer_id,kind,starts_at,ends_at,pickup_location_id)
  values(host,recipient,l.id,t.id,v_kind,starts,ends,(chosen->>'pickup_location_id')::uuid) returning id into v_id;
  insert into borrowbuddy_private.campus_occupancy values(v_id,host,tstzrange(starts,ends,'[)')),(v_id,recipient,tstzrange(starts,ends,'[)'));
  perform borrowbuddy_private.campus_notice(case when u=host then recipient else host end,'Handover time booked','View your appointment in campus handovers.',case when l.id is not null then jsonb_build_object('loan_id',l.id) else jsonb_build_object('campus_transfer_id',t.id) end);
  perform public.write_audit('campus.appointment.booked','campus_appointment',v_id::text,'{}');
  return jsonb_build_object('id',v_id);
 end if;
 raise exception 'Unknown campus action';
end; $function$

;

-- admin_get_student's profile JSON gains the department name.
CREATE OR REPLACE FUNCTION public.admin_get_student(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can manage students';
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(p) || jsonb_build_object('department', d.name),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'title', i.title, 'status', i.status, 'created_at', i.created_at
      ) order by i.created_at desc)
      from public.items i where i.owner_id = p.id
    ), '[]'::jsonb),
    'loans', coalesce((
      select jsonb_agg(row order by (row->>'created_at') desc)
      from (
        select jsonb_build_object(
          'id', l.id, 'status', l.status, 'start_date', l.start_date, 'due_date', l.due_date,
          'created_at', l.created_at, 'item_title', i.title,
          'role', case when l.borrower_id = p.id then 'borrower' else 'owner' end,
          'other_name', o.full_name
        ) as row
        from public.loans l
        join public.items i on i.id = l.item_id
        join public.profiles o on o.id = case when l.borrower_id = p.id then l.owner_id else l.borrower_id end
        where l.borrower_id = p.id or l.owner_id = p.id
        order by l.created_at desc
        limit 50
      ) recent
    ), '[]'::jsonb),
    'fines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'amount', f.amount, 'status', f.status, 'source', f.source,
        'reason', f.reason, 'created_at', f.created_at
      ) order by f.created_at desc)
      from public.fines f where f.user_id = p.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row order by (row->>'created_at') desc)
      from (
        select jsonb_build_object(
          'id', a.id, 'action', a.action, 'metadata', a.metadata,
          'created_at', a.created_at, 'actor_name', actor.full_name
        ) as row
        from public.audit_log a
        left join public.profiles actor on actor.id = a.actor_id
        where a.entity = 'profile' and a.entity_id = p.id::text
        order by a.created_at desc
        limit 30
      ) recent
    ), '[]'::jsonb)
  )
  into v_result
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  where p.id = p_profile_id;

  return v_result;
end;
$function$

;

-- ---------------------------------------------------------------------------
-- 6. Departments: admin functions read and write the name through
--    profiles.department_id. Their JSON keeps a "department" field so both
--    apps show the same text as before.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_profiles(
  p_search text default null,
  p_status public.verification_status default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid, full_name text, email text, phone text, department text, year_of_study integer,
  avatar_path text, student_id_path text, verification_status public.verification_status,
  verification_note text, trust_score numeric, is_admin boolean, created_at timestamptz,
  items_count integer, active_loans_count integer, pending_fines_total integer, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_pattern text;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can manage students';
  end if;

  if v_search is not null then
    -- Treat the search as plain text, not a LIKE pattern.
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    with matched as (
      select p.*, d.name as department_name
      from public.profiles p
      left join public.departments d on d.id = p.department_id
      where (p_status is null or p.verification_status = p_status)
        and (
          v_pattern is null
          or p.full_name ilike v_pattern
          or p.email ilike v_pattern
          or coalesce(d.name, '') ilike v_pattern
        )
    )
    select
      m.id, m.full_name, m.email, m.phone, m.department_name, m.year_of_study,
      m.avatar_path, m.student_id_path, m.verification_status, m.verification_note,
      m.trust_score, m.is_admin, m.created_at,
      (select count(*)::integer from public.items i
        where i.owner_id = m.id and i.status <> 'retired'),
      (select count(*)::integer from public.loans l
        where (l.borrower_id = m.id or l.owner_id = m.id)
          and l.status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed')),
      (select coalesce(sum(f.amount), 0)::integer from public.fines f
        where f.user_id = m.id and f.status = 'pending'),
      count(*) over ()
    from matched m
    order by m.created_at desc, m.id
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Admins type a department name; it is matched to the departments table and
-- added there (inactive, so it is not offered to students) when it is new.
create or replace function public.admin_update_student(
  p_profile_id uuid,
  p_full_name text,
  p_department text,
  p_year_of_study integer,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_full_name, ''));
  v_department text := nullif(trim(coalesce(p_department, '')), '');
  v_department_id uuid;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_before jsonb;
begin
  perform public.admin_assert_can_manage(p_profile_id);

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Name must be 2 to 80 characters';
  end if;
  if v_department is not null and char_length(v_department) not between 2 and 80 then
    raise exception 'Department must be 2 to 80 characters';
  end if;
  if v_phone is not null and v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Phone must be a 10-digit mobile number';
  end if;
  if p_year_of_study is not null and (p_year_of_study < 1 or p_year_of_study > 6) then
    raise exception 'Year must be between 1 and 6';
  end if;

  if v_department is not null then
    insert into public.departments (name, is_active) values (v_department, false)
    on conflict ((lower(name))) do nothing;
    select d.id into v_department_id from public.departments d where lower(d.name) = lower(v_department);
  end if;

  select jsonb_build_object('full_name', p.full_name, 'department', d.name,
                            'year_of_study', p.year_of_study, 'phone', p.phone)
  into v_before
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  where p.id = p_profile_id;

  update public.profiles
  set full_name = v_name, department_id = v_department_id, year_of_study = p_year_of_study, phone = v_phone
  where id = p_profile_id;

  perform public.write_audit('profile.edited', 'profile', p_profile_id::text,
    jsonb_build_object('before', v_before));
end;
$$;

-- Returned whole profile rows; now returns each row as JSON with the
-- department name added, since the row itself no longer has one.
drop function public.admin_pending_profiles(integer);
create function public.admin_pending_profiles(p_limit integer default 50)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can review verifications';
  end if;
  return query
    select to_jsonb(p) || jsonb_build_object('department', d.name)
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    where p.verification_status = 'pending'
    order by p.created_at asc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.admin_pending_profiles(integer) from public, anon;
grant execute on function public.admin_pending_profiles(integer) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. Drop the old columns, after checking nothing in them is missing from
--    the new tables (the whole migration rolls back if anything is).
-- ---------------------------------------------------------------------------
do $$
declare v_bad bigint;
begin
  select count(*) into v_bad from public.items i
  where i.images is distinct from public.photo_paths(i) and cardinality(i.images) > 0;
  if v_bad > 0 then raise exception 'contract: % item(s) have photos missing from item_photos', v_bad; end if;

  select count(*) into v_bad from public.campus_posts p
  where p.images is distinct from public.photo_paths(p) and cardinality(p.images) > 0;
  if v_bad > 0 then raise exception 'contract: % campus post(s) have photos missing from campus_post_photos', v_bad; end if;

  select count(*) into v_bad from public.profiles p
  left join public.departments d on d.id = p.department_id
  where p.department is not null and lower(p.department) is distinct from lower(d.name);
  if v_bad > 0 then raise exception 'contract: % profile(s) have a department not linked to departments', v_bad; end if;

  select count(*) into v_bad from public.messages m
  where m.deleted_at is null and (
    (m.reactions is not null and m.reactions <> '{}'::jsonb and m.reactions <> public.message_reactions_json(m.id))
    or (cardinality(m.mentions) > 0 and not exists (select 1 from public.message_mentions mm where mm.message_id = m.id))
    or (m.poll is not null and not exists (select 1 from public.polls po where po.message_id = m.id)));
  if v_bad > 0 then raise exception 'contract: % message(s) have reactions, mentions or a poll missing from their tables', v_bad; end if;

  select count(*) into v_bad from public.loans l
  where (l.pickup_confirmed_at is not null and not exists (
           select 1 from public.loan_handovers h where h.loan_id = l.id and h.kind = 'pickup' and h.confirmed_at is not null))
     or (l.return_confirmed_at is not null and not exists (
           select 1 from public.loan_handovers h where h.loan_id = l.id and h.kind = 'return' and h.confirmed_at is not null));
  if v_bad > 0 then raise exception 'contract: % loan(s) have a confirmed handover missing from loan_handovers', v_bad; end if;
end;
$$;

alter table public.items drop column images;
alter table public.campus_posts drop column images;
alter table public.messages drop column reactions, drop column mentions, drop column poll;
alter table public.campus_schedules drop column weekly, drop column exceptions;
alter table public.profiles drop column department;
alter table public.loans
  drop column handover_token_expires_at,
  drop column handover_attempts,
  drop column return_token_expires_at,
  drop column return_attempts,
  drop column pickup_confirmed_at,
  drop column return_confirmed_at;

-- ---------------------------------------------------------------------------
-- 8. Index the composite foreign keys added in step 1, so deleting or
--    re-keying a request or item does not scan loans.
-- ---------------------------------------------------------------------------
create index if not exists loans_request_fk_idx on public.loans (request_id, item_id, borrower_id, start_date);
create index if not exists loans_item_owner_fk_idx on public.loans (item_id, owner_id);
