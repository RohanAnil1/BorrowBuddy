# Endgame: complete native Android website parity

The goal remains open. Compilation is evidence of buildability, not evidence of
full workflow correctness or visual fidelity. No row below is complete until its
native behavior, website comparison and applicable backend scenarios are verified.

Borrow Circles, Authorized Buddy Pickup and Campus Impact Dashboard are queued
for implementation after this goal in [the deferred roadmap](../../ROADMAP.md).

| Website surface | Android implementation | Verification still required |
| --- | --- | --- |
| Landing hero, ticker, preloader, 3D device | Native Filament device; source opening caption/hold/fade and thermal tickers; boot, drag, inertia, idle motion and static fallback | Studio reflections/brushed maps, contact-shadow fidelity, sparkles, hero layout and full motion/visual comparison |
| Borrow queue and tag wall | Native Filament conveyor with source geometry, state textures, belt/scan/station motion, counters and saved clock; overlapping native eight-tag carousel with gestures, keyboard/arrows, auto-advance, seeded portraits/barcodes and motion policy | Conveyor volumetric/additive lighting, sparkles, camera sway, tablet/performance and full visual comparison; tag entrance/hover/tablet fidelity |
| Public campus board and trust section/footer | Native board, seeded fallback spots, safety content and section links | Route/pin animations, original composition, live website screenshots |
| Login and signup | Native credential forms, password visibility, domain/password checks, Supabase auth; hosted authentication/refresh and optimized process/session restoration pass | Broader auth expiry/error matrices, visual comparison and recovery beyond the verified private-chat process-death path |
| Onboarding and pending states | Source registration sections, saved profile draft, strict private ID upload, pending/rejected/suspended UI, resubmission; native rejection/resubmission/approval cycle tested | Interrupted upload/submission recovery, suspension, all device sizes and visual comparison |
| App shell and dashboard | Source header/branding/bell/avatar, route order and exact counts; 48 dp non-overlapping actual touch regions, tab/button roles, visible keyboard focus and large-text wrapping; complete high-contrast badges with visible bell and zero-count transitions; saved collapsible ticker and bounded navigation; dashboard greeting, snapping loan tickets with due tones/pulse, category icon grid, counted tabs with spring/exit/entry motion and transparent movement rows | More dashboard due-state/empty/tablet/large-font/pointer comparisons, full route/visual/motion acceptance, manual screen-reader journeys and source server/device timezone behavior |
| Catalog, filters and item detail | Source compact filters, saved draft/applied query, lazy responsive grid, full cover/condition/owner/deposit cards; Supabase availability exclusion before limit; gallery and thumbnail rail; native calendar-based waitlist join tested | Remaining query combinations, large fonts, small-height/keyboard/pointer states and full screen visual comparison |
| Calendar, requests and waitlist | Inclusive date picker without expanding long blackout ranges, verification feedback, animated bottom booking bar, requests, join/leave waitlist | Backend expiry, race tests and website comparisons |
| Listing creation/editing and owner controls | Photo upload/remove, validated form; source owner request cards with saved decline reason, cover/title listing rows, pause/activate/edit/delete, eight recent decisions and first-listing empty state; owner history access retained below source sections | Upload failure/lifecycle recovery, further foreign ownership/error states, large fonts/pointer and complete source visual acceptance |
| Borrow/lending logbooks | Source My borrows lazy rows, borrowing/lending sections, pending/recent requests, history, waitlist state explanations, empty browse and fine notice; native join/leave/cancel/rotation tested; parallel queries independently cap each loan role at 60; owner source request/listing/recent-decision sections ported | Further cross-user/error/lifecycle states, large fonts, tablet comparisons and full visual acceptance |
| Loan detail and custody chain | Source four facts with responsive columns, human loan labels/tones, role-aware logbook link, returned banner, channel card, reporter details, rating stars and custody steps; tested native handovers | Full state/phone/tablet comparisons, remaining handover/review/report form styling, large fonts, channel/cancel navigation and relative-time lifecycle behavior |
| Pickup/return handovers | Decodable QR tickets, six-digit entry, server expiry, saved code, persistent five-attempt lockout/regeneration and custody confirmation animation | Full visual comparison, cancellation, expiry/background and reconnect stress tests |
| Reviews and incidents | Ratings/comments, source type/evidence/description form, selected states, step motion, draft/photos restoration and filed confirmation; native incident/admin/fine flow tested | Full visual/motion comparison, other incident states, upload interruptions and trust refresh |
| Private/community chat | Source list/header/loan chip/bubble/composer typography, colors and geometry at 411/640/1024; uppercase presentation with original storage, native IME/Enter/Shift+Enter, batched unread, 137-message keyset history, saved anchors/drafts, filtered realtime/read tracking and bounded lifecycle teardown | Long-title/large-font/pointer and motion acceptance; failed-send/offline and broader process-death recovery beyond the verified optimized private-chat route/draft path, broader reconnect/background stress; actual browser empty-list comparison remains unavailable with existing community rooms |
| Public profile, account, fines and inbox | Source public identity/badges, responsive stats, relative dates, aggregate reputation/stars, twenty latest reviews, twelve newest available listings and empty states; original fonts/icons and student/admin lanyard cards retained; safe profile projection, RLS, listing navigation/Back and recreation checked; source account panels/responsive fields and notices; source ledger/empty state, balance and fine-to-loan timestamps; source 40-row inbox/cards/empty state, conditional mark-all, whole-card routes and lifecycle-aware unread blink | Larger fonts, pointer/keyboard/error states and remaining full visual/lifecycle acceptance; complete combined results are recorded in the dated checkpoint |
| In-app campus map | Native photographed map, decoded-size bounds, source route arc/label sides, pickup photos, zero/one item counts and catalog links; native workflow tested | Pin/route/card motion, framing, tablet composition and complete visual comparison |
| Admin moderation and pins | Source responsive verification/incident/fine/pin sections measured at 411/640/1024; private evidence, saved offscreen drafts, limits, invalid decisions, thirty-row incident window plus older access; tested approval/rejection/fine actions and tap/drag/numeric pin creation, edits, visibility and safe deletion; uninterrupted 23-scenario regression passes | Other moderation states, zoom/large evidence, expiry/error, motion and complete visual acceptance |
| Offline, security, lifecycle and performance | Encrypted session manager, debug-only local HTTP policy, native state/navigation; optimized actual process death restores session/private-chat route/unsent draft; source worker private-page cache isolation tested; real network loss/reconnect preserves the campus route and draft | Broader state restoration, permission denial, interrupted uploads and sustained release benchmarks; campus process-death recovery beyond rotation remains open |
| Campus Lost & Found, giveaways, collection chat and handover schedules | Native Compose feeds/filters/pagination, signed private galleries, system photo picker with metadata-stripping WebP uploads, private claims/admin review, 24/48/72-hour reservations/deadlines, collection chat/codes/receipts, weekly/date availability and shared loan/collection bookings; distinct campus notification IDs preserve loan appointment navigation; three combined hosted native workflows pass with fixture cleanup | Broader visual/accessibility, native edge-state and interrupted upload/process-death acceptance; the website/backend security/concurrency tests remain separate evidence |
| Custom offline connection screen | Native vector cargo animation reproduces the website artwork/brand/fonts, with pause/reduced motion, real HTTPS reachability and a modal preserving the route and unsent draft; actual Wi-Fi/mobile-data disconnect/reconnect and draft checks pass, including recreation | Broader process-death/large-font/device coverage and captive-portal/background stress; existing private-cache boundaries remain required |
| Deliverables | Gradle project, wrapper, debug APK, optimized unsigned APK/AAB, release signing configuration; debug-certificate optimized QA APK passes separate nondebuggable UI smoke test and 16 KB packaging checks | Production signing, broader optimized-release workflows/benchmarks and full acceptance report |

The user added a React Bits lanyard ID card to the requested profile scope on
20 October. Website account/public profiles and native student/admin profiles now
include personalized cards. This explicit addition is part of the parity target;
it does not change the remaining original workflows or deferred roadmap features.
`verification/member-card-implementation.md` records the design and native port.

## Latest header/accessibility delivery — 30 October 2026

`verification/header-a11y-checkpoint-20261030.json` is the latest delivery record.
The header's eight-configuration matrix passes all 24 scenarios at real system
font settings, with separate student/admin layouts, actual touch bounds, full
labels/counts, roles, selection and Android Tab/Enter activation. The six-case
Campus/offline matrix passes all 24 scenarios again. The offline pane now announces
the restored connection state. Pin/card/component checks pass unchanged on the
isolated emulator after a foreign instrumentation collision was diagnosed and
preserved. The source audit details precise scopes and retained failures.

The checkpoint records fresh hosted navigation/Campus/release results, artifact
hashes, settings restoration, fixture cleanup and launch. These checks preserve
the ID cards, logo and offline design and do not close the remaining full visual,
screen-reader, physical performance or production-signing gates. The broader
complete-app endgame and the deferred roadmap queue remain open.

## Earlier visual and accessibility follow-up — 28 October 2026

`verification/parity-a11y-checkpoint-20261028.json` records that earlier delivery.
This follow-up corrects Campus primary contrast (3.07:1 to 6.85:1), source control
colours, keyboard focus, heading/pane/state/error semantics and confirmation
reflow. Six configurations use actual system font settings and Android Tab/Enter
input. The body/schedule/confirmation/offline matrix and separate source offline
browser captures have explicit scopes in `verification/parity-a11y-source-audit-20261028.md`.
The checkpoint identifies accepted reports and the exact installed APK.

The earlier full original-feature regression and transactional SQL suites below
remain prior evidence. This follow-up repeats the relevant hosted Campus,
component/card and optimized-release checks. Full screen/state/motion comparison,
manual TalkBack/Switch Access, interrupted upload/process recovery, sustained
memory/device profiling and production signing remain open. A preserved Android
low-memory instrumentation interruption is included in those remaining gates.
Deferred roadmap features remain deferred.

## Earlier campus and reconnect checkpoint — 28 October 2026

The native Campus implementation and custom offline screen now pass the three
combined hosted campus workflows, including real network loss/recreation/reconnect
and draft recovery. Private claim evidence, realtime collection conversations,
booking/cancellation, codes/receipts and native picker publication/editing are
exercised with normal actor credentials. Existing accounts/inventory/images and
locations match the fixture harness's original baseline after cleanup.

The complete original-feature suite passes 23 native scenarios and 23 authenticated
checks in one uninterrupted run, without skips. Four component/pin tests, both
GPU-card roles, 33 unit tests and lint (zero errors/23 advisories) also pass. The
optimized app loads all three new Campus areas and passes actual process death,
session/route/draft recovery, deliberate exactly-once chat, public profile, moving
card and sign-out. Direct hosted HTTPS works without a proxy. Earlier website
comparison evidence is preserved; browser source captures were not repeated in
this original-feature native run.

`verification/campus-checkpoint-20261028.json` records six artifact hashes, accepted
reports, ZIP/ELF alignment for sixteen native libraries, all 72 unchanged assets,
seven rollback SQL suites, the campus contract and exact installed APK verification.
The optimized QA APK is running on the API 36.1 / 16 KB emulator. No physical phone
is connected; production signing is still absent. Final database/media audits
are clean, and all 20 demo listings/39 photos remain. The local website server is
restored at port 3018.

The complete-app goal remains open for the matrix's visual/accessibility/state and
motion work, interrupted uploads, broader campus process-death/device stress,
physical release profiling, production security-advisor review and signing.
Deferred roadmap features remain deferred.

## Earlier pin and recovery checkpoint — 23 October 2026

`verification/pin-recovery-checkpoint-20261023.json` records the exact reports,
artifacts and outstanding gates. Pin synchronization uses a focused native-window
barrier while retaining normal Compose idling, original timeouts and real touches.
The local eleven-cycle test and hosted pin workflow pass. Catalog resize checks
now commit an external display change before reading semantics. Completed
moderation fixtures are removed before later queues; the original admin totals
and all three layout sizes pass.

The combined regression is **failed**, with two infrastructure interruptions
preserved separately: 22 native passes before an Android system abort in the last
owner/tablet scenario, and fourteen passes before the emulator-37 process exited
during screenshot export. The latter console reported bad color-buffer handles;
its root cause is not established. A separate recovered owner focus passes two
native/ten authenticated checks. These results do not establish an uninterrupted
full pass or sustained stability.

Fresh student/admin native GPU and website WebGL card checks pass with the
approved Buddy Brackets artwork. The optimized APK passes actual process death,
changed PID, restored session/private-chat route/unsent draft, no automatic draft
send, exactly-once deliberate message storage, moving card and sign-out. Final
checks retain 28 unit passes and zero lint errors/23 advisories; production APK
and AAB hashes are unchanged. Source worker private-cache isolation and storage
failure handling pass separately with synthetic content. Final data/media audits
are clean and the persistent demo catalogue is intact. The temporary emulator
proxy is cleared and its tunnel stopped. Full visual/motion, offline/lifecycle,
performance, direct network and production-signing acceptance remain open.

## Earlier branding and admin checkpoint — 21 October 2026

The user approved **B — Buddy Brackets** and its full logo kit. Website/native
header symbols, student/admin card faces and straps, PWA/favicons and Android
adaptive/themed icons use the approved geometry and existing palette. This is
an explicitly authorized branding update; original layouts, workflows and ID
card interactions remain in scope. The kit and application checks are separate.

`verification/brand-checkpoint.json` records exact artifacts and results. The
admin geometry and workflow focuses and chat focus passed independently. The
new combined run has not passed: notification realtime delivery timed out on
the first attempt, and retry reached a pin-dialog Compose idle timeout after
session, catalog and shell passed. Repeated reduced-motion card timeouts exposed
a frame-clock cap stretching simulation time below 30 FPS; bounded catch-up
retains the solver's small steps, forces and damping. Final native results and
the 10/60 FPS regression are in the checkpoint. These failures remain preserved;
timing reliability, direct campus networking and final whole-app acceptance
remain open. Hosted Android QA used a temporary origin-restricted encrypted
CONNECT tunnel, documented in `verification/admin-source-audit.md`.

## Earlier chat checkpoint — 21 October 2026

- The source chat list/private/community/empty-thread layouts were measured in
  twelve normal hosted browser samples at 411/640/1024 and ported with original
  fonts/icons/colors. Native layout checks verify line boxes, bubble fonts/colors,
  loan/profile callbacks, IME insets, 2000-character editing and empty states.
  Existing community rooms are preserved; native empty-list component checks are
  separate from a live empty browser-list comparison.
- Source uppercase/normal-whitespace display is applied to message bubbles and
  previews while original stored case/newlines remain intact. Three send actions
  (IME, button, Enter with Shift+Enter newline editing), 137-message history,
  rotation/draft/scroll anchors, read isolation and socket reconnection pass.
- The accepted fresh combined run passes **19 native scenarios and 33
  authenticated workflow checks**, zero skips and targeted cleanup. Exact
  artifacts, hashes and reports are in `verification/chat-checkpoint.json`;
  `verification/chat-accepted-full-20261021.txt` is the accepted full report.
- An initial owner tablet check timed out after live `wm` resize inside the
  instrumented activity. The corrected harness starts the tablet check in a
  fresh process and retains its decoded 80 dp cover, 57 dp cover left and 157 dp
  title left assertions. The phone workflow still checks draft recreation,
  approve/decline, edit/status/delete safeguards, loan access and empty creation.
  An initial optimized input test selected the label instead of its editable
  parent; the corrected selector verifies text and enabled Send. Failed reports
  remain preserved. These corrections do not change the production APK.
- All 25 unit tests pass; lint has zero errors/23 advisories. Both roles pass the
  GPU ID-card drag/flip/background/detach/reduced-motion test. The nondebuggable
  optimized app passes real sign-in, chat send/original-case storage exactly once,
  public profile, moving GPU card and sign-out. Its QA debug certificate is not a
  production signing key. Debug/optimized APKs and unsigned release APK/AAB build;
  APK ZIP/ELF alignment passes for sixteen libraries; all 72 debug assets remain
  byte-identical in optimized output (two additional baseline-profile assets).
- Final read-only audit: 3 profiles, 21 items, 12 pickup locations, 20 migrations,
  QA user/item/pin/channel counts zero, and the persistent demo lender's 20 listings
  and 39 hosted photos retained. QA MediaStore images are absent; emulator size,
  density and animator scale are restored. Exact optimized APK installs/launches
  on the API 36.1 16 KB emulator. No physical phone was connected this turn.
- The complete-app endgame remains open. Remaining source state/motion fidelity,
  long-title/large-font/pointer/error cases, offline/interrupted upload/process
  recovery, broader realtime stress, 3D lighting and physical release performance
  need acceptance, alongside production signing. See the matrix and
  `verification/chat-source-audit.md` for the current limits.

## Earlier public-profile evidence collected on 21 October 2026

- The public profile now follows the original identity/badges, typography, rounded trust, aggregate reputation/stars, twenty-review sample, twelve newest available listings, empty states and footer. Original student/admin ID cards remain in account/public profiles. Browser and native comparisons cover 411/640/1024 widths, including the middle flex-wrap boundary; native integer-pixel rounding is recorded explicitly. Safe projection, RLS, null comments, both review roles, listing navigation, Back and recreation are checked.
- A successful SELECT with no body now has one bounded recovery attempt for dashboard categories and independently capped borrower/lender reads. Valid empty arrays are accepted immediately; permission/malformed errors and cancellation propagate; writes/RPCs are never replayed. Five real-SDK MockEngine tests cover the contract. The earlier upstream empty-body cause remains unproven.
- All 25 unit tests pass; lint has zero errors and 23 advisories. Debug APK, optimized unsigned release APK and unsigned AAB build successfully. Both APK variants pass ZIP/ELF 16 KB alignment checks for sixteen native libraries. All 72 original assets are byte-identical in release; its two extra assets are generated baseline profiles.
- The final fresh combined suite passes **15 native scenarios and 30 authenticated workflow checks**, with no skipped tests and strict targeted cleanup. The accepted report is `verification/public-profile-accepted-full-20261021.txt`; exact artifacts and scopes are in `verification/public-profile-checkpoint.json`. The ledger regression now scrolls past the ID card and asserts the source trust layout. The catalog screenshot helper waits for visible lazy-loaded images; the filtered fixture keeps its decoded-size assertion. These are test corrections, with no source UI removed or altered.
- The dedicated GPU ID-card test passes for both roles, including actual artwork, drag/flip, background/detach pause and reduced motion. A separate self-instrumenting module drives the nondebuggable R8 app through real login, catalog/public-profile navigation, two consecutive changing card frames, Back and sign-out. That optimized APK uses the local debug certificate for QA, not a production key.
- At the user's request, that exact optimized APK was installed and launched on the connected Samsung SM-N986U1 Android 13/arm64 phone; its installed SHA256 matches the tested artifact. This is launch evidence, not full physical workflow or performance acceptance.
- The user also requested persistent demo content and chose a dedicated non-admin lender. **20 listings with 39 hosted images** now use existing categories/pickup points. Normal website credentials verify every detail page, all images and catalog cards at 411/1024 widths. Data is explicitly marked demo and is separate from QA cleanup; `supabase/demo-catalog/` records its IDs, provenance, scripts and results.
- The final read-only audit reports three profiles, twenty-one items, twelve pickup locations and twenty migrations: the original two profiles/one item plus the authorized demo lender/twenty listings. All QA user/item/pin/channel counts are zero; all 39 demo objects remain. QA MediaStore images are gone, and the emulator display/animator setting are restored. Earlier emulator, ADB, source-login, outdated ledger and lazy-image aborted runs remain preserved.
- Remaining global visual/motion, chat edge states, offline/interruption/permission, broader optimized-release workflow and physical benchmark gates remain open, as does production signing. `verification/chat-source-audit.md` records measured source chat layout work and its remaining acceptance limits. The complete-app endgame is not marked achieved.

## Evidence collected on 14 October 2026

- `:app:assembleDebug` generated an APK.
- Three domain unit tests passed: inclusive dates/overlap, credentials, transitions/fine cap.
- The APK installed and launched on API 35 / x86_64 / 16 KB-page emulator `emulator-5560`.
- Startup reported no `AndroidRuntime` crash. Debug cold startup on this emulator was 3827 ms; release performance is not measured yet.
- A subsequent cold debug launch took 2292 ms. Login and landing screenshots are saved in `verification/`; these are runtime evidence, not visual-parity approval.
- Android lint passed with zero errors after Android 12 upload compatibility and configuration fixes; eight advisory warnings remain.
- A connected UI test passed on API 35: landing CTA opens native sign-in, then signup with repeated-password input.
- Web/shared TypeScript typechecking passed after the availability client change.
- Existing web lint passed after the availability client change.
- The initial configuration pointed to an unavailable local stack. Following the user's clarification, the hosted BorrowBuddy project was discovered through the authenticated Supabase CLI; it reports ACTIVE_HEALTHY.
- Android's ignored local properties now target the hosted HTTPS project using its public client key. Hosted auth health and public pickup-location requests both returned HTTP 200. No database data was changed by these checks. End-to-end workflow tests remain unverified.
- Initial read-only checks found the availability RPCs missing. After the user confirmed this is a development/test database and authorized isolated fixtures, migration 15 passed a rollback-only regression and was applied successfully through the Supabase CLI. The linked database now records 15 migrations.
- The availability regression passed again after rollout: an unrelated verified student sees loan/block date windows while private loan rows remain unreadable; inclusive boundaries, free gaps, invalid ranges, pending users and anonymous access were checked.
- The existing core lending smoke test passed against the hosted development database using randomized fixture IDs inside a rolled-back transaction. It covers profile creation, verification, requests, approval, double-booking, pickup/return, waitlist notifications, reviews/trust, overdue fines, RLS and admin pins. This is backend SQL evidence; authenticated Android UI workflow testing remains required.
- The debug APK was rebuilt successfully with the hosted public client configuration. Server-role credentials were used only in memory for read-only schema checks and were not written to Android configuration or artifacts.
- No production keystore is present. Production signing is configured but unverified.
- Native rendering now uses transparent GLES with a 1.75 DPR render-target cap matching the website. Runtime inspection found and fixed glTF texture orientation, the desired-size viewport callback mismatch, and TextureView detachment during fallback removal.
- Native boot/drag/inertia and reduced-motion tests passed. Two connected API 35 tests passed: native login/signup navigation, and device frames reaching the settled pose followed by renderer removal from the view hierarchy on navigation.
- The latest build, five unit tests, connected tests and Android lint passed. A native device screenshot is saved in `verification/device-native-api35.png`; lighting is visibly unfinished, so this is not visual-parity approval.
- A hardware-backed API 35 emulator cold debug launch took 1630 ms. A prior runtime snapshot showed approximately 182 MB total PSS / 283 MB RSS; complete release and leak benchmarks remain outstanding.
- Software-renderer attempts encountered host/emulator memory pressure, including a LOW_MEMORY app exit. Retesting used the existing laptop GPU and reduced render-target sizes. Low-memory physical-device behavior remains an acceptance test.
- Migration 16 was validated inside a rolled-back transaction, then applied to the hosted development project. Its regression passed after deployment: pickup/return counters, five-attempt lockout, regeneration, expiry, single use, party authorization and legacy-helper access denial.
- Both clients now consume `confirm_handover_v2` and show unsuccessful result errors without reporting success or clearing the entered native code. Web/shared typechecking, web lint, Android build, unit tests and Android lint passed after this change.
- A real HTTPS API workflow passed using uniquely named confirmed QA accounts: password auth, onboarding/profile protection, private student-ID upload/access, rejection/resubmission/approval, listing/request/approval, availability privacy, private chat/read isolation, HTTP-persistent handover lockout/regeneration/pickup/return, waitlist notification, unique review/new-review notification, refresh and logout. All fixture accounts, files, lending data and actor audit rows were cleaned up by ID. This is authenticated API evidence, not full native UI acceptance.
- The initial hosted connected test passed native sign-in, activity recreation, encrypted-session restoration and sign-out. The expanded test validates live inbox/chat unread badges clearing within 12 seconds (below the 30-second polling fallback). It exposed a websocket cleanup exception on logout; both portal and chat now tolerate teardown after auth has already disconnected the socket.
- The expanded hosted connected test passed after that fix, with zero failures or skips. This diagnostic run used the dedicated API 35 emulator with JIT disabled: normal JIT runs crashed inside ART `Jit::MaybeDoOnStackReplacement` on the test runner's Compose wait loop, including after host memory was freed. Normal-runtime testing on another image/device remains required; the diagnostic pass is not production acceptance.
- Live portal refresh subscribes while STARTED, reconnects after failed subscriptions and falls back to 30-second active polling. Background refresh retains the displayed data and local form state. Inbox badges are capped at 9+ like the website; conversation summaries use three batched requests rather than per-thread member/message queries.
- Android unit tests and lint passed again after websocket teardown fixes. Normal emulator JIT was restored afterward. An immediate post-restart launch was killed with LOW_MEMORY; a later cold launch after boot activity settled took 1445 ms. This reinforces the pending low-memory/device acceptance gate.
- Final hosted fixture audit returned two original profiles, one original item, 16 applied migrations, zero QA users and zero QA items.
- Migration 17 supplies aggregate reputation counts/averages without private loan rows. Its rollback regression passed before and after rollout, including multiple returned loans/reviews, fractional averages, excluding active/cancelled loans, unrelated viewers, empty profiles, pending/missing profiles, unverified callers and anonymous denial. Both web and Android consume it; web/shared typechecking and web lint passed.
- Native item detail now has the website's thumbnail rail/active border and photo overlay, with swipe navigation retained. The calendar avoids allocating every day of long blocked ranges. Valid dates trigger the original 550 ms verification phase and a 220 ms animated bottom booking action. Account fines/map tiles and Browse route highlighting were restored.
- Two authenticated native tests passed on the dedicated API 36.1 / 16 KB emulator with normal JIT: session sign-in/recreation/encrypted restoration/realtime badges/sign-out; and catalog search/gallery selection/owner reputation/back navigation/calendar/bottom-bar request dispatch/persisted dates/logbook cancellation. The latest redacted direct runner report is `verification/hosted-native-workflow.txt` and reports `OK (2 tests)` with no skips.
- The initial API 36.1 AVD generated by local command-line tools 19 had `target=android-0`; SurfaceFlinger repeatedly aborted in `mapper.ranchu`. Correcting only the dedicated QA AVD metadata to the installed image's `android-36.1` stabilized it. Its normal-JIT runs then exposed old transitive Espresso 3.5.0 input injection; stable test-only Espresso 3.7.0/runner 1.7.0/rules 1.7.0/JUnit 1.3.0/monitor 1.8.0 are now explicit dependencies.
- A Gradle connected command on API 36.1 returned success despite an invalid runner user ID and zero tests. The hosted harness now installs both APKs and instruments Android user 0 explicitly; it rejects zero/failed/skipped runs. Realtime assertions wait for subscription readiness and hold the Compose clock below the polling interval, correcting the weaker earlier timeout-only evidence. The subscription's connection deadline now uses the IO dispatcher.
- The extended native item test also opened the owner's public profile and verified the real `1 COMPLETED LOANS` and `5.0/5 FROM 1 REVIEW` aggregates before returning to the item and completing request/cancellation. Both tests passed again with normal JIT; Android unit tests and lint passed afterward. The final hosted audit confirms 17 migrations, two original profiles, one original item and zero QA accounts/items.

## Evidence collected on 15 October 2026

- The previous flat marketing cards were replaced with the native eight-tag wall. All routes, contents, names, statuses, portrait seeds and barcode serials match the website. The controller preserves bounded arrow/key navigation, drag snapping, one-second automatic advance and six-second interaction pauses.
- Native portraits port the original Mulberry32/dot-bust painter; their shared cache is bounded at 4 MB. Paper falloff/grain, overlap, spring parameters, perspective, levitation, status blink, parallax and the cargo mark are native rendering code. Full mobile/tablet visual acceptance remains pending, including tag entrance and pointer-hover tilt.
- Website and native screenshots were compared. This found and corrected viewport sizing, amber title marker, secondary typography spacing, backdrop screen blending and bottom vignette. The references are `verification/tag-wall-website-mobile.png` and `verification/tag-wall-native-api36.png`; they are comparison evidence, not full parity approval.
- The opening caption now uses the source's 1.1-second hold, 0.5-second exit and blink sequence. Landing controls remain hidden from accessibility while opening, and the overlay consumes pointer input. Both thermal tickers port the eight blurbs, 42-second loop and the original Lucide plane path; their offscreen/background/reduced-motion/hover/hold policies are implemented. Full ticker timing/visual acceptance is still required.
- The motion policy observes Android animator settings dynamically. Tag motion uses actual viewport intersection rather than clipped bounds. Frame work stops offscreen/background, and infinite visual motion is marked as such for Compose's testing policy.
- Six unit tests passed, including selection pause, clamped drag snapping and wraparound. Android build and lint passed with zero errors and 16 advisory warnings.
- Four connected API 36.1 / 16 KB / normal-JIT tests passed after the final changes: native sign-in/signup navigation, actual device frames settling and renderer removal on navigation, tag arrow/swipe/keyboard navigation with reduced motion, and automatic advance pausing in background/offscreen. `verification/landing-motion-api36.txt` reports `OK (4 tests)`. Android animator scale was restored to 1.
- No hosted database data was changed by this landing work. The original conveyor is still represented by a static fallback in Android and remains required work; the overall goal remains active.
- Photo uploads now support ordered multiple selection with the Android photo picker. Selection is limited to remaining slots; the single-image contract is used for student IDs or the last slot. Uploads remain sequential with the existing MIME/size checks, keep successful files when another fails, and continue through the rest of the selection. Removal is disabled during uploads. Full picker/provider and interrupted-upload acceptance remains pending.
- Private student-ID and incident previews now open a full-screen, fit-to-screen view with a close control and Android back dismissal. URLs remain signed and private. Image state is keyed by both bucket and path. Admin workflow and large-image visual acceptance remain pending.
- The debug APK was rebuilt after the photo-picker/viewer changes, including the full Lucide license notice. Compilation and lint passed; installation and launch succeeded on emulator-5562 (API 36.1). The four landing tests above predate these upload/viewer changes; they do not validate native picker/admin workflows.

## Native conveyor implementation and evidence

- `tools/export-conveyor.mjs` evaluates the original website station/belt JSX geometry at build time and runs the installed source QR painter and original fonts in Chromium. Both 12-unit and 24-unit scenes use all 64 source-painted texture states. Each GLB embeds only 16 initial textures; the rest remain PNG assets for on-demand replacement. Node names are unique and all geometry accessors are nonempty. Android loads GLB assets and Kotlin code only.
- The static-only queue is now replaced by `CargoConveyorView` with a fallback retained for renderer failure. The native timeline preserves the 10.61-second cycle, cubic travel, four dwell boundaries, custody flips, three parcel records, phase signs, stamps, bob/sway, scan line and trust-chip motion. The website's 800 px spread breakpoint and 360/440 px stage dimensions are retained in dp.
- Three conveyor unit tests pass for dwell boundaries/stamps, cycle reset/crate rotation, wakes/custody flips/trust timing, frame-delta clamping, suspension and reduced-motion still state. The full current unit suite has nine tests and zero failures.
- Initial connected frame/cycle checks passed, but an early screenshot showed no geometry because texture loading was unfinished. Readiness now waits for at least five rendered frames, and the reduced-motion test inspects actual screenshot pixels for the dark shipping hall and source paper/signs. Frame counters alone are not treated as visual proof.
- Screenshot inspection also caught opaque glow rectangles. The GLB export now marks opacity/additive source materials for alpha blending; the rectangles are gone in the inspected render. `verification/conveyor-native-api36.png` records the actual phone render, not full website visual acceptance.
- Android compilation, installation and unit tests pass. Lint reported zero errors and 17 advisory warnings before the final small threshold/LED changes. Native connected checks cover a full parcel cycle, background frame suspension, resumed rendering, removal on navigation and the reduced-motion scene.
- A later combined renderer run passed its cycle test but Android killed the process during the second test. `dumpsys activity exit-info` records LOW_MEMORY at 486 MB RSS on the 2 GB emulator; this is a failed stability run, not a passing suite. The pixel/screenshot test passed independently afterward. The exporter and renderer were then changed to load texture states on demand: one background decode worker, ten owned texture slots, release on replacement/detach, and readiness that also waits for pending texture loads. Verification of this optimization follows below; complete release/low-memory acceptance remains pending.
- The on-demand GLBs are 1.46 MB each, down from approximately 3.4 MB. Both connected conveyor tests passed after the optimization and mipmap-usage correction, including actual screenshot pixels; `verification/conveyor-api36.txt` reports `OK (2 tests)`. Dynamic GPU uploads use sampleable/uploadable/mipmap-capable textures and recycle the decoded bitmap after upload completion. Renderer upload errors now fall back safely. An active debug sample measured approximately 309 MB PSS / 463 MB RSS; that single sample is not a release benchmark or proof of low-memory stability. The failed pre-optimization report is retained separately.
- The four existing landing tests also passed against the optimized APK: sign-in/signup navigation, actual device rendering/removal, tag arrow/swipe/keyboard/reduced-motion behavior and automatic advance pausing in background/offscreen. `verification/landing-motion-api36.txt` reports `OK (4 tests)`; Android animator scale was restored to 1. No hosted test accounts or data were created by conveyor work.
- At this earlier checkpoint, remaining conveyor work included belt UV scrolling, LED/scan/curtain/sonar/strobe/recoil effects, lighting/sparkles, trust-chip fade, pointer sway, masking, counters/layout and clock restoration. The subsequent implementation/evidence below supersedes this checkpoint; full parity remains required.

## Conveyor motion, counters and restoration

- `StationMotion` ports the original linear-color LED chase/green sweep, head pulses, lamp chase, curtain push/quiver/settle, sonar expansion/fade, strobes, scanner beam sweep and stamp recoil. Its reusable frame buffers avoid per-frame array allocations. Two new unit tests verify phase transitions, chase movement, curtain limits, differing lamp phases and reduced-motion freezing. The current unit suite has 11 passing tests.
- Exported scene nodes now use original ref roles rather than mesh indices. Both scene sizes were checked for all 12 LEDs and eight curtains per gate, unique names, belt surface and parcel wash. The runtime uses cached material wrappers, source UV scrolling, parcel wash smoothing and trust-chip fade.
- Initial runtime checks exposed asynchronous gltfio renderable creation and null Java `Material` wrappers for borrowed native instances. Material caching/visibility setup now waits for resource completion; the UV uniform is set against the actual native instance. These failed checks were corrected before accepting the connected run.
- The native queue now uses the source title marker, mono captions, live status text/blink, responsive section/stage sizing, and animated three-digit gate counters. The playback controller lives above lazy items and saves the clock, counters and last counted gate.
- The expanded connected conveyor suite passed both tests, including a full cycle, scans counted once, changed belt offset, an actual scan screenshot, background suspension, offscreen clock suspension, scrolling back, activity recreation with saved clock/counts, navigation removal and the reduced-motion pixel checks. This is API 36.1 / 16 KB / normal-JIT evidence, not physical-device or complete visual acceptance.
- Four existing navigation/device/tag-wall tests also passed after the queue layout/state changes. An endpoint-only edge check missed a hard back-wall seam. The strengthened test samples the intermediate fade and uses screen coordinates. Investigation found that Android had omitted the website's opaque `#0b0805` hall background, leaving transparent sky above the wall. The native stage now draws that source background before its TextureView, then the elliptical vignette and 8% alpha mask within a save layer. The stronger fade test passes; intermediate screenshot RGB samples form a gradual ramp into the dark hall. The unused backdrop-overlay experiment was removed. Final expanded-suite/lint results are recorded below.
- Remaining work includes full website comparison, source fog and exact additive/volumetric lighting, bloom/shadows/sparkles, pointer sway, tablet rendering and release/low-memory profiling. Authentication/lending/admin end-to-end acceptance and the other top-level gates remain open. No hosted database data was changed by this work.
- After restoring the opaque hall background, the expanded connected conveyor suite passed again (`OK (2 tests)`, 45.99 seconds). The stronger intermediate-alpha pixel check passes, and scan/still screenshots were refreshed. The same run reverified offscreen/background suspension, saved clock/counts after activity recreation and renderer removal on navigation. Animator scale was restored to 1. This does not resolve the separate physical-device, release-memory or full visual-comparison gates.
- Final lint passed with zero errors and 18 advisory warnings. The installed debug APK includes the native stage background/mask and playback restoration changes. All 11 unit tests passed in this implementation cycle; the four existing landing tests and expanded two-test conveyor suite passed in their recorded runs.

## Native lending workflow validation

- A focused native two-party scenario passed on API 36.1 with normal JIT: owner approval,
  borrower pickup QR generation and actual ZXing decoding, activity recreation with the
  same code, five persisted incorrect attempts, locked correct code, borrower regeneration,
  owner pickup confirmation, owner return QR decoding, borrower return and a four-star
  review. Database checks verified returned status, both timestamps and exactly one review.
  Its isolated fixture cleanup passed. This focused run predates the confirmation animation.
- Code expiration now uses the server's timestamp and survives activity recreation. The
  countdown runs only while STARTED. Numeric entry provides a Done action that dismisses
  the keyboard; the native test verifies that confirmation buttons are visible before tapping.
- QR rendering uses the website's M error correction, two-module quiet zone, white
  208 dp image with 12 dp padding, and 2.2-second amber ring. The custody acknowledgement
  ports the expanding ring and drawn checkmark, with background/reduced-motion handling.
  Complete visual acceptance remains pending.
- Realtime tests now require actual notification and membership change events plus
  persisted read counts, rather than badge timing alone. Eight published tables are
  subscribed explicitly, user-specific tables are filtered, and collectors register before
  channel join. The strengthened baseline tests passed individually after cold boot.
- An earlier long-running emulator process was killed by LOW_MEMORY at approximately
  344–371 MB RSS. A fresh 2 GB emulator boot allowed the subsequent focused scenarios to
  pass. Per-scenario process isolation is test hygiene; it does not resolve release memory,
  long-session stability or reconnect acceptance.
- The first full rerun in this session passed all six authenticated API checks and fixture
  cleanup, but could not install the native APK because the dedicated emulator was absent.
  This is not a passing native suite. The owned API 36.1 emulator was restarted with its
  actual SDK image root before the next attempt.
- The next full attempt failed the strengthened realtime check: notification reads saved,
  but no event arrived after channel join. Supabase documents this join/replication race.
  Portal readiness now waits for the `system` replication-ready notification, refreshes
  after readiness to recover intervening changes, and retries on channel status loss.
  This fix still requires the subsequent test result; a joined socket alone is not proof.
- A read-only backend privilege audit found authenticated SELECT access to both handover
  hash columns. The source uses unsalted six-digit SHA-256 values, so row-level party
  privacy is insufficient protection for confirmation codes. Column/RPC exposure needs
  a shared backend/client correction and regression coverage before security acceptance.
  No hashes or codes were printed during the privilege audit.
- After the replication-ready fix, the complete hosted harness passed all eight workflow
  checks: six authenticated API scenarios, both baseline native tests, and the native
  owner/borrower handover test (the two baseline tests form one harness check).
  Each of the three native scenarios reports `OK (1 test)` with no failures/skips.
  Notification and membership events were observed before the polling deadline.
  Pickup/return acknowledgement, decoded QR tickets, rotation, lockout/regeneration
  and the four-star review passed against the updated APK. The database records both
  confirmation timestamps, returned status and zero reset counters. Targeted cleanup passed.
- The final build and all 11 unit tests passed. Final lint has zero errors and 18
  advisory warnings. These workflow results do not close the security finding above,
  long-session/low-memory behavior, complete visual parity or production signing.
- The post-run read-only hosted audit confirms two original profiles, one original
  item, 17 migrations, zero QA users and zero QA items.

## Handover secrets and internal helper security

- Migration 18 moves the actual pickup/return hashes to `borrowbuddy_private.handover_secrets`.
  Client and anonymous schema/table privileges are revoked and RLS has no client policies.
  Existing codes are copied before public fields are cleared. A CHECK constraint keeps
  the public compatibility columns null, including in full-row API/RPC/realtime responses.
  Both clients now explicitly select loan fields; shared client types exclude hash fields.
- The rollback-only migration test generated real old-format codes before inserting the
  migration. The same pickup code still confirmed afterward. It also verified private
  access denial, return generation/confirmation, full-row and cancellation response
  privacy, outsider isolation, consumed-code removal and cascaded cleanup. This passed
  before rollout; the dedicated regression and existing lockout regression passed again
  after migration 18 was applied to the hosted development project.
- Preflight rollback regressions also passed for availability, public reputation and the
  core lending smoke suite against migration 18. Native tests then passed all three
  session/item/two-party scenarios. The lending test now subscribes before pickup and
  return code generation, awaits replication readiness and inspects actual new/old loan
  event payloads for non-null hashes. No secret values are printed in assertions/reports.
- A separate rollback-only audit reproduced anonymous notification and audit writes
  through public SECURITY DEFINER helpers, using only a synthetic account. Migration 19
  revokes public/anonymous/student execution on those helpers plus internal trust
  recalculation and waitlist promotion. Trusted services, parent business RPCs and
  triggers retain their calls. The new permission regression verifies actual denial
  under both client roles, trusted-service grants and a normal profile edit.
- Permission, private-handover and core smoke regressions passed with migration 19
  inside a rolled-back transaction. Migration 19 was applied; its permission regression
  passed again afterward. Both new regressions are included in database CI.
- Web/shared TypeScript typechecking and web lint passed after the explicit loan
  projections/types. The updated Android build, 11 unit tests and lint passed with zero
  lint errors and 18 advisories. The full hosted harness after migration 19 is recorded
  below when complete. The broader security, visual, lifecycle and release gates remain open.
- The full hosted harness passed after migration 19: nine workflow checks, including
  the new live API helper denials, public loan/private-schema privacy checks and all
  three native scenarios. The native lending scenario again verified actual pickup
  and return event privacy, decoded QR tickets, rotation, five-attempt lockout/reset,
  confirmed timestamps, returned state and one four-star review. Both redacted native
  reports contain only passing tests; targeted fixture cleanup passed.
- The final read-only audit records 19 migrations, two original profiles and one
  original item; zero QA users/items, public code-hash rows, orphaned private secrets
  or exposed internal helpers. Student private-schema USAGE is false.

## Native verification and document workflow

- `HostedVerificationTest` uses an isolated student with no completed profile and the
  existing QA admin. It inserts a synthetic PNG into MediaStore, opens the real Android
  photo picker and checks the uploaded file's SHA-256 against the selected bytes. No
  real student document is used. UiAutomator 2.4.0 is a test-only dependency.
- Native onboarding now follows the website's registration heading, ticket bar, separate
  profile/required-ID sections, source copy and upload-dependent submission action.
  Profile drafts and the selected uploaded path survive recreation. Pending accounts
  with a name but no submitted ID return to onboarding so a partial submission cannot
  strand them in the queue without a document. Full visual comparison is still required.
- Admin verification uses the website's compact “View student ID” action. The native
  viewer waits for actual image loading, displays progress and retry states, refreshes
  signed links while foregrounded before their 30-minute expiry, and signs again after
  returning from background. Background refresh work is lifecycle-scoped. Large-image,
  zoom and network/error/revocation acceptance remain open.
- Initial test runs caught an immutable test bitmap and a test lookup that ran before
  the async admin image control existed. The fixture and synchronization were corrected;
  these runs were failures and their isolated backend/media cleanup passed.
- The focused API 36.1 / normal-JIT scenario passed: real picker upload, draft and path
  restoration, pending access gate, full document pixels, viewer rotation/back dismissal,
  admin rejection with the displayed note, a newly uploaded resubmission, admin approval,
  final student portal entry and no admin controls for the student. Database checks
  confirm two ID submissions plus rejection/approval audit actions. The viewer capture
  `verification/hosted-private-viewer-api36.png` was inspected and shows the complete
  synthetic ID at readable scale. This is functional evidence, not full visual approval.
- The harness now requires four native scenarios by default. Focused `verification` and
  `handover` diagnostics explicitly skip other native scenarios. Fixture cleanup includes
  only the created student's storage prefix and exact MediaStore filename, plus existing
  created account/item/audit IDs. The full updated suite result is recorded below.
- The updated default harness passed all ten authenticated workflow checks, including
  all four native scenarios with `OK (1 test)` each and no skipped/failed native tests.
  The final verification check additionally denies another student's signed-URL request
  for the actual native upload. Both submission audit entries and the rejection/approval
  actions were verified. Targeted fixture cleanup passed.
- The final Android build and all 11 unit tests passed; lint reports zero errors and
  19 advisories. The post-run audit has two original profiles, one original item, 19
  migrations, zero QA users/items and zero orphaned private secrets. A MediaStore query
  finds no remaining `borrowbuddy-qa-` image. The overall parity goal remains active.

## Native incident, moderation and fine workflows

- The incident form now follows the source's explicit type selection, evidence and
  description steps, progress markers, ticket bar, 220 ms enter/exit motion and reduced
  motion handling. Next requires a selected type; filing validates the description.
  Drafts/photos survive step changes and recreation. Navigation within the form is
  disabled while evidence is uploading. Filed state survives the loan reload.
- `HostedModerationTest` uses three active fixture loans, normal borrower/admin sessions
  and two synthetic MediaStore images. It tests actual multi-selection and upload bytes,
  restoration/back navigation, damage/late/other reports, disputed/active loan state,
  admin private evidence viewing, resolved/rejected decisions, pending balances, offline
  settlement and waiver, zero final balance and retained fine history.
- Initial diagnostics failed on the system picker's completion label and on an admin
  field lookup during queue reload. Observing the picker established its actual “Done”
  action. The test now waits for the next field after reload. These failures were not
  treated as passes; targeted fixture cleanup passed on both failed runs.
- The focused native moderation scenario passed. Database checks verify two resolved
  reports and one rejected report, two retained photos, ₹750 settled and ₹250 waived,
  admin identity/timestamps and the corresponding incident/fine audit actions. Unrelated
  viewers cannot read the incidents or sign their evidence URLs.
- Website inspection found its evidence uploader unmounted before final submission,
  dropping the hidden photo-path input. `incident-form.tsx` now keeps paths at form level
  and restores the uploader when going back. A real browser regression passed using
  normal sign-in, actual uploads, step unmount/back, the final Server Action and database
  verification of both evidence paths. The filed screenshot was inspected. This is a
  regression fix preserving the intended existing evidence workflow in both clients.
- The default harness now requires five native scenarios. Optional website testing uses
  `BORROWBUDDY_QA_WEB_URL`; the same fixture owns browser uploads. Cleanup handles exact
  media names, created users/items/storage prefixes and notifications whose payloads
  reference only fixture loan IDs, including deliveries to existing admins.
- Web/shared typechecking and web lint passed. Android build, all 11 unit tests and lint
  passed with zero lint errors and 19 advisories. Full-suite results and the final audit
  follow below when complete. Visual parity is still open: source mobile app navigation,
  loan metric cards, labels and composition differ, alongside the other recorded gates.
- The first combined run passed session/catalog/handover but Android killed the
  verification process with LOW_MEMORY at approximately 451 MB RSS. The kernel log
  states that the minimum memory watermark was breached with low swap. Its failed
  runner result is retained as `hosted-native-verification-low-memory-451mb.txt`.
  Cleanup passed; this run is not counted as a successful full suite.
- A standalone debug observation measured approximately 207 MiB PSS / 314 MiB RSS
  on landing and 173 MiB PSS / 282 MiB RSS after opening sign-in; native heap use also
  fell. These are single debug samples, not release benchmarks or proof of stability.
  Verification now logs per-stage memory. In the cold run, PSS rose from roughly
  172 MiB after the picker to 271 MiB after viewer capture/recreation and 277 MiB on
  the next picker return; growth is predominantly native memory. The measurements
  are saved in `verification-memory-api36.txt`. The contribution of capture/test
  instrumentation versus production activity/image lifecycle still requires profiling.
- The owned emulator was cold-booted with the same 2 GB RAM and normal JIT. All five
  native scenarios then passed, with one completed test each and no failures/skips.
  The complete harness passed twelve checks including the actual browser regression,
  evidence privacy, fine status/timestamps/admin identity and audit actions. This
  functional pass does not close the failed long-session/low-memory stability gate.
- Native filed-report and pending-fine screenshots were captured and inspected, along
  with the browser filed-report screenshot. They show working states and make the
  remaining app-shell, loan-card, typography/status and layout differences explicit.
- The final audit confirms two original profiles, one original item, 19 migrations,
  zero QA accounts/items and zero remaining synthetic incident notifications. No QA
  MediaStore images remain. All created fixture storage and related rows were cleaned.
  The owned website test server was stopped after testing.

## Chat history, read cursors and lifecycle validation — 15 October

- Migration 20 is deployed to the authorized hosted development database. Its rollback
  regression passes verified community enrollment/read cursors, private membership,
  sender identity, unverified/anonymous denial and a quiet channel's latest message
  beside 350 newer community messages. Core SQL smoke and private handover regressions
  also pass after deployment. Both clients now use per-channel message heads.
- Native chat uses an entry-scoped ViewModel, saved draft, stable message-ID merging,
  timestamp/UUID keyset history, foreground read tracking, filtered inserts, replication
  readiness, catch-up after joining, retry and a 30-second HTTP fallback. The source
  header/profile/loan links, relative timestamps, bubble alignment and send affordances
  are ported. Shared field and app-shell visual differences remain open.
- The first actual native scenario passed history and send/realtime checks but failed
  after recreation. Retained channel objects and delayed leave acknowledgements were
  addressed with unique attempt topics and explicit SDK channel removal in chat and
  portal updates. The next run passed recreation but exposed a separate resume failure:
  the SDK temporarily marks paused auth as Initializing, and profile refresh mistook
  that for signed-out. Profile loading now waits for auth restoration before checking
  the current user. Failed runs remain diagnostic evidence, not successful validation.
- Two history unit tests pass overlapping tail/echo deduplication without dropping
  older rows or sender metadata, and stable chronology with timestamp offsets/ID ties.
  Web typecheck/lint pass. Android build, all 13 unit tests and lint pass with zero
  lint errors and 19 advisories.
- The auth wait is required for both profile loading and the first resumed chat/portal
  request; otherwise the latter can issue an anonymous query and mistake RLS filtering
  for lost membership. Chat history loads and sends also wait for session restoration.
- One diagnostic native test returned OK before the community send finished because
  its text matcher accepted the composer draft. The independent database assertion
  correctly failed on zero persisted community messages. The test now requires a
  non-editable delivered bubble and an unread=false result, and the harness requires
  the cursor timestamp to include the persisted message. That diagnostic is not a pass.
- The combined run's chat scenario now passes normal UI sends, 131 loaded history
  rows including UUID-tied page boundaries, 136 final private messages, two send
  actions without duplicates, wrong-room filtering, real incoming insert events,
  rotation/draft/history retention, stopped read-cursor suspension, resumed catch-up,
  socket disconnect/rejoin for chat and portal, and removal of the old private channel.
  Community opening creates exactly one visible own cursor and the actual community
  send persists and is marked read. An unrelated verified student sees no private
  messages. See `hosted-native-chat.txt` and `hosted-native-chat-state.json`.
- `native-chat-community-api36.png` was exported and inspected. It records delivered
  bubbles and an empty composer; the large app navigation, shared fields, header/chip
  styling and surrounding composition still require source visual comparison. This
  functional result does not close the visual, offline or release-performance gates.
- The final combined hosted run passed all six native scenarios (one completed test
  each, no failures/skips) and all twelve harness checks. The optional browser evidence
  regression was not included in this run; its earlier separate pass remains recorded
  above. The same 2 GB API 36.1 emulator and normal JIT were used without increasing
  RAM. This does not replace release/physical-device or sustained memory validation.
- Targeted cleanup passed. The final hosted audit confirms two original profiles,
  one original item, 20 migrations and zero QA users/items/community channels. The
  source website typecheck/lint and Android's 13 unit tests/lint also pass. The complete
  app remains an active goal with the visual, campus controls, offline, memory and
  release signing/acceptance work below still outstanding.

## Campus pin controls and map workflow — 15 October

- Source inspection confirms website administration covers verification, incidents,
  fines and campus pins. Community creation currently has a backend RPC and no
  website form/control. Adding a new channel-management interface is a subsequent
  feature; it is not an outstanding website UI parity gate.
- Native pin placement now supports both tap and drag with the source's clamping and
  one-decimal rounding. Numeric X/Y fields, the source 50%/42% default, local coordinate
  validation, label-side/visibility values and saved drafts complete the original form
  controls. Deletion confirmation survives recreation. The source quadratic route now
  uses its exact 1000×750 coordinate formula, and Gate 1 remains visible without a
  selected pin. Zero availability, the queue label and direct catalog shelf rows are
  restored. Details close through the map background, close control and Android back.
- Packaged map and pickup photos load asynchronously at their displayed constraints
  through Coil rather than decoding the 4000×3000 map via painterResource. An actual
  decode-size assertion is included in the native fixture scenario; this is not a
  release memory benchmark. Original packaged assets are unchanged.
- The focused native scenario passed tap/drag/numeric placement, invalid-coordinate
  rejection, rotation, edits, hidden/visible student behavior, a one-item catalog shelf,
  delete cancellation/recreation and safe deletion with the item retained and its
  pickup reference cleared. API checks require three save audit entries, one delete,
  anonymous/student admin-RPC denial and exact fixture cleanup. The expanded combined
  scenario also checks zero availability, direct student RLS filtering, decoded map
  dimensions and exports route/detail screenshots. Results follow when complete.
- One diagnostic failed because a dropdown option shared its text with several
  read-only status labels; selecting the clickable option fixes that ambiguity.
  Another full run reached the account page before it finished loading; the session
  test now waits for its sign-out control. Failed attempts are not passes.
- Re-reading the actual `app-shell.tsx` establishes the next visual target: the source
  ticker, compact sticky black header, CargoMark, notification icon, initials avatar,
  wrapped navigation and pending-request count on My items. It has no bottom navigation.
  Current native extra navigation/chrome and badge placement require comparison with
  this source. Map pin label fidelity, pulse/dash/card animations, framing and tablet composition
  remain part of the map visual gate after these functional controls.
- Saved label-side values now place the active pin's name on the selected side.
  Narrow screens show the active label; wide windows show every label, matching the
  source breakpoint. Active pins/labels draw above other pins and labels clip to the
  photographed board. The native scenario checks the actual left label's bounds.
- The first combined pin scenario passed its runtime image-size assertion, zero/one
  availability, direct RLS filtering and all workflow/audit assertions. Inspecting the
  exported pictures revealed completely black surfaces. Handover QR decoding also
  failed: the captured 609×609 image contained 370,881 dark pixels (every pixel).
  Android Settings rendered black too. SurfaceFlinger reported the Intel host GLES
  backend. These captures are retained with `black-surface` names and are not visual
  acceptance evidence. The failed QR runner result is retained separately.
- Session validation and map captures now require pixel variation; a uniform/black
  native surface cannot pass. QR checks still decode actual captured pixels, save a
  failing image and log dimensions. Test-owned realtime channels are removed after use.
- SwiftShader and ANGLE/SwiftShader boots painted Settings but emulator 36.4.9 then
  terminated, including during a standalone app launch without any fixture run.
  Windows Application Error reports identify `qemu-system-x86_64-headless.exe` with
  exception 0xc0000005. No running emulator process remained, and fixture cleanup
  passed. These runs are not full-suite/visual passes. SDK manager's stable channel
  lists emulator 37.2.12, which is being installed in the separate D:/Android/sdk
  toolchain; the existing C: SDK binary is preserved.
- All 15 unit tests and Android lint pass (zero errors, 19 advisories). Emulator
  validation does not establish hardware performance or resolve the previously
  recorded sustained/low-memory failures.
- Stable emulator 37.2.12 was downloaded from Google after SDK manager's archive
  connection stalled at zero bytes. Its 455,342,868-byte size and published repository
  SHA-1 were verified before extraction. The D: SDK now reports the installed revision;
  the original C: emulator is preserved. Software rendering still terminated with
  Windows exception 0xc0000005, so it is not the validation configuration.
- Emulator 37.2.12 with host graphics and its default Vulkan support paints the
  actual app/3D landing correctly. The same API 36.1/16 KB AVD is used. This version
  enforces 2560 MB even when launched with `-memory 2048`; `/proc/meminfo` reports
  2,527,520 kB. Current combined functional/pixel checks therefore do not close the
  earlier 2 GB stability gate, and no app memory fix is inferred from the tool change.
- The final combined run passed all seven native scenarios, with one completed test
  per scenario and no failures/skips, and all thirteen authenticated harness checks.
  Both pickup and return QR tickets decoded from actual on-screen captures. The
  optional browser evidence regression was not part of this run; prior web results
  remain recorded above. Test fixture cleanup passed.
- Fresh route/detail screenshots were exported and inspected after the renderer
  repair. They show the original map photo, the exact route arc, a clipped left-side
  active label, live availability, selection rail and catalog/close controls. Pixel
  variance was checked; the earlier black frames remain separate diagnostics. These
  are functional/rendering evidence, not full visual acceptance: app chrome, map
  framing, button/label styling, animations and wide-screen composition still differ.
- The final hosted audit confirms two original profiles, one original item, twelve
  original pickup locations and 20 migrations, with zero QA users/items/pins/channels.
  No original pin was edited or removed. The complete Android parity goal remains active.
- The first combined pin scenario passed its runtime image-size assertion, zero/one
  availability, direct RLS filtering and all workflow/audit assertions. Inspecting the
  exported pictures then revealed completely black surfaces. Handover QR decoding
  also failed: the captured 609×609 image contained 370,881 dark pixels (every pixel).
  Android Settings rendered black too. SurfaceFlinger reported the Intel host GLES
  backend, establishing an emulator-wide graphics failure rather than readable QR
  output. Those artifacts are retained with `black-surface` names and are not visual
  acceptance evidence. The failed QR runner result is retained separately.
- Session validation and map captures now require pixel variation, so a uniform/black
  native surface cannot pass. QR checks still decode actual captured pixels; diagnostics
  save a failing image and dimensions. Test-owned realtime channels are removed after
  use. A SwiftShader boot painted Settings again but the emulator then terminated
  during the first scenario, with adb returning 255. Cleanup passed and the qemu process
  was confirmed absent. This attempt is not a functional or visual pass; the owned
  emulator is being re-established with a supported software GLES backend and logs.
- All 15 unit tests and Android lint pass (zero errors, 19 advisories). Software GPU
  validation does not establish physical-device/hardware performance or resolve the
  previously recorded sustained/low-memory failures.

## App shell checkpoint, 15 October 2026

- Native chrome now follows `app-shell.tsx`: original CargoMark and wordmark, wrapped
  top navigation, My items pending badge, Lucide bell, initials account control and
  admin link. The extra global back row and extra header logbook link were removed;
  the existing dashboard link opens the logbook. Bell/account touch targets are 48 dp.
- Pending requests and unread notifications use exact head counts. A focused hosted
  test passed with 61 pending requests, a realtime 62nd request, native approval back
  to 61 and mark-all-read back to zero; notification display remains capped at 9+.
- The ticker collapses before the sticky header, pauses when fully hidden and restores
  its per-entry fraction after recreation. A fresh Browse entry resets its scroll.
- Initial navigation tests exposed loss of the Browse back-stack entry. Anchoring
  section navigation to the full Browse route pattern fixes it. The passing focused
  test verifies nine section changes retain Browse plus one section and Android Back
  returns to Browse. Failed diagnostic runs are not acceptance passes.
- A normal browser fixture session rendered the source header at 411 and 1024 CSS
  pixels. Captures and measured bounds/styles are saved under `verification/web-shell`.
  Mono tracking, phone navigation offset and wide navigation padding/centering were
  adjusted from those references. Native phone captures paint correctly; complete
  screen and wide native visual acceptance remain open. Reference capture now waits
  for the source template's opacity entrance to finish and excludes the Next dev indicator.
- The first combined run passed session, catalog, shell and campus pins, then timed
  out while waiting for a community message after the send-button click. A focused
  chat rerun passed all assertions. The cause of the intermittent timeout is still
  unproven; the test now checks the composer and enabled/visible button before the
  click and captures diagnostics on timeout. This is not recorded as an app fix.
- The final combined run passed all eight native scenarios (one completed test each,
  no failures/skips) and all 16 authenticated checks, including the website evidence
  regression and phone/tablet header references. Actual QR captures decoded for pickup
  and return. Both the full run and focused chat rerun passed; the earlier intermittent
  send timeout still belongs to the stress/offline audit. All fixture cleanup passed.
- All 15 unit tests pass; final Android lint reports zero errors and 19 advisories.
  The debug APK is rebuilt. These runs use the 2.5 GB emulator configuration recorded
  above and do not close 2 GB sustained memory, physical-device, complete visual/motion
  or production signing gates. The endgame remains active; additional features stay deferred.
- The final read-only hosted audit confirms two original profiles, one original item,
  twelve pickup locations and 20 migrations; QA users, items, pins and channels are all
  zero. `tools/audit-hosted-fixture-cleanup.sql` reproduces these count-only checks.

## Catalog checkpoint, 16 October 2026

- Replaced the oversized stacked filters and padded catalog cards with the source
  compact search/filter rows, native date dialogs, condition/owner/deposit cards and
  lazy one/two/three-column grid at the source 640/1024 dp breakpoints. The container
  retains 1152 dp maximum width and 16/40 dp gutters. The original fixed photo,
  screen-blended batik and lower vignette now appear behind authenticated screens.
- Category/condition/pickup/date changes apply immediately. The search draft stays
  separate from the submitted query; both and the remaining filters survive recreation.
  The source pending-request catalog link now opens the owner's desk. Scores round
  to the nearest integer; deposit labels use Android ICU's Indian currency grouping.
- Availability exclusions now occur in the database query before the 48-row limit,
  matching the website. The expanded shell scenario passed with a full 48 available
  items when the newest item is booked, using its 62-item isolated fixture. The SDK's
  list-valued `notIn` filter avoids the raw-string quoting error caught during testing.
- Expanded native coverage exercises automatic filters, native date selection, unsent
  search drafts, rotation, empty/clear states, a tablet-sized window, actual image
  decoding, gallery/request/cancellation and rupee formatting. Diagnostic failures
  exposed old eager-list assertions and Material date semantics (full dates are in
  Text semantics). After correcting those assertions, the final combined run passed
  all eight native scenarios without failures/skips and all 17 authenticated checks,
  including source catalog/header captures and the browser evidence regression.
- The old shared one-pixel QA PNG had an invalid IDAT CRC and invalid compressed-data
  checksum. `tools/qa-image.mjs` now produces a valid opaque 2×2 synthetic PNG. Native
  cover readiness and browser natural image dimensions confirm decoding. No
  original website image was edited. Matching fixture/card captures are generated by
  `tools/test-web-catalog.mjs` when the hosted harness has a website URL.
- A fixture-free Android HTTPS diagnostic confirmed emulator-wide DNS failure with
  UnknownHostException. After the old emulator process was confirmed absent, emulator
  37.2.12 restarted with an explicit currently reachable resolver and default host
  Vulkan. The same native diagnostic then passed HTTP 200. No application DNS override
  was added. This still uses the previously recorded enforced 2.5 GB emulator memory.
- Matching source/native card references now use the original uppercase typography,
  collapsed body whitespace, explicit line boxes and two-line titles. Full native card
  capture bounds are checked to prevent clipped screenshots. The phone fixture measures
  379.43 × 475.05 dp natively versus 379 × 472.75 CSS pixels on the website; font width
  differs by less than 0.3%. Platform line breaks still differ in some cases, so these
  measurements do not establish complete pixel or motion parity. The native 1024 dp
  check confirms three 304 dp columns and restores emulator display overrides afterward.
- All 15 unit tests pass; Android lint reports zero errors and 19 advisories. The
  rebuilt debug APK verifies its v2 signature, 16 KB ZIP alignment and ELF load alignment
  for all 16 packaged native libraries. The ten audited dependency pins match stable
  upstream Maven metadata at the recorded check time. Reports are in `verification/`.
- The final read-only hosted audit confirms two original profiles, one original item,
  twelve pickup locations and 20 migrations; QA users/items/pins/channels are all zero.
  `verification/catalog-checkpoint.json` identifies this APK and the remaining gates.
  The complete parity goal remains active; release performance, signing and final
  requirement-by-requirement acceptance are still outstanding.

## Loan presentation checkpoint, 16 October 2026

- Ported the source date/deposit/counterparty-trust/handover facts, one/two/four-column
  layout, rounded human status badges and role-aware logbook link. Counterparty trust
  rounds rather than truncates. Dates use the source Indian date range and currency
  grouping. The original Lucide paths also supply the fact, channel and rating icons.
- The custody chain now follows the website's step states and timestamps instead of
  repeating the creation timestamp for approval. Pending steps hide their timestamp;
  native accessibility exposes completed/pending state. Returned confirmation, reporter
  names/relative timestamps, cancellation guidance and saved-rating stars are included.
- A focused native run passed approval, displayed facts, logbook return, two/four-column
  window changes/restoration, real QR decoding, recreation, persistent five-attempt
  lockout, regeneration, pickup/return and rating. Website captures use the same returned
  loan and normal borrower login at 411/768/1024 pixels. The final combined run passed
  all eight native scenarios without failures/skips and all 18 authenticated checks,
  including the website evidence-upload regression. All fixture cleanup passed.
- Source CSS inspection and browser measurements confirm the unlayered global title
  rule wins over page utility sizes: the heading follows `clamp(40px, 6vw, 64px)`.
  Native heading sizing and 800 dp desktop gutters follow this behavior. Browser
  measurements now wait for two frames after viewport changes to avoid recording the
  previous viewport's responsive styles. Card dimensions and heading styles are asserted.
  The source fact widths are 379, 362 and 195 CSS pixels at those respective viewports;
  heading sizes are 40, 46.08 and 61.44 pixels. Native adaptive checks verify equal-width
  columns, one/two/four-column arrangement and restoration of emulator display settings.
- Earlier screenshots only brought the custody heading into view. The updated capture
  scrolls to the final returned step and requires the first and last steps to be visible;
  a heading-only screenshot is not timeline evidence. Complete screen/state visual
  acceptance and remaining handover/review/report-form styling remain open.
- All 15 unit tests pass and lint reports zero errors with 19 advisories. The rebuilt
  debug APK passes signature verification, 16 KB ZIP alignment and native ELF load
  alignment. `verification/loan-checkpoint.json` identifies the artifact and scoped
  checks; these do not close sustained 2 GB memory, physical-device/release performance,
  production signing or complete website parity. Additional features remain deferred.
- The final count-only hosted audit confirms two original profiles, one item, twelve
  pickup locations and 20 migrations, with zero QA users/items/pins/channels. Emulator
  display size/density are restored to physical defaults (1080×2400, 420 dpi).

## Borrow logbook checkpoint, 16 October 2026

- Replaced the generic stacked logbook with the source heading, active loans, pending
  requests, lending-out section, waiting/notified explanations, six recent decisions,
  six history records, empty browse action and fine-policy notice. Rows use the source
  typography, dates, badge tones and rounded statuses. The source 1024 dp maximum
  container and 800 dp desktop gutters apply. Existing history loan links are retained.
- The repository now loads both loan roles for this screen and sorts waitlist entries
  newest first, matching the website. A lazy list bounds composed rows; saved list
  state and refresh keys retain the current content during post-action reloads instead
  of replacing the screen with its initial loading state.
- A new focused native scenario passed real borrowing/lending navigation, request
  cancellation, notified waitlist display, calendar-based waitlist join, both leave
  actions, rotation, the fine notice and a separate empty account's browse link.
  Five isolated listings and the corresponding workflow data are removed by exact IDs.
  The first diagnostic assertion targeted a nonmerged row rather than its text children;
  that assertion was corrected and the focused run passed. It was not an app behavior fix.
- Source logbook references and measurements are captured at 411/1024 CSS pixels using
  the same seeded borrower. Native references cover active, notified, policy and empty
  states. These are scoped comparison evidence, not complete screen/state acceptance;
  native tablet captures, large fonts, pointer/keyboard states and owner-desk parity
  remain open. A combined run reached all logbook actions but its new test attempted
  sign-out scrolling before the account screen loaded. The test now waits for that
  screen's sign-out control; the failed diagnostic is retained separately. The final
  combined run passed all nine native scenarios without failures/skips and all 20
  authenticated checks, including source references and the website evidence-upload
  regression. All fixture cleanup passed.
- All 15 unit tests pass; lint reports zero errors and 19 advisories. APK signature,
  16 KB ZIP alignment and native ELF load alignment checks pass for the rebuilt APK.
- Further source-query inspection identified a remaining parity gap: the website loads
  the latest 60 loans independently for each role, while native `loans()` currently
  limits a combined OR query to 120. A student with more than 120 recent loans in one
  role could lose visibility of older loans in the other role. This needs separate
  role queries and a large-history regression before logbook data parity is accepted.
- `verification/logbook-checkpoint.json` identifies the verified APK and open gates.
  Full visual/motion parity, large-font/native-tablet logbook comparisons, sustained
  2 GB memory and release/physical-device performance, production signing and final
  requirement-by-requirement acceptance remain open. Additional features stay deferred.
- The final read-only hosted audit confirms two original profiles, one item, twelve
  pickup locations and 20 migrations; QA users/items/pins/channels are all zero.
  Emulator display size/density are restored to physical defaults (1080×2400, 420 dpi).

## Loan role query checkpoint, 16 October 2026

- Reproduced the combined-limit bug with 121 synthetic historical returned loans,
  a newer borrowing loan and a much older lending loan. The unchanged Android query
  failed the normal authenticated native assertion: expected 60 borrower rows, got
  120, leaving no room for the older lending loan. The source website still showed
  both roles. `hosted-native-loan-history-before-fix.txt` retains the failing result.
- Native `loans()` now issues parallel borrower/owner queries with separate 60-row
  limits, then deduplicates and merges them newest first. No endpoint, permission,
  database trigger or business RPC changed. A focused native run passed 60 borrower
  rows plus the older owner row, with out-of-cap borrower history excluded, followed
  by the complete logbook UI workflow. The final combined regression also passed the
  reverse-role cap and cross-profile RLS check: 60 owner rows plus one borrower row,
  all still restricted to the authenticated viewer's own loan parties. Actual results
  are exported to `verification/native-loan-history.json`.
- Historical fixtures are direct synthetic test records, not evidence of 121 UI
  handover lifecycles. The request insert guard remains enabled: each history item
  has its own request, followed by an explicit privileged status update limited to
  tracked fixture IDs. Fixture deletion now batches known item/loan IDs in groups of
  50, including only notifications referencing those loans. Focused cleanup passed.
- The large catalog fixture also requires the native test to wait for its submitted
  search to finish before selecting the waitlist item; otherwise that item can be
  outside the first unfiltered page. This is a test-readiness correction, not a new
  catalog behavior change. The production parity goal remains active.
- The final combined run passed all nine native scenarios without failures/skips and
  all 20 authenticated checks, including source references and the browser evidence
  regression. All 15 unit tests pass; lint reports zero errors and 19 advisories.
  Signature verification, 16 KB ZIP alignment and native ELF alignment pass for the
  rebuilt APK. `verification/loan-role-checkpoint.json` identifies this artifact and
  its remaining gates. The earlier combined-query gap is resolved; full visual/motion,
  lifecycle/error, sustained 2 GB/release/device performance and production signing
  acceptance remain open. Additional features stay deferred.
- The final read-only audit confirms two original profiles, one original item,
  twelve pickup locations and 20 migrations, with zero QA users/items/pins/channels.
  Display overrides are cleared (physical 1080×2400, density 420 dpi).

## Dashboard and fine navigation checkpoint, 16 October 2026

- Replaced generic dashboard cards/buttons with the source greeting/title/trust/ID
  header, 256 dp snapping loan tickets (up to eight), original Lucide category icons
  in two/four columns, counted borrowing/lending tabs and transparent movement rows.
  Source due-tone precedence uses UTC dates; greeting uses campus local time. Native
  tabs save selection and port the 400-stiffness/0.8-damping spring plus sequential
  220 ms exit/entry fade and 16 dp slide. The full-logbook link remains in its source
  position. Dashboard loans/categories load concurrently with the existing backend.
- The focused hosted scenario passed live counts, loan navigation, saved selection
  after Android Back/recreation, category filtering and a 1024 dp four-column layout.
  Each wide category cell measures 227 dp. Emulator display overrides are restored.
  Source phone/tablet captures and measurements use the same seeded borrower.
- A separate fixture-free component test checks overdue badge pixels and motion.
  It measured alpha 0.4504–1 with 9,456 changed pixels between dim/bright captures;
  background time leaves its phase unchanged and reduced motion holds alpha at 1.
  This is not an authenticated workflow or complete screen/motion acceptance.
- The first motion diagnostic used an older test APK without clock advancement at
  the reduced-motion wait. After rebuilding, the test exposed continued animation
  despite the committed system scale being zero. `rememberReducedMotion` now reads
  that setting directly rather than relying on the animator cache during the settings
  observer callback. The component test and both existing tag-wall gesture/lifecycle/
  reduced-motion tests pass. Animation settings are restored in `finally`.
- All 17 unit tests pass; lint reports zero errors and 19 advisories. The final combined
  nine-scenario hosted regression passes all 21 authenticated checks, including the
  source dashboard reference and existing catalog/logbook/header/evidence checks.
  Earlier failed attempts and their corrections are recorded below. Full visual,
  state, lifecycle/error and release/device performance acceptance remain open.
- The first combined run passed session/catalog/shell/pins/logbook/dashboard, then
  stalled before chat's email input. Thread dumps show the main thread waiting in
  `HardwareRenderer.syncAndDrawFrame` and RenderThread spending sustained CPU in the
  emulator's `qemu_pipe_write`/`glGetUniformLocation` shader path. Process RSS grew to
  roughly 1.7 GB, including about 852 MB shared. These observations locate a graphics
  transport stall; they do not prove an app heap leak or a fixed emulator/driver cause.
  Java/native traces and the incomplete chat report are retained under `verification/`.
- The hung test app was stopped after collecting diagnostics, and hosted fixture
  cleanup passed. The old emulator process was confirmed gone before cold-booting
  the same AVD with the same host GPU/default Vulkan configuration. A fixture-free
  Android HTTPS check and the focused private/community chat scenario then passed
  without an app or graphics-mode change. This recovery is not a final stress pass.
- A subsequent combined run failed the chat assertion requiring an incoming message
  to arrive through the filtered realtime stream within 12 seconds. That report did
  not distinguish a missing event from message visibility or connection state. The
  test now records those counters and a screenshot on that specific failure; its
  deadline and requirement for an actual realtime event remain unchanged. Two later
  focused chat runs passed. This does not resolve the intermittent delivery failure.
- After the overnight host session changed, the same emulator launch configuration
  selected the NVIDIA host GPU instead of Intel. The final combined run used that
  fresh emulator. No production chat change was made, and a passing retry on a
  different active host GPU cannot establish either a graphics or realtime fix.
- The next combined run passed six native scenarios, including the expanded
  dashboard/logbook case and actual filtered realtime chat delivery. It then failed
  during `HostedLoanFlowTest.adaptiveFacts`: Compose's `WindowCapture.forceRedraw`
  exceeded its internal two-second deadline after a display resize. Handover,
  verification and moderation were therefore not accepted for that run. The failed
  report is retained as `hosted-native-handover-wide-capture-failure.txt`; the process
  exit receipt records exit code 1. A post-run hosted audit confirmed the original
  2 profiles/1 item/12 locations/20 migrations and no QA accounts/items/pins/channels.
- Resized loan screenshots now use Android's compositor capture, with exact display
  dimensions, the existing fact-grid layout assertions and a painted-pixel check
  cropped to the facts themselves (system bars cannot satisfy it). Phone captures
  and actual QR decoding remain unchanged. This is a test capture adjustment, not
  evidence of a production graphics fix. The focused handover run then passed both
  resized captures, real QR decoding, rotation, five-attempt lockout/regeneration,
  pickup/return and review, plus the source loan captures: nine authenticated checks
  and targeted cleanup passed (`dashboard-handover-run.txt`). The complete combined
  suite was then retried. The compositor images include Android system bars.
- That retry hit the same internal two-second `WindowCapture.forceRedraw` timeout
  in the dashboard's resized capture; the logbook scenario failed and later native
  cases were not reached. `dashboard-logbook-capture-failure-run.txt` and
  `hosted-native-dashboard-wide-capture-failure.txt` retain this result. Targeted
  cleanup passed. The compositor helper is now shared by both resized-display
  tests, with the dashboard paint assertion cropped to an actual category card.
  Layout, pixel, navigation and QR assertions are retained; no screenshot timeout
  or realtime deadline has been relaxed.
- Source auditing also identified two missing ledger behaviors: contextual loan
  navigation and a displayed creation time. Native fines now expose their joined,
  authorized loan as a minimum-48-dp accessible action, and display the existing
  relative-time formatter. The moderation scenario is extended to open both fine
  contexts as the borrower, assert each correct loan, use Android Back to return
  to the ledger, and assert the creation-time text. Its focused hosted run passed
  all nine authenticated checks, including source incident evidence and cleanup
  (`fine-navigation-run.txt`). The shared-capture dashboard/logbook focus also
  passed all ten checks and cleanup (`dashboard-resized-logbook-run.txt`).
  The failed combined runs used the prior
  dashboard APK, SHA-256 `9B8842DB6B0739E4D883ED849B27E6A84728863A5315000D3C07FAFBBCADBB54`.
- The final combined run passes all nine native scenarios, all 21 authenticated
  checks and targeted cleanup on the updated APK, SHA-256
  `9F4D8A80E50FE745905AE2683770136F9594A87510B174DAFCB51681F13AD0AD`.
  Debug signing verification, 16 KB ZIP alignment and ELF alignment pass for all
  16 native libraries. `verification/dashboard-checkpoint.json` identifies the
  artifact, component checks, capture adjustment and remaining acceptance gates.
  This passing run does not resolve previously observed intermittent realtime or
  graphics/stress failures. The production parity goal remains active.
- The final read-only hosted audit confirms 2 original profiles, 1 item, 12 pickup
  locations and 20 migrations, with zero QA users/items/pins/channels. Emulator
  overrides are cleared (physical 1080×2400, 420 dpi). Additional features remain
  deferred until the complete app passes the endgame acceptance requirements.

## Owner desk port in progress, 16 October 2026

- Ported the source owner header, pending count and 48-hour explanation, borrower-first
  request cards, rounded trust, formatted dates, quoted messages and request ages.
  Listing rows use original 80 dp covers, grouped cover/title layout, status/deposit,
  wrapped controls, eight recent decisions and the original first-listing empty state.
  Native owner loan history remains available below the source page sections.
- Requests/listings/loans load concurrently. The lazy page saves scrolling and each
  decline draft across recreation. Approval/decline and listing controls retain their
  existing backend/RLS; optional decline reasons now trim to null like the website.
  Original Lucide geometry, fonts, colors and 150 ms hover/focus states are reused,
  with reduced-motion support and 48 dp button/input touch adaptations.
- Source captures measure phone/tablet reason fields at 165/192 px, covers at 80×80,
  and the same 40/61.44 px headings. Native wide assertions check the 80 dp cover at
  x=57 and title at x=157 in a 1024 dp display. The fixture's fractional trust score
  is set after verification, whose existing trigger otherwise recomputes reputation.
- The focused hosted scenario passes all nine authenticated checks and cleanup.
  It verifies saved/trimmed decline, approval and loan access, actual cover decoding,
  pause/activate, editing, cancelled/confirmed deletion, rejection of deleting an item
  with loan history, recent-decision cap, wide rendering/restoration, and an empty
  verified student's create-listing navigation. Source/native reports and images
  use `owner-focus`, `hosted-native-owner`, `web-owner` and `native-owner` names.
- Two initial test-readiness failures are retained: a heading was offscreen after
  saved lazy scrolling, and display resources changed before the resized page was
  composed. Tests now wait for the actual page/viewport semantics without weakening
  layout or action assertions. A subsequent run failed Espresso's 60-second main-
  looper idle condition on the account sign-out scroll after resize restoration.
  A diagnostic-only stage-log rerun passed all actions; the cause of the intermittent
  idling failure remains unproven. `owner-idle-failure-*` preserves that evidence.
- The complete regression is running with ten native scenarios and the new source
  owner check. Broader font/device/pointer/error states, complete visual/motion
  acceptance, sustained memory/graphics/realtime stability and production signing
  remain open. The endgame scope and additional-feature deferral are unchanged.

## Chat viewport regression, 17 October 2026

- The first owner combined run passed the two native session/catalog scenarios,
  then the source browser timed out waiting for `/home` after sign-in. Targeted
  cleanup passed. The development server still returned the login page normally;
  the cause is unproven. Source catalog failures now save redacted rendered text,
  failed-request paths/status and a screenshot without extending the deadline.
  `owner-full-source-catalog-failure.txt` retains the original failure.
- The next combined run passed through native dashboard/logbook checks, then timed
  out waiting for a sent IME message to appear. Diagnostics show a connected chat,
  132 loaded messages, one realtime event and a cleared draft, while the visible
  list remained on older messages. The report/capture are retained as
  `owner-full-chat-failure-*` and `owner-chat-timeout.png`.
- Extracted the existing production scroll behavior into `ThreadScroll.kt` and
  reproduced a viewport bug without hosted fixtures: after sending row 100, reducing
  viewport height left it undisplayed. `chat-scroll-before-fix.txt` records that
  failing assertion. The controller now waits for the appended lazy layout and
  follows viewport changes while at the latest-message position. It uses immediate
  scrolling like the source `scrollIntoView`, whose page has no smooth-scroll rule.
- Explicit history loading and dragging pause following. Saved following/request
  state preserves reading position during restoration; a new send/receipt resumes
  following. A history-load response checks its scroll generation before restoring
  an anchor, so it cannot overwrite a newer send/receipt position.
- `ThreadScrollTest` now passes append, repeated viewport shrink/expand, older-history
  reading, saved-state restoration and a subsequent new append. This uses the real
  production controller; saved-state emulation is not full process-death evidence.
  The hosted private/community chat focus also passes all eight authenticated checks
  and cleanup, with an added real activity recreation while reading old history.
  Reports are `chat-scroll-after-fix.txt` and `chat-scroll-hosted-focus.txt`.
- All 17 unit tests pass; lint has zero errors and 19 advisories. A complete ten-
  scenario regression is running on this rebuild. Other previously observed
  realtime-delivery, rendering and main-looper idling failures remain unproven;
  this viewport correction is not a general stability or production-readiness claim.
- That combined attempt passed chat, then the handover test waited for an offscreen
  owner loan badge after successful approval. The backend loan was already in
  `awaiting_pickup`; the new lazy owner page had not composed its distant history
  row. Approval is now scoped to the exact request, confirmed through the normal
  owner repository, and followed by scrolling to/asserting the resulting loan status.
  Owner loan reopening waits for the page rather than an uncomposed offscreen row.
  The assertions and handover flow remain intact; no timeout is increased.
- Added twelve tracked owner shelf fixtures so even the handover focus exercises
  the offscreen case. It passes all nine authenticated checks, including real QR,
  rotation, five-attempt lockout/regeneration, pickup/return, review, source captures
  and cleanup (`owner-lazy-handover-focus.txt`). The earlier combined failure is
  preserved in `owner-chat-handover-failure-*`; final combined acceptance is pending.
- A later combined run passed handover and verification, then timed out opening an
  incident evidence viewer. The test had waited for any loaded thumbnail but then
  clicked the first generic thumbnail. It now selects one loaded semantics node,
  scrolls to that same node, asserts enabled/displayed, and retains the full-size
  viewer/decode checks. This removes a test race; its role in the original timeout
  is not independently proven. Viewer failure captures are retained when available.
- Two subsequent moderation focuses failed at initial sign-in. A captured screen
  reports connection unavailable, and a separate fixture-free Android HTTPS test
  proves `UnknownHostException` for the hosted project. Cold-booting with the same
  resolver configuration did not recover it. Direct host DNS queries showed the
  old configured resolver timing out while the host's current resolver answered.
  Only the owned test emulator was relaunched using that working host resolver;
  Android HTTPS then passed in 0.955 seconds. App URLs/TLS/DNS code and host network
  settings are unchanged. Reports use `owner-chat-network-*` and
  `moderation-login-visible-failure*`; this is test-environment recovery, not an
  authentication implementation fix or general stability claim.
- After resolver recovery, the updated moderation focus passes all nine authenticated
  checks and cleanup (`evidence-ready-moderation-focus.txt`), including the selected
  ready thumbnail, full-size private image, incident decisions, fine-linked loan/time
  checks, settlement/waiver and the source incident upload. Its sign-in helper also
  dismisses the keyboard and scrolls the exact submit button into view before clicking;
  login failures retain a masked-password screen capture for diagnosis.

- The next combined attempt passed the first nine native scenarios, including chat,
  handover and moderation, then failed in the owner test's final account logout.
  Its capture shows the account loading state: the test tried to scroll before the
  account's scroll container existed. It now awaits the actual sign-out control
  before scrolling, and awaits the editable title field after the empty-list CTA.
  The updated owner focus passes all nine authenticated checks and targeted cleanup
  (`owner-focus-run.txt`). This fixes test readiness; it does not establish that the
  earlier independent main-looper idling failure is resolved. The failed combined
  attempt is retained in `owner-chat-final-owner-failure-*`.

Earlier combined-run failure: the subsequent run passed six native scenarios, then
the handover scenario completed pickup/return but timed out awaiting the saved
rating. Its capture shows the comment still focused and the keyboard covering
the form's lower area. The test now closes the keyboard after text entry before
scrolling/tapping Submit, retaining the visible saved-rating and exact backend
rating/comment assertions. That capture does not independently prove whether a
review request reached the server. The harness now exports future handover failure
captures and queries rating/role before cleanup to distinguish persistence from
visibility failures. The original failed run is retained in
`owner-chat-rating-failure-*`; it is not a passing combined checkpoint.
The updated handover focus passes all nine authenticated checks and cleanup,
including onscreen saved rating and exact backend rating/comment
(`owner-lazy-handover-focus.txt`). The original cause remains unproven; keyboard
dismissal makes the test's intended tap deterministic rather than establishing a
production review implementation fix.

## Owner desk and chat checkpoint — 17 October 2026

- The final combined run completed **all ten native scenarios and 23 authenticated
  workflow checks**, with exit code zero and targeted fixture cleanup. This includes
  private/community chat, handover/review, moderation and the owner desk in the same
  run. `verification/owner-chat-full-run.txt` retains the actual result; earlier
  failures above remain preserved rather than being treated as passing retries.
- All 17 unit tests pass; final lint has zero errors and 19 warnings
  (`owner-chat-unit-lint.txt`). The main APK SHA-256 is
  `D6B3CC1462B600E642B5BF640839D4AFEFE1ACF8EF25B1FFC3623E3E4F40F909`.
  Its debug v2 signature verifies, and ZIP/ELF 16 KB alignment passes for all 16
  native libraries. Device size/density overrides are restored to 1080×2400 / 420.
- A separate read-only hosted audit confirms the original baseline: two profiles,
  one item, twelve pickup locations and twenty migrations, with zero QA users,
  items, pins or channels (`owner-chat-cleanup-audit.txt`).
- `verification/owner-chat-checkpoint.json` records this checkpoint and its limits.
  Source account/ledger/inbox/admin/chat layouts, further visual/motion and lifecycle
  states, stress/release/physical-device performance and production signing remain
  open. This passing regression does not prove every earlier intermittent realtime,
  graphics or main-looper idling issue resolved. The endgame goal remains active.

## Account/ledger port — 18 October 2026

Source 768-pixel page bounds, original
fonts and Lucide vectors, outstanding/empty ledger panels, three fine badge tones,
source currency formatting, account navigation panels, responsive profile fields,
save feedback and sign-out pending state are now implemented. Personal history
remains newest first without the admin cap; the admin query now orders pending fines
oldest first and limits the result to 50, matching the website. A new hosted
account/ledger focus passes all nine authenticated checks and cleanup with 52
pending and two historical fines. It verifies invalid save, restored drafts,
Done-key saving, stored year-six preservation, rounded public/account trust,
public-profile/map/loan navigation, empty ledger, row privacy and replenishment
of the admin queue after normal settlement. Reports use `account-ledger-focus`,
`hosted-native-account-ledger` and `native-account-ledger-result`.

The initial tablet screenshot could pass on a loading backdrop; that artifact is
explicitly rejected. The stronger capture requires actual black panel/text pixels.
The title comparison then exposed 150 px versus the browser's 129 px. Font padding
alone was insufficient; the source title now uses tight/both-trim line boxes with
visible glyph overflow. The fixture-free typography test passes recorded phone/
tablet one/two-line cases, and the hosted title measures 130 px versus 129 px
(integer rounding). Actual account/ledger tablet screenshots were visually
inspected after the stronger focus passed. Earlier failed reports remain retained.

When verification resumed on 18 October, the owned emulator and website server were confirmed
absent and restored. Android HTTPS passes against hosted Supabase using the host's
current working resolver. Reference requests through 127.0.0.1 left a source route
wrapper at opacity zero; server logs show a blocked development-resource origin.
Using the dev server's advertised localhost hostname restored the reference checks.
No app DNS code or website source was changed for this environment recovery.

The final combined run passes **eleven native scenarios and 25 authenticated
workflow checks**, including the inline loan/time metadata refinement, with exit
code zero and targeted fixture cleanup. The APK hash is
`9D32FE159E342E23ABE8B57CC740D7E19E177F514D67D97F8DBA0157FFA2D152`.
All 17 unit tests pass. Final lint has zero errors and 19 warnings; the debug v2
signature verifies and ZIP/ELF 16 KB alignment passes for all 16 native libraries.
All ten dependency pins match freshly queried stable Maven metadata.

Visual review rejected another tablet image: the display dimensions had changed
before the compositor replaced its phone-scale frame. Black/text pixels alone
could be supplied by that frame's full-width header. A test-only follow-up now
requires the blue page backdrop outside both panel edges as well as the expected
panel/text. The same application APK passes all nine focused authenticated checks
and cleanup with that stronger capture. Actual final tablet images were inspected;
`native-account-ledger-capture-checks.json` records all six outside samples passing
for each screen. The checkpoint records separate combined/focused instrumentation
hashes rather than claiming the full suite was repeated after this capture-only fix.

The final read-only hosted audit confirms two profiles, one item, twelve locations,
twenty migrations and zero QA users/items/pins/channels. Display overrides are
restored to 1080×2400 / 420. `verification/account-ledger-checkpoint.json` records
the exact reports, artifact and remaining gates. The endgame goal remains active.

Large-font/keyboard/pointer edge states, process-death/offline recovery and broader
source visual acceptance remain open. Other ported screens need the same explicit
title line-box audit; their older styles were not changed by this account port.

## User-requested profile lanyard — 20 October 2026

Website account/public profiles and native student/admin profiles now include the
supplied React Bits lanyard with original-font personalized membership artwork.
The source component keeps its physical drag/flip behavior. The native port uses
the source card/ring/clamp geometry, four-node physics, a 72-sample ribbon and the
eight source reflection panels. Accessible flip controls and static fallbacks
retain card information. Private account/verification-upload fields are excluded
from the public card projection. No auth privileges or database schema changed.

The website production build/typecheck/lint pass. Isolated student/admin browser
checks pass real WebGL, actual drag hits, keyboard flip, phone/tablet layouts,
public counterparts and context-loss fallback. The final native component test
passes actual opaque lettering/colors, upright texture, touch drag/flip,
background/detach pause and reduced-motion idle stop. The account/ledger focus
passes all nine authenticated checks and cleanup with the card present. Its
tablet capture now explicitly scrolls the existing fines/map actions into view,
because the new requested card occupies space above those actions.

The final APK is `515C044C7FA55C103B17A3AE665FB4E677009FC623E6463EA4A34435E7719738`.
All 19 unit tests pass; lint has zero errors/23 warnings. The debug v2 signature,
ZIP alignment and all 16 ELF library alignments pass. Hosted cleanup returns to
two profiles/one item/twelve pickup spots/twenty migrations with zero QA rows.
Display and animator settings are restored. `verification/member-card-checkpoint.json`
records exact reports and scope.

This is not a passing full combined suite. The preserved 18 October attempt failed
on logbook Compose idling; that focus later passed ten authenticated checks. The
20 October combined attempt failed opening the dashboard after catalog booking;
its screenshot shows an empty JSON-response parse error. The inbox focus passed
nine authenticated checks on its earlier APK. These failures require diagnosis
and a fresh complete regression. Lanyard initialization/rendering cost still needs
release/physical-device and sustained low-memory profiling, alongside the
remaining source screen/state/motion and production signing gates.

## Next implementation priorities

1. Continue the permission/incident-state and offline/failed-send audit, including further mixed-role lifecycle/error states. The admin fine ordering/limit and replenishment now have a normal-credential hosted regression; broader moderation acceptance remains open. `verification/account-ledger-source-audit.md` records source routes, form/guard differences and typography evidence.
2. Finish remaining admin layouts and public-profile/chat/inbox edge-state acceptance; audit earlier display-title line boxes and finish all source screen/state comparisons, including account/ledger, empty/due/realtime movement states, large fonts and pointer/keyboard behavior. Preserve native public-profile and owner-history access alongside original source sections.
3. Audit source page-entry motion (300 ms fade/rise, 24 px, source easing), finish device lighting/detail maps, conveyor effects, hero/remaining animations and tablet adaptations; continue website comparisons.
4. Finish lifecycle restoration, offline parity, adaptive layouts and realtime reconnect/background stress.
5. Complete release profiling, APK/AAB signing and requirement-by-requirement acceptance audit.


## Website-first Campus Commons — 27 October 2026

The user explicitly prioritized Campus Lost & Found, the Semester Giveaway Shelf,
and Handover Time Slots before further Android implementation. Their website
implementation uses dedicated campus storage/APIs, preserves existing loan and
conversation formats, and uses `campus_transfer_id`, `campus_claim_id` and
`campus_post_id` notification keys. Android DTO compatibility is regression-tested
through the original loan approval/chat/code workflow. At that website-only
checkpoint, the new screens were not implemented natively. Original lending APIs and null retired secret columns
remain intact. No APK or signing claim is changed by this website delivery.

See [CAMPUS.md](../../CAMPUS.md) for the acceptance evidence and native follow-up
scope. Borrow Circles, Authorized Buddy Pickup and Campus Impact Dashboard remain
deferred. The endgame is still open.

## Member card stamps — 12 November 2026

Website and native ID cards now show achievement stamps from the aggregate-only
`get_profile_stamps` RPC (verified viewers only, same visibility as
`get_public_profile_stats`). The account screen shows every stamp, with locked
stamps greyed and a short hint; public profiles show earned stamps only. Earned
stamps press in once when scrolled into view and stay still under reduced motion.
`ProfileStamps` mirrors the web catalog in `apps/web/src/lib/stamps.ts`. Covered by
`supabase/tests/profile_stamps.sql`, `ProfileStampsTest`, `assembleDebug` and a
browser check of the web card at desktop and 375 px. The native card has not yet
been compared on a device or emulator.
