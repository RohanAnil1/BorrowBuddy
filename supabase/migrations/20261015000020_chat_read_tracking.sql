-- Community channels are open to verified students; reading one establishes the
-- caller's own read cursor. Private channels still require existing membership.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_type public.conversation_type;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_verified(v_uid) then raise exception 'Only verified students can read conversations'; end if;
  select type into v_type from public.conversations where id = p_conversation_id;
  if not found then raise exception 'Conversation not found'; end if;
  if v_type = 'community' then
    insert into public.conversation_members(conversation_id, user_id, last_read_at)
    values(p_conversation_id, v_uid, now())
    on conflict(conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  else
    update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = v_uid;
    if not found then raise exception 'You are not a member of this conversation'; end if;
  end if;
end;
$$;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated, service_role;

alter policy conversations_select on public.conversations using (
  public.is_verified((select auth.uid())) and
  (type = 'community' or public.is_conversation_member(id, (select auth.uid())) or public.is_admin((select auth.uid())))
);
alter policy messages_select on public.messages using (
  public.is_verified((select auth.uid())) and (
    public.is_conversation_member(conversation_id, (select auth.uid())) or
    exists(select 1 from public.conversations c where c.id = conversation_id and c.type = 'community')
  )
);
alter policy messages_insert on public.messages with check (
  sender_id = (select auth.uid()) and public.is_verified((select auth.uid())) and (
    public.is_conversation_member(conversation_id, (select auth.uid())) or
    exists(select 1 from public.conversations c where c.id = conversation_id and c.type = 'community')
  )
);
-- Joining a public channel for read tracking must not expose other students' read cursors.
alter policy conversation_members_select on public.conversation_members using (
  user_id = (select auth.uid()) or public.is_admin((select auth.uid())) or (
    public.is_conversation_member(conversation_id, (select auth.uid())) and
    exists(select 1 from public.conversations c where c.id = conversation_id and c.type = 'private')
  )
);

-- One latest message per visible channel. A global 300-message limit can lose a
-- quiet channel's latest message/unread flag when another channel is very busy.
-- INVOKER deliberately applies the caller's conversation and message RLS policies.
create or replace function public.get_conversation_message_heads()
returns table(id uuid, conversation_id uuid, sender_id uuid, body text, created_at timestamptz)
language sql stable security invoker
set search_path = public
as $$
  select m.id, m.conversation_id, m.sender_id, m.body, m.created_at
  from public.conversations c
  cross join lateral (
    select msg.id, msg.conversation_id, msg.sender_id, msg.body, msg.created_at
    from public.messages msg where msg.conversation_id = c.id
    order by msg.created_at desc, msg.id desc limit 1
  ) m;
$$;
revoke execute on function public.get_conversation_message_heads() from public, anon;
grant execute on function public.get_conversation_message_heads() to authenticated, service_role;
