-- Admin console read models: only admins can read the overview and the audit
-- log, the overview always has 14 days, queue counts follow the data, and the
-- audit list filters, searches and names its subjects. Rolls back.
begin;
create temp table console_test_context(admin_id uuid, student_id uuid, pending_id uuid);
grant select on console_test_context to authenticated, anon;

-- Signs in as the given user for the rest of the transaction (or until reset).
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated, anon;

do $$
declare
  v_admin uuid := gen_random_uuid(); v_student uuid := gen_random_uuid(); v_pending uuid := gen_random_uuid();
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_admin, 'console-qa-' || v_admin || '@bennett.edu.in', '{"full_name":"Console QA admin"}'),
    (v_student, 'console-qa-' || v_student || '@bennett.edu.in', '{"full_name":"Console QA student"}'),
    (v_pending, 'console-qa-' || v_pending || '@bennett.edu.in', '{"full_name":"Console QA pending"}');
  update public.profiles set verification_status = 'verified' where id in (v_admin, v_student);
  update public.profiles set is_admin = true where id = v_admin;
  insert into console_test_context values (v_admin, v_student, v_pending);
end;
$$;

-- 1. Students and signed-out visitors can't read either.
select pg_temp.as_user(student_id) from console_test_context;
set local role authenticated;
do $$
begin
  begin perform public.admin_overview(); raise exception 'FAIL: student read the admin overview';
  exception when others then if sqlerrm <> 'Only admins can view the admin console' then raise; end if; end;
  begin perform public.admin_list_audit(); raise exception 'FAIL: student read the audit log';
  exception when others then if sqlerrm <> 'Only admins can read the audit log' then raise; end if; end;
end;
$$;
reset role;

set local role anon;
do $$
begin
  begin perform public.admin_overview(); raise exception 'FAIL: anon ran admin_overview';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_list_audit(); raise exception 'FAIL: anon ran admin_list_audit';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- 2. The overview counts the pending student and has 14 days, today last.
select pg_temp.as_user(admin_id) from console_test_context;
set local role authenticated;
do $$
declare
  v jsonb := public.admin_overview();
  v_series jsonb := v -> 'series';
begin
  if jsonb_array_length(v_series) <> 14 then
    raise exception 'FAIL: expected 14 days, got %', jsonb_array_length(v_series);
  end if;
  if (v_series -> 13 ->> 'day')::date <> (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'FAIL: the series does not end today';
  end if;
  if (v_series -> 13 ->> 'signups')::int < 3 then
    raise exception 'FAIL: today''s sign-ups miss the three test accounts';
  end if;
  if (v -> 'queues' ->> 'verifications')::int < 1 or (v -> 'oldest' ->> 'verifications') is null then
    raise exception 'FAIL: the pending student is not in the verification queue';
  end if;
  if (v -> 'students' ->> 'admins')::int < 1 then
    raise exception 'FAIL: no admins counted';
  end if;
  if (select count(*) from jsonb_object_keys(v -> 'queues')) <> 6 then
    raise exception 'FAIL: unexpected queue keys';
  end if;
end;
$$;

-- 3. Admin actions show up in the audit log with names, filters and search.
select public.admin_send_notice(student_id, 'Console QA notice', 'Rollback-only notice') from console_test_context;
do $$
declare
  v_student uuid := (select student_id from console_test_context);
  v_row record;
begin
  select * into v_row from public.admin_list_audit('notice', null, 10, 0) limit 1;
  if not found then
    raise exception 'FAIL: the notice is missing from the audit log';
  end if;
  if v_row.action is distinct from 'notice.sent' or v_row.entity_id is distinct from v_student::text then
    raise exception 'FAIL: the notice is not the newest notice entry';
  end if;
  if v_row.subject_name is distinct from 'Console QA student' or v_row.actor_name is distinct from 'Console QA admin' then
    raise exception 'FAIL: subject or actor name missing (%, %)', v_row.subject_name, v_row.actor_name;
  end if;
  if coalesce(v_row.total_count, 0) < 1 then
    raise exception 'FAIL: missing total count';
  end if;

  if exists (select 1 from public.admin_list_audit('trust', null, 50, 0) a where a.action not like 'trust.%') then
    raise exception 'FAIL: category filter let other actions through';
  end if;

  if not exists (select 1 from public.admin_list_audit(null, 'console qa student', 50, 0)) then
    raise exception 'FAIL: search by subject name found nothing';
  end if;
  if exists (select 1 from public.admin_list_audit(null, '%_nothing_matches_%', 50, 0)) then
    raise exception 'FAIL: search treated LIKE wildcards as patterns';
  end if;

  if (select count(*) from public.admin_list_audit(null, null, 1, 0)) <> 1 then
    raise exception 'FAIL: limit ignored';
  end if;
end;
$$;
reset role;

rollback;
