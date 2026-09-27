-- ===========================================================================
-- Student ID submission (kept as an RPC so the client cannot flip its own
-- verification status; column privileges block direct writes).
-- ===========================================================================

create or replace function public.submit_student_id(p_path text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current public.profiles;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(trim(coalesce(p_path, ''))) < 3 then
    raise exception 'Upload a student ID first';
  end if;

  select * into v_current from public.profiles where id = v_uid for update;
  if v_current is null then
    raise exception 'Profile not found';
  end if;
  if v_current.verification_status = 'verified' then
    raise exception 'Your student ID is already verified — contact an admin to change it';
  end if;
  if v_current.verification_status = 'suspended' then
    raise exception 'Your account is suspended — contact an admin';
  end if;

  update public.profiles
  set student_id_path = p_path,
      verification_status = 'pending',
      verification_note = null
  where id = v_uid
  returning * into v_profile;

  perform public.write_audit(
    'profile.student_id_submitted', 'profile', v_uid::text,
    jsonb_build_object('path', p_path)
  );

  return v_profile;
end;
$$;
