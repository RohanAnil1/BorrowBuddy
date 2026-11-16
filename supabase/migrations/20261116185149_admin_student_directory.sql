-- Admin student directory.
--
--   admin_list_profiles(...)        every student, searchable and filterable by
--                                   status, with their private fields (admins
--                                   need the email and ID upload to manage them)
--                                   and a few activity counts
--   admin_profile_status_counts()   how many students sit in each status
--   admin_set_admin(...)            promote or demote an admin, audited
--
-- Status changes (verify, reject, suspend, reinstate) reuse
-- admin_set_verification(), which already notifies the student and audits.
-- All three are SECURITY DEFINER and raise for anyone who is not an admin.

create or replace function public.admin_list_profiles(
  p_search text default null,
  p_status public.verification_status default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  department text,
  year_of_study integer,
  avatar_path text,
  student_id_path text,
  verification_status public.verification_status,
  verification_note text,
  trust_score numeric,
  is_admin boolean,
  created_at timestamptz,
  items_count integer,
  active_loans_count integer,
  pending_fines_total integer,
  total_count bigint
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
      select p.*
      from public.profiles p
      where (p_status is null or p.verification_status = p_status)
        and (
          v_pattern is null
          or p.full_name ilike v_pattern
          or p.email ilike v_pattern
          or coalesce(p.department, '') ilike v_pattern
        )
    )
    select
      m.id, m.full_name, m.email, m.phone, m.department, m.year_of_study,
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

comment on function public.admin_list_profiles(text, public.verification_status, integer, integer) is
  'Every student for the admin directory, newest first, with private fields and activity counts. Raises for non-admins.';

revoke all on function public.admin_list_profiles(text, public.verification_status, integer, integer) from public, anon;
grant execute on function public.admin_list_profiles(text, public.verification_status, integer, integer)
  to authenticated, service_role;

create or replace function public.admin_profile_status_counts()
returns table (verification_status public.verification_status, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can manage students';
  end if;
  return query
    select p.verification_status, count(*)
    from public.profiles p
    group by p.verification_status;
end;
$$;

comment on function public.admin_profile_status_counts() is
  'Number of students in each verification status. Raises for non-admins.';

revoke all on function public.admin_profile_status_counts() from public, anon;
grant execute on function public.admin_profile_status_counts() to authenticated, service_role;

create or replace function public.admin_set_admin(p_profile_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.verification_status;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only admins can change admin access';
  end if;
  if p_profile_id = v_uid then
    raise exception 'You cannot change your own admin access';
  end if;

  select p.verification_status into v_status from public.profiles p where p.id = p_profile_id;
  if not found then
    raise exception 'Profile not found';
  end if;
  if p_is_admin and v_status <> 'verified' then
    raise exception 'Only verified students can be made admins';
  end if;

  update public.profiles set is_admin = coalesce(p_is_admin, false) where id = p_profile_id;

  perform public.write_audit(
    case when p_is_admin then 'admin.granted' else 'admin.revoked' end,
    'profile', p_profile_id::text, '{}'::jsonb
  );
end;
$$;

comment on function public.admin_set_admin(uuid, boolean) is
  'Grant or revoke admin access for another student (who must be verified to be granted). Audited. Raises for non-admins.';

revoke all on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated, service_role;
