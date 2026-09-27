-- ===========================================================================
-- Scheduled jobs & realtime
-- ===========================================================================

-- pg_cron may not be enabled (e.g. local dev without it) — never fail the
-- migration because of it.
do $$
begin
  create extension if not exists pg_cron;
exception
  when others then
    raise notice 'pg_cron unavailable, skipping: %', sqlerrm;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'borrowbuddy-expire-requests',
      '*/30 * * * *',
      $job$select public.expire_stale_requests()$job$
    );
    perform cron.schedule(
      'borrowbuddy-flag-overdue',
      '15 0 * * *',
      $job$select public.flag_overdue_loans()$job$
    );
    perform cron.schedule(
      'borrowbuddy-due-soon',
      '0 9 * * *',
      $job$select public.notify_due_soon()$job$
    );
    perform cron.schedule(
      'borrowbuddy-waitlist-sweep',
      '30 9 * * *',
      $job$select public.notify_waitlist_sweep()$job$
    );
  end if;
exception
  when others then
    raise notice 'cron scheduling skipped: %', sqlerrm;
end;
$$;

-- Realtime for chat, notifications and live loan/request status.
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'messages', 'notifications', 'loans', 'borrow_requests',
      'conversations', 'conversation_members', 'fines', 'incidents'
    ]
    loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      exception
        when duplicate_object then null;
      end;
    end loop;
  end if;
end;
$$;
