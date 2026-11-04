-- Availability is campus-visible; private loan rows and parties remain private.
create or replace function public.get_item_availability(p_item_id uuid)
returns table(start_date date, end_date date, kind text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_verified(auth.uid()) then
    raise exception 'Only verified students can view availability';
  end if;
  if not exists (
    select 1 from public.items i where i.id = p_item_id
      and (i.status <> 'draft' or i.owner_id = auth.uid() or public.is_admin(auth.uid()))
  ) then
    raise exception 'Item not found';
  end if;
  return query
    select l.start_date, l.due_date, 'loan'::text from public.loans l
    where l.item_id = p_item_id
      and l.status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed', 'lost')
    union all
    select b.start_date, b.end_date, 'block'::text from public.availability_blocks b
    where b.item_id = p_item_id;
end;
$$;

create or replace function public.get_busy_item_ids(p_start date, p_end date)
returns table(item_id uuid)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_verified(auth.uid()) then
    raise exception 'Only verified students can view availability';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Pick a valid date range';
  end if;
  return query
    select distinct i.id from public.items i
    where i.status = 'available' and (
      exists (select 1 from public.loans l where l.item_id = i.id
        and l.status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed', 'lost')
        and daterange(l.start_date, l.due_date, '[]') && daterange(p_start, p_end, '[]'))
      or exists (select 1 from public.availability_blocks b where b.item_id = i.id
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]'))
    );
end;
$$;
revoke all on function public.get_item_availability(uuid) from public, anon;
revoke all on function public.get_busy_item_ids(date, date) from public, anon;
grant execute on function public.get_item_availability(uuid) to authenticated;
grant execute on function public.get_busy_item_ids(date, date) to authenticated;
