import { Receipt } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { fineStatusLabel, formatMoney, relativeTime } from "@/lib/format";
import { requireProfile } from "@/lib/auth/guards";
import { getFinesForUser, getOutstandingTotal } from "@/lib/data/fines";

export const metadata = { title: "Fines" };

export default async function FinesPage() {
  const profile = await requireProfile();
  const [fines, outstanding] = await Promise.all([
    getFinesForUser(profile.id),
    getOutstandingTotal(profile.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ ACCOUNTABILITY LEDGER ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Fines</h1>

      <div className="mt-6 flex flex-wrap items-center gap-4 border border-line bg-panel p-6">
        <div>
          <p className="font-secondary text-[9px] text-ink/50">OUTSTANDING</p>
          <p className="type-title mt-1 text-[1.75rem]">{formatMoney(outstanding)}</p>
        </div>
        <p className="type-body max-w-sm text-[12px] leading-6 text-ink/60 uppercase">
          Fines are settled in person (cash or UPI) and marked off by an admin.
          BorrowBuddy never takes a cut, and the platform holds no money.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {fines.length === 0 ? (
          <EmptyState
            body="OVERDUE LOANS ACCRUE ₹20 PER DAY, CAPPED AT ₹1,000. RETURN ON TIME AND THIS PAGE STAYS EMPTY."
            code="CLEAN LEDGER"
            icon={<Receipt className="size-7" />}
            title="No fines on record"
          />
        ) : (
          fines.map((fine) => (
            <article
              className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-5"
              key={fine.id}
            >
              <div>
                <p className="type-body-alt text-[14px] uppercase">
                  {formatMoney(fine.amount)}
                  <span className="ml-3 font-secondary text-[9px] text-ink/50">
                    {fine.source.toUpperCase()}
                  </span>
                </p>
                <p className="type-body mt-1 text-[13px] text-ink/60 uppercase">{fine.reason}</p>
                <p className="font-secondary mt-2 text-[9px] text-ink/40">
                  {fine.loan ? (
                    <Link
                      className="underline-offset-4 transition-colors hover:text-accent hover:underline"
                      href={`/loans/${fine.loan.id}`}
                    >
                      {(fine.loan.item_title ?? "LOAN").toUpperCase()} ·
                    </Link>
                  ) : null}{" "}
                  {relativeTime(fine.created_at).toUpperCase()}
                </p>
              </div>

              <StatusBadge
                tone={
                  fine.status === "pending" ? "danger" : fine.status === "waived" ? "muted" : "success"
                }
              >
                {fineStatusLabel(fine.status)}
              </StatusBadge>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
