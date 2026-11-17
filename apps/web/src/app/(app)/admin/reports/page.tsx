import { Flag, MessageSquare, Package, UserRound } from "lucide-react";
import Link from "next/link";
import { Drawer } from "@/components/admin/drawer";
import { Cell, DataTable, Field, FilterChips, Notice, PageHeader, Row, WaitingTag, inputClass } from "@/components/admin/ui";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminReports, isStale, type ReportStatus } from "@/lib/data/admin";
import { relativeTime } from "@/lib/format";
import { resolveReport } from "./actions";

export const metadata = { title: "Reports · Admin" };

const VIEWS: ReportStatus[] = ["open", "resolved", "dismissed"];
const TARGETS = {
  item: { label: "Listing", icon: Package },
  user: { label: "Student", icon: UserRound },
  message: { label: "Message", icon: MessageSquare },
} as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status } = await searchParams;
  const view: ReportStatus = VIEWS.includes(status as ReportStatus) ? (status as ReportStatus) : "open";
  const { reports, counts, error } = await getAdminReports(view);
  const back = view === "open" ? "/admin/reports" : `/admin/reports?status=${view}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Listings, students and messages flagged by other students. Look at what was reported, act on it from its own page if needed, then close the report."
        eyebrow={`QUEUE · ${counts.open} OPEN`}
        title="Reports"
      />

      <FilterChips
        items={VIEWS.map((key) => ({
          key,
          label: key,
          count: counts[key],
          href: key === "open" ? "/admin/reports" : `/admin/reports?status=${key}`,
          active: key === view,
        }))}
        label="Report status"
      />

      {error && <Notice>Could not load reports: {error}</Notice>}

      {reports.length === 0 ? (
        <EmptyState
          body={view === "open" ? "When a student flags a listing, a person or a message, it shows up here." : "Closed reports are kept here."}
          code={view === "open" ? "NO OPEN REPORTS" : "NOTHING HERE"}
          icon={<Flag className="size-7" />}
          title={view === "open" ? "Nothing flagged" : `No ${view} reports`}
        />
      ) : (
        <DataTable
          caption={`${view} reports`}
          columns={[
            { label: "Reported" },
            { label: "Reason" },
            { label: "By" },
            { label: view === "open" ? "Waiting" : "Closed" },
            { label: "", className: "w-1" },
          ]}
        >
          {reports.map((report) => {
            const target = TARGETS[report.target];
            const Icon = target.icon;
            return (
              <Row key={report.id}>
                <Cell label="Reported">
                  <span className="font-secondary inline-flex items-center gap-1.5 text-[11px] text-ink/55">
                    <Icon aria-hidden className="size-3.5" /> {target.label}
                  </span>
                  {report.target_href ? (
                    <Link className="block max-w-64 truncate text-[14px] normal-case hover:text-accent" href={report.target_href}>
                      {report.target_label ?? "Open"}
                    </Link>
                  ) : (
                    <span className="block text-[14px] normal-case text-ink/50">Removed</span>
                  )}
                </Cell>
                <Cell className="max-w-md" label="Reason">
                  <span className="line-clamp-3 text-[13px] normal-case text-ink/80">{report.reason}</span>
                </Cell>
                <Cell label="By">
                  <span className="text-[13px] normal-case text-ink/75">{report.reporter?.full_name ?? "A student"}</span>
                </Cell>
                <Cell label={view === "open" ? "Waiting" : "Closed"}>
                  {view === "open" ? (
                    <WaitingTag since={report.created_at} stale={isStale(report.created_at)} />
                  ) : (
                    <span className="flex flex-col items-start gap-1">
                      <StatusBadge tone={report.status === "resolved" ? "success" : "muted"}>{report.status}</StatusBadge>
                      <span className="text-[12px] normal-case text-ink/55">
                        {report.resolver?.full_name ?? "An admin"}
                        {report.resolved_at ? ` · ${relativeTime(report.resolved_at)}` : ""}
                      </span>
                    </span>
                  )}
                </Cell>
                <Cell label="">
                  {report.status === "open" && (
                    <Drawer eyebrow="CLOSE REPORT" label="Review" size="sm" title={report.target_label ?? target.label}>
                      <div className="flex flex-col gap-5">
                        <div className="border border-line p-4">
                          <p className="font-secondary text-[11px] text-ink/55">
                            {target.label} reported by {report.reporter?.full_name ?? "a student"} · {relativeTime(report.created_at)}
                          </p>
                          <p className="mt-2 text-[14px] normal-case leading-6">{report.reason}</p>
                          {report.target_href && (
                            <Link className="font-secondary mt-3 inline-block text-[11px] text-accent hover:underline" href={report.target_href}>
                              Open the {target.label.toLowerCase()} →
                            </Link>
                          )}
                        </div>
                        <form action={resolveReport} className="flex flex-col gap-4">
                          <input name="report_id" type="hidden" value={report.id} />
                          <input name="return_to" type="hidden" value={back} />
                          <Field hint="Kept with the report for other admins." label="Note (optional)">
                            <textarea className={`${inputClass} min-h-24`} maxLength={500} name="note" />
                          </Field>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="press inline-flex min-h-10 items-center rounded-lg bg-accent px-4 font-strong text-[13px] uppercase text-white hover:opacity-90"
                              name="decision"
                              type="submit"
                              value="resolved"
                            >
                              Resolved — action taken
                            </button>
                            <button
                              className="press inline-flex min-h-10 items-center rounded-lg border border-line px-4 font-strong text-[13px] uppercase text-ink transition-colors hover:border-accent hover:text-accent"
                              name="decision"
                              type="submit"
                              value="dismissed"
                            >
                              Dismiss — no action
                            </button>
                          </div>
                        </form>
                      </div>
                    </Drawer>
                  )}
                </Cell>
              </Row>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
