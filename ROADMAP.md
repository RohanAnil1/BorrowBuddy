# BorrowBuddy feature roadmap

Updated 30 October 2026. Campus Commons was implemented and verified on the website
first. Native Android campus and offline support is implemented. The three combined
campus workflows, actual offline/reconnect draft recovery, 23-scenario original-feature
regression and optimized-release smoke now pass; full parity acceptance remains open.
The native visual/accessibility follow-up adds source-colour Campus controls,
keyboard focus, large-text confirmation reflow and screen-reader semantics.
The header follow-up now preserves source navigation order, adds real 48 dp touch
regions without overlap, exposes tab/button roles and keyboard focus, and adapts
the original header for large system text. Count badges retain complete numerals,
high contrast and the visible bell. The offline pane announces connection recovery,
and its service probe now has a cancellable seven-second total deadline. All 38
unit tests pass, including five timeout/cancellation/transport checks.
All 48 header/Campus/offline visual-accessibility scenarios and five pin/card/
component checks pass. Current reports, fresh hosted regressions and APK hashes
are in the [30 October delivery checkpoint](apps/android/verification/header-a11y-checkpoint-20261030.json).
Manual screen-reader journeys, remaining visual states and physical release
profiling remain open.

## Website delivery: Campus Commons

- Campus Lost & Found: private ownership claims and finder notes, independent
  admin review, revocation/moderation, collection chat and one-time-code receipts.
- Semester Giveaway Shelf: photo listings, atomic 24/48/72-hour reservations,
  authoritative deadlines, cancellation/expiry and private collection receipts.
- Handover scheduling: weekly hours, date replacements/blocked days, 15/30/60-minute
  slots, conflict protection for both participants across loans and collections,
  rescheduling and cancellation. Existing loan codes work without appointments.
- Custom offline page: original fonts/brand, animated cargo illustration,
  pause/reduced-motion controls, connection checks and original-page recovery.

Implementation and verification are documented in [CAMPUS.md](CAMPUS.md).
The hosted development backend receives additive migrations; existing inventory,
accounts, student/admin ID cards, logo and lending workflows are preserved.

## Remaining endgame goal

Complete the native Kotlin/Compose Android application with all website features,
UI/UX, animations and workflows, including the ID cards and Buddy Brackets logo.
The native Campus surfaces include private claims/admin review, photo listings,
giveaway reservations, collection conversations/codes/receipts, availability,
appointments and distinct notification destinations. The offline screen uses
native vector animation, pause/reduced motion, a live reachability check and route
and draft preservation. The [parity tracker](apps/android/PARITY.md) retains the original open
visual, broader lifecycle/device stress and production signing gates. The updated
optimized QA APK is built and running on the connected API 36.1 / 16 KB emulator;
no physical phone was connected for this checkpoint. The exact reports and hashes
are in [the 30 October checkpoint](apps/android/verification/header-a11y-checkpoint-20261030.json).
Website delivery and these native test passes do not close the remaining gates.

## Deferred features

These three features remain queued for after the complete Android parity goal.
They are not started or scheduled.

## 1. Borrow Circles

Clubs, hostels and project teams get shared inventory spaces with membership
controls and designated equipment managers.

**MVP:** invite-only circles, member inventory and existing borrowing rules.

**Status:** queued for later.

## 2. Authorized Buddy Pickup

A borrower can nominate someone to collect or return an item. The lender sees
who is authorized, and the custody record identifies the actual person.

**MVP:** one delegate per handover with separate confirmation credentials.

**Status:** queued for later.

## 3. Campus Impact Dashboard

Show completed shares, equipment utilization and estimated purchases avoided.
Clearly label estimates and explain their calculation.

**MVP:** personal and aggregate campus statistics from completed loans.

**Status:** queued for later.
