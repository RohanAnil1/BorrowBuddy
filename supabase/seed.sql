-- ===========================================================================
-- Seed data — safe to re-run (idempotent)
-- ===========================================================================

insert into public.categories (name, slug, icon, sort_order)
values
  ('Electronics', 'electronics', 'laptop', 1),
  ('Cameras & Audio', 'cameras-audio', 'camera', 2),
  ('Gaming', 'gaming', 'gamepad', 3),
  ('Sports & Fitness', 'sports-fitness', 'dumbbell', 4),
  ('Books & Stationery', 'books-stationery', 'book', 5),
  ('Tools & Hardware', 'tools-hardware', 'wrench', 6),
  ('Appliances', 'appliances', 'fan', 7),
  ('Other', 'other', 'box', 8)
on conflict (slug) do update
set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order;

insert into public.pickup_locations (name, description, lat, lng)
values
  ('Library Entrance', 'Main library steps, ground floor', 28.4507, 77.5831),
  ('Student Activity Center', 'Outside the SAC main door', 28.4512, 77.5838),
  ('Academic Block A', 'Atrium near the notice board', 28.4503, 77.5825),
  ('Boys Hostel Gate', 'Gate 1 entrance', 28.4520, 77.5845),
  ('Girls Hostel Gate', 'Gate 2 entrance', 28.4516, 77.5852),
  ('Sports Complex', 'Near the equipment room', 28.4498, 77.5841),
  ('Cafeteria', 'Central cafeteria seating area', 28.4509, 77.5833)
on conflict (name) do update
set description = excluded.description, lat = excluded.lat, lng = excluded.lng;

insert into public.conversations (type, title)
values ('community', 'Campus Lending')
on conflict (title) where type = 'community' do nothing;

-- ---------------------------------------------------------------------------
-- Admin bootstrap: set ADMIN_EMAIL in apps/web/.env.local — that account is
-- auto-promoted (is_admin + verified) on its first sign-in. Manual fallback:
--
--   update public.profiles
--   set is_admin = true, verification_status = 'verified'
--   where email = 'you@bennett.edu.in';
-- ---------------------------------------------------------------------------
