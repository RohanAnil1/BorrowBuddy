<div align="center">

<img src="apps/web/public/icons/icon-192.png" width="96" alt="BorrowBuddy Buddy Brackets mark" />

# BorrowBuddy

**Borrow it from campus, not from the shop.**

A peer-to-peer lending desk for verified Bennett University students. List what you own,
borrow what you need, and hand things over with one-time codes, instead of chasing
favours through WhatsApp groups.

[**Open the website**](https://borrow-buddy-web.vercel.app) ·
[**Get the Android app**](https://github.com/RohanAnil1/BorrowBuddy/releases) ·
[Roadmap](ROADMAP.md) · [Campus features](CAMPUS.md)

</div>

---

## What it does

| | |
| --- | --- |
| **Catalog and requests** | Browse what students lend, filter by category, condition, pickup spot and dates, save items and request a date range. Owners accept or decline from their lending desk. |
| **Secure handovers** | Pickup and return are confirmed with six-digit one-time codes or a QR scan. Codes lock after five wrong tries and their hashes never leave the database. |
| **Loans that look after themselves** | Due dates, extensions, reminders, late fines, damage and incident reports, and admin dispute handling. |
| **Reputation** | Reviews, a trust score and a student ID card with earned stamps. |
| **Chat and notifications** | Per-loan chat with unread tracking, a live notification inbox and optional email. |
| **Campus Commons** | Lost & Found with private ownership claims, semester giveaways, handover scheduling and a campus map. |
| **Buddy** | An in-app assistant that knows your loans and the catalog. |
| **Works offline** | A custom offline screen that checks the connection and returns you to where you were. |

Only verified students get in. You sign up with an `@bennett.edu.in` email, then an admin checks your student ID.

## Three ways to use it

| | How | Notes |
| --- | --- | --- |
| 🌐 **Website** | Go to **[borrow-buddy-web.vercel.app](https://borrow-buddy-web.vercel.app)** | Works in any modern browser, on desktop and on phones. |
| 🤖 **Android app** | Download the latest `BorrowBuddy-v…-qa.apk` from [GitHub Releases](https://github.com/RohanAnil1/BorrowBuddy/releases) and open it on your phone | A native Kotlin/Compose app for Android 12+, with home-screen widgets (including one starring Parcel, the mascot). These are QA pre-releases (see [Releases](#releases)). |
| 🍎 **iPhone** | Open the website in **Safari**, tap **Share → Add to Home Screen** | Opens full-screen with its own icon and launch screen, clear of the notch and home bar. |

All three use the same accounts and the same live data.

## Repository layout

An npm-workspaces monorepo. The web and Android apps are separate clients of one Supabase backend.

```
BorrowBuddy/
├── apps/
│   ├── web/          Next.js 16 (App Router, React 19, Tailwind 4) website, PWA and Buddy API
│   └── android/      Native Kotlin + Jetpack Compose app, home-screen widgets, QA tooling
├── packages/
│   └── shared/       @borrowbuddy/shared: types, constants, zod schemas, campus date and brand helpers
├── supabase/
│   ├── migrations/   Postgres schema, row-level security, RPCs and scheduled jobs
│   ├── tests/        SQL regression suites (privacy, handover limits, chat, extensions…)
│   ├── seed.sql      Categories, pickup spots and impact rates
│   └── demo-catalog/ Scripts for the demo inventory
├── ROADMAP.md        Feature roadmap
└── CAMPUS.md         Campus Commons design and verification
```

### Web (`apps/web`)

- Next.js **16.3** with the App Router, React **19.2**, Tailwind CSS **4**, `@supabase/ssr`.
- Motion and 3D from GSAP, Motion and react-three-fiber. Heavy 3D loads only when idle or in view.
- An installable PWA (manifest, iPhone startup images, safe areas) with a self-contained `/offline` page.
- Server routes: `/api/assistant` (Buddy; Gemini, Groq or a local fallback), `/api/cron/notification-emails` (email through Resend), `/api/health` and `/api/loans/[id]/calendar` (loan calendar file).

### Android (`apps/android`)

- Kotlin **2.4**, Jetpack Compose (BOM **2026.09**), AGP **9.4**, `minSdk 31` (Android 12), `targetSdk 37`.
- Talks to Supabase directly through **supabase-kt 3.8** (Auth, PostgREST, Storage, Realtime). The session is encrypted with a key held in Android Keystore.
- The same Campus Cargo look as the website: the brand fonts, the Buddy Brackets mark, a Filament-rendered 3D ID card and the conveyor landing.
- **Home-screen widgets** (Jetpack Glance). There are three picker entries:
  - **Boarding pass** (4x2, resizable to 4x3). Shows your next loan due back: the item, borrowing or lending, who it's with, and a live countdown such as `[ DUE IN 2 DAYS ]`. Below that are tiles for pending requests, unread chats and fines, each opening its screen. **Browse →** jumps to the catalog.
  - **Next return** (2x2). Shows the countdown, the item and your two most urgent counts.
  - **Parcel** (2x2, stretches to 4x2). Parcel, the mascot, with a speech bubble about your loans. It sleeps when you're signed out, waves when a return is close, looks worried when something is overdue, and bursts with brackets when there's news.

  WorkManager refreshes the widgets hourly and whenever you leave the app. It keeps working offline: it shows the last-known data, countdowns keep ticking, and it marks itself `OFFLINE · 3H AGO`. Tap that label to refresh. When you're signed out, it asks you to sign in.
- Setup details, the backend compatibility notes and the QA/verification history are in [apps/android/README.md](apps/android/README.md) and [PARITY.md](apps/android/PARITY.md).

## Local setup

**You need:** Node.js 20+ (CI uses 22) and npm, plus the [Supabase CLI](https://supabase.com/docs/guides/cli) for a local database. For Android you also need JDK 17 and Android SDK 37 (Android Studio works).

### Database

```bash
npm install
npm run db:start      # local Supabase stack in Docker
npm run db:reset      # apply supabase/migrations and seed.sql
```

> `npm run db:push` applies migrations to the **linked hosted project**. Only run it on purpose.

### Website

Create `apps/web/.env.local` (git-ignored):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase status`>
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=<service-role key; server only>

# Optional
ADMIN_EMAIL=you@bennett.edu.in        # becomes admin + verified on first sign-in
RESEND_API_KEY=                       # notification emails
NOTIFICATIONS_FROM_EMAIL=
CRON_SECRET=                          # shared secret for /api/cron/*
ASSISTANT_PROVIDER=                   # gemini | groq | local (defaults to whichever key is set)
GEMINI_API_KEY=
GROQ_API_KEY=
```

```bash
npm run dev           # http://localhost:3000
```

### Android

```bash
cd apps/android
cp android.local.properties.example android.local.properties
```

Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public values only; never a service-role key). Set `BORROWBUDDY_WEB_URL` to the website that serves Buddy. For example, `https://borrow-buddy-web.vercel.app`, or leave it blank for `http://localhost:3000` through `adb reverse tcp:3000 tcp:3000`. Environment variables of the same name override the file.

```bash
./gradlew :app:assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:installDebug         # onto a connected phone
```

Debug builds may use plain HTTP only for the emulator bridge (`10.0.2.2`) and loopback. Everything else needs HTTPS. To add a widget, long-press the home screen, open **Widgets → BorrowBuddy**, and drag out **Boarding pass**, **Next return** or **Parcel**.

## Testing and CI

| Check | Command | Runs in CI |
| --- | --- | --- |
| Web lint | `npm run lint` | ✅ `CI / web` |
| Web typecheck | `npm run typecheck` (`next typegen && tsc --noEmit`) | ✅ `CI / web` |
| Web build | `npm run build` | ✅ `CI / web` |
| Database | migrations + `seed.sql` on Postgres 17, then every `supabase/tests/*.sql` suite | ✅ `CI / database` |
| Android | `./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest` | ✅ `Android / build` (uploads the debug APK and reports) |
| Android UI | `./gradlew :app:connectedDebugAndroidTest` (needs a device) | Local only |

The `Android` workflow runs only when `apps/android/**` changes. Browser and device end-to-end scripts are in `apps/web/tools` and `apps/android/tools`.

## Releases

Android builds ship as **GitHub pre-releases** named `vX.Y.Z`. Each one attaches a single `BorrowBuddy-vX.Y.Z-qa.apk`.

- **QA builds are debug-signed.** They install over the previous QA build and keep you signed in. They aren't production-signed, so a future production release will need the QA app uninstalled first.
- The latest is **[v0.4.0](https://github.com/RohanAnil1/BorrowBuddy/releases/tag/v0.4.0)** (version code 6, Android 12+). Its notes list the APK's SHA-256 and the website it talks to.
- To cut one, bump `versionCode`/`versionName` in `apps/android/app/build.gradle.kts` in its own PR. Build with `BORROWBUDDY_WEB_URL=https://borrow-buddy-web.vercel.app`, then publish the APK as a pre-release.
- A production-signed build needs a `keystore.properties` (see `keystore.properties.example`). None is stored in this repository.

The website is hosted on Vercel at [borrow-buddy-web.vercel.app](https://borrow-buddy-web.vercel.app).

## More reading

- [ROADMAP.md](ROADMAP.md): what's shipped and what's next
- [CAMPUS.md](CAMPUS.md): Lost & Found, giveaways and handover scheduling
- [apps/android/README.md](apps/android/README.md): Android build, backend compatibility, signing and QA history
- [apps/android/PARITY.md](apps/android/PARITY.md): web-to-Android parity tracker
