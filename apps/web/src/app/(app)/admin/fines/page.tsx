import type { FineStatus } from "@borrowbuddy/shared";
import { Check, Receipt } from "lucide-react";
import Link from "next/link";
import { Cell, DataTable, FilterChips, Notice, PageHeader, Pagination, Row } from "@/components/admin/ui";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminFines, getAdminOverview, getFineStatusCounts } from "@/lib/data/admin";
import { fineStatusLabel, formatMoney, relativeTime } from "@/lib/format";
import { actOnFine } from "../moderation-actions";

export const metadata = { title: "Fines · Admin" };

const PAGE_SIZE = 25;
const VIEWS = ["pending", "settled", "waived", "all"] as const;
type View = (typeof VIEWS)[number];

const SOURCE_LABELS: Record<string, string> = {
  overdue: "Overdue",
  damage: "Damage",
  loss: "Loss",
  no_show: "No-show",
  other: "Other",
};

function href(view: View, page = 1) {
  const params = new URLSearchParams();
  if (view !== "pending") params.set("status", view);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/fines?${query}` : "/admin/fines";
}

export default async function FinesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const view: View = VIEWS.includes(params.status as View) ? (params.status as View) : "pending";
  const page = Math.max(1, Math.floor(Number(params.page) || 1));

  const [{ fines, total, error }, counts, overview] = await Promise.all([
    getAdminFines(view, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    getFineStatusCounts(),
    getAdminOverview(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const back = href(view, page);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Fines are paid in person, off the app. Mark one paid once you've collected it, or waive it if it shouldn't stand. The student is notified either way."
        eyebrow={`LEDGER · ${formatMoney(overview.queues.fines_amount)} UNPAID`}
        title="Fines"
      />

      <FilterChips
        items={VIEWS.map((key) => ({
          key,
          label: key === "all" ? "All" : fineStatusLabel(key as FineStatus),
          count: key === "all" ? counts.pending + counts.settled + counts.waived : counts[key],
          href: href(key),
          active: key === view,
        }))}
        label="Fine status"
      />

      {error && <Notice>Could not load fines: {error}</Notice>}

      {fines.length === 0 ? (
        <EmptyState
          body={view === "pending" ? "Overdue and incident fines land here until they're paid or waived." : "Nothing in this list yet."}
          code={view === "pending" ? "NOTHING OWED" : "EMPTY LEDGER"}
          icon={<Receipt className="size-7" />}
          title={view === "pending" ? "No unpaid fines" : "No fines here"}
        />
      ) : (
        <>
          <DataTable
            caption={`${view === "all" ? "All" : fineStatusLabel(view as FineStatus)} fines`}
            columns={[
              { label: "Student" },
              { label: "Amount", className: "text-right" },
              { label: "Reason" },
              { label: view === "pending" ? "Issued" : "Status" },
              { label: "", className: "w-1" },
            ]}
          >
            {fines.map((fine) => (
              <Row key={fine.id}>
                <Cell label="Student">
                  {fine.user ? (
                    <Link className="text-[14px] normal-case hover:text-accent" href={`/admin/students/${fine.user.id}`}>
                      {fine.user.full_name || "Student"}
                    </Link>
                  ) : (
                    <span className="text-[14px] normal-case text-ink/60">Deleted student</span>
                  )}
                  {fine.loan && (
                    <Link className="block text-[12px] normal-case text-ink/55 hover:text-accent" href={`/loans/${fine.loan.id}`}>
                      {fine.loan.item_title ?? "Loan"}
                    </Link>
                  )}
                </Cell>
                <Cell className="text-right dt:whitespace-nowrap" label="Amount">
                  <span className="type-body-alt text-[15px] tabular-nums">{formatMoney(fine.amount)}</span>
                </Cell>
                <Cell className="max-w-sm" label="Reason">
                  <span className="font-secondary text-[11px] text-ink/55">{SOURCE_LABELS[fine.source] ?? fine.source}</span>
                  <span className="block line-clamp-2 text-[13px] normal-case text-ink/80">{fine.reason}</span>
                </Cell>
                <Cell label={view === "pending" ? "Issued" : "Status"}>
                  {fine.status === "pending" ? (
                    <span className="text-[13px] normal-case text-ink/70">{relativeTime(fine.created_at)}</span>
                  ) : (
                    <span className="flex flex-col items-start gap-1">
                      <StatusBadge tone={fine.status === "settled" ? "success" : "muted"}>
                        {fineStatusLabel(fine.status as FineStatus)}
                      </StatusBadge>
                      <span className="text-[12px] normal-case text-ink/55">
                        {fine.settler?.full_name ?? "An admin"}
                        {fine.settled_at ? ` · ${relativeTime(fine.settled_at)}` : ""}
                      </span>
                    </span>
                  )}
                </Cell>
                <Cell label="">
                  {fine.status === "pending" && (
                    <div className="flex flex-wrap items-center gap-2 dt:flex-nowrap dt:justify-end">
                      <form action={actOnFine}>
                        <input name="fine_id" type="hidden" value={fine.id} />
                        <input name="action" type="hidden" value="settle" />
                        <input name="return_to" type="hidden" value={back} />
                        <SubmitButton className="min-h-9 px-3 text-[12px]" pendingLabel="…">
                          <Check aria-hidden className="size-4" /> Paid
                        </SubmitButton>
                      </form>
                      <form action={actOnFine}>
                        <input name="fine_id" type="hidden" value={fine.id} />
                        <input name="action" type="hidden" value="waive" />
                        <input name="return_to" type="hidden" value={back} />
                        <ConfirmSubmit
                          className="min-h-9 px-3 text-[12px]"
                          confirmLabel="Waive fine"
                          message={`${fine.user?.full_name ?? "The student"} no longer owes ${formatMoney(fine.amount)} for this. They're notified.`}
                          pendingLabel="…"
                          title={`Waive this ${formatMoney(fine.amount)} fine?`}
                        >
                          Waive
                        </ConfirmSubmit>
                      </form>
                    </div>
                  )}
                </Cell>
              </Row>
            ))}
          </DataTable>
          <Pagination
            hrefFor={(value) => href(view, value)}
            page={page}
            pages={pages}
            summary={`${total} fine${total === 1 ? "" : "s"}`}
          />
        </>
      )}
    </div>
  );
}
