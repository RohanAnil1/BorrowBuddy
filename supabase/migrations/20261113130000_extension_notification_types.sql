-- Notification types for loan extensions. Kept in their own migration so the
-- new enum values are committed before any function or test uses them.
alter type public.notification_type add value if not exists 'extension_requested';
alter type public.notification_type add value if not exists 'extension_approved';
alter type public.notification_type add value if not exists 'extension_declined';
alter type public.notification_type add value if not exists 'handover_reminder';
