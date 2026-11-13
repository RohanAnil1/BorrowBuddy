# BorrowBuddy Android

Native Kotlin/Jetpack Compose client for the existing BorrowBuddy Supabase backend.
The endgame is complete website feature, visual and animation parity; this project is
under active implementation and must not yet be labelled production-ready.

For setup, releases and the monorepo overview, start at the [root README](../../README.md).

## Home-screen widget

`widget/` holds Jetpack Glance widgets in the Campus Cargo style. The picker lists three:

- **Boarding pass** (4x2 by default, resizable from 2x2 up to 4x3+). The main panel shows the next loan due back: the role, the item, who it's with and the loan code. A perforated stub holds a thermal-font countdown (`02 DAYS LEFT`). Below sit tiles for pending requests, unread chats and fines, plus **Browse →**.
- **Next return** (2x2). Shows the countdown, the item and the two most urgent counts.
- **Parcel** (2x2, stretches to 4x2). The mascot stands on the campus canvas under a speech bubble. Its face follows your loans, most urgent first (`ParcelCues`): asleep when signed out, thinking while your ID is checked, worried with a question mark when something is overdue or a fine is unpaid, waving when a return is a day or two away, bursting with brackets when there are new requests or chats, calm when a loan is on track, and happy when nothing is due. Offline, it shows its no-signal eyes. Tapping it opens whatever the bubble is about. Parcel is drawn by the same `ParcelMascot.kt` code as in the app (`drawParcelStill`), into a bitmap.

Behaviour:

- **States.** Signed out, it asks you to sign in. While verification is pending, it says so. With no open loans, it shows "All clear".
- **Data.** `WidgetLoader` reads through the app's single `BorrowRepository`, so the encrypted session is shared. The data is loans, the pending-request count, unread conversations and pending fines. In a background-only process, supabase-kt hasn't restored the session yet, so the loader restores it and renews an expiring token once.
- **Refresh.** `WidgetSyncWorker` runs hourly (only when the battery isn't low). It also runs once when a widget is placed, when the app is updated, when you leave the app, and when you tap the `SYNCED …` label. There's no `updatePeriodMillis` and no polling.
- **Offline.** The last snapshot is cached in private preferences. Countdowns are recomputed from the due date at every render, so they keep moving without the network, and the label switches to `OFFLINE · 3H AGO`. Signing out clears the widget straight away.
- **Taps.** Taps open `MainActivity` with an allow-listed route (`WidgetRoutes`): the loan, `home` (Browse), `my/items`, `chat`, `fines` or `dashboard`.
- **Fonts.** Launchers inflate widget views in a restricted context, where `TextView` won't load app fonts. So `TextArt` typesets brand text (Noto Sans ExtraCondensed, Noto Sans Mono, Thermochrome, Gotham) into alpha-only bitmaps, which are tinted on the home screen. Each one carries its text as a content description. Both widgets use `SizeMode.Responsive` buckets rather than `Exact`. ColorOS reports a landscape size and then draws that layout in portrait, so `Exact` overstated the space. The bucket the host picks never does.
- **Tests.** `WidgetModelTest` covers countdowns, formatting, loan selection and route rules. `ParcelCuesTest` covers Parcel's moods. `WidgetRenderTest` (instrumented) renders every widget and mood to PNGs in the app's external files (`widget-renders/`) for review.

## Latest header/accessibility delivery — 30 October 2026

`verification/header-a11y-checkpoint-20261030.json` records this delivery's exact
artifacts, accepted results, cleanup and installed APK. The native header follows
the website's route order and retains its normal-size composition. Real 48 dp
touch regions no longer overlap; tabs/buttons expose roles and visible keyboard
focus. Large system text uses the wrapping header. Both amber count badges use
the existing black ink (6.85:1 contrast), retain complete numerals and clear at
zero. The unread badge grows without obscuring the bell.

All 24 header scenarios and 24 Campus/offline scenarios pass with real Android
font/display settings and platform Tab/Enter input. The five component/pin/card
checks pass on a separate API 36.1 / 16 KB emulator, including native student/admin
card rendering, drag/flip, reduced motion and lifecycle teardown. A failed component
run caused by another application's concurrent instrumentation is preserved and
excluded from accepted results. No application or assertion change was needed.

The source audit is `verification/header-a11y-source-audit-20261030.md`. Website,
backend, ID-card and logo production sources are preserved. The offline pane's
restored-state label and cancellable seven-second service probe also improve
recovery without changing the screen's design. Current assets match the
repository and debug/release APKs. The delivery checkpoint distinguishes fresh
hosted workflow checks from earlier full regressions and records remaining
TalkBack/Switch Access, full visual/motion, physical performance and production
signing gates. The installable optimized APK is
`app/build/outputs/apk/release/app-release-qa.apk`, signed with the existing debug
certificate for QA. It is not a production-signed release.

## Earlier visual and accessibility follow-up — 28 October 2026

That delivery record is `verification/parity-a11y-checkpoint-20261028.json`.
Campus actions now match the website's black-on-amber primary and paper secondary
labels, with wrapping text, 48 dp minimum targets and visible keyboard focus.
Measured primary contrast improves from 3.07:1 to 6.85:1. Confirmation dialogs use
the source black panel and scrollable content. Headings, offline pane/animation
state and validation feedback expose accessibility semantics. ID-card/brand
production sources and all 72 original assets are unchanged.

The new matrix uses real Android font settings and keyboard events across six
phone, middle, tablet and short-screen configurations at 100/200% system text.
It verifies complete text, reachable controls, status/error semantics, schedule
drafts/validation and dialog cancel/confirm behavior. The original website offline
page is checked separately at 411/640/1024 with 200% browser zoom and reduced motion.

The current checkpoint records the final matrix, hosted Campus flows, pin/card
components, optimized release smoke, unit/lint results, artifact hashes and launch.
The earlier 23-scenario full original-feature regression and SQL suites remain
separate prior evidence; they are not represented as rerun in this visual follow-up.
The current installable APK is `app/build/outputs/apk/release/app-release-qa.apk`;
its current hash is in the delivery record. It uses the existing debug certificate.
Historical checkpoints below identify earlier builds and their hashes.

`verification/parity-a11y-source-audit-20261028.md` explains scope and retained
failures, including test-coordinate/key-injection corrections and an Android
low-memory interruption. Manual TalkBack/Switch Access journeys, remaining visual
states/motion, interrupted uploads, sustained physical-device profiling and
production signing remain open. Automated semantics alone do not establish full
accessibility acceptance.

## Earlier campus and reconnect checkpoint — 28 October 2026

`verification/campus-checkpoint-20261028.json` records the exact artifacts, source
manifest, accepted reports, cleanup and remaining gates. Native Campus now includes
Lost & Found, private claims/admin review, giveaway reservations, collection
conversations/codes/receipts and shared loan/collection scheduling. These surfaces
reuse the hosted development backend and preserve existing lending, chat, profiles,
student/admin ID cards, original fonts, blue/black/amber design and Buddy Brackets.

The custom offline screen uses the original cargo artwork as native vector
animation. The reconnect failure is fixed with application-context network
callbacks, foreground capability polling and repeated HTTPS reachability checks
while routing/DNS recover. A real Wi-Fi/mobile-data loss and restoration test
recreates the activity and resumes the same conversation with its unsent draft.
Collection catch-up also preserves edits made during network requests. Code
plaintext stays in entry-scoped memory through rotation and is never saved to disk.

Accepted checks on the current production sources:

- All three combined hosted native campus workflows pass, including private claim
  review, booking/cancellation, realtime, one-time collection receipts and real
  photo-picker publication/editing. Exact-fixture cleanup preserves existing data.
- The full original-feature regression passes **23 native scenarios and 23
  authenticated checks**, zero skips, in one uninterrupted run. Paired browser
  source captures were not repeated in this run; earlier source comparisons remain
  separate evidence. Direct HTTPS works without the earlier emulator proxy.
- Four component/pin tests and the dedicated student/admin GPU-card test pass,
  including approved logo faces, drag/flip, lifecycle and reduced motion.
- The nondebuggable R8 APK passes native Campus navigation, actual process death
  with a different PID, restored session/chat route/unsent draft, no automatic send,
  exactly-one deliberate original-case message, public profile, moving card and
  sign-out: one black-box test and eight authenticated checks.
- The full debug/release APK/AAB build succeeds; **33 unit tests** pass, and lint
  reports **zero errors/23 advisories**. Both APK variants pass ZIP/ELF 16 KB
  alignment for all sixteen native libraries. All 72 original assets are identical
  between debug and optimized output. Seven rollback SQL suites and the campus
  access/storage/locking/realtime/cron contract pass without a native-phase migration.

Installable optimized QA APK: `app/build/outputs/apk/release/app-release-qa.apk`.
SHA256: `C054A2D2DFE5108C555CEC93CA9DEC40BD7D264577A6DE6B303BA78915755733`.
It uses the existing debug certificate, **not production signing**. This exact APK
is installed/launched on the API 36.1 / 16 KB emulator, with its installed hash
verified and rendered landing screen inspected. No physical phone is connected.
All QA database/media records are absent; the original three profiles, 21 items,
12 locations, 20 demo listings and 39 demo photos remain. The local website server
is restored at `http://localhost:3018`, including the unchanged offline page.

Failed reports and rejected capture diagnostics remain preserved. The existing
Supabase advisory baseline is recorded in `verification/campus-security-summary-20261028.json`
and still needs production review. Complete visual/accessibility/state coverage,
campus process-death and interrupted-upload cases, sustained physical-device
profiling and production signing remain open in `PARITY.md`.

## Earlier pin and recovery checkpoint — 23 October 2026

The 23 October checkpoint is `verification/pin-recovery-checkpoint-20261023.json`.
Pin-dialog tests now wait for the actual focused Android dialog window before
normal synchronized touches. Eleven local cancellation cycles, saved drafts,
restored confirmation and Back dismissal pass. The hosted pin focus passes two
native scenarios/eight authenticated checks, retaining all original placement,
visibility, deletion, item-preservation, permission and audit assertions.
Catalog resize synchronization and moderation fixture isolation are corrected;
all admin widths pass their original 32-total/30-visible queue assertions.

That checkpoint's fresh combined regression was **failed**. One run passed 22 native
scenarios before Android aborted the final owner/tablet test with a system
crash. A fresh emulator-37 run passed fourteen native scenarios, then the host
emulator exited during screenshot export. These reports are preserved; separate
focused passes are not a complete combined pass. After recovery, the owner focus
passes both phone/tablet scenarios and ten authenticated checks with cleanup.
Uninterrupted regression and sustained graphics/device acceptance remain open.

Student/admin cards pass fresh native GPU and website WebGL checks, including
drag/flip, lifecycle/reduced motion, keyboard interaction and approved logo faces.
The user-approved **B — Buddy Brackets** kit remains integrated in web/native
headers, cards/straps, website icons and adaptive/round/themed Android icons.
Existing colours, fonts, layouts, university seal and workflows are retained.
The kit is in `../../Design/borrowbuddy-logo-concepts/kit/`; its unchanged ZIP is
`../../Design/BorrowBuddy-Buddy-Brackets-Logo-Kit.zip`.

The nondebuggable optimized APK passes actual background process reclamation:
a different PID restores authentication, the private-chat route and original-case
unsent draft; recovery never auto-sends the draft, and deliberate sending stores
one message. Its focused run passes one native/eight authenticated checks.
The final build checks pass 28 unit tests (cached for unchanged production
sources) and lint with zero errors/23 advisories, including fresh test-source
analysis. Production APK/AAB hashes remain byte-identical to the brand checkpoint.

The ignored local website configuration now points to the hosted test project.
The website worker retires old authenticated HTML caches and retains the public
offline shell/icons; a real-worker synthetic test verifies private-page isolation
and usable network responses despite cache-storage failures. UI and workflows
are unchanged. Final audits show zero QA rows/images while all twenty demo
listings and thirty-nine hosted images remain. The optimized QA APK is installed
and launched on the API 36.1 16 KB emulator; no physical phone was retested.
Hosted emulator checks use the documented encrypted CONNECT tunnel condition;
the temporary proxy is cleared and its owned tunnel stopped afterward.
Production signing, direct network acceptance and the remaining parity gates stay open.

The earlier chat checkpoint is `verification/chat-checkpoint.json`.
Native chat list/private/community/empty-thread layouts now use measured source
fonts, gutters, line boxes, bubbles, loan chips and composer geometry at
411/640/1024. Source uppercase presentation preserves original-case storage.
IME Send, button send, Enter/Shift+Enter, 2000-character input, history anchors,
rotation, read isolation and reconnect pass. The native empty-list component is
ported and tested separately; existing community rooms prevent an actual empty
browser list without altering user data. Student/admin ID cards remain intact.

The accepted combined run passes **19 native scenarios and 33 authenticated
workflow checks**, with zero skips and targeted cleanup:
`verification/chat-accepted-full-20261021.txt`. The final build passes 25 unit
tests and lint with zero errors/23 advisories. Dedicated student/admin GPU-card
checks and a nondebuggable R8 smoke test pass, including original-case chat stored
exactly once, public profile, moving card and sign-out. The owner tablet test now
starts in a fresh process after setting display geometry, retaining all original
cover/title assertions and phone workflow/draft recreation checks. Earlier failed
resize/input-selector runs remain preserved in the checkpoint.

Installable optimized QA APK: `app/build/outputs/apk/release/app-release-qa.apk`.
It uses the existing debug certificate and is installed/launched on the API 36.1
16 KB emulator; no physical phone was connected for this checkpoint. Debug and
optimized APKs pass ZIP/ELF alignment for all sixteen native libraries, and all
72 debug-APK assets are byte-identical in the optimized build. Production signing
and remaining visual/motion, offline/lifecycle and performance gates stay open.
The final database audit has zero QA rows; the authorized 20 demo listings and
39 hosted images remain. Display/animation settings and QA MediaStore files are
restored/clean. Detailed scope is in `verification/chat-source-audit.md`.

The earlier 21 October public-profile checkpoint is
`verification/public-profile-checkpoint.json`. The native profile now follows the
website identity/badges, reputation stars/review panels, listing grid and empty
states at 411/640/1024 dp, using the original fonts/icons. The student/admin
membership lanyard remains in account and public profiles. Profile queries retain
safe public fields, the twenty-review/twelve-listing windows and full aggregates.

The public-profile build passed 25 unit tests and lint with zero errors/23 advisories.
Dedicated student/admin GPU card checks, the corrected account/ledger regression
and a separate nondebuggable optimized-APK smoke test pass. The optimized QA APK
was installed and launched on the user's Samsung phone at that checkpoint. Its debug certificate is
for local testing; production signing and endgame acceptance remain open.

The public-profile combined suite passed all fifteen native scenarios and thirty authenticated
workflow checks, with targeted fixture cleanup. Its accepted report is
`verification/public-profile-accepted-full-20261021.txt`. Earlier failed and aborted
runs are preserved separately. This passing regression does not close the remaining
whole-app visual, lifecycle, performance and production-signing gates.
The user also authorized twenty persistent demo listings with 39 hosted photos,
verified separately in the website; see `../../supabase/demo-catalog/README.md`.

## Build

Open this directory in Android Studio. Use JDK 17 and install Android SDK 37.
The project pins AGP 9.4.1, Kotlin 2.4.21, Compose BOM 2026.09.00 and Gradle 9.8.1.

Copy `android.local.properties.example` to `android.local.properties` and fill in
the existing Supabase URL and public anon/publishable key. Never supply a service-role
key to this application. The local properties file is ignored by Git.

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

The installable debug APK is `app/build/outputs/apk/debug/app-debug.apk`.
For connected UI tests on an Android 12+ emulator or device:

```powershell
.\gradlew.bat :app:connectedDebugAndroidTest
```

Check the actual completed test count. On the local API 36.1 image, the Gradle
connected runner has reported success with zero tests; the hosted harness below
instead instruments Android user 0 and rejects empty, failed or skipped scenarios.

Local emulator development uses `http://10.0.2.2:54321` for a Supabase stack running
on the host. Only debug builds permit HTTP, limited to the emulator bridge and
loopback addresses. Production requires HTTPS. A physical device can use `adb reverse`
with loopback, or a hosted HTTPS Supabase project.

## Backend compatibility

Apply migrations through `20261015000020_chat_read_tracking.sql` to a staging
database before deploying either updated client. Migration 15 returns availability
windows and busy item IDs without private loan-party data. Migration 16 adds
`confirm_handover_v2`, whose `{ok,error}` result preserves failed-attempt counters
across requests and locks codes after five failures. The legacy confirmation helper
is private to prevent bypassing the limit. Both clients use the new result contract.
Migration 17 supplies reputation aggregates to both clients so a student's completed
loan count is consistent for unrelated viewers while loan records remain private.
Migration 18 moves handover hashes to an inaccessible private schema, migrates existing
codes without changing their validity, and constrains the retired public hash fields
to null. Public API, RPC and realtime loan records cannot contain code hashes. Both
clients select their loan fields explicitly; only authorized code-generation RPCs
return plaintext single-use codes. The SQL regression also verifies cancellation
responses, client/anonymous denial, consumed codes and fixture cascade cleanup.
Migration 19 restricts internal notification, audit, trust-recalculation and waitlist
helpers to trusted execution. Student/admin business RPCs and triggers retain their
authorized internal calls; clients cannot directly forge notifications or audit entries.

Accounts and roles are shared with the website. An account must complete onboarding
and receive admin ID approval before entering the portal. Native code does not
promote accounts or hold server credentials. Provision the initial admin through
trusted server/database access as documented in the root README.

## Production signing

Copy `keystore.properties.example` to the ignored `keystore.properties`, and provide
your keystore path, alias and passwords. Keep the signing key outside the repository.

```powershell
.\gradlew.bat :app:assembleRelease :app:bundleRelease
```

The production APK and AAB are generated under `app/build/outputs`. Without a
production keystore, release outputs are unsigned and are not distribution-ready.
No production signing key has been created or stored by this implementation.

The separate `smoke` Android test module can drive a minified, nondebuggable APK
through UIAutomator in its own process. This avoids linking an unobfuscated Compose
test runtime against renamed production classes. Build it with
`:smoke:assembleRelease`. For local verification only, sign a copy of the unsigned
app APK with the existing Android debug certificate, then set
`BORROWBUDDY_QA_FOCUS=release` and `BORROWBUDDY_QA_MAIN_APK` to that copy when
running the hosted harness. The harness checks the target is nondebuggable, signs
in with an isolated actor, opens private chat, backgrounds and kills the actual
process while retaining its task, and requires a new PID with the session, route
and original-case unsent draft restored. The draft must not be sent automatically;
the later deliberate message must be stored exactly once. Catalog, public profile,
changing GPU card frames and sign-out checks remain. The test module itself is debuggable so failed
captures can be exported. A debug-certificate QA APK is not a production release.

## Goal boundaries

All existing student and admin workflows belong to the parity goal. Push messaging,
camera QR scanning and unfinished roadmap features are deferred until that goal
passes its complete validation gates. QR display and manual code entry are included.

See `PARITY.md` for implementation and verification status. The included converted
fonts and images originate from the existing website; preserve their applicable
licenses when distributing the app.

## Hosted development workflow validation

`tools/test-hosted-workflow.mjs` creates uniquely named confirmed QA accounts,
tests real password auth, private uploads, verification, lending, private chat,
handover lockout, waitlists, reviews, reputation and refresh/logout, then cleans up its own IDs.
Use it only against a development/test database. It requires environment variables
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`BORROWBUDDY_ALLOW_TEST_FIXTURES=1`. Keep service credentials in memory and clear
them afterward; they are never Android app configuration.

Optionally set `BORROWBUDDY_QA_GRADLE` to the Gradle executable and `ANDROID_SERIAL`
to a dedicated emulator to include native session, item, app shell, borrow logbook, two-party lending, verification, moderation, chat and campus pin tests. They cover
live unread badges, encrypted restoration, catalog search, gallery thumbnails,
calendar selection, request dispatch/cancellation, owner approval, decoded QR tickets,
code restoration after rotation, five failed attempts, regeneration, pickup/return and rating.
Verification uses a synthetic PNG in the actual Android photo picker, checks unchanged
uploaded bytes and saved form state, then performs admin document viewing, rejection,
student resubmission and approval. Database checks require the corresponding audit actions.
Moderation seeds three active fixture loans, then files native damage/late/other reports,
selects two actual gallery photos, checks draft restoration and stored bytes, reviews
evidence as admin, resolves/rejects reports and records settlement/waiver of test fines.
As the normal borrower, it also opens each fine's contextual loan, checks the correct
loan title, returns with Android Back, and checks the fine's relative creation time.
The owner desk uses separate verified fixture actors, three listings and ten prior
decisions. It checks rounded trust, draft restoration, trimmed decline, approval and
loan access, actual covers, pause/activate/edit/delete, the loan-history deletion guard,
eight recent decisions, 1024 dp layout/restoration and the empty first-listing flow.
Its source phone/tablet references use the same actors and data. Native owner history
remains accessible below the original website sections.
The account/ledger scenario uses separate verified students and a normally completed
fixture loan. It seeds 52 pending fines plus settled/waived history with distinct
timestamps, checks all 54 personal rows newest first, then verifies the admin's
oldest 50 and replenishment after normal settlement. Those are query-limit fixtures,
not 54 independent lending lifecycles. It also checks restored profile drafts,
invalid-save rejection, Done-key saving, preservation of an existing year-six value,
rounded trust, public-profile/map/loan navigation and a genuinely empty ledger.
With a website URL, source account and populated/empty ledger captures use the same
actors. The native title is compared with the browser's measured heading height;
tablet captures require painted black panel/text pixels rather than page backdrop.
Temporary QA credentials
are supplied as runner arguments, never compiled into the application. The hosted
test is skipped in ordinary connected runs without those arguments.
The harness builds and installs both APKs, then runs instrumentation explicitly as
Android user 0. Set `BORROWBUDDY_QA_ADB` if adb is outside your SDK environment.
It clears only the app on that dedicated emulator between baseline scenarios and runs
each scenario in a fresh process. All nineteen configured tests must pass; zero/failed/skipped tests fail.
Redacted reports are saved in `verification/hosted-native-workflow.txt` and
`verification/hosted-native-handover.txt`, `verification/hosted-native-verification.txt`
and `verification/hosted-native-moderation.txt`, `verification/hosted-native-chat.txt`;
the owner reports are `verification/hosted-native-owner.txt` and
`verification/hosted-native-owner-wide.txt`. Chat presentation reports add
`verification/hosted-native-chat-{phone,medium,wide}.txt` with five state captures
per width. Chat focus runs four native tests, owner focus runs two on an emulator,
and public-profile focus runs three; each focus remains separate from a combined
acceptance run. Separate JSON reports record final loan/verification state without credentials.
`BORROWBUDDY_QA_FOCUS=handover`, `verification`, `moderation`, `chat`, `pins`, `shell`, `catalog`, `logbook`, `owner`, `ledger`, `inbox`, `profile` or `release` runs that native diagnostic scenario
and explicitly reports a focused run. It does not establish full-suite acceptance.
The verification fixture's backend files, accounts and audit entries are cleaned by
created IDs. Its MediaStore image is removed by exact fixture name on the dedicated emulator.
Moderation cleanup also removes only notifications referencing fixture loan IDs, including
notifications delivered to existing admins. Uploaded evidence is limited to the created
borrower's storage prefix; test gallery images are removed by their exact names.

With a local website dev server using the same hosted test project, set
`BORROWBUDDY_QA_WEB_URL` to include source catalog/header captures at 411/1024 CSS pixels,
loan references at 411/768/1024 pixels, populated logbook references at 411/1024 pixels
and dashboard ticket/category/tab references, plus the browser evidence regression
after moderation.
Playwright/Chromium can use `NODE_MODULES_PATH` and `CHROMIUM_EXECUTABLE` as below.
The browser signs in normally, uploads two synthetic photos, changes steps/back,
submits the real Server Action and verifies stored evidence paths. This exercises the
website's persistent evidence field; credentials remain in memory and incident screenshots
are captured only after the report is filed. Catalog/header reference captures use their
own isolated fixture states. The harness owns and cleans the shared fixture.
Separate-process workflow tests do not establish release memory or stability acceptance.

The app-shell scenario creates 62 isolated items and 61 pending requests to verify exact
counts beyond the incoming-request list limit. A second normal student session creates
the next request; the native badge must update through realtime before the polling
fallback. It checks owner approval, notification read events, ticker collapse and rotation
restoration, accessible controls and bounded primary navigation with actual Android Back.
The large fixture is removed before subsequent native scenarios. Redacted results use
`hosted-native-shell`; native captures use `native-shell`. Optional website captures and
measured header bounds/styles use `web-shell`. The browser server must point to the same
hosted project; a local Supabase `.env.local` needs environment overrides for this run.

Catalog validation also covers automatic category/condition/pickup filters, native dates,
saved submitted query and unsent draft, empty/clear states, actual cover decoding and
Indian currency grouping. On a dedicated emulator, the runner temporarily changes display
size/density for the source three-column layout and restores the previous overrides in
`finally`. Matching source browser captures use the same actor/item. The fixture generator
`tools/qa-image.mjs` creates a valid 2×2 synthetic PNG; no original student image is used.
`HostedNetworkDiagnostic` is a separate opt-in, fixture-free Android HTTPS check using
`qaNetworkCheck=1`; it is not one of the nineteen functional scenarios.

The lending scenario also checks the source loan facts and human status labels,
completed/pending custody steps and the role-aware logbook link. On a dedicated emulator,
it verifies two/four fact columns at 768/1024 dp and restores the previous display overrides.
`native-loan` captures document facts, returned state and the full visible timeline;
optional `web-loan` references use the same returned loan and borrower, including a saved
rating. Responsive browser measurements wait for layout frames and assert current styles.

The logbook scenario creates five workflow listings plus 121 synthetic historical
listings/returned loans, with loans in both directions. It verifies the source's
independent 60-row cap per role, preserves an older lending loan behind more than 120
borrower records, excludes out-of-cap history and checks cross-profile RLS filtering.
Historical records are directly seeded only in the authorized test database; this is
query-limit evidence, not 121 completed UI handover workflows. Request insert guards
remain enabled. Exact fixture IDs bound all historical status updates and bulk cleanup.
The scenario also
checks the lending-out section, role-aware loan navigation, pending cancellation,
notified waitlist dates, a real calendar-based waitlist join, both leave actions,
rotation, the fine-policy notice and an empty verified student's browse link. The
listings are removed before subsequent scenarios. Its separate empty account is
removed during final fixture cleanup. Reports/captures use `hosted-native-logbook`,
`native-logbook` and, with the optional website URL, `web-logbook`.

The same scenario validates dashboard counts, lending selection, loan/category
navigation, restoration after Back/recreation and the four-column category grid.
`native-dashboard` and `web-dashboard` files hold scoped references; complete visual
acceptance still requires additional states and screen/font sizes.
Resized dashboard and loan references use Android compositor screenshots, with exact
display dimensions and painted-pixel checks cropped to the asserted content. These
captures include system bars. Grid/navigation checks and actual QR decoding remain
required. `verification/dashboard-checkpoint.json` preserves the earlier dashboard
checkpoint; `verification/owner-chat-checkpoint.json` preserves the subsequent owner/
chat checkpoint. The latest passing combined result is `verification/account-ledger-checkpoint.json`:
eleven native scenarios, 25 authenticated workflow checks and targeted fixture cleanup
passed on 18 October. All 17 unit tests pass; lint has zero errors and 19 advisories.
The signed debug APK also passes ZIP/ELF 16 KB alignment checks for all 16 native
libraries. The checkpoint records the exact APK hash and remaining production gates;
it does not certify complete visual parity, sustained stability or production signing.
The same application APK then passed an account/ledger focus with stronger compositor
checks: the expected black panel/text and blue backdrop outside both horizontal edges
must be present. Rejected loading/phone-scale tablet captures remain preserved. The
checkpoint distinguishes the combined instrumentation APK from this test-only follow-up.

`AccountTypographyTest`, enabled with `qaAccountTypography=1`, separately exercises
the actual title style against browser-measured phone/tablet line boxes. It uses no
hosted fixtures and is separate from the combined native workflow scenarios. The hosted
account test also compares its tablet heading to a fresh browser measurement.

`DashboardMotionTest` is a separate opt-in component test. On a dedicated emulator,
instrument class `in.borrowbuddy.android.DashboardMotionTest` with runner argument
`qaDashboardMotion=1`. It checks actual overdue-badge pixel changes, background pause
and reduced motion, temporarily changes the emulator animation scale and restores it
in `finally`. It does not use hosted accounts and is separate from the combined
native scenarios. Reports/captures use `dashboard-motion` and `native-dashboard-pulse`.

## Dependency and APK packaging audits

From the repository root, `node apps/android/tools/audit-stable-dependencies.mjs`
compares ten pinned library versions with upstream Google Maven/Maven Central metadata.
It writes `verification/stable-dependencies.json` and fails on a mismatch or failed fetch;
it does not modify dependency pins automatically.

Run `apps/android/tools/audit-apk-packaging.ps1 -Zipalign <SDK/build-tools/version/zipalign.exe>`
in PowerShell to verify the built debug APK's 16 KB ZIP alignment and native ELF load
alignment. Supply `-Apk` to inspect another APK. The report is `verification/apk-packaging.json`.
Use the SDK's `apksigner verify --verbose <APK>` separately to verify its signature.
Debug signing and packaging checks do not establish production signing or device performance.

## Further hosted scenarios

Chat fixtures include tied timestamps across history pages, a quiet private channel and
a community channel with over 300 messages. The native scenario requires UI sends,
filtered realtime delivery, draft/history retention after recreation, background catch-up,
read-cursor suspension and a socket disconnect/rejoin. Remote writes use a second normal
password session. Community rooms and their messages are cleaned by the created room ID.
Both clients require migration 20's per-channel message-head RPC. Community read tracking
creates only the reader's cursor; private membership and verified-student gates remain enforced.

Campus pin validation uses a uniquely named pin and an isolated admin-owned item. It
requires native tap/drag/numeric placement, coordinate validation and rotation, edits,
hide/restore behavior, student map counts and catalog routes, cancellation/rotation of
deletion confirmation, safe item unlinking and audit actions. Anonymous/student admin
RPC calls and direct student table writes must be rejected. Cleanup resolves only this
run's exact unique fixture names, then deletes by their returned IDs. Original pins are
never edited. Reports and map screenshots use the `hosted-native-pins`/`native-map` prefixes.

The pin focus and full suite also include `PinDialogTest`, with eleven local
cancellation cycles, retained drafts, restored confirmation and system Back.
Dialogs wait for a focused Android window before normal synchronized Compose
touches. For a standalone run, instrument `in.borrowbuddy.android.PinDialogTest`
with `-e qaPinDialog 1`; no hosted credentials or database writes are needed.

On this host, multiple SDK installations contain different emulator binaries.
Select `D:/Android/sdk/emulator/emulator.exe` explicitly and check `-version`
before starting QA. The 23 October recovery uses emulator 37.2.12 with the API
36.1 16 KB image under `C:/Users/minia/AppData/Local/Android/Sdk`; the SDK used
for building does not determine which emulator executable a shell launches.
The interrupted run on emulator 36.4.9 is retained separately in the checkpoint.

On this Windows host, the verified rendering configuration uses stable emulator
37.2.12 with `-gpu host` and default Vulkan support. Older 36.4.9 produced black app
and Settings surfaces; software backends also terminated the emulator. The session
test and map captures now reject uniform/black output. Keep pixel captures as part
of validation, since successful semantics/API assertions alone cannot prove rendering.
The newer emulator enforces 2560 MB RAM despite `-memory 2048`; the current seven-case
functional pass does not close the separate 2 GB/release memory stability gate.

Portal subscriptions request replication readiness and wait for the server's `system`
acknowledgement before reporting ready. They refresh at that point to recover updates
between socket join and replication startup, and retry on channel status loss. This
addresses the join/listener timing gap described in the
[Supabase troubleshooting guide](https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting).
The native realtime test requires actual delivered notification/membership events;
an initial refresh or polling alone cannot satisfy it.

## Native device asset pipeline

`tools/export-device.mjs` exports the website's actual Drei rounded-box geometry and
canvas screen/grille/shadow painters to `app/src/main/assets/models/cargo-device.glb`.
The Android runtime renders the asset using Filament, with Kotlin animation and
gesture handling; no browser or JavaScript runtime is embedded in the application.

To regenerate the model, start the website dev server from the repository root,
then run `node apps/android/tools/export-device.mjs` from that root. Playwright and
a Chromium executable are required for the original canvas painters; provide
`NODE_MODULES_PATH` and `CHROMIUM_EXECUTABLE` if they are installed outside the repo.
`--reuse-textures` regenerates geometry using the already exported original PNG
textures, without starting a browser. Lighting/detail fidelity remains under review.

## Native conveyor asset pipeline

Run `node apps/android/tools/export-conveyor.mjs` from the repository root. It uses
Playwright/Chromium (the same optional runtime environment variables above) and
the website's actual installed QR painter and fonts; no website dev server is needed.
Station and belt geometry is evaluated directly from the original JSX at build time.
Both 12-unit phone and 24-unit wide scenes use 64 original painted texture files for
gate phases, signs, curtains, hazard tape, belt, parcel fronts/backs/stamps and trust chip.
Each GLB embeds only its 16 initial textures. Changing signs/parcel faces decode on
a single background worker; replaced GPU textures are released instead of retaining
all variants. At most ten dynamic face/sign textures remain owned by a renderer.
The exported node manifest drives initial visibility without running JavaScript on Android.

`ConveyorMotion` ports the 10.61-second cycle, cubic travel, four scans, custody flips,
parcel rotation, scan line and trust-chip timing. `CargoConveyorView` renders the assets
with Filament and pauses when offscreen/background or reduced motion is enabled.
Connected renderer tests cover a complete cycle, background suspension, navigation
removal and the reduced-motion scene. Full visual acceptance, volumetric/additive
lighting, resource profiling and tablet comparisons are still required.

The native station controller now ports the source LED chase/green sweep, scanner
pulses, curtain quiver/push/settle, sonar rings, strobes, beam sweep and stamp recoil.
Source refs become stable exported node names. Belt scrolling updates gltfio's
`baseColorUvMatrix` using the row-vector layout in the
[Filament material shader](https://github.com/google/filament/blob/main/libs/gltfio/materials/base.mat.in).
Material setup waits for asynchronous resource creation; borrowed gltfio instances
do not necessarily expose a Java `Material` wrapper.

`ConveyorPlayback` lives above the lazy landing items and saves the active clock,
four gate counts and last counted gate. Counts animate on discrete scans; the live
indicator uses the original blink intervals with lifecycle/reduced-motion handling.
The queue header, captions, responsive section sizing and counter row follow the
website. Full-scene screenshot comparison remains an acceptance gate.
The scene uses the source's 8% top/bottom alpha mask and elliptical hall vignette;
the native pixel check verifies that the top edge reveals the page backdrop.

## Chat scrolling validation

`ThreadScrollTest` is a separate fixture-free chat regression, enabled with
`qaThreadScroll=1` and class `in.borrowbuddy.android.ThreadScrollTest`. It exercises
the production scroll controller through appends, keyboard-like viewport changes,
older-history reading and saved-state restoration. The controller waits for layout
before following new messages, and late history restoration cannot replace a newer
send/receipt position. This component test is separate from the combined hosted scenarios.
`verification/chat-scroll-before-fix.txt` and `chat-scroll-after-fix.txt` retain the
reproduced failure and corrected result. Real activity recreation while reading old
messages is also checked in `HostedChatTest`.

## Native landing motion

The tag wall ports the website's eight records, portrait generator, barcode sequence,
overlap, perspective, spring parameters, one-second advance and six-second interaction
pause. Swipe, arrows and hardware keyboard navigation work natively. Animation stops
offscreen, in the background and when Android animations are disabled. Portrait memory
is bounded by a 4 MB cache. The fixed backdrop uses the original screen blend and vignette.

The opening caption uses the source's 1.1-second hold and 0.5-second exit; controls stay
hidden from accessibility until opening completes. The thermal ticker reuses the eight
blurbs, 42-second loop and Lucide plane path. It pauses offscreen, in the background,
under reduced motion and during hover/hold, and culls offscreen text while drawing.

`verification/landing-motion-api36.txt` records the connected landing suite.
The website/native tag screenshots document visual comparison, not full parity approval.
`tools/capture-tag-wall.mjs` regenerates the website reference with a running dev server.
