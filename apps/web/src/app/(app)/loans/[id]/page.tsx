import { ArrowLeftRight, CalendarDays, MapPin, MessageSquare, Star, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HandoverPanel } from "@/components/app/handover-panel";
import { IncidentForm } from "@/components/app/incident-form";
import { ReviewForm } from "@/components/app/review-form";
import { StarRating } from "@/components/app/star-rating";
import { StatusBadge, loanTone } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateRange, formatMoney, loanStatusLabel, relativeTime } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getLoanConversationId } from "@/lib/data/chat";
import { getIncidentsForLoan } from "@/lib/data/incidents";
import { getLoan } from "@/lib/data/loans";
import { getReviewsForLoan } from "@/lib/data/reviews";
import { cancelLoan } from "../../my/actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loan = await getLoan(id);
  return { title: loan ? `Loan · ${loan.item.title}` : "Loan" };
}

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireVerified();
  const { id } = await params;

  const loan = await getLoan(id);
  if (!loan) notFound();

  const [conversationId, reviews, incidents] = await Promise.all([
    getLoanConversationId(loan.id),
    getReviewsForLoan(loan.id),
    getIncidentsForLoan(loan.id),
  ]);

  const myReview = reviews.find((review) => review.reviewer_id === profile.id);
  const canReview = loan.status === "returned" && !myReview;
  const canReportIncident = ["active", "overdue", "return_pending", "disputed", "lost"].includes(
    loan.status,
  );

  const isOwner = loan.owner_id === profile.id;
  const counterparty = isOwner ? loan.borrower : loan.owner;
  const showPickupCode = loan.status === "awaiting_pickup" && !isOwner;
  const confirmPickup = loan.status === "awaiting_pickup" && isOwner;
  const showReturnCode = ["active", "return_pending", "overdue"].includes(loan.status) && isOwner;
  const confirmReturn = ["active", "return_pending", "overdue"].includes(loan.status) && !isOwner;

  const timeline = [
    { label: "REQUESTED", at: loan.created_at, done: true },
    {
      label: "APPROVED",
      at: loan.pickup_confirmed_at ?? loan.updated_at,
      done: loan.status !== "awaiting_pickup",
    },
    { label: "PICKED UP", at: loan.pickup_confirmed_at, done: Boolean(loan.pickup_confirmed_at) },
    { label: "RETURNED", at: loan.returned_at, done: Boolean(loan.returned_at) },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 dt:px-10">
      <Link
        className="font-secondary text-[10px] uppercase text-ink/50 transition-colors hover:text-accent"
        href={isOwner ? "/my/items" : "/my/borrows"}
      >
        ← BACK TO THE LOGBOOK
      </Link>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="type-title text-[1.75rem] dt:text-[2.25rem]">{loan.item.title}</h1>
          <p className="font-secondary mt-2 text-[10px] text-ink/50">
            {isOwner
              ? `ON LOAN TO ${counterparty.full_name.toUpperCase()}`
              : `BORROWED FROM ${counterparty.full_name.toUpperCase()}`}
          </p>
        </div>
        <StatusBadge tone={loanTone(loan.status)}>{loanStatusLabel(loan.status)}</StatusBadge>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact icon={<CalendarDays className="size-3.5" />} label="DATES" value={formatDateRange(loan.start_date, loan.due_date)} />
        <Fact icon={<Wallet className="size-3.5" />} label="DEPOSIT" value={formatMoney(loan.item.deposit_amount)} />
        <Fact
          icon={<Star className="size-3.5" />}
          label="COUNTERPARTY TRUST"
          value={String(Math.round(counterparty.trust_score))}
        />
        <Fact icon={<MapPin className="size-3.5" />} label="HANDOVER" value="IN-APP 6-DIGIT CODE" />
      </div>

      <div className="mt-10 flex flex-col gap-6">
        {showPickupCode && <HandoverPanel kind="pickup" loanId={loan.id} mode="show" />}
        {confirmPickup && <HandoverPanel kind="pickup" loanId={loan.id} mode="confirm" />}
        {showReturnCode && <HandoverPanel kind="return" loanId={loan.id} mode="show" />}
        {confirmReturn && <HandoverPanel kind="return" loanId={loan.id} mode="confirm" />}

        {loan.status === "returned" && (
          <div className="border border-accent/40 bg-accent/5 p-6">
            <p className="status-bracket text-[11px]">
              [ RETURNED {loan.returned_at ? relativeTime(loan.returned_at).toUpperCase() : ""} ]
            </p>
            <p className="type-body mt-3 text-[13px] leading-6 text-ink/60 uppercase">
              {myReview
                ? "You already rated this loan."
                : "Rate the other student so their trust score reflects how it went."}
            </p>
          </div>
        )}

        {conversationId && (
          <Link
            className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-6 transition-colors hover:border-accent"
            href={`/chat/${conversationId}`}
          >
            <div>
              <p className="flex items-center gap-2 font-secondary text-[11px] uppercase text-ink">
                <MessageSquare className="size-4 text-accent" />
                [ LOAN CHANNEL ]
              </p>
              <p className="type-body mt-2 text-[12px] text-ink/60 uppercase">
                Agree on a pickup spot and time with {counterparty.full_name}.
              </p>
            </div>
            <span className="font-secondary text-[10px] uppercase text-accent">OPEN →</span>
          </Link>
        )}

        {canReview && <ReviewForm counterpartyName={counterparty.full_name} loanId={loan.id} />}

        {canReportIncident && <IncidentForm loanId={loan.id} ownerId={profile.id} />}

        {incidents.length > 0 && (
          <section className="border border-line bg-panel p-6">
            <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ REPORTS ]</h2>
            <div className="mt-4 flex flex-col gap-3">
              {incidents.map((incident) => (
                <div
                  className="flex flex-wrap items-start justify-between gap-3 border border-line bg-black p-4"
                  key={incident.id}
                >
                  <div>
                    <p className="type-body-alt text-[13px] uppercase">
                      {incident.type.replace("_", " ")}
                      <span className="ml-2 font-secondary text-[9px] text-ink/50">
                        BY {(incident.reporter?.full_name ?? "A PARTY").toUpperCase()}
                      </span>
                    </p>
                    <p className="type-body mt-1 max-w-xl text-[12px] leading-6 text-ink/60 uppercase">
                      {incident.description}
                    </p>
                    {incident.resolution_note && (
                      <p className="type-body mt-2 border border-line px-3 py-2 text-[11px] uppercase text-ink/70">
                        ADMIN: {incident.resolution_note}
                      </p>
                    )}
                    <p className="font-secondary mt-2 text-[9px] text-ink/40">
                      {relativeTime(incident.created_at).toUpperCase()}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      incident.status === "resolved"
                        ? "success"
                        : incident.status === "rejected"
                          ? "muted"
                          : "warning"
                    }
                  >
                    {incident.status.replace("_", " ")}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </section>
        )}

        {myReview && (
          <section className="border border-line bg-panel p-6">
            <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ YOUR RATING ]</h2>
            <div className="mt-3 flex items-center gap-3">
              <StarRating size="md" value={myReview.rating} />
              {myReview.comment && (
                <p className="type-body text-[12px] text-ink/60 uppercase">
                  “{myReview.comment}”
                </p>
              )}
            </div>
          </section>
        )}

        {loan.status === "awaiting_pickup" && (
          <form
            action={cancelLoan}
            className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-6"
          >
            <input name="loan_id" type="hidden" value={loan.id} />
            <div>
              <p className="font-secondary text-[10px] uppercase text-ink">[ ABORT DISPATCH? ]</p>
              <p className="type-body mt-1 text-[12px] text-ink/60 uppercase">
                {isOwner
                  ? "If the borrower doesn't show up, cancel the loan so others can book."
                  : "You can cancel any time before pickup."}
              </p>
            </div>
            <SubmitButton pendingLabel="CANCELLING…" variant="danger">
              <ArrowLeftRight className="size-4" />
              Cancel loan
            </SubmitButton>
          </form>
        )}

        <section className="border border-line bg-panel p-6">
          <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ CUSTODY CHAIN ]</h2>
          <ol className="mt-5 flex flex-col gap-4">
            {timeline.map((step, index) => (
              <li className="flex items-start gap-3" key={step.label}>
                <div className="relative flex flex-col items-center">
                  <span
                    className={`flex size-3 items-center justify-center rounded-full border-2 ${
                      step.done ? "border-accent bg-accent" : "border-ink/30 bg-transparent"
                    }`}
                  />
                  {index < timeline.length - 1 && (
                    <span
                      className={`absolute top-3 h-8 w-0.5 ${
                        step.done ? "bg-accent/60" : "bg-ink/15"
                      }`}
                    />
                  )}
                </div>
                <div>
                  <p
                    className={`font-secondary text-[10px] uppercase ${
                      step.done ? "text-ink" : "text-ink/40"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.at && step.done && (
                    <p className="font-secondary mt-1 text-[9px] text-ink/40">
                      {relativeTime(step.at).toUpperCase()}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border border-line bg-panel p-5">
      <p className="flex items-center gap-2 font-secondary text-[9px] text-ink/50">
        {icon} {label}
      </p>
      <p className="type-body-alt mt-2 text-[13px] uppercase">{value}</p>
    </div>
  );
}
