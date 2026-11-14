-- Deleting a profile ends that account's sessions, and only a live session can
-- bring the profile back. Everything rolls back.
begin;
create temp table deleted_profile_ctx(user_id uuid, other_id uuid, old_session uuid, new_session uuid);
grant select on deleted_profile_ctx to authenticated;
insert into deleted_profile_ctx values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
insert into auth.users(id, email, raw_user_meta_data)
select user_id, 'deleted-profile-qa-' || user_id || '@bennett.edu.in', '{"full_name":"Deleted profile QA"}'::jsonb from deleted_profile_ctx
union all
select other_id, 'deleted-profile-other-' || other_id || '@bennett.edu.in', '{}'::jsonb from deleted_profile_ctx;
insert into auth.sessions(id, user_id) select old_session, user_id from deleted_profile_ctx;
insert into auth.sessions(user_id) select other_id from deleted_profile_ctx;

do $$
declare c deleted_profile_ctx;
begin
  select * into c from deleted_profile_ctx;
  if not exists (select 1 from public.profiles where id = c.user_id) then
    raise exception 'FAIL: sign-up did not create a profile';
  end if;
  delete from public.profiles where id = c.user_id;
  if exists (select 1 from auth.sessions where user_id = c.user_id) then
    raise exception 'FAIL: deleting the profile left its sessions alive';
  end if;
  if not exists (select 1 from auth.sessions where user_id = c.other_id) then
    raise exception 'FAIL: deleting one profile ended someone else''s session';
  end if;
end;
$$;

-- The ended session's token, still unexpired: no profile comes back.
select set_config('request.jwt.claims',
  (select json_build_object('sub', user_id, 'role', 'authenticated', 'session_id', old_session)::text from deleted_profile_ctx), true);
set local role authenticated;
do $$
begin
  if public.ensure_my_profile() then
    raise exception 'FAIL: an ended session recreated the profile';
  end if;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from public.profiles p join deleted_profile_ctx c on p.id = c.user_id) then
    raise exception 'FAIL: profile exists after an ended session asked for it';
  end if;
end;
$$;

-- Signing in again: a new live session gets a fresh, unverified profile.
insert into auth.sessions(id, user_id) select new_session, user_id from deleted_profile_ctx;
select set_config('request.jwt.claims',
  (select json_build_object('sub', user_id, 'role', 'authenticated', 'session_id', new_session)::text from deleted_profile_ctx), true);
set local role authenticated;
do $$
begin
  if not public.ensure_my_profile() then
    raise exception 'FAIL: a fresh sign-in could not recreate the profile';
  end if;
  if not public.ensure_my_profile() then
    raise exception 'FAIL: asking twice failed';
  end if;
end;
$$;
reset role;
do $$
declare p public.profiles;
begin
  select pr.* into p from public.profiles pr join deleted_profile_ctx c on pr.id = c.user_id;
  if p.id is null then raise exception 'FAIL: no profile after a fresh sign-in'; end if;
  if p.verification_status <> 'pending' or p.is_admin or p.full_name <> '' then
    raise exception 'FAIL: the recreated profile skipped onboarding or review';
  end if;
end;
$$;

-- Not callable signed out; the trigger function is not callable at all.
set local role anon;
do $$
begin
  if has_function_privilege('anon', 'public.ensure_my_profile()', 'EXECUTE') then
    raise exception 'FAIL: anon can call ensure_my_profile';
  end if;
  if has_function_privilege('authenticated', 'public.end_sessions_for_deleted_profile()', 'EXECUTE') then
    raise exception 'FAIL: clients can call the session-ending trigger function';
  end if;
end;
$$;
reset role;

select 'PASS: deleted profile signs out' as result;
rollback;
