-- Private profile fields: a student reads only their own; admins read the queue.
begin;
create temp table private_profile_context(student_id uuid, other_id uuid, admin_id uuid, pending_id uuid);
grant all on private_profile_context to authenticated, anon;
do $$
declare
  v_student uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid(); v_pending uuid := gen_random_uuid();
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_student, 'private-qa-student-' || v_student || '@bennett.edu.in', '{"full_name":"Private QA student"}'),
    (v_other, 'private-qa-other-' || v_other || '@bennett.edu.in', '{"full_name":"Private QA other"}'),
    (v_admin, 'private-qa-admin-' || v_admin || '@bennett.edu.in', '{"full_name":"Private QA admin"}'),
    (v_pending, 'private-qa-pending-' || v_pending || '@bennett.edu.in', '{"full_name":"Private QA pending"}');
  update public.profiles set verification_status = 'verified' where id in (v_student, v_other, v_admin);
  update public.profiles set phone = '9000000001', verification_note = 'QA note' where id = v_other;
  update public.profiles set is_admin = true where id = v_admin;
  update public.profiles set student_id_path = v_pending || '/id.png' where id = v_pending;
  insert into private_profile_context values(v_student, v_other, v_admin, v_pending);
end;
$$;

-- A student: their own private fields, nobody else's, and no admin queue.
select set_config('request.jwt.claims', json_build_object('sub', student_id)::text, true) from private_profile_context;
set local role authenticated;
do $$
declare v_context private_profile_context; v_rows int; v_email text; v_column text;
begin
  select * into v_context from private_profile_context;
  -- Public columns of another verified student still read fine...
  if not exists(select 1 from public.profiles where id = v_context.other_id and full_name = 'Private QA other' and is_admin = false) then
    raise exception 'FAIL: public profile columns are no longer readable';
  end if;
  -- ...but private columns are refused outright, even on your own row and even via select *.
  foreach v_column in array array['email', 'phone', 'student_id_path', 'verification_note'] loop
    begin
      execute format('select %I from public.profiles where id = $1', v_column) using v_context.other_id;
      raise exception 'FAIL: % of another student is readable', v_column;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform * from public.profiles where id = v_context.student_id;
    raise exception 'FAIL: select * on profiles still allowed';
  exception when insufficient_privilege then null;
  end;
  -- Editing your own row keeps working.
  update public.profiles set phone = '9000000002' where id = v_context.student_id;
  if (select phone from public.my_private_profile()) <> '9000000002' then raise exception 'FAIL: own phone update lost'; end if;
  select count(*), max(email) into v_rows, v_email from public.my_private_profile();
  if v_rows <> 1 then raise exception 'FAIL: expected exactly one private row, got %', v_rows; end if;
  if v_email <> 'private-qa-student-' || v_context.student_id || '@bennett.edu.in' then raise exception 'FAIL: wrong private email returned'; end if;
  begin
    perform public.admin_pending_profiles();
    raise exception 'FAIL: a student read the verification queue';
  exception when others then
    if sqlerrm not like 'Only admins%' then raise; end if;
  end;
end;
$$;
reset role;

-- An admin: the queue, with the email and ID upload they review.
select set_config('request.jwt.claims', json_build_object('sub', admin_id)::text, true) from private_profile_context;
set local role authenticated;
do $$
declare v_context private_profile_context; v_row public.profiles;
begin
  select * into v_context from private_profile_context;
  select * into v_row from public.admin_pending_profiles() where id = v_context.pending_id;
  if v_row.id is null then raise exception 'FAIL: pending student missing from the admin queue'; end if;
  if v_row.email is null or v_row.student_id_path is null then raise exception 'FAIL: admin queue lacks email or ID path'; end if;
  if exists(select 1 from public.admin_pending_profiles() where verification_status <> 'pending') then
    raise exception 'FAIL: admin queue includes non-pending profiles';
  end if;
end;
$$;
reset role;

-- Signed out: neither function is callable, and private columns are refused.
set local role anon;
do $$
begin
  begin
    perform email from public.profiles limit 1;
    raise exception 'FAIL: anon read profile emails';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.my_private_profile();
    raise exception 'FAIL: anon called my_private_profile';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_pending_profiles();
    raise exception 'FAIL: anon called admin_pending_profiles';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select 'PASS: private profile fields' as result;
rollback;
