-- Email notifications.
--
-- The web app's /api/cron/notification-emails route sends a short digest of
-- important, still-unread notifications and stamps notifications.emailed_at.
-- pg_cron calls that route every 5 minutes through pg_net. The URL and shared
-- secret live in Supabase Vault (names below), so nothing secret is in git:
--
--   select vault.create_secret('https://<your-app>/api/cron/notification-emails', 'borrowbuddy_email_cron_url');
--   select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'borrowbuddy_cron_secret');
--
-- Until both secrets exist the job does nothing.

alter table public.notifications add column if not exists emailed_at timestamptz;
alter table public.profiles add column if not exists email_notifications boolean not null default true;

comment on column public.notifications.emailed_at is 'When this notification went out by email (null = not emailed).';
comment on column public.profiles.email_notifications is 'Student wants email for important updates. Toggle on /me.';

-- The sender scans recent, unread, not-yet-emailed rows.
create index if not exists notifications_email_queue_idx
  on public.notifications (created_at)
  where emailed_at is null and read_at is null;

-- Least privilege. Students only read their notifications and mark them
-- read; they must not stamp emailed_at or touch anyone's rows otherwise.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- Students can switch email on or off for themselves.
grant update (email_notifications) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduler: pg_net posts to the web route with the shared secret.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net;
exception
  when others then
    raise notice 'pg_net unavailable, skipping: %', sqlerrm;
end;
$$;

create or replace function public.dispatch_notification_emails()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_catalog.pg_namespace where nspname = 'vault') then
    return null;
  end if;

  execute $sql$select decrypted_secret from vault.decrypted_secrets where name = 'borrowbuddy_email_cron_url'$sql$ into v_url;
  execute $sql$select decrypted_secret from vault.decrypted_secrets where name = 'borrowbuddy_cron_secret'$sql$ into v_secret;
  if v_url is null or v_secret is null then
    return null; -- not configured yet
  end if;

  -- Only skip the network call when nothing is waiting.
  if not exists (
    select 1 from public.notifications n
    where n.emailed_at is null and n.read_at is null
      and n.created_at < now() - interval '2 minutes'
      and n.created_at > now() - interval '24 hours'
  ) then
    return 0;
  end if;

  return (
    select net.http_post(
      url := v_url,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
  );
end;
$$;

revoke all on function public.dispatch_notification_emails() from public, anon, authenticated;
grant execute on function public.dispatch_notification_emails() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'borrowbuddy-notification-emails',
      '*/5 * * * *',
      $job$select public.dispatch_notification_emails()$job$
    );
  end if;
exception
  when others then
    raise notice 'cron scheduling skipped: %', sqlerrm;
end;
$$;
