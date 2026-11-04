-- Direct roles and calls; synthetic account and all mutations roll back.
begin;
create temp table helper_permission_context(id uuid);
grant select on helper_permission_context to anon,authenticated;
insert into helper_permission_context values(gen_random_uuid());
insert into auth.users(id,email,raw_user_meta_data)
select id,'helper-permission-qa-' || id || '@bennett.edu.in','{"full_name":"Helper permission QA"}'::jsonb
from helper_permission_context;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$
declare v_target uuid; v_signature text;
begin
  select id into v_target from helper_permission_context;
  foreach v_signature in array array[
    'public.create_notification(uuid,public.notification_type,text,text,jsonb)',
    'public.write_audit(text,text,text,jsonb)',
    'public.recompute_trust_score(uuid)',
    'public.notify_waitlist_for_item(uuid)'
  ] loop
    if has_function_privilege(current_user,v_signature,'EXECUTE') then
      raise exception 'FAIL: % can execute internal helper %',current_user,v_signature;
    end if;
    if not has_function_privilege('service_role',v_signature,'EXECUTE') then
      raise exception 'FAIL: trusted service lost internal helper %',v_signature;
    end if;
  end loop;
  begin
    perform public.create_notification(v_target,'loan_cancelled','Forbidden synthetic notification');
    raise exception 'FAIL: client can forge notifications';
  exception when insufficient_privilege then null; end;
  begin
    perform public.write_audit('forbidden.synthetic','fixture',v_target::text);
    raise exception 'FAIL: client can forge audit records';
  exception when insufficient_privilege then null; end;
  begin
    perform public.recompute_trust_score(v_target);
    raise exception 'FAIL: client can directly recompute trust';
  exception when insufficient_privilege then null; end;
  begin
    perform public.notify_waitlist_for_item(gen_random_uuid());
    raise exception 'FAIL: client can directly promote waitlists';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',id)::text,true) from helper_permission_context;
set local role authenticated;
do $$
declare v_target uuid; v_signature text;
begin
  select id into v_target from helper_permission_context;
  foreach v_signature in array array[
    'public.create_notification(uuid,public.notification_type,text,text,jsonb)',
    'public.write_audit(text,text,text,jsonb)',
    'public.recompute_trust_score(uuid)',
    'public.notify_waitlist_for_item(uuid)'
  ] loop
    if has_function_privilege(current_user,v_signature,'EXECUTE') then
      raise exception 'FAIL: % can execute internal helper %',current_user,v_signature;
    end if;
    if not has_function_privilege('service_role',v_signature,'EXECUTE') then
      raise exception 'FAIL: trusted service lost internal helper %',v_signature;
    end if;
  end loop;
  begin
    perform public.create_notification(v_target,'loan_cancelled','Forbidden synthetic notification');
    raise exception 'FAIL: client can forge notifications';
  exception when insufficient_privilege then null; end;
  begin
    perform public.write_audit('forbidden.synthetic','fixture',v_target::text);
    raise exception 'FAIL: client can forge audit records';
  exception when insufficient_privilege then null; end;
  begin
    perform public.recompute_trust_score(v_target);
    raise exception 'FAIL: client can directly recompute trust';
  exception when insufficient_privilege then null; end;
  begin
    perform public.notify_waitlist_for_item(gen_random_uuid());
    raise exception 'FAIL: client can directly promote waitlists';
  exception when insufficient_privilege then null; end;
end;
$$;
-- A normal self-edit still runs the profile audit/update triggers.
update public.profiles set department='Computer Science' where id=(select id from helper_permission_context);
reset role;
do $$ begin
  if exists(select 1 from public.notifications where user_id=(select id from helper_permission_context)
      and title='Forbidden synthetic notification') then raise exception 'FAIL: unauthorized notification persisted'; end if;
  if exists(select 1 from public.audit_log where action='forbidden.synthetic'
      and entity_id=(select id::text from helper_permission_context)) then raise exception 'FAIL: forged audit persisted'; end if;
end; $$;
select 'PASS: anonymous/student helper denial, trusted service grants and normal profile update' as result;
rollback;
