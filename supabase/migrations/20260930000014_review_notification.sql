-- ===========================================================================
-- Reviews notify the reviewee the moment they land, mirroring the request
-- trigger in 20260930000013.
-- ===========================================================================

create or replace function public.notify_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer public.profiles;
begin
  select * into v_reviewer from public.profiles where id = new.reviewer_id;

  perform public.create_notification(
    new.reviewee_id,
    'new_review',
    'New rating',
    format(
      '%s rated you %s/5.',
      coalesce(nullif(v_reviewer.full_name, ''), 'A student'),
      new.rating
    ),
    jsonb_build_object(
      'review_id', new.id,
      'loan_id', new.loan_id,
      'rating', new.rating,
      'role', new.role::text
    )
  );

  return new;
end;
$$;

create trigger reviews_notify
after insert on public.reviews
for each row execute function public.notify_review();
