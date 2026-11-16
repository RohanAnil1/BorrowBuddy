-- Admin student management: the per-student page and its actions.
--
--   admin_get_student(id)                 profile, listings, loans, fines and
--                                         audit history in one JSON document
--   admin_revoke_verification(id, note)   back to pending; the student must
--                                         upload a new ID; admin access goes too
--   admin_update_student(...)             fix name, department, year, phone
--   admin_set_trust_score(id, score, why) override the trust score (the next
--                                         review or loan change recalculates it)
--   admin_recalculate_trust_score(id)     recalculate it now
--   admin_send_notice(id, title, body)    a notification from the admins
--   admin_pause_student_listings(id)      take every available listing off the shelf
--   admin_waive_student_fines(id)         waive every pending fine
--   admin_remove_student_avatar(id)       clear an inappropriate profile photo
--
-- Every function is SECURITY DEFINER, raises for non-admins, refuses to act on
-- the caller's own account (except reading it), and writes to the audit log.

alter type public.notification_type add value if not exists 'admin_notice';

create or replace function public.admin_assert_can_manage(p_profile_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can manage students';
  end if;
  if p_profile_id = (select auth.uid()) then
    raise exception 'You cannot do this to your own account';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id) then
    raise exception 'Student not found';
  end if;
end;
$$;

revoke all on function public.admin_assert_can_manage(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.admin_get_student(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can manage students';
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(p),
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
  where p.id = p_profile_id;

  return v_result;
end;
$$;

comment on function public.admin_get_student(uuid) is
  'One student for the admin manage page: full profile, listings, recent loans, fines and audit history. Null if not found. Raises for non-admins.';

-- ---------------------------------------------------------------------------

create or replace function public.admin_revoke_verification(p_profile_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform public.admin_assert_can_manage(p_profile_id);

  update public.profiles
  set verification_status = 'pending',
      verification_note = v_note,
      student_id_path = null,
      is_admin = false
  where id = p_profile_id;

  perform public.create_notification(
    p_profile_id,
    'verification_rejected'::public.notification_type,
    'Verification revoked',
    coalesce(v_note, 'An admin asked you to verify again. Upload a new photo of your student ID to get back in.'),
    jsonb_build_object('status', 'pending')
  );

  perform public.write_audit('verification.revoked', 'profile', p_profile_id::text, jsonb_build_object('note', v_note));
end;
$$;

-- ---------------------------------------------------------------------------

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
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_before jsonb;
begin
  perform public.admin_assert_can_manage(p_profile_id);

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Name must be 2 to 80 characters';
  end if;
  if v_department is not null and char_length(v_department) > 80 then
    raise exception 'Department must be at most 80 characters';
  end if;
  if v_phone is not null and v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Phone must be a 10-digit mobile number';
  end if;
  if p_year_of_study is not null and (p_year_of_study < 1 or p_year_of_study > 6) then
    raise exception 'Year must be between 1 and 6';
  end if;

  select jsonb_build_object('full_name', p.full_name, 'department', p.department,
                            'year_of_study', p.year_of_study, 'phone', p.phone)
  into v_before
  from public.profiles p where p.id = p_profile_id;

  update public.profiles
  set full_name = v_name, department = v_department, year_of_study = p_year_of_study, phone = v_phone
  where id = p_profile_id;

  perform public.write_audit('profile.edited', 'profile', p_profile_id::text,
    jsonb_build_object('before', v_before));
end;
$$;

-- ---------------------------------------------------------------------------

create or replace function public.admin_set_trust_score(p_profile_id uuid, p_score numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before numeric;
begin
  perform public.admin_assert_can_manage(p_profile_id);
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Trust score must be between 0 and 100';
  end if;
  if v_reason is null then
    raise exception 'Give a reason for changing the trust score';
  end if;

  select p.trust_score into v_before from public.profiles p where p.id = p_profile_id;
  update public.profiles set trust_score = round(p_score, 2) where id = p_profile_id;

  perform public.write_audit('trust.set', 'profile', p_profile_id::text,
    jsonb_build_object('before', v_before, 'after', round(p_score, 2), 'reason', v_reason));
end;
$$;

-- Throw away a manual score: recalculate from reviews, returns and incidents.
create or replace function public.admin_recalculate_trust_score(p_profile_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before numeric;
  v_after numeric;
begin
  perform public.admin_assert_can_manage(p_profile_id);
  select p.trust_score into v_before from public.profiles p where p.id = p_profile_id;
  v_after := public.recompute_trust_score(p_profile_id);
  perform public.write_audit('trust.recalculated', 'profile', p_profile_id::text,
    jsonb_build_object('before', v_before, 'after', v_after));
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------

create or replace function public.admin_send_notice(p_profile_id uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  perform public.admin_assert_can_manage(p_profile_id);
  if char_length(v_title) < 3 or char_length(v_title) > 100 then
    raise exception 'Title must be 3 to 100 characters';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'Message must be 1 to 1000 characters';
  end if;

  perform public.create_notification(
    p_profile_id, 'admin_notice'::public.notification_type, v_title, v_body,
    jsonb_build_object('from', 'admins')
  );
  perform public.write_audit('notice.sent', 'profile', p_profile_id::text,
    jsonb_build_object('title', v_title));
end;
$$;

-- ---------------------------------------------------------------------------

create or replace function public.admin_pause_student_listings(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.admin_assert_can_manage(p_profile_id);

  update public.items set status = 'paused'
  where owner_id = p_profile_id and status = 'available';
  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform public.create_notification(
      p_profile_id, 'admin_notice'::public.notification_type, 'Your listings were paused',
      format('An admin paused %s of your listings. They stay paused until you turn them back on.', v_count),
      '{}'::jsonb
    );
  end if;
  perform public.write_audit('listings.paused', 'profile', p_profile_id::text,
    jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------

create or replace function public.admin_waive_student_fines(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fine record;
  v_count integer := 0;
begin
  perform public.admin_assert_can_manage(p_profile_id);

  for v_fine in
    select f.id from public.fines f where f.user_id = p_profile_id and f.status = 'pending'
  loop
    perform public.settle_fine(v_fine.id, 'waive');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------

create or replace function public.admin_remove_student_avatar(p_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform public.admin_assert_can_manage(p_profile_id);

  select p.avatar_path into v_path from public.profiles p where p.id = p_profile_id;
  if v_path is null then
    return null;
  end if;

  update public.profiles set avatar_path = null where id = p_profile_id;
  perform public.write_audit('avatar.removed', 'profile', p_profile_id::text,
    jsonb_build_object('path', v_path));
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.admin_get_student(uuid)',
    'public.admin_revoke_verification(uuid, text)',
    'public.admin_update_student(uuid, text, text, integer, text)',
    'public.admin_set_trust_score(uuid, numeric, text)',
    'public.admin_recalculate_trust_score(uuid)',
    'public.admin_send_notice(uuid, text, text)',
    'public.admin_pause_student_listings(uuid)',
    'public.admin_waive_student_fines(uuid)',
    'public.admin_remove_student_avatar(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated, service_role', v_signature);
  end loop;
end;
$$;
