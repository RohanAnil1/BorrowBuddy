import { AlertTriangle, Gavel } from "lucide-react";
import Link from "next/link";
import { Drawer } from "@/components/admin/drawer";
import {
  Cell,
  DataTable,
  Field,
  FilterChips,
  Notice,
  PageHeader,
  Row,
  WaitingTag,
  inputClass,
} from "@/components/admin/ui";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminIncidents, getAdminOverview, isStale } from "@/lib/data/admin";
import { relativeTime } from "@/lib/format";
import { resolveIncident } from "../moderation-actions";

export const metadata = { title: "Incidents · Admin" };

const TYPE_LABELS: Record<string, string> = {
  damage: "Damage",
  lost: "Lost item",
  late: "Late return",
  no_show: "No-show",
  other: "Other",
};

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdmin();
  const { view: rawView } = await searchParams;
  const view = rawView === "closed" ? "closed" : "open";
  const [{ incidents, error }, overview] = await Promise.all([getAdminIncidents(view), getAdminOverview()]);
  const back = view === "closed" ? "/admin/incidents?view=closed" : "/admin/incidents";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Damage, loss, late returns and no-shows reported by either side of a loan. Decide what happened, leave a note both students will see, and issue a fine if one is due."
        eyebrow={`QUEUE · ${overview.queues.incidents} OPEN`}
        title="Incidents"
      />

      <FilterChips
        items={[
          { key: "open", label: "Open", count: overview.queues.incidents, href: "/admin/incidents", active: view === "open" },
          { key: "closed", label: "Decided", href: "/admin/incidents?view=closed", active: view === "closed" },
        ]}
        label="Incident status"
      />

      {error && <Notice>Could not load incidents: {error}</Notice>}

      {incidents.length === 0 ? (
        <EmptyState
          body={
            view === "open"
              ? "Damage, loss and no-show reports land here with photos from both students."
              : "Incidents you resolve or reject are kept here."
          }
          code={view === "open" ? "NO OPEN INCIDENTS" : "NOTHING DECIDED YET"}
          icon={<AlertTriangle className="size-7" />}
          title={view === "open" ? "No open incidents" : "No history yet"}
        />
      ) : view === "open" ? (
        <ul className="flex flex-col gap-4">
          {incidents.map((incident) => {
            const title = incident.loan?.item_title ?? "Loan";
            return (
              <li className="border border-warn/40 bg-panel" key={incident.id}>
                <div className="flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone="warning">{TYPE_LABELS[incident.type] ?? incident.type}</StatusBadge>
                        {incident.status === "under_review" && <StatusBadge tone="info">Under review</StatusBadge>}
                      </div>
                      <p className="type-body-alt mt-2 text-[17px] normal-case">{title}</p>
                      <p className="mt-0.5 text-[13px] normal-case text-ink/60">
                        Reported by {incident.reporter?.full_name ?? "a student"} ·{" "}
                        <Link className="text-accent hover:underline" href={`/loans/${incident.loan_id}`}>
                          open the loan
                        </Link>
                      </p>
                    </div>
                    <WaitingTag since={incident.created_at} stale={isStale(incident.created_at)} />
                  </div>

                  <blockquote className="border-l-2 border-warn/60 pl-4 text-[14px] normal-case leading-6 text-ink/85">
                    {incident.description}
                  </blockquote>

                  {incident.loan && (
                    <dl className="grid grid-cols-2 gap-3 border-y border-line py-3 text-[13px] normal-case">
                      <div>
                        <dt className="font-secondary text-[11px] text-ink/55">Borrower</dt>
                        <dd className="mt-0.5">{incident.loan.borrower_name ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-secondary text-[11px] text-ink/55">Owner</dt>
                        <dd className="mt-0.5">{incident.loan.owner_name ?? "—"}</dd>
                      </div>
                    </dl>
                  )}

                  {incident.photos.length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label="Evidence photos">
                      {incident.photos.map((photo) =>
                        photo.url ? (
                          <li key={photo.id}>
                            <Link className="group relative block" href={photo.url} target="_blank">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                alt={`Evidence photo, ${photo.phase === "before" ? "before" : "after"} the loan`}
                                className="size-24 border border-line object-cover transition-colors group-hover:border-accent"
                                src={photo.url}
                              />
                              <span className="font-secondary absolute left-1 bottom-1 bg-black/80 px-1.5 text-[11px] text-ink/80">
                                {photo.phase}
                              </span>
                            </Link>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  )}

                  <div>
                    <Drawer
                      description={<>Your note goes to both {incident.loan?.borrower_name ?? "the borrower"} and {incident.loan?.owner_name ?? "the owner"}.</>}
                      eyebrow="DECIDE INCIDENT"
                      icon={<Gavel aria-hidden className="size-4" />}
                      label="Decide"
                      title={`${TYPE_LABELS[incident.type] ?? "Incident"} · ${title}`}
                      variant="primary"
                    >
                      <form action={resolveIncident} className="flex flex-col gap-4">
                        <input name="incident_id" type="hidden" value={incident.id} />
                        <input name="return_to" type="hidden" value={back} />
                        <fieldset className="flex flex-col gap-2">
                          <legend className="font-secondary mb-1.5 text-[11px] text-ink/70">Decision</legend>
                          {[
                            ["resolved", "Resolve", "It happened as reported; close it."],
                            ["rejected", "Reject", "The report doesn't hold up."],
                          ].map(([value, label, hint]) => (
                            <label
                              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                              key={value}
                            >
                              <input
                                className="mt-1 accent-[var(--color-accent)]"
                                defaultChecked={value === "resolved"}
                                name="decision"
                                type="radio"
                                value={value}
                              />
                              <span>
                                <span className="font-strong block text-[13px] uppercase">{label}</span>
                                <span className="block text-[12px] normal-case text-ink/60">{hint}</span>
                              </span>
                            </label>
                          ))}
                        </fieldset>
                        <Field label="Note to both students">
                          <textarea
                            className={`${inputClass} min-h-28`}
                            maxLength={2000}
                            minLength={5}
                            name="resolution_note"
                            placeholder="What you decided, and why."
                            required
                          />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field hint="Leave empty for no fine." label="Fine (₹)">
                            <input className={inputClass} inputMode="numeric" max={100000} min={0} name="fine_amount" placeholder="0" step={50} type="number" />
                          </Field>
                          <Field label="Charged to">
                            <select className={inputClass} defaultValue={incident.loan?.borrower_id ?? ""} name="fine_user_id">
                              {incident.loan && (
                                <>
                                  <option value={incident.loan.borrower_id}>{incident.loan.borrower_name ?? "Borrower"} (borrower)</option>
                                  <option value={incident.loan.owner_id}>{incident.loan.owner_name ?? "Owner"} (owner)</option>
                                </>
                              )}
                            </select>
                          </Field>
                        </div>
                        <div>
                          <SubmitButton pendingLabel="Saving…">Save decision</SubmitButton>
                        </div>
                      </form>
                    </Drawer>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <DataTable
          caption="Decided incidents, newest first"
          columns={[{ label: "Incident" }, { label: "Decision" }, { label: "Note" }, { label: "Decided" }]}
        >
          {incidents.map((incident) => (
            <Row key={incident.id}>
              <Cell label="Incident">
                <Link className="text-[14px] normal-case hover:text-accent" href={`/loans/${incident.loan_id}`}>
                  {incident.loan?.item_title ?? "Loan"}
                </Link>
                <span className="block text-[12px] normal-case text-ink/55">
                  {TYPE_LABELS[incident.type] ?? incident.type} · by {incident.reporter?.full_name ?? "a student"}
                </span>
              </Cell>
              <Cell label="Decision">
                <StatusBadge tone={incident.status === "resolved" ? "success" : "muted"}>{incident.status}</StatusBadge>
              </Cell>
              <Cell className="max-w-md" label="Note">
                <span className="line-clamp-2 text-[13px] normal-case text-ink/75">{incident.resolution_note ?? "—"}</span>
              </Cell>
              <Cell label="Decided">
                <span className="text-[13px] normal-case text-ink/70">
                  {incident.resolver?.full_name ?? "An admin"}
                  <span className="block text-ink/50">{incident.resolved_at ? relativeTime(incident.resolved_at) : "—"}</span>
                </span>
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </div>
  );
}
