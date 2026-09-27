-- Resolve btree_gist operator classes used by the loans exclusion constraint.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  phone text,
  department text,
  year_of_study int check (year_of_study between 1 and 6),
  avatar_path text,
  student_id_path text,
  verification_status public.verification_status not null default 'pending',
  verification_note text,
  trust_score numeric(5, 2) not null default 70 check (trust_score between 0 and 100),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Created by trigger on signup.';

-- ---------------------------------------------------------------------------
-- categories / pickup locations
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text not null default 'box',
  sort_order int not null default 0
);

create table public.pickup_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  lat double precision,
  lng double precision,
  photo_path text,
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  title text not null check (char_length(title) between 3 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  condition public.item_condition not null default 'good',
  images text[] not null default '{}' check (cardinality(images) <= 6),
  deposit_amount int not null default 0 check (deposit_amount between 0 and 100000),
  max_loan_days int not null default 14 check (max_loan_days between 1 and 30),
  pickup_location_id uuid references public.pickup_locations (id) on delete set null,
  status public.item_status not null default 'available',
  search_vector tsvector generated always as (
    to_tsvector(
      'english'::regconfig,
      coalesce(title, '') || ' ' || coalesce(description, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- availability blocks (owner-declared blackout dates)
-- ---------------------------------------------------------------------------
create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason public.availability_reason not null default 'manual',
  note text check (char_length(note) <= 200),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- borrow requests
-- ---------------------------------------------------------------------------
create table public.borrow_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  borrower_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  message text check (char_length(message) <= 500),
  status public.request_status not null default 'pending',
  decline_reason text check (char_length(decline_reason) <= 300),
  expires_at timestamptz default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- loans — the core lifecycle object.
-- The exclusion constraint below makes double-booking impossible at the
-- database level: no two blocking loans for the same item may overlap.
-- ---------------------------------------------------------------------------
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.borrow_requests (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  borrower_id uuid not null references public.profiles (id) on delete restrict,
  start_date date not null,
  due_date date not null,
  returned_at timestamptz,
  status public.loan_status not null default 'awaiting_pickup',
  handover_token_hash text,
  handover_token_expires_at timestamptz,
  handover_attempts int not null default 0,
  return_token_hash text,
  return_token_expires_at timestamptz,
  return_attempts int not null default 0,
  pickup_confirmed_at timestamptz,
  return_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= start_date),
  constraint loans_no_overlap exclude using gist (
    item_id with =,
    daterange(start_date, due_date, '[]') with &&
  ) where (
    status in ('awaiting_pickup', 'active', 'return_pending', 'overdue', 'disputed', 'lost')
  )
);

-- ---------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  desired_start date not null,
  desired_end date not null,
  status public.waitlist_status not null default 'waiting',
  created_at timestamptz not null default now(),
  check (desired_end >= desired_start)
);

-- ---------------------------------------------------------------------------
-- chat
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type public.conversation_type not null,
  loan_id uuid references public.loans (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  check (
    (type = 'private' and loan_id is not null)
    or (type = 'community' and loan_id is null and title is not null)
  )
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_path text,
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or image_path is not null)
);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  role public.review_role not null,
  rating int not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (loan_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);

-- ---------------------------------------------------------------------------
-- incidents & evidence
-- ---------------------------------------------------------------------------
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  type public.incident_type not null,
  description text not null check (char_length(description) between 10 and 2000),
  status public.incident_status not null default 'open',
  resolution_note text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.incident_photos (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  path text not null,
  phase public.photo_phase not null default 'after',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- fines (tracked in-app, settled offline)
-- ---------------------------------------------------------------------------
create table public.fines (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null check (amount between 1 and 100000),
  source public.fine_source not null default 'other',
  reason text not null,
  status public.fine_status not null default 'pending',
  settled_by uuid references public.profiles (id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- moderation
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target public.report_target not null,
  target_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
