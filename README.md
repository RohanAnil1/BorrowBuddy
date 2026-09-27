# BorrowBuddy

Campus-only peer-to-peer lending platform for verified Bennett University students. Replaces informal borrowing via WhatsApp groups with structured availability tracking, secure handovers, reputation, and dispute handling.

## Monorepo layout

```
BorrowBuddy/
  apps/
    web/            # Next.js 16 app (web client + server actions)
    mobile/         # Expo Android app (Phase 4, not yet created)
  packages/
    shared/         # Types, zod schemas, business rules (used by web + mobile)
  supabase/
    migrations/     # Postgres schema, RLS, functions
    seed.sql        # Categories, pickup locations
  design/           # pen.dev design files
```

## Prerequisites

- Node.js >= 20
- Supabase CLI (`npm i -g supabase` or `npx supabase`)
- A Supabase project (cloud) or local Supabase stack (Docker)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment — copy `apps/web/.env.example` to `apps/web/.env.local` and fill in your Supabase project values (Project Settings → API).

3. Apply database migrations:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   Or, for local development: `npx supabase start` then `npx supabase db reset`.

4. Run the web app:

   ```bash
   npm run dev
   ```

## Local development with the Supabase CLI

The whole stack (Postgres, Auth, Storage, REST, Studio) runs locally in Docker:

```bash
npx supabase start     # first run pulls images; applies migrations + seed
npx supabase status    # prints API URL and keys
npm run dev            # http://localhost:3000
```

Copy the printed `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` into
`apps/web/.env.local` (see `apps/web/.env.example`), then restart the dev server.

Useful bits:

- Studio: <http://localhost:54323> · Mailpit (all outbound email): <http://localhost:54324>
- Auth is email + password, restricted to `@bennett.edu.in` (Supabase policy:
  8+ chars, letters + digits). Emails are only used for notifications — there is
  no magic-link step and no password-reset flow yet (an admin handles recovery).
- Admin bootstrap: set `ADMIN_EMAIL` in `apps/web/.env.local`; that account is
  auto-promoted (admin + verified) on its first sign-in. Manual fallback:
  ```sql
  update public.profiles set is_admin = true, verification_status = 'verified' where email = 'you@bennett.edu.in';
  ```
- `npx supabase db reset` re-applies every migration and the seed
- `npx supabase stop` / `npx supabase stop --no-backup` to pause or wipe

### Deploying to Vercel

This is an npm-workspaces monorepo — the Next.js app lives in `apps/web`, so
Vercel needs one project setting to find it (Framework Preset must be
Next.js, never "Other"):

1. Project → **Settings → General → Root Directory**: `apps/web`, and turn ON
   **"Include source files outside of the Root Directory in the Build Step"**
   (required so the `@borrowbuddy/shared` workspace package is available).
   Framework Preset then auto-detects **Next.js** — leave the Build Command
   and Output Directory at their defaults (`.next` is managed by the preset).
2. **Environment variables** (Production + Preview) — same names as
   `apps/web/.env.example`: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_APP_URL` (your Vercel URL), `ADMIN_EMAIL`.
3. Use a **hosted Supabase project** — the local stack (127.0.0.1) isn't
   reachable from Vercel. Apply the schema with
   `npx supabase link --project-ref <ref>` then `npx supabase db push`
   (tables, RLS, RPCs and storage buckets all ship in `supabase/migrations`).
4. In the hosted Supabase dashboard → **Auth → Sign In / Up**: disable email
   confirmations (password sign-ins are instant) and set the password policy
   to minimum length 8 with "letters and digits", matching
   `supabase/config.toml`.
5. Redeploy, then sign up once with the `ADMIN_EMAIL` address — the bootstrap
   promotes it to admin + verified automatically, ready for the review queue.

### What the app does today (Phase 1 + 2 + 3)

- Email + password auth (Bennett domain only), onboarding, student-ID upload, admin verification queue
- Listings with photo uploads, search + category/condition/spot/date filters
- Availability calendar with range picking; requests with a 48-hour expiry
- Owner approval (double-booking impossible at the database level)
- QR/6-digit handover for pickup and return, single-use codes with attempt limits
- Private loan chat + community channels with realtime messages
- Ratings and reviews feeding trust scores; public student profiles
- Incident reports with photos, admin resolution, and fines (settle/waive)
- Waitlist with automatic "dates opened up" notifications
- Campus pickup map with live availability counts
- Notifications, overdue detection and fines (daily cron), audit log

Phase 3 polish:

- **Installable PWA** — manifest, generated icons, maskable icon, offline page and a
  service worker (network-first navigations with an offline shell, cache-first static
  assets; Supabase requests are never cached)
- **Day / night desert theme** — semantic color tokens flip the whole app; the choice is
  remembered in `localStorage` and applied before first paint (no flash)
- **Scroll-driven parallax** — native CSS `animation-timeline` on the landing hero layers
  and reveal-on-scroll sections; degrades to static for unsupported browsers and
  `prefers-reduced-motion`
- **Performance** — route-level loading skeletons, `optimizePackageImports`, immutable
  caching for icons, `robots.txt` keeping the campus app out of search

### ReactBits motion pass (taste-skill audited)

Public surfaces carry the motion; the app stays calm and legible.

- Vendored from the official registry (`reactbits.dev/r/<Name>-TS-TW`) into
  `apps/web/src/components/reactbits/`, re-skinned to our tokens. Added `"use client"`
  and SSR-safety patches (GlassSurface) so they hydrate cleanly.
- Landing: `VariableProximity` deforms the Fraunces headline toward the cursor,
  `BlurText` subhead, `ScrollVelocity` ticker, `MagicBento` for the three steps,
  `ChromaGrid` for the eight categories, `CountUp` + `SpotlightCard` for the trust
  panel, `RotatingText` + `StarBorder` + `FadeContent` for the closing call to action,
  `ClickSpark` for tactile clicks, `Magnet` on the primary CTA.
- Login: `SplitText` headline inside a `GlassSurface` panel.
- Offline: `LatticeLoader` inside `FadeContent`.
- App: `TearTicket` for the six-digit handover code, `StatusMark` for the loan
  timeline, `LatticeLoader` for route loading.
- Audited against the `design-taste-frontend` skill (zero em/en dashes, no 1/8 or
  step-number labels, hero stack trimmed to four elements, one CTA label everywhere,
  stacked section headers, restrained eyebrows).

Theme arc on the landing is deliberate: dusk hero, daylit body, dusk band, night
closing, so the page reads as one day passing rather than random section inversions.

Next: the Android app (Expo) on the same Supabase backend.

## Validating the database

`supabase/tests/smoke_test.sql` runs the entire core loop — signup, verification,
listing, requests, approval, double-booking rejection, QR handover, return,
waitlist, reviews, trust score, overdue fines and RLS — and rolls back.

Against a plain Postgres container (no Supabase stack needed):

```powershell
docker run -d --name bb-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 `
  -v "${PWD}:/repo" postgres:17-alpine

docker cp supabase/tests/stub_supabase.sql bb-pg:/tmp/stub.sql
docker exec bb-pg psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/stub.sql
docker exec bb-pg psql -U postgres -v ON_ERROR_STOP=1 `
  -f /repo/supabase/migrations/20260923000001_extensions.sql `
  -f /repo/supabase/migrations/20260923000002_enums.sql `
  -f /repo/supabase/migrations/20260923000003_tables.sql `
  -f /repo/supabase/migrations/20260923000004_indexes.sql `
  -f /repo/supabase/migrations/20260923000005_functions.sql `
  -f /repo/supabase/migrations/20260923000006_rpc.sql `
  -f /repo/supabase/migrations/20260923000007_rls.sql `
  -f /repo/supabase/migrations/20260923000008_storage.sql `
  -f /repo/supabase/migrations/20260923000009_cron_realtime.sql `
  -f /repo/supabase/seed.sql

docker exec bb-pg psql -U postgres -v ON_ERROR_STOP=1 -f /repo/supabase/tests/smoke_test.sql
```

`stub_supabase.sql` provides the `auth`/`storage` schemas and roles that the real
Supabase platform supplies. CI runs the same steps on every push.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the web app (apps/web) |
| `npm run build` | Production build of the web app |
| `npm run lint` | Lint all workspaces |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run db:start` / `db:stop` | Start/stop local Supabase |
| `npm run db:reset` | Re-apply migrations + seed locally |
| `npm run db:push` | Push migrations to linked Supabase project |

## Design language — "Borrow from a Dream"

A Dalí/Magritte dreamscape applied on top of a strict lending system. Tokens live in
`apps/web/src/app/globals.css`; surreal primitives live in `apps/web/src/components/surreal/`.

| Token | Value | Use |
|---|---|---|
| `bone` | `#f6efe3` | App surface |
| `twilight` | `#0e1b33` | Full-bleed dreamscape sections |
| `umber` | `#2a1e14` | Text (never pure black) |
| `sand` | `#e7d3b3` | Cards, dunes |
| `terracotta` | `#d96c4f` | Warm secondary |
| `ochre` | `#e3a34b` | Suns, highlights |
| `rose` | `#d9a0a0` | Soft accents |
| `ultramarine` | `#2b4ee6` | Primary actions |
| `vermilion` | `#ff4d2e` | Alerts, overdue |

- **Type**: Fraunces (display, variable SOFT/WONK axes) + Geist (UI) + Geist Mono (data)
- **Motifs**: floating items with long shadows, melting clocks (due dates), arched portals
  (categories), echo typography (misregistration), drifting clouds, paper grain
- **Motion**: levitation, drift, twinkle — all disabled under `prefers-reduced-motion`
- **Scope**: full surreal on public surfaces (landing, login); calm bone/umber/ultramarine
  system with surreal accents on functional screens (forms, calendars, QR handover, admin)

## Build phases

- **Phase 0** — Foundation: monorepo, Supabase schema/RLS, designs
- **Phase 1** — MVP core loop: auth + verification, listings, search, requests, loans, QR handover/return
- **Phase 2** — Trust & communication: chat, waitlist, ratings, incidents, fines/overdue, pickup map
- **Phase 3** — Moderation & polish: admin dashboard, disputes, PWA, dark mode
- **Phase 4** — Android app (Expo) on the same Supabase backend
