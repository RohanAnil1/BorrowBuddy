-- Private profile fields, step 1 of 2 (additive, safe for every app version).
--
-- Every signed-in student can read the profile rows of verified students, and
-- until now that included email, phone, the student ID upload path and the
-- admin's verification note. Step 2 (a later migration) stops the API roles
-- reading those columns directly. Before that can ship, the apps need another
-- way to get the private fields they legitimately use:
--
--   my_private_profile()      the signed-in student's own private fields
--   admin_pending_profiles()  the verification queue (admins only), with the
--                             email and ID upload they review
--
-- Both are SECURITY DEFINER so they keep working once the columns are locked.

create or replace function public.my_private_profile()
returns table (email text, phone text, student_id_path text, verification_note text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email, p.phone, p.student_id_path, p.verification_note
  from public.profiles p
  where p.id = (select auth.uid());
$$;

comment on function public.my_private_profile() is
  'The signed-in student''s own email, phone, student ID path and verification note. Returns no row when signed out.';

revoke all on function public.my_private_profile() from public, anon;
grant execute on function public.my_private_profile() to authenticated;

create or replace function public.admin_pending_profiles(p_limit integer default 50)
returns setof public.profiles
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
    select p.*
    from public.profiles p
    where p.verification_status = 'pending'
    order by p.created_at asc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

comment on function public.admin_pending_profiles(integer) is
  'Verification queue for admins, oldest first, including email and student ID path. Raises for non-admins.';

revoke all on function public.admin_pending_profiles(integer) from public, anon;
grant execute on function public.admin_pending_profiles(integer) to authenticated;
