-- ===========================================================================
-- Strict student-ID guardrails:
--   * PNG / JPG only (bucket-level enforcement)
--   * submit_student_id() now verifies the path belongs to the caller, uses
--     an allowed extension, and that the object actually exists in storage.
-- ===========================================================================

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'student-ids';

create or replace function public.submit_student_id(p_path text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_path text := trim(coalesce(p_path, ''));
  v_current public.profiles;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- strict path guard: {uid}/{file}.png|jpg|jpeg — no traversal, no PDFs
  if v_path !~ ('^' || v_uid::text || '/[A-Za-z0-9-]+\.(png|jpe?g)$') then
    raise exception 'Upload a PNG or JPG photo of your student ID';
  end if;

  -- the file must actually exist in the private student-ids bucket
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'student-ids' and name = v_path
  ) then
    raise exception 'Uploaded file not found - upload your student ID again';
  end if;

  select * into v_current from public.profiles where id = v_uid for update;
  if v_current is null then
    raise exception 'Profile not found';
  end if;
  if v_current.verification_status = 'verified' then
    raise exception 'Your student ID is already verified - contact an admin to change it';
  end if;
  if v_current.verification_status = 'suspended' then
    raise exception 'Your account is suspended - contact an admin';
  end if;

  update public.profiles
  set student_id_path = v_path,
      verification_status = 'pending',
      verification_note = null
  where id = v_uid
  returning * into v_profile;

  perform public.write_audit(
    'profile.student_id_submitted', 'profile', v_uid::text,
    jsonb_build_object('path', v_path)
  );

  return v_profile;
end;
$$;
