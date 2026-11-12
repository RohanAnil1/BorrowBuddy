-- Achievement stamps for the member ID card.
--
-- Returns one row per stamp with aggregate progress only: counts and booleans,
-- never loan, review or campus transfer rows. Visibility mirrors
-- get_public_profile_stats: the caller must be a verified student, and the
-- target must be verified unless it is the caller or the caller is an admin.
--
-- Stamps (progress is capped at goal):
--   first_lend        >= 1 returned loan as owner
--   first_borrow      >= 1 returned loan as borrower
--   on_time_10        10 returns as borrower on or before the due date
--   trusted_lender    trust_score >= 85 and >= 5 returned loans as owner
--   five_star_streak  the 5 most recent reviews received are all 5 stars
--   campus_helper     >= 1 completed Lost & Found return or giveaway as host
create or replace function public.get_profile_stamps(p_profile_id uuid)
returns table(key text, earned boolean, progress integer, goal integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trust numeric;
  v_lends integer;
  v_borrows integer;
  v_on_time integer;
  v_streak integer;
  v_recent integer;
  v_helped integer;
begin
  if not public.is_verified(auth.uid()) then
    raise exception 'Only verified students can view reputation';
  end if;

  select p.trust_score into v_trust
  from public.profiles p
  where p.id = p_profile_id
    and (p.verification_status = 'verified' or p.id = auth.uid() or public.is_admin(auth.uid()));
  if not found then
    raise exception 'Student profile not found';
  end if;

  select
    count(*) filter (where l.owner_id = p_profile_id),
    count(*) filter (where l.borrower_id = p_profile_id),
    count(*) filter (where l.borrower_id = p_profile_id
      and l.returned_at is not null and l.returned_at::date <= l.due_date)
  into v_lends, v_borrows, v_on_time
  from public.loans l
  where l.status = 'returned'
    and (l.owner_id = p_profile_id or l.borrower_id = p_profile_id);

  -- Most recent reviews first; the streak is the run of 5-star ratings from the top.
  select
    count(*),
    coalesce(min(r.position) filter (where r.rating < 5) - 1, count(*))
  into v_recent, v_streak
  from (
    select rv.rating, row_number() over (order by rv.created_at desc, rv.id desc) as position
    from public.reviews rv
    where rv.reviewee_id = p_profile_id
    order by rv.created_at desc, rv.id desc
    limit 5
  ) r;

  select count(*) into v_helped
  from public.campus_transfers t
  join public.campus_posts cp on cp.id = t.post_id
  where t.host_id = p_profile_id
    and t.status = 'completed'
    and cp.kind in ('found', 'giveaway');

  return query
    select s.key, s.earned, least(s.progress, s.goal), s.goal
    from (values
      (1, 'first_lend', v_lends >= 1, v_lends, 1),
      (2, 'first_borrow', v_borrows >= 1, v_borrows, 1),
      (3, 'on_time_10', v_on_time >= 10, v_on_time, 10),
      (4, 'trusted_lender', v_trust >= 85 and v_lends >= 5, v_lends, 5),
      (5, 'five_star_streak', v_recent = 5 and v_streak = 5, v_streak::integer, 5),
      (6, 'campus_helper', v_helped >= 1, v_helped, 1)
    ) as s(ordinal, key, earned, progress, goal)
    order by s.ordinal;
end;
$$;

comment on function public.get_profile_stamps(uuid) is
  'Member ID card achievement stamps: aggregate progress only, verified students only.';

revoke all on function public.get_profile_stamps(uuid) from public, anon;
grant execute on function public.get_profile_stamps(uuid) to authenticated, service_role;
