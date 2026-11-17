import {
  AlertTriangle,
  BadgeCheck,
  Flag,
  MapPin,
  MessageSquarePlus,
  PackageSearch,
  Receipt,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import { TrendCard } from "@/components/admin/trend-card";
import {
  Avatar,
  Notice,
  PageHeader,
  Panel,
  PanelLink,
  QueueTile,
  StatCard,
  WaitingTag,
  buttonClass,
} from "@/components/admin/ui";
import { auditHref, auditLabel, auditNote } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminOverview, getAuditLog, isStale } from "@/lib/data/admin";
import { getOpenIncidents } from "@/lib/data/incidents";
import { getPendingVerifications } from "@/lib/data/profiles";
import { formatMoney, relativeTime } from "@/lib/format";

export const metadata = { title: "Overview · Admin" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [overview, recent, waiting, incidents] = await Promise.all([
    getAdminOverview(),
    getAuditLog({ limit: 8 }),
    getPendingVerifications(5),
    getOpenIncidents(4),
  ]);
  const { queues, oldest, students, activity, series } = overview;
  const totalWaiting = queues.verifications + queues.reports + queues.incidents + queues.claims;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        actions={
          <>
            <Link className={buttonClass.secondary} href="/admin/groups?new=1">
              <MessageSquarePlus aria-hidden className="size-4" /> New group
            </Link>
            <Link className={buttonClass.secondary} href="/admin/pins?new=1">
              <MapPin aria-hidden className="size-4" /> Add pickup spot
            </Link>
          </>
        }
        description="What needs a decision now, and how lending on campus is moving."
        eyebrow={totalWaiting ? `CONTROL ROOM · ${totalWaiting} WAITING ON YOU` : "CONTROL ROOM · ALL CLEAR"}
        title="Overview"
      />

      {overview.error && (
        <Notice>
          Live counts are unavailable right now ({overview.error}). The queues below still open normally.
        </Notice>
      )}

      <section aria-labelledby="queues-heading">
        <h2 className="font-secondary mb-3 text-[11px] text-ink/70" id="queues-heading">
          Needs you
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <QueueTile
            count={queues.verifications}
            href="/admin/verifications"
            icon={<BadgeCheck aria-hidden className="size-5" />}
            label="Student IDs"
            oldest={oldest.verifications}
            stale={isStale(oldest.verifications)}
          />
          <QueueTile
            count={queues.incidents}
            href="/admin/incidents"
            icon={<AlertTriangle aria-hidden className="size-5" />}
            label="Incidents"
            oldest={oldest.incidents}
            stale={isStale(oldest.incidents)}
          />
          <QueueTile
            count={queues.fines}
            href="/admin/fines"
            icon={<Receipt aria-hidden className="size-5" />}
            label="Unpaid fines"
            note={formatMoney(queues.fines_amount)}
            oldest={oldest.fines}
            stale={false}
          />
          <QueueTile
            count={queues.claims}
            href="/admin/claims"
            icon={<PackageSearch aria-hidden className="size-5" />}
            label="Lost & found claims"
            oldest={oldest.claims}
            stale={isStale(oldest.claims)}
          />
          <QueueTile
            count={queues.reports}
            href="/admin/reports"
            icon={<Flag aria-hidden className="size-5" />}
            label="Reports"
            oldest={oldest.reports}
            stale={isStale(oldest.reports)}
          />
        </div>
      </section>

      <section aria-labelledby="glance-heading">
        <h2 className="font-secondary mb-3 text-[11px] text-ink/70" id="glance-heading">
          Campus at a glance
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            hint={`${students.pending} pending · ${students.suspended} suspended`}
            href="/admin/students?status=verified"
            label="Verified students"
            value={students.verified}
          />
          <StatCard
            hint={activity.overdue_loans ? `${activity.overdue_loans} overdue` : "None overdue"}
            label="Loans in progress"
            value={activity.open_loans}
          />
          <StatCard hint="Available to borrow now" href="/home" label="Live listings" value={activity.listings} />
          <StatCard
            hint={`${activity.pickup_spots} active pickup spots`}
            href="/admin/groups"
            label="Group chats"
            value={activity.groups}
          />
        </div>
      </section>

      {series.length > 0 && (
        <section aria-labelledby="trends-heading">
          <h2 className="font-secondary mb-3 text-[11px] text-ink/70" id="trends-heading">
            Last 14 days
          </h2>
          <div className="grid gap-3 lg:grid-cols-3">
            <TrendCard
              label="Sign-ups"
              points={series.map((point) => ({ day: point.day, value: point.signups }))}
              unit={["sign-up", "sign-ups"]}
            />
            <TrendCard
              label="New loans"
              points={series.map((point) => ({ day: point.day, value: point.loans }))}
              unit={["loan", "loans"]}
            />
            <TrendCard
              label="Incidents reported"
              points={series.map((point) => ({ day: point.day, value: point.incidents }))}
              unit={["incident", "incidents"]}
              upIsGood={false}
            />
          </div>
        </section>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel
          action={<PanelLink href="/admin/verifications">Open queue</PanelLink>}
          bodyClassName="p-0"
          icon={<BadgeCheck aria-hidden className="size-3.5" />}
          title="Waiting longest"
        >
          {waiting.length === 0 && incidents.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] normal-case text-ink/60">
              Nothing is waiting. New sign-ups and incident reports show up here.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {waiting.map((profile) => (
                <li key={profile.id}>
                  <Link
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink/[0.03]"
                    href="/admin/verifications"
                  >
                    <Avatar name={profile.full_name || profile.email} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] normal-case">
                        {profile.full_name || "Unnamed student"}
                      </span>
                      <span className="font-secondary block text-[11px] text-ink/55">Student ID review</span>
                    </span>
                    <WaitingTag since={profile.created_at} stale={isStale(profile.created_at)} />
                  </Link>
                </li>
              ))}
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <Link
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink/[0.03]"
                    href="/admin/incidents"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-warn/50 text-warn">
                      <AlertTriangle aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] normal-case">
                        {incident.loan?.item_title ?? "Loan"} · {incident.type.replace("_", " ")}
                      </span>
                      <span className="block truncate text-[12px] normal-case text-ink/55">
                        Reported by {incident.reporter?.full_name ?? "a party"}
                      </span>
                    </span>
                    <WaitingTag since={incident.created_at} stale={isStale(incident.created_at)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          action={<PanelLink href="/admin/audit">Audit log</PanelLink>}
          bodyClassName="p-0"
          icon={<ScrollText aria-hidden className="size-3.5" />}
          title="Recent activity"
        >
          {recent.entries.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] normal-case text-ink/60">
              {recent.error ? `The audit log is unavailable (${recent.error}).` : "No admin activity yet."}
            </p>
          ) : (
            <ol className="divide-y divide-line">
              {recent.entries.map((entry) => {
                const subject =
                  entry.subject_name ?? (typeof entry.metadata.full_name === "string" ? entry.metadata.full_name : null);
                const note = auditNote(entry.metadata, subject);
                const href = auditHref(entry.entity, entry.entity_id);
                return (
                  <li className="flex items-start gap-3 px-5 py-3" key={entry.id}>
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] normal-case leading-5">
                        {auditLabel(entry.action)}
                        {subject &&
                          (href ? (
                            <>
                              {" · "}
                              <Link className="text-accent hover:underline" href={href}>
                                {subject}
                              </Link>
                            </>
                          ) : (
                            <span className="text-ink/70"> · {subject}</span>
                          ))}
                      </p>
                      {note && <p className="mt-0.5 truncate text-[12px] normal-case text-ink/55">“{note}”</p>}
                    </div>
                    <span className="shrink-0 text-right text-[12px] normal-case text-ink/55">
                      {entry.actor_name ?? "System"}
                      <span className="block">{relativeTime(entry.created_at)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
