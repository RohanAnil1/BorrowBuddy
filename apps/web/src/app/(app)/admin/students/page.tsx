import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, RotateCcw, Search, ShieldCheck, ShieldOff, SlidersHorizontal, UserCheck, UserX, Users } from "lucide-react";
import Link from "next/link";
import type { VerificationStatus } from "@borrowbuddy/shared";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { getStudentDirectory, type AdminStudentRow } from "@/lib/data/profiles";
import { formatMoney, relativeTime } from "@/lib/format";
import { BUCKETS } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { revokeStudentVerification, setStudentAdmin, setStudentStatus } from "./actions";

export const metadata = { title: "Students · Admin" };

const PAGE_SIZE = 25;
const STATUSES: VerificationStatus[] = ["verified", "pending", "rejected", "suspended"];

const inputClass =
  "rounded-lg border border-line bg-black px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent";

const STATUS_TONE = {
  verified: "success",
  pending: "info",
  rejected: "warning",
  suspended: "danger",
} as const;

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
  const returnTo = directoryHref({ q, status, page });

  const supabase = await createClient();
  const idUrls = new Map<string, string>();
  await Promise.all(
    directory.students.map(async (student) => {
      if (!student.student_id_path) return;
      const { data } = await supabase.storage
        .from(BUCKETS.studentIds)
        .createSignedUrl(student.student_id_path, 60 * 30);
      if (data?.signedUrl) idUrls.set(student.id, data.signedUrl);
    }),
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 dt:px-10">
      <Link className="font-secondary inline-flex items-center gap-2 text-[10px] text-ink/60 hover:text-accent" href="/admin">
        <ArrowLeft className="size-3.5" /> MODERATION DESK
      </Link>
      <p className="status-bracket mt-6 text-[10px]">[ CONTROL ROOM — ADMIN ONLY ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Students</h1>
      <p className="type-body mt-2 max-w-[60ch] text-[13px] normal-case text-ink/70">
        Everyone who has signed up. Search, check their student ID, and verify, suspend or reinstate them.
        Every change notifies the student and is written to the audit log.
      </p>

      <nav aria-label="Filter by status" className="mt-8 flex flex-wrap gap-2">
        {[undefined, ...STATUSES].map((key) => {
          const active = key === status;
          const count = key ? directory.counts[key] : everyone;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`font-secondary inline-flex items-center gap-2 border px-3 py-2 text-[10px] uppercase transition-colors ${
                active ? "border-accent bg-accent/15 text-accent" : "border-line text-ink/60 hover:border-accent hover:text-accent"
              }`}
              href={directoryHref({ q, status: key })}
              key={key ?? "all"}
            >
              {key ?? "All"} <span className="text-ink/40">{count}</span>
            </Link>
          );
        })}
      </nav>

      <form action="/admin/students" className="mt-4 flex flex-wrap items-center gap-2" role="search">
        {status && <input name="status" type="hidden" value={status} />}
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="sr-only">Search students</span>
          <Search className="pointer-events-none absolute left-3 size-4 text-ink/40" aria-hidden="true" />
          <input
            className={`${inputClass} w-full pl-9`}
            defaultValue={q}
            maxLength={100}
            name="q"
            placeholder="Name, email or department"
            type="search"
          />
        </label>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 font-strong text-[13px] uppercase transition-colors hover:border-accent hover:text-accent"
          type="submit"
        >
          Search
        </button>
        {q && (
          <Link className="font-secondary text-[10px] text-ink/50 hover:text-accent" href={directoryHref({ status })}>
            CLEAR
          </Link>
        )}
      </form>

      {directory.error && (
        <p className="mt-6 border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ COULD NOT LOAD STUDENTS: {directory.error.toUpperCase()} ]
        </p>
      )}

      <section aria-labelledby="students-heading" className="mt-8">
        <h2 id="students-heading" className="font-secondary text-[11px] uppercase text-ink/60">
          [ {status ?? "ALL"} STUDENTS ]{" "}
          <span className="ml-2 text-ink/40">
            {directory.total} {q ? `MATCHING “${q.toUpperCase()}”` : "TOTAL"}
          </span>
        </h2>

        <div className="mt-4 flex flex-col gap-3">
          {directory.students.length === 0 ? (
            <EmptyState
              compact
              code="NO STUDENTS"
              icon={<Users className="size-7" />}
              title={q ? "No one matches that search" : "No students here yet"}
              body={q ? "TRY A DIFFERENT NAME, EMAIL OR DEPARTMENT." : "STUDENTS SHOW UP HERE AS SOON AS THEY SIGN UP."}
            />
          ) : (
            directory.students.map((student) => (
              <StudentRow
                idUrl={idUrls.get(student.id)}
                isSelf={student.id === me.id}
                key={student.id}
                returnTo={returnTo}
                student={student}
              />
            ))
          )}
        </div>

        {pages > 1 && (
          <nav aria-label="Pages" className="mt-6 flex items-center justify-between font-secondary text-[10px] text-ink/60">
            {page > 1 ? (
              <Link className="inline-flex items-center gap-1 hover:text-accent" href={directoryHref({ q, status, page: page - 1 })}>
                <ChevronLeft className="size-3.5" /> PREVIOUS
              </Link>
            ) : (
              <span />
            )}
            <span>
              PAGE {page} OF {pages}
            </span>
            {page < pages ? (
              <Link className="inline-flex items-center gap-1 hover:text-accent" href={directoryHref({ q, status, page: page + 1 })}>
                NEXT <ChevronRight className="size-3.5" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>

      <p className="font-secondary mt-12 flex items-center gap-2 text-[9px] text-ink/40">
        <ShieldCheck className="size-3.5" />
        EVERY ADMIN ACTION HERE IS WRITTEN TO THE AUDIT LOG.
      </p>
    </div>
  );
}

function StudentRow({
  student,
  idUrl,
  isSelf,
  returnTo,
}: {
  student: AdminStudentRow;
  idUrl: string | undefined;
  isSelf: boolean;
  returnTo: string;
}) {
  const name = student.full_name || "Unnamed student";
  const hidden = (
    <>
      <input name="profile_id" type="hidden" value={student.id} />
      <input name="return_to" type="hidden" value={returnTo} />
    </>
  );

  return (
    <article className="border border-line bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="type-body-alt flex flex-wrap items-center gap-2 text-[14px] uppercase">
            <Link className="truncate hover:text-accent" href={`/admin/students/${student.id}`}>{name}</Link>
            {student.is_admin && (
              <span className="font-secondary border border-accent/60 px-1.5 py-0.5 text-[8px] text-accent">ADMIN</span>
            )}
            {isSelf && <span className="font-secondary border border-line px-1.5 py-0.5 text-[8px] text-ink/60">YOU</span>}
          </p>
          <p className="font-secondary mt-1 break-all text-[10px] text-ink/50">{student.email.toUpperCase()}</p>
          <p className="type-body mt-1 text-[12px] uppercase text-ink/60">
            {student.department ?? "No department"} · YEAR {student.year_of_study ?? "NOT SET"}
            {student.phone ? ` · ${student.phone}` : ""}
          </p>
          <p className="font-secondary mt-2 text-[9px] text-ink/40">
            JOINED {relativeTime(student.created_at).toUpperCase()} · TRUST {Math.round(student.trust_score)} ·{" "}
            {student.items_count} LISTING{student.items_count === 1 ? "" : "S"} · {student.active_loans_count} OPEN LOAN
            {student.active_loans_count === 1 ? "" : "S"}
            {student.pending_fines_total > 0 && (
              <span className="text-warn"> · {formatMoney(student.pending_fines_total)} UNPAID FINES</span>
            )}
          </p>
          {student.verification_note && (
            <p className="font-secondary mt-2 text-[9px] text-ink/50">NOTE: {student.verification_note.toUpperCase()}</p>
          )}
        </div>
        <StatusBadge tone={STATUS_TONE[student.verification_status]}>{student.verification_status}</StatusBadge>
      </div>

      <details>
        <summary className="cursor-pointer border-t border-line px-5 py-3 font-secondary text-[9px] text-ink/50 transition-colors hover:text-accent">
          [ MANAGE ]
        </summary>
        <div className="flex flex-col gap-5 border-t border-line p-5">
          <div className="flex flex-wrap gap-2">
            {idUrl ? (
              <Link
                className="inline-flex items-center gap-2 border border-line px-4 py-2.5 font-strong text-[12px] uppercase transition-colors hover:border-accent"
                href={idUrl}
                target="_blank"
              >
                <ExternalLink className="size-4" /> View student ID
              </Link>
            ) : (
              <p className="border border-warn/50 bg-warn/10 px-4 py-2.5 font-secondary text-[9px] text-warn">
                [ NO STUDENT ID UPLOADED ]
              </p>
            )}
            {student.verification_status === "verified" && (
              <Link
                className="inline-flex items-center gap-2 border border-line px-4 py-2.5 font-strong text-[12px] uppercase transition-colors hover:border-accent"
                href={`/users/${student.id}`}
              >
                <Users className="size-4" /> Public profile
              </Link>
            )}
            <Link
              className="inline-flex items-center gap-2 border border-accent/60 px-4 py-2.5 font-strong text-[12px] uppercase text-accent transition-colors hover:border-accent"
              href={`/admin/students/${student.id}`}
            >
              <SlidersHorizontal className="size-4" /> All options
            </Link>
          </div>

          {isSelf ? (
            <p className="font-secondary text-[9px] text-ink/50">
              [ YOU CAN’T CHANGE YOUR OWN STATUS OR ADMIN ACCESS — ASK ANOTHER ADMIN ]
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                {student.verification_status !== "verified" && (
                  <form action={setStudentStatus}>
                    {hidden}
                    <input name="status" type="hidden" value="verified" />
                    <SubmitButton pendingLabel="…">
                      <UserCheck className="size-4" />
                      {student.verification_status === "suspended" ? "Reinstate" : "Verify"}
                    </SubmitButton>
                  </form>
                )}
                {student.verification_status === "pending" && (
                  <form action={setStudentStatus} className="flex flex-wrap items-center gap-2">
                    {hidden}
                    <input name="status" type="hidden" value="rejected" />
                    <input className={`${inputClass} w-full sm:w-52`} maxLength={500} name="note" placeholder="Reason (sent to them)" />
                    <SubmitButton pendingLabel="…" variant="danger">
                      <UserX className="size-4" />
                      Reject
                    </SubmitButton>
                  </form>
                )}
                {(student.verification_status === "verified" || student.verification_status === "rejected") && (
                  <form action={revokeStudentVerification}>
                    {hidden}
                    <ConfirmSubmit
                      confirmLabel="Revoke"
                      message={`${name} goes back to pending and must upload a new student ID${student.is_admin ? ". They also lose admin access" : ""}.`}
                      pendingLabel="…"
                      title={`Revoke ${name}'s verification?`}
                    >
                      <RotateCcw className="size-4" /> Revoke verification
                    </ConfirmSubmit>
                  </form>
                )}
              </div>

              {student.verification_status !== "suspended" && (
                <form action={setStudentStatus} className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
                  {hidden}
                  <input name="status" type="hidden" value="suspended" />
                  <input className={`${inputClass} w-full min-w-0 flex-1 sm:min-w-64`} maxLength={500} name="note" placeholder="Reason for suspension (sent to them)" />
                  <ConfirmSubmit
                    confirmLabel="Suspend"
                    message={`${name} will be locked out of BorrowBuddy until an admin reinstates them.`}
                    pendingLabel="…"
                    title={`Suspend ${name}?`}
                  >
                    <ShieldOff className="size-4" /> Suspend
                  </ConfirmSubmit>
                </form>
              )}

              <form action={setStudentAdmin} className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                {hidden}
                <input name="is_admin" type="hidden" value={student.is_admin ? "false" : "true"} />
                <p className="font-secondary flex-1 text-[9px] text-ink/50">
                  {student.is_admin
                    ? "[ HAS ADMIN ACCESS — CAN REVIEW STUDENTS, INCIDENTS AND FINES ]"
                    : student.verification_status === "verified"
                      ? "[ NO ADMIN ACCESS ]"
                      : "[ ONLY VERIFIED STUDENTS CAN BE MADE ADMINS ]"}
                </p>
                {student.is_admin ? (
                  <ConfirmSubmit
                    confirmLabel="Remove access"
                    message={`${name} will lose access to the moderation desk.`}
                    pendingLabel="…"
                    title={`Remove admin access from ${name}?`}
                  >
                    Remove admin
                  </ConfirmSubmit>
                ) : (
                  student.verification_status === "verified" && (
                    <SubmitButton pendingLabel="…" variant="secondary">
                      <ShieldCheck className="size-4" /> Make admin
                    </SubmitButton>
                  )
                )}
              </form>
            </>
          )}
        </div>
      </details>
    </article>
  );
}
