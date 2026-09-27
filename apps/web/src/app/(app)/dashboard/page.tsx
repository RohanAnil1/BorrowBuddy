import Link from "next/link";
import type { TickerLoan } from "@/components/app/loans-ticker";
import { CategoryGrid } from "@/components/app/category-grid";
import { DashboardTabs } from "@/components/app/dashboard-tabs";
import { LoansTicker } from "@/components/app/loans-ticker";
import { formatDate } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getLoansForUser } from "@/lib/data/loans";
import { getCategories } from "@/lib/data/items";

export const metadata = { title: "Dashboard" };

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "LATE SHIFT";
  if (hour < 12) return "GOOD MORNING";
  if (hour < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

export default async function DashboardPage() {
  const profile = await requireVerified();
  const [{ asBorrower, asOwner }, categories] = await Promise.all([
    getLoansForUser(profile.id),
    getCategories(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  const ticker: TickerLoan[] = [...asBorrower, ...asOwner]
    .filter((loan) => !["returned", "cancelled", "lost"].includes(loan.status))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 8)
    .map((loan) => {
      const overdue = loan.status === "overdue" || loan.due_date < today;
      const dueToday = loan.due_date === today;
      return {
        id: loan.id,
        title: loan.item.title,
        party:
          loan.borrower.id === profile.id ? `FROM ${loan.owner.full_name}` : `TO ${loan.borrower.full_name}`,
        dueDate: formatDate(loan.due_date),
        status: loan.status,
        tone: overdue ? ("danger" as const) : dueToday ? ("warn" as const) : loan.status === "awaiting_pickup" ? ("info" as const) : ("active" as const),
      };
    });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="status-bracket text-[10px]">[ {greeting()} ]</p>
          <h1 className="type-title mt-2 text-[2rem] dt:text-[2.5rem]">
            {profile.full_name.split(" ")[0]}&apos;s lending desk
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="border border-accent/60 bg-accent/10 px-3 py-1.5 font-secondary text-[10px] text-accent">
            TRUST SCORE {Math.round(profile.trust_score)}
          </span>
          <span className="border border-line px-3 py-1.5 font-secondary text-[10px] text-ink/60">
            {profile.verification_status === "verified" ? "[ ID VERIFIED ]" : `[ ${profile.verification_status.toUpperCase()} ]`}
          </span>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-secondary text-[11px] uppercase text-ink/60">LOANS IN MOTION</h2>
          <Link
            className="font-secondary text-[10px] uppercase text-accent transition hover:decoration-accent hover:underline"
            href="/my/borrows"
          >
            FULL LOGBOOK →
          </Link>
        </div>
        <div className="mt-4">
          <LoansTicker loans={ticker} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">QUICK SEARCH</h2>
        <div className="mt-4">
          <CategoryGrid categories={categories} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">YOUR MOVEMENTS</h2>
        <div className="mt-4">
          <DashboardTabs
            borrowing={asBorrower.filter((loan) => !["returned", "cancelled", "lost"].includes(loan.status))}
            lending={asOwner.filter((loan) => !["returned", "cancelled", "lost"].includes(loan.status))}
          />
        </div>
      </section>
    </div>
  );
}
