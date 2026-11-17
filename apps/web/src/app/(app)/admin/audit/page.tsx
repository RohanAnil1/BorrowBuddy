import { ScrollText } from "lucide-react";
import Link from "next/link";
import { Cell, DataTable, FilterChips, Notice, PageHeader, Pagination, Row, SearchForm } from "@/components/admin/ui";
import { EmptyState } from "@/components/app/empty-state";
import { AUDIT_CATEGORIES, auditHref, auditLabel, auditNote } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/auth/guards";
import { getAuditLog } from "@/lib/data/admin";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Audit log · Admin" };

const PAGE_SIZE = 40;
const GONE_LABELS: Record<string, string> = {
  profile: "Deleted account",
  conversation: "Deleted group",
  pickup_location: "Removed pickup spot",
};
const timestamp = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

function href(params: { category?: string; q?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const category = AUDIT_CATEGORIES.some((entry) => entry.key === params.category) ? params.category : undefined;
  const q = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const { entries, total, error } = await getAuditLog({
    category,
    search: q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Every admin decision and every sensitive change on the platform, newest first. Rows can't be edited or deleted from here."
        eyebrow={`RECORDS · ${total} ENTRIES`}
        title="Audit log"
      />

      <div className="flex flex-col gap-3">
        <SearchForm
          action="/admin/audit"
          clearHref={href({ category })}
          defaultValue={q}
          keep={{ category }}
          placeholder="Student, admin, group or action"
        />
        <FilterChips
          items={[{ key: "all", label: "Everything" }, ...AUDIT_CATEGORIES].map((entry) => ({
            key: entry.key,
            label: entry.label,
            href: href({ category: entry.key === "all" ? undefined : entry.key, q }),
            active: entry.key === "all" ? !category : entry.key === category,
          }))}
          label="Filter by kind"
        />
      </div>

      {error && <Notice>Could not load the audit log: {error}</Notice>}

      {entries.length === 0 ? (
        <EmptyState
          body={q || category ? "Try another filter or search." : "Admin actions are recorded here as they happen."}
          code="NO ENTRIES"
          compact
          icon={<ScrollText className="size-7" />}
          title={q || category ? "Nothing matches" : "Nothing recorded yet"}
        />
      ) : (
        <>
          <DataTable
            caption="Audit log entries, newest first"
            columns={[{ label: "When" }, { label: "What" }, { label: "About" }, { label: "By" }, { label: "Details" }]}
          >
            {entries.map((entry) => {
              const subject =
                entry.subject_name ?? (typeof entry.metadata.full_name === "string" ? entry.metadata.full_name : null);
              // A named entity with no name left was deleted since: say so, no dead link.
              const gone = !subject ? GONE_LABELS[entry.entity] : undefined;
              const link = gone ? null : auditHref(entry.entity, entry.entity_id);
              const note = auditNote(entry.metadata, subject);
              const extra = Object.keys(entry.metadata).length > 0;
              return (
                <Row key={entry.id}>
                  <Cell label="When">
                    <time className="text-[13px] normal-case text-ink/75 dt:whitespace-nowrap" dateTime={entry.created_at} title={entry.created_at}>
                      {timestamp.format(new Date(entry.created_at))}
                      <span className="block text-[12px] text-ink/50">{relativeTime(entry.created_at)}</span>
                    </time>
                  </Cell>
                  <Cell label="What">
                    <span className="text-[14px] normal-case">{auditLabel(entry.action)}</span>
                    <span className="block font-mono text-[11px] text-ink/45 normal-case">{entry.action}</span>
                  </Cell>
                  <Cell label="About">
                    {subject ? (
                      link ? (
                        <Link className="text-[14px] normal-case text-accent hover:underline" href={link}>
                          {subject}
                        </Link>
                      ) : (
                        <span className="text-[14px] normal-case">{subject}</span>
                      )
                    ) : (
                      <span className="text-[13px] normal-case text-ink/50">
                        {gone ?? entry.entity.replace("_", " ")}
                        {link && (
                          <>
                            {" · "}
                            <Link className="text-accent hover:underline" href={link}>
                              open
                            </Link>
                          </>
                        )}
                      </span>
                    )}
                  </Cell>
                  <Cell label="By">
                    {entry.actor_id ? (
                      <Link className="text-[13px] normal-case text-ink/80 hover:text-accent" href={`/admin/students/${entry.actor_id}`}>
                        {entry.actor_name ?? "Deleted account"}
                      </Link>
                    ) : (
                      <span className="text-[13px] normal-case text-ink/55">System</span>
                    )}
                  </Cell>
                  <Cell className="max-w-sm" label="Details">
                    {note && <span className="block line-clamp-2 text-[13px] normal-case text-ink/75">“{note}”</span>}
                    {extra && (
                      <details className="mt-1">
                        <summary className="font-secondary cursor-pointer text-[11px] text-ink/55 hover:text-accent">Raw data</summary>
                        <pre className="mt-2 max-h-48 overflow-auto border border-line bg-black p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap break-all normal-case text-ink/75">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                    {!note && !extra && <span className="text-[13px] text-ink/40">—</span>}
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
          <Pagination
            hrefFor={(value) => href({ category, q, page: value })}
            page={page}
            pages={pages}
            summary={`${total} entr${total === 1 ? "y" : "ies"}`}
          />
        </>
      )}
    </div>
  );
}
