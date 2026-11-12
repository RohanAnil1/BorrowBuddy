-- Buddy assistant: per-student message budget, shared across server instances.
-- Additive only. Nothing reads this table directly; assistant_hit() owns it.

create table if not exists public.assistant_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  count integer not null default 0 check (count >= 0)
);

alter table public.assistant_usage enable row level security;
revoke all on table public.assistant_usage from public, anon, authenticated;

create or replace function public.assistant_hit(p_limit integer default 20, p_window_seconds integer default 600)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 200);
  v_window interval := make_interval(secs => least(greatest(coalesce(p_window_seconds, 600), 10), 86400));
  v_row public.assistant_usage;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  insert into public.assistant_usage as u (user_id, window_start, count)
  values (v_uid, now(), 1)
  on conflict (user_id) do update
    set window_start = case when u.window_start <= now() - v_window then now() else u.window_start end,
        count = case when u.window_start <= now() - v_window then 1 else u.count + 1 end
  returning * into v_row;

  return query select
    v_row.count <= v_limit,
    greatest(v_limit - v_row.count, 0),
    case when v_row.count <= v_limit then 0
      else greatest(ceil(extract(epoch from (v_row.window_start + v_window - now())))::integer, 1)
    end;
end;
$$;

revoke all on function public.assistant_hit(integer, integer) from public, anon;
grant execute on function public.assistant_hit(integer, integer) to authenticated;
