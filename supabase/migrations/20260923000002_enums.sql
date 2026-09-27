create type public.verification_status as enum ('pending', 'verified', 'rejected', 'suspended');
create type public.item_condition as enum ('new', 'good', 'fair', 'worn');
create type public.item_status as enum ('draft', 'available', 'paused', 'retired');
create type public.availability_reason as enum ('manual', 'maintenance');
create type public.request_status as enum (
  'pending', 'approved', 'declined', 'cancelled', 'expired', 'converted'
);
create type public.loan_status as enum (
  'awaiting_pickup', 'active', 'return_pending', 'returned', 'overdue', 'disputed', 'lost', 'cancelled'
);
create type public.handover_kind as enum ('pickup', 'return');
create type public.conversation_type as enum ('private', 'community');
create type public.waitlist_status as enum ('waiting', 'notified', 'converted', 'expired', 'cancelled');
create type public.incident_type as enum ('damage', 'lost', 'late', 'no_show', 'other');
create type public.incident_status as enum ('open', 'under_review', 'resolved', 'rejected');
create type public.photo_phase as enum ('before', 'after');
create type public.fine_status as enum ('pending', 'settled', 'waived');
create type public.fine_source as enum ('overdue', 'damage', 'loss', 'no_show', 'other');
create type public.review_role as enum ('as_owner', 'as_borrower');
create type public.report_target as enum ('item', 'user', 'message');
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.notification_type as enum (
  'verification_approved', 'verification_rejected',
  'request_received', 'request_approved', 'request_declined', 'request_cancelled', 'request_expired',
  'waitlist_available',
  'loan_due_soon', 'loan_overdue', 'loan_returned', 'loan_cancelled', 'handover_confirmed',
  'incident_opened', 'incident_resolved',
  'fine_created', 'fine_settled',
  'new_message', 'new_review', 'report_resolved'
);
