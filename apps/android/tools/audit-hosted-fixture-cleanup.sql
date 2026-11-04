-- Read-only post-run audit. Counts never include credentials or original user data.
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.items) as items,
  (select count(*) from public.pickup_locations) as pickup_locations,
  (select count(*) from supabase_migrations.schema_migrations) as migrations,
  (select count(*) from auth.users where email like 'android-qa-%@bennett.edu.in') as qa_users,
  (select count(*) from public.items where title like 'Android QA%') as qa_items,
  (select count(*) from public.pickup_locations where name like 'Android QA%' or name like 'Forbidden QA%') as qa_pins,
  (select count(*) from public.conversations where title like 'Android QA%') as qa_channels;
