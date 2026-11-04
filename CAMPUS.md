# Campus Commons website delivery

Website-first implementation, 27 October 2026. Native Android support is now
implemented, with current acceptance scopes recorded below. Borrow Circles,
Authorized Buddy Pickup and Campus Impact Dashboard remain
deferred in [ROADMAP.md](ROADMAP.md).

## Entry points

| Route | Purpose |
| --- | --- |
| `/campus` | Campus navigation hub |
| `/campus/lost-found` | Searchable found-item board and private ownership claims |
| `/campus/giveaways` | Free items/bundles and first-request reservations |
| `/campus/{section}/new` | Verified-member photo publication |
| `/campus/{section}/{id}` | Keyboard-operable gallery and role-aware actions |
| `/campus/activity` | Own posts, private claims, unread collection conversations and receipts |
| `/campus/collections/{id}` | Participant-only text chat, scheduling and collection confirmation |
| `/campus/handovers` | Appointments and weekly/date-specific availability |
| `/campus/admin` | Private claim evidence review and uncompleted approval revocation |
| `/offline` / `/offline.html` | Custom, self-contained connection screen |

The existing admin desk links to the campus review queue. Existing loan detail
pages add optional pickup/return appointments after their original handover UI.
The Campus Cargo palette, original fonts, Buddy Brackets mark and student/admin
profile ID cards remain in place. Mobile detail actions remain reachable; forms
retain inputs after recoverable upload/network failures.

## Workflows and privacy

Finders supply photos, approximate location, found date and private identifying
notes. Claims contain private identifying evidence. Only the claimant and admins
can read claim evidence; only the finder and admins can read finder notes. Finders
cannot self-claim, approve claims or see another member's evidence. Admins cannot
review their own claim. One approval creates one collection, closes other pending
claims and opens a new participant-only conversation. Revocation or moderation
requires a reason and is audited.

Giveaways reserve atomically for 24, 48 or 72 hours (default 48). The detail page
previews the deadline and the successful reservation returns its authoritative
deadline. Chat and appointments never extend a hold. Expiry/cancellation releases
the listing, appointment occupancy and code. A subsequent reservation creates a
new thread; the former recipient cannot generate or use its codes.

Recipients generate six-digit codes, valid for fifteen minutes within a giveaway
deadline. Only the current host can confirm collection, and the recipient must
still be verified. Five incorrect attempts persist across requests; regeneration
replaces the secret and resets attempts. Successful confirmation produces a
receipt and closes chat for writing. Hidden posts do not erase participants'
closed conversation history.

Appointments use Asia/Kolkata, a 30-day horizon and 15/30/60-minute lengths
(default 30). Date replacements/blocked days override weekly hours. Each booking
occupies both calendars, regardless of which member is hosting another exchange.
Conflicting reschedules roll back without losing the original appointment.
Availability edits preserve existing appointments. Loan codes remain usable
without scheduling, and overdue returns can be scheduled without changing fines.

## Data and transactional API

`campus_posts` is a dedicated campus base model discriminated as found/giveaway;
it never changes the meaning of lending inventory. Private `campus_post_notes`
and `campus_claims` are separate from feed data. `campus_transfers` records each
approved claim or giveaway reservation, its authorized participants and the
associated collection thread/read cursors. `campus_messages`, `campus_schedules`
and `campus_appointments` remain separate from legacy chat/loan models.

Authenticated Server Actions call `campus_api` for transactional writes.
`campus_slots` reads valid availability; `campus_thread_heads` reads incoming
message timestamps without fetching all message bodies for activity cards.
Shared types and publication validation live in `packages/shared/src/campus.ts`.

All new public tables enable RLS. Anonymous access and direct authenticated
mutations (including TRUNCATE) are revoked. Guarded operations check membership,
ownership, roles, deadlines and legal transitions inside the database. Partial
unique indexes enforce one winning claim/active reservation. Participant advisory
locks plus a private GiST exclusion constraint prevent overlapping occupancy.
Retryable reservation, approval, booking and message operations retain their
identity. Code confirmation is single use and competing confirmations cannot
both complete.

The private `campus-photos` bucket allows owned uploads and authorized signed
reads. Website uploads re-encode images as WebP to remove embedded metadata;
publication waits until uploads finish. Code hashes/attempts/expiry and calendar
occupancy live in the inaccessible `borrowbuddy_private` schema. Feed responses,
notifications, public caches and realtime records contain no collection secrets
or claim evidence.

New `campus_update`/`campus_message` notifications use `campus_transfer_id`,
`campus_claim_id` and `campus_post_id` destinations. Existing loan/conversation
identifiers and older Android response fields are preserved. Found/giveaway
collections do not contribute to borrowing fines, deposits or reputation.

The active `borrowbuddy-campus-expiry` cron job runs every minute. Reservation,
booking and collection operations also enforce expiry authoritatively, so cleanup
timing cannot extend a hold.

## Realtime and offline behavior

Collection chat authenticates its subscription with the browser's cookie session
before joining private-table change filters. Every effect owns a unique channel
and cleans it up. A database-listener readiness event triggers catch-up; socket
join alone is not treated as proof that changes are streaming. Focus/reconnect
and a visible-page sweep recover missed events without storing drafts or private
history in public caches. The browser acceptance test blocks HTTP message-history
refreshes on the recipient of a message to verify actual realtime delivery.

`public/offline.html` contains the complete connection-screen design, inline cargo
SVG, CSS animation and retry logic. Its three original fonts are precached with
the document by service worker v3. It needs no React route chunk, API request or
external image to render offline. Animation supports pause/play and reduced
motion. Retry checks server reachability and restores the original local route;
normal authentication guards still apply after reconnection. The worker retires
older BorrowBuddy caches and never caches private HTML or Supabase traffic.

## Verification and repeat runs

The final production run passes **17 campus acceptance groups**, including all
normal browser workflows and 320/411/768/800/1440 layouts. Lint (zero warnings),
type checking and the production build pass. The offline document/worker tests
and actual production disconnect/reconnect checks pass. A focused populated
handover check at 200% text zoom and a settled receipt capture also pass.

Final cleanup leaves three existing profiles, 21 original inventory items,
twelve pickup locations, all twenty demo listings and 39 stored demo images.
There are no QA users or remaining campus fixture rows/photos/secrets/occupancy.
The every-minute expiry job is active and its latest run succeeded.

Acceptance artifacts are in `apps/web/verification/`:

- `campus-result.json`: hosted normal-credential backend and browser acceptance.
- `campus-realtime-browser-trace.json`: subscription metadata only, without JWTs.
- `offline-result.json`: real worker/document/fonts, screen sizes, 200% zoom,
  animation controls, reduced motion and retry/reconnect.
- `offline-production-result.json`: actual Next production disconnect/reconnect,
  cached fonts, original URL restoration and authentication guard.
- `campus-security-advisors-final.json`: hosted security advisor output. The two
  campus warnings concern intentionally authenticated SECURITY DEFINER APIs;
  their explicit role guards and anonymous denial are exercised. Existing
  unrelated advisor warnings were not silently reclassified or removed.
  The [authenticated definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
  describes this deliberate API boundary.

`supabase/tests/campus_contract.sql` checks table/RPC grants, RLS, private storage,
overlap exclusion, realtime publication and minute cleanup. CI includes this
contract. All seven existing transactional SQL suites were also run against the
hosted development database with rollback (smoke lending, availability, attempts,
private secrets, internal helpers, read cursors and public reputation).

Run `npm run lint`, `npm run typecheck` and `npm run build`. To run hosted campus
tests, supply `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`BORROWBUDDY_ALLOW_TEST_FIXTURES=1`, `BORROWBUDDY_QA_WEB_URL`,
`NODE_MODULES_PATH` (containing Playwright) and `CHROMIUM_EXECUTABLE`, then run
`node apps/web/tools/test-campus.mjs`. The service key is used only by the local
fixture harness and must never be a public application environment variable.

The harness uses isolated generated identities, normal credentials for workflows,
exact-ID cleanup and before/after comparisons of existing profiles, inventory,
images and pickup locations. Photos, posts, related notifications (including admin
notifications), messages, appointments and fixture users are removed afterward.
The persistent demo lender/listings/images are outside this cleanup scope.

Website code is implemented in this workspace and additive migrations are applied
to the hosted development project. Publishing the website is a separate deployment
step. The Android parity, emulator stability, release profiling and production
signing gates remain open in [PARITY.md](apps/android/PARITY.md).

## Native Android implementation

The Compose client now uses the same `campus_api`, `campus_slots` and
`campus_thread_heads` contracts and RLS-protected tables. Campus navigation includes
the two boards, private activity, availability/appointments and admin claim review.
Loan screens retain their original handover controls and add optional scheduling.
Loan appointment notifications still open the loan; collection notices use their
separate campus transfer identifiers.

Native photos use the Android photo picker, bounded sequential image decoding,
WebP re-encoding to remove metadata and five-minute signed URLs. Campus photos
disable image memory/disk caches. Forms and schedule exceptions retain drafts
through recreation. Collection conversations have separate authenticated realtime
subscriptions, keyset history, unread tracking and idempotent send identifiers.
Metadata catch-up preserves edits made while requests were in flight. Terminal
transfer states cannot be reverted by an older HTTP response.

Collection codes stay in the entry-scoped ViewModel through rotation. Plaintext
codes are not written to saved-state storage; generate a fresh code after process
death. The server remains authoritative for expiry, five-attempt lockout,
regeneration, recipient authorization and single-use confirmation.

The custom offline screen is native Canvas/vector drawing using the original
cargo artwork, fonts and Buddy Brackets logo. Pause and Android reduced-motion
settings stop its animation. A connectivity modal retains the real route and
unsent draft, checks HTTPS reachability before resuming and supports campus-home
navigation.

Build both native APKs before running `node apps/android/tools/test-campus-native.mjs`.
The harness requires the development fixture opt-in and Supabase variables above,
plus `ANDROID_SERIAL` for a dedicated emulator and `BORROWBUDDY_QA_ADB`. It creates
isolated finder/donor, recipient and admin accounts, drives native controls with
normal credentials, tests real disconnection and the system photo picker, then
cleans exact fixture IDs and compares existing accounts/inventory/images/locations.
Reports and captures are saved under `apps/android/verification/`. A failed or
interrupted run remains a failure; focused passes do not establish complete native
parity acceptance.

### Accepted native checks — 28 October 2026

The combined campus run `06419c73-0bcf-4745-830d-1336912a03d2` passes all three
native workflows: finder/private claim/admin review/two-party collection; giveaway
reservation/realtime chat/booking/cancellation/collection; and real system-picker
photo publication/editing with draft restoration. Cleanup verifies that existing
accounts, inventory, images and locations match their pre-test baselines.

The giveaway flow disables both emulator Wi-Fi and mobile data, recreates the
activity, restores connectivity and resumes the same conversation with its unsent
original-case draft intact. Connectivity callbacks are backed by a foreground-only
three-second capability check. HTTPS probes retry while network routing/DNS recover;
the modal offers Resume only after a successful probe. Separate component checks
cover animation pause through recreation, heading contrast, schedule drafts and
campus/legacy notification routing. The original pin-dialog regression also passes.

The existing-feature suite passes 23 native scenarios and 23 authenticated checks
in one uninterrupted run, without skips. It includes lending codes/lockout, private
and community chat, onboarding, moderation, inbox, fines, profiles, admin layouts
and owner controls. Its original assertions are retained; the moderation test now
waits for the optional appointment panel before touching the report action, avoiding
a loading-induced layout shift. Both student/admin GPU-card roles pass separately.
The build passes 33 unit tests and lint with zero errors/23 advisories. The seven
existing rollback SQL suites and the campus grants/RLS/storage/locking/realtime/cron
contract pass against the hosted development project. No schema migration was
needed for the native implementation.

This evidence does not close full device/large-font/accessibility/visual acceptance,
interrupted-upload and campus process-death coverage, sustained release profiling,
or production signing. The dated Android checkpoint records artifact hashes and
the final optimized smoke/launch results. Rejected captures and failed diagnostics
remain preserved separately from accepted evidence.

The subsequent native visual/accessibility follow-up matches Campus control
colours to the website, adds keyboard focus and heading/pane/state/error semantics,
and makes confirmation content scroll at large text sizes. Its six-configuration
system-font/keyboard matrix, separate source offline browser checks and current
artifact/workflow results are in
`apps/android/verification/parity-a11y-checkpoint-20261028.json`. Manual screen-reader
journeys and the remaining full visual/device acceptance remain open.

### Android header/accessibility follow-up — 30 October 2026

The latest delivery record is
`apps/android/verification/header-a11y-checkpoint-20261030.json`. Source-order
header navigation retains all existing routes and gains separate 48 dp touch
regions, tab/button roles, visible keyboard focus and font-aware wrapping. Amber
badges use original black ink, preserve complete counts and keep the bell visible.
The offline pane name follows the restored connection state; its design and
route/draft behavior remain intact. A cancellable seven-second service check
replaces the blocking health probe, preventing a stalled check from holding the
single-flight flag indefinitely. The 38 unit tests include five probe cases.

The header's eight-configuration matrix and Campus/offline six-configuration matrix
pass all 48 scenarios, with real system text settings, Android keyboard events and
required image/metrics evidence. Five pin/card/component checks pass on an isolated
16 KB emulator after an unrelated instrumentation collision was diagnosed. The
checkpoint records fresh hosted Campus/header/release checks, cleanup and launch.
An asynchronous inline scheduling layout exposed a test scroll race; the helper
now waits for an actually visible control and retains real-click assertions.
Website/backend behavior, ID cards and logo are preserved. Complete visual/motion,
manual screen-reader, physical performance and production signing gates remain.
