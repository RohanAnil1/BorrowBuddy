-- Admins can delete a student's profile.
--
--   admin_delete_student(id, confirm_email)
--
-- Refuses while the student has a loan in progress, so no item goes missing.
-- Otherwise removes their closed loans (with each loan's fines, reviews,
-- incidents and handover records), their listings and requests, and the
-- profile. Deleting the profile ends every session of the account (see
-- 20261114120000_deleted_profile_signs_out); signing in again starts over with
-- onboarding and ID review.
--
-- The caller must type the student's email to confirm. The audit log keeps
-- their name, email and what was removed. Students on the other side of the
-- removed loans get their trust score recalculated.
--
-- Returns the storage paths the profile pointed at, so the server can delete
-- the files with the service role.

create or replace function public.admin_delete_student(p_profile_id uuid, p_confirm_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_open integer;
  v_loans integer;
  v_items integer;
  v_others uuid[];
  v_item_images text[];
  v_other uuid;
begin
  perform public.admin_assert_can_manage(p_profile_id);

  select * into v_profile from public.profiles p where p.id = p_profile_id for update;

  if lower(trim(coalesce(p_confirm_email, ''))) <> lower(v_profile.email) then
    raise exception 'Type the student''s email exactly to confirm';
  end if;

  select count(*) into v_open
  from public.loans l
  where (l.borrower_id = p_profile_id or l.owner_id = p_profile_id)
    and l.status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed');
  if v_open > 0 then
    raise exception 'This student has % loan(s) in progress. Finish or cancel them first.', v_open;
  end if;

  select coalesce(array_agg(distinct case when l.borrower_id = p_profile_id then l.owner_id else l.borrower_id end), '{}')
  into v_others
  from public.loans l
  where l.borrower_id = p_profile_id or l.owner_id = p_profile_id;

  select coalesce(array_agg(image), '{}') into v_item_images
  from public.items i, unnest(i.images) as image
  where i.owner_id = p_profile_id;

  select count(*) into v_items from public.items i where i.owner_id = p_profile_id;
  select count(*) into v_loans from public.loans l where l.borrower_id = p_profile_id or l.owner_id = p_profile_id;

  -- Write the record first: the audit row survives the profile.
  perform public.write_audit('profile.deleted', 'profile', p_profile_id::text, jsonb_build_object(
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'verification_status', v_profile.verification_status,
    'items', v_items,
    'loans', v_loans
  ));

  delete from public.loans l where l.borrower_id = p_profile_id or l.owner_id = p_profile_id;

  update public.campus_claims set reviewed_by = null where reviewed_by = p_profile_id;

  delete from public.profiles where id = p_profile_id;

  foreach v_other in array v_others loop
    if exists (select 1 from public.profiles p where p.id = v_other) then
      perform public.recompute_trust_score(v_other);
    end if;
  end loop;

  return jsonb_build_object(
    'loans_removed', v_loans,
    'items_removed', v_items,
    'avatar_path', v_profile.avatar_path,
    'student_id_path', v_profile.student_id_path,
    'item_images', to_jsonb(v_item_images)
  );
end;
$$;

comment on function public.admin_delete_student(uuid, text) is
  'Delete a student''s profile, closed loans and listings. Refuses while a loan is in progress or if the confirmation email does not match. Audited. Raises for non-admins and for your own account.';

revoke all on function public.admin_delete_student(uuid, text) from public, anon;
grant execute on function public.admin_delete_student(uuid, text) to authenticated, service_role;
