import { CalendarClock, Hourglass, PackageOpen, PlusCircle } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge, loanTone, requestTone } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateRange, loanStatusLabel, relativeTime } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getLoansForUser, isOpenLoan } from "@/lib/data/loans";
import { getOutgoingRequests } from "@/lib/data/requests";
import { getWaitlistForUser } from "@/lib/data/waitlist";
import { cancelRequest, leaveWaitlist } from "../actions";

export const metadata = { title: "My borrows" };

export default async function MyBorrowsPage() {
  const profile = await requireVerified();
  const [{ asBorrower, asOwner }, outgoing, waitlist] = await Promise.all([
    getLoansForUser(profile.id),
    getOutgoingRequests(profile.id),
    getWaitlistForUser(profile.id),
  ]);

  const activeBorrows = asBorrower.filter((loan) => isOpenLoan(loan.status));
  const pastBorrows = asBorrower.filter((loan) => !isOpenLoan(loan.status)).slice(0, 6);
  const lendingOut = asOwner.filter((loan) => isOpenLoan(loan.status));
  const pendingOutgoing = outgoing.filter((request) => request.status === "pending");
  const decidedOutgoing = outgoing.filter((request) => request.status !== "pending").slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ LOGBOOK — BORROWED ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">My borrows</h1>

      <section className="mt-10">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">
          [ ACTIVE LOANS ]
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {activeBorrows.length === 0 ? (
            <p className="border border-line bg-panel px-6 py-8 text-center font-secondary text-[10px] text-ink/50">
              [ NOTHING BORROWED RIGHT NOW ]
            </p>
          ) : (
            activeBorrows.map((loan) => (
              <Link
                className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-5 transition-colors hover:border-accent"
                href={`/loans/${loan.id}`}
                key={loan.id}
              >
                <div>
                  <p className="type-body-alt text-[15px] uppercase">{loan.item.title}</p>
                  <p className="font-secondary mt-1 text-[9px] text-ink/50">
                    FROM {loan.owner.full_name.toUpperCase()} ·{" "}
                    {formatDateRange(loan.start_date, loan.due_date).toUpperCase()}
                  </p>
                </div>
                <StatusBadge tone={loanTone(loan.status)}>
                  {loanStatusLabel(loan.status)}
                </StatusBadge>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">
          [ YOUR REQUESTS ]
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {pendingOutgoing.length === 0 ? (
            <p className="border border-line bg-panel px-6 py-8 text-center font-secondary text-[10px] text-ink/50">
              NO PENDING REQUESTS. REQUESTS AUTO-EXPIRE AFTER 48 HOURS.
            </p>
          ) : (
            pendingOutgoing.map((request) => (
              <article
                className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-5"
                key={request.id}
              >
                <div>
                  <p className="type-body-alt text-[15px] uppercase">{request.item.title}</p>
                  <p className="font-secondary mt-1 text-[9px] text-ink/50">
                    {formatDateRange(request.start_date, request.end_date).toUpperCase()} · ASKED{" "}
                    {relativeTime(request.created_at).toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={requestTone(request.status)}>{request.status}</StatusBadge>
                  <form action={cancelRequest}>
                    <input name="request_id" type="hidden" value={request.id} />
                    <SubmitButton pendingLabel="…" variant="secondary">
                      Cancel
                    </SubmitButton>
                  </form>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {lendingOut.length > 0 && (
        <section className="mt-14">
          <h2 className="font-secondary text-[11px] uppercase text-ink/60">
            [ YOUR ITEMS OUT ON LOAN ]
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {lendingOut.map((loan) => (
              <Link
                className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-5 transition-colors hover:border-accent"
                href={`/loans/${loan.id}`}
                key={loan.id}
              >
                <div>
                  <p className="type-body-alt text-[15px] uppercase">{loan.item.title}</p>
                  <p className="font-secondary mt-1 text-[9px] text-ink/50">
                    WITH {loan.borrower.full_name.toUpperCase()} · DUE{" "}
                    {formatDateRange(loan.due_date, loan.due_date).toUpperCase()}
                  </p>
                </div>
                <StatusBadge tone={loanTone(loan.status)}>
                  {loanStatusLabel(loan.status)}
                </StatusBadge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {waitlist.length > 0 && (
        <section className="mt-14">
          <h2 className="font-secondary text-[11px] uppercase text-ink/60">
            [ WAITING FOR THESE ]
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {waitlist.map((entry) => (
              <article
                className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-5"
                key={entry.id}
              >
                <div>
                  <Link
                    className="type-body-alt text-[15px] uppercase transition-colors hover:text-accent"
                    href={`/items/${entry.item?.id ?? ""}`}
                  >
                    {entry.item?.title ?? "Item"}
                  </Link>
                  <p className="font-secondary mt-1 text-[9px] text-ink/50">
                    {formatDateRange(entry.desired_start, entry.desired_end).toUpperCase()} ·{" "}
                    {entry.status === "notified" ? "DATES JUST OPENED UP" : "STILL BOOKED"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={entry.status === "notified" ? "success" : "info"}>
                    <Hourglass className="size-3" />
                    {entry.status}
                  </StatusBadge>
                  <form action={leaveWaitlist}>
                    <input name="entry_id" type="hidden" value={entry.id} />
                    <SubmitButton pendingLabel="…" variant="secondary">
                      Leave
                    </SubmitButton>
                  </form>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {decidedOutgoing.length > 0 && (
        <section className="mt-14">
          <h2 className="font-secondary text-[11px] uppercase text-ink/60">
            [ RECENT REQUESTS ]
          </h2>
          <div className="mt-4 divide-y divide-line border border-line bg-panel">
            {decidedOutgoing.map((request) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={request.id}>
                <span className="type-body text-[13px] uppercase text-ink/70">
                  {request.item.title} · {formatDateRange(request.start_date, request.end_date)}
                </span>
                <StatusBadge tone={requestTone(request.status)}>{request.status}</StatusBadge>
              </div>
            ))}
          </div>
        </section>
      )}

      {pastBorrows.length > 0 && (
        <section className="mt-14">
          <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ HISTORY ]</h2>
          <div className="mt-4 divide-y divide-line border border-line bg-panel">
            {pastBorrows.map((loan) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={loan.id}>
                <span className="type-body text-[13px] uppercase text-ink/70">
                  {loan.item.title} · {formatDateRange(loan.start_date, loan.due_date)}
                </span>
                <StatusBadge tone={loanTone(loan.status)}>
                  {loanStatusLabel(loan.status)}
                </StatusBadge>
              </div>
            ))}
          </div>
        </section>
      )}

      {asBorrower.length === 0 && outgoing.length === 0 && (
        <div className="mt-10">
          <EmptyState
            action={
              <Link
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white transition-opacity hover:opacity-90"
                href="/home"
              >
                <PlusCircle className="size-4" />
                Find something to borrow
              </Link>
            }
            body="REQUEST A PROJECTOR FOR MOVIE NIGHT, A CAMERA FOR A TRIP, A FAN FOR THE SUMMER."
            code="NO BORROWS"
            icon={<PackageOpen className="size-7" />}
            title="No borrows yet"
          />
        </div>
      )}

      <div className="mt-14 border border-line bg-black p-6">
        <p className="flex items-center gap-2 font-secondary text-[10px] uppercase text-ink">
          <CalendarClock className="size-4 text-accent" />
          [ OVERDUE LOANS ACCRUE A ₹20/DAY FINE, CAPPED AT ₹1,000 ]
        </p>
        <p className="type-body mt-2 text-[12px] leading-6 text-ink/50 uppercase">
          Fines are tracked here and settled in person. BorrowBuddy never takes a cut.
        </p>
      </div>
    </div>
  );
}
