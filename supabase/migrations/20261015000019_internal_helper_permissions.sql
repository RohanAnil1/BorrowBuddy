-- These SECURITY DEFINER helpers are implementation details. Direct client calls
-- bypass notification/audit policies and the authorization of their parent RPCs.
-- Parent RPCs and triggers execute as their trusted owner and retain access.
revoke execute on function public.create_notification(uuid, public.notification_type, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.recompute_trust_score(uuid)
  from public, anon, authenticated;
revoke execute on function public.notify_waitlist_for_item(uuid)
  from public, anon, authenticated;

grant execute on function public.create_notification(uuid, public.notification_type, text, text, jsonb) to service_role;
grant execute on function public.write_audit(text, text, text, jsonb) to service_role;
grant execute on function public.recompute_trust_score(uuid) to service_role;
grant execute on function public.notify_waitlist_for_item(uuid) to service_role;
