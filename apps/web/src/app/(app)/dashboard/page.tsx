import { AlarmClock, ArrowRight, Inbox, MessagesSquare, Receipt, Sprout } from "lucide-react";
import Link from "next/link";
import { CategoryGrid } from "@/components/app/category-grid";
import { DashboardTabs } from "@/components/app/dashboard-tabs";
import { GettingStarted, ParcelGreeting, QuickActions } from "@/components/app/dashboard-today";
import { EmptyState } from "@/components/app/empty-state";
import { ItemCard } from "@/components/app/item-card";
import { LoanBoardingPass, type BoardingPassLoan } from "@/components/app/loan-boarding-pass";
import { formatMoney, loanStatusLabel } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getUnreadMessageCount } from "@/lib/data/chat";
import { getOutstandingTotal } from "@/lib/data/fines";
import { getCategories, getMyItems, searchItems } from "@/lib/data/items";
import { getLoansForUser, type LoanSummary } from "@/lib/data/loans";
import { getPendingRequestCount } from "@/lib/data/requests";
import { getSavedItemIds, savedState } from "@/lib/data/wishlist";
import { getPendingExtensionLoanIds } from "@/lib/data/extensions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

const CLOSED = ["returned", "cancelled", "lost"];

/** Today's date on campus (IST), so "due soon" matches what students see. */
function campusToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 5) return "LATE SHIFT";
  if (hour < 12) return "GOOD MORNING";
  if (hour < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

function toPass(loan: LoanSummary, viewerId: string): BoardingPassLoan {
  return {
    id: loan.id,
    title: loan.item.title,
    status: loan.status,
    statusLabel: loanStatusLabel(loan.status),
    ownerName: loan.owner.full_name,
    borrowerName: loan.borrower.full_name,
    role: loan.borrower_id === viewerId ? "borrowing" : "lending",
    pickupSpot: loan.item.pickup_location?.name ?? null,
    startDate: loan.start_date,
    dueDate: loan.due_date,
  };
}

export default async function DashboardPage() {
  const profile = await requireVerified();
  const [{ asBorrower, asOwner }, categories, pendingRequests, unread, owed, myItems, fresh, savedIds] = await Promise.all([
    getLoansForUser(profile.id),
    getCategories(),
    getPendingRequestCount(profile.id),
    getUnreadMessageCount(profile.id).catch(() => 0),
    getOutstandingTotal(profile.id),
    getMyItems(profile.id),
    searchItems({ limit: 12 }),
    getSavedItemIds(profile.id),
  ]);

  const today = campusToday();
  const soon = addDays(today, 2);
  const openBorrowing = asBorrower.filter((loan) => !CLOSED.includes(loan.status));
  const openLending = asOwner.filter((loan) => !CLOSED.includes(loan.status));
  const dueSoon = openBorrowing.filter((loan) => loan.status === "overdue" || loan.due_date <= soon).length;

  const inMotion = [...openBorrowing, ...openLending]
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 8);
  const pendingExtensions = await getPendingExtensionLoanIds(inMotion.map((loan) => loan.id));
  const passes = inMotion.map((loan) => ({ ...toPass(loan, profile.id), extensionPending: pendingExtensions.has(loan.id) }));

  const justListed = fresh.filter((item) => item.owner_id !== profile.id).slice(0, 8);

  const needs = [dueSoon, pendingRequests, unread, owed].filter((value) => value > 0).length;
  const firstName = profile.full_name.split(" ")[0];
  const line =
    needs === 0
      ? `All clear, ${firstName}. Want to lend something today?`
      : `${needs} ${needs === 1 ? "thing needs" : "things need"} you today. Tap me if you get stuck.`;

  const strip = [
    { href: "/my/borrows", label: "Due soon", value: String(dueSoon), hint: dueSoon ? "Return in the next 2 days" : "Nothing due", icon: AlarmClock, hot: dueSoon > 0 },
    { href: "/my/items", label: "Requests", value: String(pendingRequests), hint: pendingRequests ? "Waiting for your answer" : "No one waiting", icon: Inbox, hot: pendingRequests > 0 },
    { href: "/chat", label: "Unread", value: String(unread), hint: unread ? "New messages" : "Inbox zero", icon: MessagesSquare, hot: unread > 0 },
    { href: "/fines", label: "Fines", value: formatMoney(owed), hint: owed ? "Settle with an admin" : "Clean ledger", icon: Receipt, hot: owed > 0 },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="status-bracket text-[11px]">[ {greeting()} ]</p>
          <h1 className="type-title mt-2 text-[2rem] dt:text-[2.5rem]">{firstName}&apos;s lending desk</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="border border-accent/60 bg-accent/10 px-3 py-1.5 font-secondary text-[11px] text-accent">
              TRUST SCORE {Math.round(profile.trust_score)}
            </span>
            <span className="border border-line px-3 py-1.5 font-secondary text-[11px] text-ink/75">[ ID VERIFIED ]</span>
          </div>
        </div>
        <ParcelGreeting line={line} mood={needs === 0 ? "happy" : "wave"} />
      </div>

      <section aria-label="Today" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {strip.map(({ href, label, value, hint, icon: Icon, hot }) => (
          <Link
            className={cn(
              "group relative flex flex-col gap-2 border bg-panel p-4 transition-colors hover:border-accent",
              hot ? "border-accent/60" : "border-line",
            )}
            href={href}
            key={href}
          >
            <span className="flex items-center justify-between">
              <span className="font-secondary text-[11px] uppercase text-ink/75">{label}</span>
              <Icon className={cn("size-4", hot ? "text-accent" : "text-ink/50")} />
            </span>
            <span className={cn("type-title text-[2rem] leading-none", hot ? "text-accent" : "text-ink")}>{value}</span>
            <span className="text-[12px] normal-case text-ink/65">{hint}</span>
            {hot && <span aria-hidden className="absolute right-3 top-3 size-2 animate-pulse rounded-full bg-accent" />}
          </Link>
        ))}
      </section>

      <div className="mt-6">
        <GettingStarted
          hasAvatar={Boolean(profile.avatar_path)}
          hasBorrowed={asBorrower.length > 0}
          hasListing={myItems.length > 0}
          userId={profile.id}
        />
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-secondary text-[12px] uppercase text-ink/75">Loans in motion</h2>
          <Link className="font-secondary text-[11px] uppercase text-accent hover:underline" href="/my/borrows">
            Full logbook →
          </Link>
        </div>
        <div className="mt-4">
          {passes.length === 0 ? (
            <EmptyState
              action={
                <Link className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white hover:opacity-90" href="/home">
                  Browse the shelf <ArrowRight className="size-4" />
                </Link>
              }
              body="When you borrow or lend something, its boarding pass shows up here with a live countdown."
              code="NOTHING IN TRANSIT"
              compact
              mood="sleepy"
              title="No loans on the move"
            />
          ) : (
            <div className="-mx-4 flex rail-scroll snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 pt-1">
              {passes.map((pass) => (
                <LoanBoardingPass key={pass.id} loan={pass} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-secondary text-[12px] uppercase text-ink/75">Quick actions</h2>
        <div className="mt-4">
          <QuickActions />
        </div>
      </section>

      {justListed.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-secondary text-[12px] uppercase text-ink/75">Just listed</h2>
            <Link className="font-secondary text-[11px] uppercase text-accent hover:underline" href="/home">
              See all →
            </Link>
          </div>
          <div className="-mx-4 mt-4 flex rail-scroll snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
            {justListed.map((item) => (
              <div className="w-60 shrink-0 snap-start" key={item.id}>
                <ItemCard item={item} saved={savedState(savedIds, item.id)} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-secondary text-[12px] uppercase text-ink/75">Quick search</h2>
        <div className="mt-4">
          <CategoryGrid categories={categories} />
        </div>
      </section>

      <Link
        className="group mt-10 flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-5 transition-colors hover:border-accent"
        href="/impact"
      >
        <span className="flex items-center gap-3">
          <Sprout className="size-5 text-accent" />
          <span>
            <span className="block font-strong text-[13px] uppercase">Campus impact</span>
            <span className="mt-0.5 block text-[12px] normal-case text-ink/65">See what sharing has saved campus, and your part in it.</span>
          </span>
        </span>
        <ArrowRight className="size-4 text-accent transition-transform group-hover:translate-x-1" />
      </Link>

      <section className="mt-10">
        <h2 className="font-secondary text-[12px] uppercase text-ink/75">Your movements</h2>
        <div className="mt-4">
          <DashboardTabs borrowing={openBorrowing} lending={openLending} />
        </div>
      </section>
    </div>
  );
}
