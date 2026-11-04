-- Read-only audit of the explicitly authorized persistent demo batch.
-- Disposable Android QA actors and this demo lender have different identities.
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.items) as items,
  (select count(*) from public.pickup_locations) as pickup_locations,
  (select count(*) from supabase_migrations.schema_migrations) as migrations,
  (select count(*) from auth.users where email like 'android-qa-%@bennett.edu.in') as qa_users,
  (select count(*) from public.items where title like 'Android QA%') as qa_items,
  (select count(*) from public.pickup_locations where name like 'Android QA%' or name like 'Forbidden QA%') as qa_pins,
  (select count(*) from public.conversations where title like 'Android QA%') as qa_channels,
  (select count(*) from public.profiles where id = 'd6860cdc-3b60-4ebd-9ee1-8faefba12aa6' and not is_admin and verification_status = 'verified') as demo_lenders,
  (select count(*) from public.items where owner_id = 'd6860cdc-3b60-4ebd-9ee1-8faefba12aa6' and status = 'available' and description like 'DEMO INVENTORY%' and cardinality(images) > 0) as demo_listings,
  (select sum(cardinality(images)) from public.items where owner_id = 'd6860cdc-3b60-4ebd-9ee1-8faefba12aa6') as demo_image_references,
  (select count(*) from storage.objects where bucket_id = 'item-images' and name like 'd6860cdc-3b60-4ebd-9ee1-8faefba12aa6/demo-20261021/%') as demo_stored_images;
