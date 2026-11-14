-- Deleting a profile row signs that account out everywhere. Signing in again
-- starts the account over: a fresh profile, onboarding and ID review.

-- 1. Deleting a profile ends every session of that account. Refresh tokens go
--    with their sessions (foreign key cascade), so no app can renew its token.
create or replace function public.end_sessions_for_deleted_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = old.id;
  return old;
end;
$$;

revoke execute on function public.end_sessions_for_deleted_profile() from public, anon, authenticated;

drop trigger if exists profiles_end_sessions_on_delete on public.profiles;
create trigger profiles_end_sessions_on_delete
after delete on public.profiles
for each row execute function public.end_sessions_for_deleted_profile();

-- 2. Called by the website and app when the signed-in account has no profile.
--    true: this sign-in is live, so a fresh profile is created (or already exists).
--    false: the sign-in was ended (its profile was deleted), so sign out locally.
--    An access token outlives its session for up to an hour, so the session is
--    checked here rather than trusting the token alone.
create or replace function public.ensure_my_profile()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id';
begin
  if v_uid is null or v_session is null then
    return false;
  end if;
  if not exists (select 1 from auth.sessions s where s.id::text = v_session and s.user_id = v_uid) then
    return false;
  end if;
  insert into public.profiles (id, email, full_name)
  select u.id, coalesce(u.email, ''), ''
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;
  return true;
end;
$$;

revoke execute on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- 3. Accounts whose profile was already deleted are signed out now.
delete from auth.sessions s
where not exists (select 1 from public.profiles p where p.id = s.user_id);
