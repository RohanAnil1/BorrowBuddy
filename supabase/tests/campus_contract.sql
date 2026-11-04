-- Read-only assertions against the deployed campus security/lifecycle contract.
do $$
declare name text; fn regprocedure;
begin
 foreach name in array array['campus_posts','campus_post_notes','campus_claims','campus_transfers','campus_messages','campus_schedules','campus_appointments'] loop
  assert (select relrowsecurity from pg_class where oid=('public.'||name)::regclass), name||' must enable RLS';
  assert not has_table_privilege('anon','public.'||name,'select'), 'Anonymous table access: '||name;
  assert has_table_privilege('authenticated','public.'||name,'select'), 'Missing scoped reads: '||name;
  assert not has_table_privilege('authenticated','public.'||name,'insert,update,delete,truncate'), 'Direct state mutation: '||name;
 end loop;
 foreach fn in array array['public.campus_api(text,jsonb)'::regprocedure,'public.campus_slots(uuid,date)'::regprocedure,'public.campus_thread_heads()'::regprocedure] loop
  assert not has_function_privilege('anon',fn,'execute'), 'Anonymous RPC access';
  assert has_function_privilege('authenticated',fn,'execute'), 'Missing member API';
 end loop;
 assert not has_schema_privilege('authenticated','borrowbuddy_private','usage'), 'Private schema exposed';
 assert not has_function_privilege('authenticated','borrowbuddy_private.campus_expire()','execute'), 'Member cleanup bypass';
 assert exists(select 1 from pg_constraint where conrelid='borrowbuddy_private.campus_occupancy'::regclass and contype='x'), 'Missing overlap exclusion';
 if exists(select 1 from pg_extension where extname='pg_cron') then
  assert exists(select 1 from cron.job where jobname='borrowbuddy-campus-expiry' and schedule='* * * * *' and active), 'Minute expiry cleanup is not active';
 end if;
 assert not (select public from storage.buckets where id='campus-photos'), 'Photos must be private';
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  assert (select count(*)=3 from pg_publication_tables where pubname='supabase_realtime' and tablename in('campus_messages','campus_transfers','campus_appointments')), 'Missing realtime publication';
 end if;
end $$;
select 'Campus grants, RLS, exclusion constraint, private storage, realtime and minute cleanup verified' as result;
