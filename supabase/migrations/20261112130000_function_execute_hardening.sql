-- Least-privilege EXECUTE on public functions (Supabase advisors 0028/0029/0011).
--
-- Before this migration every function below was executable by PUBLIC and by
-- the anon role through /rest/v1/rpc. Each user-facing function already checks
-- auth.uid() internally, so this removes attack surface rather than fixing a
-- known hole. Only `pickup_locations_select_public` serves signed-out users,
-- and it calls no functions; every policy that uses the is_* helpers is scoped
-- to `authenticated`. Verified against all .rpc() callers in apps/web and
-- apps/android: none run without a session.

-- 1. User-facing RPCs and RLS helpers: signed-in users only.
--    `authenticated` and `service_role` keep their existing explicit grants.
revoke execute on function
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
from public, anon;

-- 2. Trigger functions and internal helpers: never called directly by clients.
--    Postgres checks EXECUTE on a trigger function only when the trigger is
--    created, not when it fires, so existing triggers keep working.
revoke execute on function
  public.audit_loan_change(),
  public.enforce_loan_transition(),
  public.handle_new_user(),
  public.notify_borrow_request(),
  public.notify_review(),
  public.protect_profile_fields(),
  public.set_updated_at(),
  public.trg_trust_on_incident(),
  public.trg_trust_on_loan(),
  public.trg_trust_on_review(),
  public.trg_trust_on_verification(),
  public.validate_borrow_request(),
  public.validate_review(),
  public.random_digits(integer)
from public, anon, authenticated;

-- 3. Pin the search_path of the one function that lacked it (advisor 0011).
--    Its body only assigns now(), which resolves from pg_catalog.
alter function public.set_updated_at() set search_path = '';

-- 4. Future functions created by migrations (role postgres) are no longer
--    executable by signed-out users by default. A function that genuinely
--    needs anonymous access must now `grant execute ... to anon` explicitly.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
