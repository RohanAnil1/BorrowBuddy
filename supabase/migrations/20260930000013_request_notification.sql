-- ===========================================================================
-- Borrow requests notify the owner the moment they land. The request insert
-- happens directly from the app, so the notification is produced by a trigger
-- (the same pattern used for verification and loans).
-- ===========================================================================

create or replace function public.notify_borrow_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_borrower public.profiles;
begin
  select * into v_item from public.items where id = new.item_id;
  select * into v_borrower from public.profiles where id = new.borrower_id;

  if v_item is null then
    return new;
  end if;

  perform public.create_notification(
    v_item.owner_id,
    'request_received',
    'New borrow request',
    format(
      '%s wants "%s" from %s to %s.',
      coalesce(nullif(v_borrower.full_name, ''), 'A student'),
      v_item.title,
      new.start_date,
      new.end_date
    ),
    jsonb_build_object(
      'request_id', new.id,
      'item_id', new.item_id,
      'borrower_id', new.borrower_id
    )
  );

  return new;
end;
$$;

create trigger borrow_requests_notify
after insert on public.borrow_requests
for each row execute function public.notify_borrow_request();
