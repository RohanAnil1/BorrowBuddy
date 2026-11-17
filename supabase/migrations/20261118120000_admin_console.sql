-- Admin console ("Control Room") read models.
--
--   admin_overview()        one round trip for the console: queue sizes (with
--                           the oldest waiting item in each, so the console can
--                           flag stale queues), student totals, lending
--                           activity, and a 14-day daily series of sign-ups,
--                           new loans and incidents (campus time, Asia/Kolkata)
--   admin_list_audit(...)   the audit log, newest first, with the actor's name
--                           and the name of the student, group or pickup spot
--                           each row is about; filterable by category (the part
--                           of the action before the first dot) and searchable
--
-- Both are read-only, SECURITY DEFINER with an empty search_path, and raise for
-- anyone who is not an admin.

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_start date := v_today - 13;
  v_since timestamptz := v_start::timestamp at time zone 'Asia/Kolkata';
  v_open_loans public.loan_status[] := array['awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed']::public.loan_status[];
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can view the admin console';
  end if;

  return jsonb_build_object(
    'queues', jsonb_build_object(
      'verifications', (select count(*) from public.profiles p where p.verification_status = 'pending'),
      'reports', (select count(*) from public.reports r where r.status = 'open'),
      'incidents', (select count(*) from public.incidents i where i.status in ('open', 'under_review')),
      'fines', (select count(*) from public.fines f where f.status = 'pending'),
      'fines_amount', (select coalesce(sum(f.amount), 0) from public.fines f where f.status = 'pending'),
      'claims', (select count(*) from public.campus_claims c where c.status = 'pending')
    ),
    'oldest', jsonb_build_object(
      'verifications', (select min(p.created_at) from public.profiles p where p.verification_status = 'pending'),
      'reports', (select min(r.created_at) from public.reports r where r.status = 'open'),
      'incidents', (select min(i.created_at) from public.incidents i where i.status in ('open', 'under_review')),
      'fines', (select min(f.created_at) from public.fines f where f.status = 'pending'),
      'claims', (select min(c.created_at) from public.campus_claims c where c.status = 'pending')
    ),
    'students', (
      select jsonb_build_object(
        'total', count(*),
        'verified', count(*) filter (where p.verification_status = 'verified'),
        'pending', count(*) filter (where p.verification_status = 'pending'),
        'rejected', count(*) filter (where p.verification_status = 'rejected'),
        'suspended', count(*) filter (where p.verification_status = 'suspended'),
        'admins', count(*) filter (where p.is_admin)
      )
      from public.profiles p
    ),
    'activity', jsonb_build_object(
      'open_loans', (select count(*) from public.loans l where l.status = any (v_open_loans)),
      'overdue_loans', (select count(*) from public.loans l where l.status = 'overdue'),
      'listings', (select count(*) from public.items i where i.status = 'available'),
      'groups', (select count(*) from public.conversations c where c.type = 'community' and c.archived_at is null),
      'pickup_spots', (select count(*) from public.pickup_locations pl where pl.is_active)
    ),
    'series', (
      with days as (
        select v_start + g as day from generate_series(0, 13) as g
      ),
      signups as (
        select (p.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
        from public.profiles p where p.created_at >= v_since group by 1
      ),
      loans as (
        select (l.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
        from public.loans l where l.created_at >= v_since group by 1
      ),
      incidents as (
        select (i.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
        from public.incidents i where i.created_at >= v_since group by 1
      )
      select jsonb_agg(
        jsonb_build_object(
          'day', d.day,
          'signups', coalesce(s.n, 0),
          'loans', coalesce(l.n, 0),
          'incidents', coalesce(i.n, 0)
        )
        order by d.day
      )
      from days d
      left join signups s on s.day = d.day
      left join loans l on l.day = d.day
      left join incidents i on i.day = d.day
    )
  );
end;
$$;

comment on function public.admin_overview() is
  'Queue sizes, student totals, lending activity and a 14-day series for the admin console. Read-only. Raises for non-admins.';

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated, service_role;

create or replace function public.admin_list_audit(
  p_category text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  action text,
  entity text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz,
  actor_id uuid,
  actor_name text,
  subject_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text := nullif(trim(coalesce(p_category, '')), '');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_pattern text;
  v_uuid text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can read the audit log';
  end if;

  if v_search is not null then
    -- Treat the search as plain text, not a LIKE pattern.
    v_pattern := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    with entries as (
      select
        a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at, a.actor_id,
        actor.full_name as actor_name,
        case
          when a.entity_id !~* v_uuid then null
          when a.entity = 'profile' then
            (select p.full_name from public.profiles p where p.id = a.entity_id::uuid)
          when a.entity = 'conversation' then
            (select c.title from public.conversations c where c.id = a.entity_id::uuid)
          when a.entity = 'pickup_location' then
            (select pl.name from public.pickup_locations pl where pl.id = a.entity_id::uuid)
        end as subject_name
      from public.audit_log a
      left join public.profiles actor on actor.id = a.actor_id
      where v_category is null or split_part(a.action, '.', 1) = v_category
    )
    select
      r.id, r.action, r.entity, r.entity_id, r.metadata, r.created_at, r.actor_id,
      r.actor_name, r.subject_name,
      count(*) over ()
    from entries r
    where v_pattern is null
      or r.action ilike v_pattern
      or r.entity_id ilike v_pattern
      or coalesce(r.actor_name, '') ilike v_pattern
      or coalesce(r.subject_name, '') ilike v_pattern
      or coalesce(r.metadata ->> 'full_name', '') ilike v_pattern
    order by r.created_at desc, r.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.admin_list_audit(text, text, integer, integer) is
  'The audit log for the admin console, newest first, with actor and subject names. Read-only. Raises for non-admins.';

revoke all on function public.admin_list_audit(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_audit(text, text, integer, integer) to authenticated, service_role;
