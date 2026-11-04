-- Campus reputation needs aggregate counts without exposing private loan rows.
create or replace function public.get_public_profile_stats(p_profile_id uuid)
returns table(completed_loans bigint, review_count bigint, rating_average numeric)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_verified(auth.uid()) then
    raise exception 'Only verified students can view reputation';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = p_profile_id
      and (p.verification_status = 'verified' or p.id = auth.uid() or public.is_admin(auth.uid()))
  ) then
    raise exception 'Student profile not found';
  end if;
  return query
    select
      (select count(*) from public.loans l where l.status = 'returned'
        and (l.owner_id = p_profile_id or l.borrower_id = p_profile_id)),
      count(r.id), avg(r.rating)::numeric
    from public.reviews r where r.reviewee_id = p_profile_id;
end;
$$;
revoke all on function public.get_public_profile_stats(uuid) from public, anon;
grant execute on function public.get_public_profile_stats(uuid) to authenticated;
