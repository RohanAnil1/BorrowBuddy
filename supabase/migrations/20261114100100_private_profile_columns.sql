-- Private profile fields, step 2 of 2: stop the API roles reading them.
--
-- The profiles_select policy lets any signed-in student read every verified
-- student's row. Row security can't hide individual columns, so this narrows
-- the column grant instead: anon and authenticated may read every profile
-- column except email, phone, student_id_path and verification_note.
--
-- Your own private fields come from my_private_profile(); admins get the
-- verification queue from admin_pending_profiles() (step 1). The server-side
-- service role, used by the email digest and admin bootstrap, keeps full
-- access, and the UPDATE grants students use to edit their own row are
-- unchanged.
--
-- Apply only after the web app and Android app no longer select * from
-- profiles; an older client doing so gets "permission denied".
--
-- A column added to profiles later is NOT readable by the API roles until it
-- is granted here as well.

revoke select on public.profiles from anon, authenticated;

grant select (
  id, full_name, department, year_of_study, avatar_path,
  verification_status, trust_score, is_admin, email_notifications,
  created_at, updated_at
) on public.profiles to anon, authenticated;
