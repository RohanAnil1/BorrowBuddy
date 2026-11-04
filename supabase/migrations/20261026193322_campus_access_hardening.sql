-- Supabase default privileges may grant more than SELECT, including TRUNCATE.
-- RLS is a separate boundary and does not substitute for least-privilege grants.
revoke all on public.campus_posts,public.campus_post_notes,public.campus_claims,
 public.campus_transfers,public.campus_messages,public.campus_schedules,
 public.campus_appointments from public,anon,authenticated;
grant select on public.campus_posts,public.campus_post_notes,public.campus_claims,
 public.campus_transfers,public.campus_messages,public.campus_schedules,
 public.campus_appointments to authenticated;
grant all on public.campus_posts,public.campus_post_notes,public.campus_claims,
 public.campus_transfers,public.campus_messages,public.campus_schedules,
 public.campus_appointments to service_role;
