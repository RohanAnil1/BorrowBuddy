# BorrowBuddy web

The BorrowBuddy website, PWA and Buddy API. It runs on Next.js 16 (App Router), React 19 and Tailwind CSS 4, on Supabase.
Live at **[borrow-buddy-web.vercel.app](https://borrow-buddy-web.vercel.app)**. On an iPhone, open it in Safari and tap
**Share → Add to Home Screen**.

For what the product does, the monorepo layout and the full environment-variable list, see the [root README](../../README.md).

## Run it

From the repository root:

```bash
npm install
npm run dev          # http://localhost:3000
```

It needs `apps/web/.env.local` with at least `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. Without the Supabase keys the app starts, but it can't sign anyone in.

## Check it

```bash
npm run lint --workspace @borrowbuddy/web
npm run typecheck --workspace @borrowbuddy/web   # next typegen && tsc --noEmit
npm run build --workspace @borrowbuddy/web
```

CI runs all three on every pull request. Browser end-to-end scripts are in [`tools/`](tools).

## Where things live

| Path | What |
| --- | --- |
| `src/app/(app)/` | Signed-in portal: browse (`home`), dashboard, items, loans, chat, campus, map, fines, admin, Buddy |
| `src/app/login`, `signup`, `onboarding`, `pending` | Sign-up and student ID verification |
| `src/app/offline` | The self-contained offline page |
| `src/app/api/assistant` | Buddy (Gemini, Groq or a local fallback, chosen by `ASSISTANT_PROVIDER`) |
| `src/app/api/cron/notification-emails` | Email delivery, called by the database scheduler with `CRON_SECRET` |
| `src/app/api/loans/[id]/calendar` | A loan's due date and appointments as an `.ics` file |
| `src/lib/env.ts` / `env-client.ts` | Validated server and browser configuration |

Shared types, schemas and campus date rules come from [`@borrowbuddy/shared`](../../packages/shared). The native
Android app in [`apps/android`](../android) uses the same Supabase project, and it calls this app's `/api/assistant`
for Buddy.
