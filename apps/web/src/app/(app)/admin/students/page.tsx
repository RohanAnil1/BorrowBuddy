import type { VerificationStatus } from "@borrowbuddy/shared";
import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import {
  Avatar,
  Cell,
  DataTable,
  FilterChips,
  Notice,
  PageHeader,
  Pagination,
  Row,
  SearchForm,
  VERIFICATION_TONE,
} from "@/components/admin/ui";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { getStudentDirectory } from "@/lib/data/profiles";
import { formatMoney, relativeTime } from "@/lib/format";
import { BUCKETS, publicUrl } from "@/lib/storage";

export const metadata = { title: "Students · Admin" };

const PAGE_SIZE = 25;
const STATUSES: VerificationStatus[] = ["verified", "pending", "rejected", "suspended"];

function directoryHref(params: { q?: string; status?: string; page?: number }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/admin/students?${query}` : "/admin/students";
}

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const me = await requireAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const status = STATUSES.includes(params.status as VerificationStatus)
    ? (params.status as VerificationStatus)
    : undefined;
  const page = Math.max(1, Math.floor(Number(params.page) || 1));

  const directory = await getStudentDirectory({
    search: q,
    status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const everyone = STATUSES.reduce((sum, key) => sum + directory.counts[key], 0);
  const pages = Math.max(1, Math.ceil(directory.total / PAGE_SIZE));
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(directory.total, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Everyone who has signed up. Open a student to verify, suspend, edit their details, adjust trust, send a notice or delete their profile. Every change is written to the audit log."
        eyebrow={`DIRECTORY · ${everyone} STUDENTS`}
        title="Students"
      />

      <div className="flex flex-col gap-3 dt:flex-row dt:items-center dt:justify-between">
        <FilterChips
          items={[undefined, ...STATUSES].map((key) => ({
            key: key ?? "all",
            label: key ?? "All",
            count: key ? directory.counts[key] : everyone,
            href: directoryHref({ q, status: key }),
            active: key === status,
          }))}
          label="Filter by status"
        />
        <SearchForm
          action="/admin/students"
          clearHref={directoryHref({ status })}
          defaultValue={q}
          keep={{ status }}
          placeholder="Name, email or department"
        />
      </div>

      {directory.error && <Notice>Could not load students: {directory.error}</Notice>}

      {directory.students.length === 0 ? (
        <EmptyState
          body={q ? "Try a different name, email or department." : "Students show up here as soon as they sign up."}
          code="NO STUDENTS"
          compact
          icon={<Users className="size-7" />}
          title={q ? "No one matches that search" : "No students here yet"}
        />
      ) : (
        <>
          <DataTable
            caption={`${status ?? "All"} students${q ? ` matching ${q}` : ""}`}
            columns={[
              { label: "Student" },
              { label: "Status" },
              { label: "Course" },
              { label: "Trust", className: "text-right" },
              { label: "Activity" },
              { label: "Joined" },
              { label: "", className: "w-1" },
            ]}
          >
            {directory.students.map((student) => {
              const name = student.full_name || "Unnamed student";
              const href = `/admin/students/${student.id}`;
              return (
                <Row key={student.id}>
                  <Cell label="">
                    <Link className="group flex min-w-0 items-center gap-3" href={href}>
                      <Avatar name={name} size={36} src={publicUrl(BUCKETS.avatars, student.avatar_path)} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5 text-[14px] normal-case group-hover:text-accent">
                          <span className="truncate">{name}</span>
                          {student.is_admin && (
                            <span className="font-secondary rounded-full border border-accent/60 px-1.5 text-[10px] text-accent">Admin</span>
                          )}
                          {student.id === me.id && (
                            <span className="font-secondary rounded-full border border-line px-1.5 text-[10px] text-ink/60">You</span>
                          )}
                        </span>
                        <span className="block max-w-64 truncate text-[12px] normal-case text-ink/55">{student.email}</span>
                      </span>
                    </Link>
                  </Cell>
                  <Cell label="Status">
                    <StatusBadge tone={VERIFICATION_TONE[student.verification_status]}>{student.verification_status}</StatusBadge>
                  </Cell>
                  <Cell label="Course">
                    <span className="text-[13px] normal-case text-ink/75">
                      {student.department ?? "—"}
                      {student.year_of_study ? <span className="block text-ink/50">Year {student.year_of_study}</span> : null}
                    </span>
                  </Cell>
                  <Cell className="dt:text-right" label="Trust">
                    <span className="type-body-alt text-[15px] tabular-nums">{Math.round(student.trust_score)}</span>
                  </Cell>
                  <Cell label="Activity">
                    <span className="text-[12px] normal-case leading-5 text-ink/70">
                      {student.items_count} listing{student.items_count === 1 ? "" : "s"} · {student.active_loans_count} open loan
                      {student.active_loans_count === 1 ? "" : "s"}
                      {student.pending_fines_total > 0 && (
                        <span className="block text-warn">{formatMoney(student.pending_fines_total)} unpaid</span>
                      )}
                    </span>
                  </Cell>
                  <Cell label="Joined">
                    <span className="text-[13px] normal-case text-ink/60 dt:whitespace-nowrap">{relativeTime(student.created_at)}</span>
                  </Cell>
                  <Cell hideOnMobile label="">
                    <Link aria-label={`Manage ${name}`} className="grid size-9 place-items-center rounded-lg text-ink/50 hover:bg-ink/5 hover:text-accent" href={href}>
                      <ChevronRight aria-hidden className="size-4" />
                    </Link>
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
          <Pagination
            hrefFor={(value) => directoryHref({ q, status, page: value })}
            page={page}
            pages={pages}
            summary={`Showing ${first}–${last} of ${directory.total}`}
          />
        </>
      )}
    </div>
  );
}
