-- Notification privileges after the email migration: read + mark read only;
-- the email stamp and preference stay where they belong.
begin;
create temp table email_context(me uuid, other uuid, my_note uuid, other_note uuid);
grant all on email_context to authenticated, anon;
do $$
declare v_me uuid := gen_random_uuid(); v_other uuid := gen_random_uuid(); v_mine uuid; v_theirs uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_me, 'mail-qa-' || v_me || '@bennett.edu.in', '{"full_name":"Mail QA me"}'),
    (v_other, 'mail-qa-' || v_other || '@bennett.edu.in', '{"full_name":"Mail QA other"}');
  insert into public.notifications(user_id, type, title) values (v_me, 'new_review', 'Mine') returning id into v_mine;
  insert into public.notifications(user_id, type, title) values (v_other, 'new_review', 'Theirs') returning id into v_theirs;
  insert into email_context values (v_me, v_other, v_mine, v_theirs);
  if not (select email_notifications from public.profiles where id = v_me) then raise exception 'FAIL: email should default on'; end if;
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', me)::text, true) from email_context;
set local role authenticated;
do $$
declare v email_context; v_rows int;
begin
  select * into v from email_context;

  if (select count(*) from public.notifications) <> 1 then raise exception 'FAIL: should see exactly my notification'; end if;

  update public.notifications set read_at = now() where id = v.my_note;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL: could not mark my notification read'; end if;

  update public.notifications set read_at = now() where id = v.other_note;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: marked someone else''s notification read'; end if;

  begin
    update public.notifications set emailed_at = now() where id = v.my_note;
    raise exception 'FAIL: students can stamp emailed_at';
  exception when insufficient_privilege then null; end;

  begin
    update public.notifications set title = 'edited' where id = v.my_note;
    raise exception 'FAIL: students can rewrite notifications';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.notifications(user_id, type, title) values (v.me, 'new_review', 'forged');
    raise exception 'FAIL: students can insert notifications';
  exception when insufficient_privilege then null; end;

  begin
    delete from public.notifications where id = v.my_note;
    raise exception 'FAIL: students can delete notifications';
  exception when insufficient_privilege then null; end;

  update public.profiles set email_notifications = false where id = v.me;
  if (select email_notifications from public.profiles where id = v.me) then raise exception 'FAIL: could not turn email off'; end if;

  update public.profiles set email_notifications = false where id = v.other;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: changed someone else''s email preference'; end if;

  begin
    perform public.dispatch_notification_emails();
    raise exception 'FAIL: students can trigger the email job';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.notifications;
    raise exception 'FAIL: anonymous notification access';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

-- Without Vault secrets (or pg_net) the job is a no-op, never an error.
do $$ begin
  if public.dispatch_notification_emails() is not null then raise exception 'FAIL: dispatch ran without configuration'; end if;
end; $$;

select 'PASS: own notifications only, mark-read only, no stamping/inserts/deletes, own email preference, job locked down and inert without secrets' as result;
rollback;
