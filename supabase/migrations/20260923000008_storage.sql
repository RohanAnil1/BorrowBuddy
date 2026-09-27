-- ===========================================================================
-- Storage buckets & policies
-- Path convention: {user_id}/{filename}
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('item-images', 'item-images', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('avatars', 'avatars', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('student-ids', 'student-ids', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('incident-photos', 'incident-photos', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('chat-images', 'chat-images', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- item-images (public read)
-- ---------------------------------------------------------------------------

drop policy if exists item_images_read on storage.objects;
create policy item_images_read on storage.objects
for select to authenticated
using (bucket_id = 'item-images');

drop policy if exists item_images_insert on storage.objects;
create policy item_images_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'item-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists item_images_update on storage.objects;
create policy item_images_update on storage.objects
for update to authenticated
using (
  bucket_id = 'item-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists item_images_delete on storage.objects;
create policy item_images_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'item-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- avatars (public read)
-- ---------------------------------------------------------------------------

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
for select to authenticated
using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- student-ids (private: owner + admins)
-- ---------------------------------------------------------------------------

drop policy if exists student_ids_read on storage.objects;
create policy student_ids_read on storage.objects
for select to authenticated
using (
  bucket_id = 'student-ids'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin((select auth.uid()))
  )
);

drop policy if exists student_ids_insert on storage.objects;
create policy student_ids_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'student-ids'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists student_ids_update on storage.objects;
create policy student_ids_update on storage.objects
for update to authenticated
using (
  bucket_id = 'student-ids'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists student_ids_delete on storage.objects;
create policy student_ids_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'student-ids'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- incident-photos (private: uploader + admins; parties read via signed URLs)
-- ---------------------------------------------------------------------------

drop policy if exists incident_photos_read on storage.objects;
create policy incident_photos_read on storage.objects
for select to authenticated
using (
  bucket_id = 'incident-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin((select auth.uid()))
  )
);

drop policy if exists incident_photos_insert on storage.objects;
create policy incident_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'incident-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists incident_photos_delete on storage.objects;
create policy incident_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'incident-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin((select auth.uid()))
  )
);

-- ---------------------------------------------------------------------------
-- chat-images (private bucket; signed URLs are generated by the app)
-- ---------------------------------------------------------------------------

drop policy if exists chat_images_read on storage.objects;
create policy chat_images_read on storage.objects
for select to authenticated
using (bucket_id = 'chat-images');

drop policy if exists chat_images_insert on storage.objects;
create policy chat_images_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists chat_images_delete on storage.objects;
create policy chat_images_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
