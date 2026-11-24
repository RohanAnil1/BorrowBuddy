-- Normalization read helpers: an item's / campus post's photo paths, read
-- from the photo tables in display order. Exposed to the API as a computed
-- field, so clients select `images:photo_paths` and keep the shape they
-- already use (a text[] whose first entry is the cover) once step 2 drops
-- the old images columns.

create function public.photo_paths(public.items)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(p.path order by p.position), '{}')
  from public.item_photos p
  where p.item_id = $1.id;
$$;

create function public.photo_paths(public.campus_posts)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(p.path order by p.position), '{}')
  from public.campus_post_photos p
  where p.post_id = $1.id;
$$;

revoke all on function public.photo_paths(public.items), public.photo_paths(public.campus_posts) from public;
grant execute on function public.photo_paths(public.items) to anon, authenticated;
grant execute on function public.photo_paths(public.campus_posts) to authenticated;
