-- Follow-up to 20261112130000_function_execute_hardening.
--
-- That migration removed PUBLIC/anon EXECUTE and relied on signed-in users'
-- direct grants. Hosted Supabase adds those through its default privileges,
-- but a plain Postgres (CI, a restore, another host) only had PUBLIC, so the
-- RLS helpers and RPCs became uncallable there. Grant them explicitly so the
-- schema means the same everywhere. On the hosted project this is a no-op.

grant execute on function
  public.admin_delete_pickup_location(uuid),
  public.admin_resolve_report(uuid, text, text),
  public.admin_save_pickup_location(uuid, text, text, double precision, double precision, text, boolean),
  public.admin_set_verification(uuid, public.verification_status, text),
  public.approve_request(uuid),
  public.cancel_loan(uuid, text),
  public.cancel_request(uuid),
  public.create_community_conversation(text),
  public.decline_request(uuid, text),
  public.join_waitlist(uuid, date, date),
  public.leave_waitlist(uuid),
  public.open_incident(uuid, public.incident_type, text, text[]),
  public.resolve_incident(uuid, text, text, integer, uuid),
  public.settle_fine(uuid, text),
  public.submit_student_id(text),
  public.is_admin(uuid),
  public.is_conversation_member(uuid, uuid),
  public.is_loan_party(uuid, uuid),
  public.is_verified(uuid)
to authenticated, service_role;
