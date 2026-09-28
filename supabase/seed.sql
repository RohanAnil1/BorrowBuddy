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

-- Campus pins for the landing board — xp/yp are percentages of the master
-- plan photograph (apps/web/public/campus-map.png), nudged by the admin desk.
insert into public.pickup_locations (name, description, xp, yp, map_label)
values
  ('Maggi Hotspot', 'Eatery counter in front of Block C1', 38.8, 44.4, 'right'),
  ('Southern Stories', 'Eatery counter in front of Block D1', 38.8, 41.3, 'left'),
  ('D5 Stage', 'Open-air stage in front of Block D5', 37.5, 35.7, 'left'),
  ('Laundry', 'Laundry drop between Blocks D4 and D2', 42.0, 36.6, 'right'),
  ('Quench', 'Eatery counter in front of the Sports Complex', 29.7, 33.6, 'left')
on conflict (name) do update
set description = excluded.description,
    xp = excluded.xp,
    yp = excluded.yp,
    map_label = excluded.map_label;

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
