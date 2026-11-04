-- Kept separate so new enum values are committed before campus RPCs use them.
alter type public.notification_type add value if not exists 'campus_update';
alter type public.notification_type add value if not exists 'campus_message';
