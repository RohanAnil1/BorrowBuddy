import {
  ArrowLeft,
  Bell,
  ExternalLink,
  Gauge,
  History,
  ImageOff,
  PackageX,
  Pencil,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { FineStatus, LoanStatus } from "@borrowbuddy/shared";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { StatusBadge, loanTone } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { getStudentDetail } from "@/lib/data/profiles";
import { fineStatusLabel, formatDate, formatMoney, loanStatusLabel, relativeTime } from "@/lib/format";
import { BUCKETS, publicUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  pauseStudentListings,
  recalculateStudentTrust,
  removeStudentAvatar,
  revokeStudentVerification,
  sendStudentNotice,
  setStudentAdmin,
  setStudentStatus,
  setStudentTrust,
  updateStudentDetails,
  waiveStudentFines,
} from "../actions";

export const metadata = { title: "Student · Admin" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inputClass =
  "rounded-lg border border-line bg-black px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent";
const labelClass = "font-secondary text-[9px] text-ink/50";
const linkButton =
  "inline-flex items-center gap-2 border border-line px-4 py-2.5 font-strong text-[12px] uppercase transition-colors hover:border-accent";

const STATUS_TONE = {
  verified: "success",
  pending: "info",
  rejected: "warning",
  suspended: "danger",
} as const;

const ACTION_LABELS: Record<string, string> = {
  "verification.verified": "Verified",
  "verification.rejected": "Verification rejected",
  "verification.suspended": "Suspended",
  "verification.pending": "Moved to pending",
  "verification.revoked": "Verification revoked",
  "admin.granted": "Admin access granted",
  "admin.revoked": "Admin access removed",
  "profile.edited": "Details edited",
  "trust.set": "Trust score set",
  "trust.recalculated": "Trust score recalculated",
  "notice.sent": "Notice sent",
  "listings.paused": "Listings paused",
  "avatar.removed": "Profile photo removed",
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-panel p-5">
      <h2 className="flex items-center gap-2 font-secondary text-[10px] uppercase text-ink/60">
        <span className="text-accent">{icon}</span> [ {title} ]
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AdminStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!uuid.test(id)) notFound();

  const detail = await getStudentDetail(id);
  if (!detail) notFound();
  const { profile, items, loans, fines, audit } = detail;

  const isSelf = profile.id === me.id;
  const name = profile.full_name || "Unnamed student";
  const returnTo = `/admin/students/${profile.id}`;
  const avatar = publicUrl(BUCKETS.avatars, profile.avatar_path);
  const liveListings = items.filter((item) => item.status === "available").length;
  const pendingFines = fines.filter((fine) => fine.status === "pending");
  const pendingTotal = pendingFines.reduce((sum, fine) => sum + fine.amount, 0);

  let idUrl: string | null = null;
  if (profile.student_id_path) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from(BUCKETS.studentIds).createSignedUrl(profile.student_id_path, 60 * 30);
    idUrl = data?.signedUrl ?? null;
  }

  const hidden = (
    <>
      <input name="profile_id" type="hidden" value={profile.id} />
      <input name="return_to" type="hidden" value={returnTo} />
    </>
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 dt:px-10">
      <Link className="font-secondary inline-flex items-center gap-2 text-[10px] text-ink/60 hover:text-accent" href="/admin/students">
        <ArrowLeft className="size-3.5" /> ALL STUDENTS
      </Link>
      <p className="status-bracket mt-6 text-[10px]">[ CONTROL ROOM — ADMIN ONLY ]</p>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="size-16 shrink-0 border border-line object-cover" src={avatar} />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center border border-line font-secondary text-[9px] text-ink/40">
              NO PHOTO
            </span>
          )}
          <div className="min-w-0">
            <h1 className="type-title truncate text-[1.75rem] dt:text-[2.25rem]">{name}</h1>
            <p className="font-secondary mt-1 break-all text-[10px] text-ink/50">{profile.email.toUpperCase()}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={STATUS_TONE[profile.verification_status]}>{profile.verification_status}</StatusBadge>
              {profile.is_admin && <StatusBadge tone="success">Admin</StatusBadge>}
              {isSelf && <StatusBadge>You</StatusBadge>}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-secondary text-[10px] text-ink/60 sm:grid-cols-4">
          <div><dt className="text-ink/40">TRUST</dt><dd className="text-[14px] text-ink">{Math.round(profile.trust_score)}</dd></div>
          <div><dt className="text-ink/40">LISTINGS</dt><dd className="text-[14px] text-ink">{items.length}</dd></div>
          <div><dt className="text-ink/40">LOANS</dt><dd className="text-[14px] text-ink">{loans.length}</dd></div>
          <div><dt className="text-ink/40">UNPAID</dt><dd className={`text-[14px] ${pendingTotal ? "text-warn" : "text-ink"}`}>{formatMoney(pendingTotal)}</dd></div>
        </dl>
      </header>

      <p className="type-body mt-4 text-[12px] uppercase text-ink/60">
        {profile.department ?? "No department"} · YEAR {profile.year_of_study ?? "NOT SET"}
        {profile.phone ? ` · ${profile.phone}` : ""} · JOINED {relativeTime(profile.created_at).toUpperCase()}
      </p>
      {profile.verification_note && (
        <p className="font-secondary mt-2 text-[9px] text-ink/50">NOTE: {profile.verification_note.toUpperCase()}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {idUrl ? (
          <Link className={linkButton} href={idUrl} target="_blank">
            <ExternalLink className="size-4" /> View student ID
          </Link>
        ) : (
          <p className="border border-warn/50 bg-warn/10 px-4 py-2.5 font-secondary text-[9px] text-warn">[ NO STUDENT ID UPLOADED ]</p>
        )}
        {profile.verification_status === "verified" && (
          <Link className={linkButton} href={`/users/${profile.id}`}>
            <Users className="size-4" /> Public profile
          </Link>
        )}
      </div>

      {isSelf ? (
        <p className="mt-8 border border-line bg-panel px-5 py-4 font-secondary text-[9px] text-ink/50">
          [ THIS IS YOUR ACCOUNT. ANOTHER ADMIN HAS TO MAKE CHANGES TO IT. ]
        </p>
      ) : (
        <div className="mt-8 grid gap-4">
          <Section icon={<ShieldCheck className="size-3.5" />} title="Access">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                {profile.verification_status !== "verified" && (
                  <form action={setStudentStatus}>
                    {hidden}
                    <input name="status" type="hidden" value="verified" />
                    <SubmitButton pendingLabel="…">
                      <UserCheck className="size-4" />
                      {profile.verification_status === "suspended" ? "Reinstate" : "Verify"}
                    </SubmitButton>
                  </form>
                )}
                {profile.verification_status === "pending" && (
                  <form action={setStudentStatus} className="flex flex-wrap items-center gap-2">
                    {hidden}
                    <input name="status" type="hidden" value="rejected" />
                    <input className={`${inputClass} w-full sm:w-56`} maxLength={500} name="note" placeholder="Reason (sent to them)" />
                    <SubmitButton pendingLabel="…" variant="danger">
                      <UserX className="size-4" /> Reject
                    </SubmitButton>
                  </form>
                )}
              </div>

              {(profile.verification_status === "verified" || profile.verification_status === "rejected") && (
                <form action={revokeStudentVerification} className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
                  {hidden}
                  <p className={`${labelClass} w-full`}>
                    REVOKE VERIFICATION — BACK TO PENDING. THEIR STUDENT ID IS CLEARED SO THEY MUST UPLOAD A NEW ONE
                    {profile.is_admin ? ", AND THEY LOSE ADMIN ACCESS" : ""}.
                  </p>
                  <input className={`${inputClass} w-full min-w-0 flex-1 sm:min-w-64`} maxLength={500} name="note" placeholder="Reason (sent to them)" />
                  <ConfirmSubmit
                    confirmLabel="Revoke"
                    message={`${name} will be sent back to verification and must upload a new student ID.`}
                    pendingLabel="…"
                    title={`Revoke ${name}'s verification?`}
                  >
                    <RotateCcw className="size-4" /> Revoke
                  </ConfirmSubmit>
                </form>
              )}

              {profile.verification_status !== "suspended" && (
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
                <input name="is_admin" type="hidden" value={profile.is_admin ? "false" : "true"} />
                <p className={`${labelClass} flex-1`}>
                  {profile.is_admin
                    ? "[ HAS ADMIN ACCESS ]"
                    : profile.verification_status === "verified"
                      ? "[ NO ADMIN ACCESS ]"
                      : "[ ONLY VERIFIED STUDENTS CAN BE MADE ADMINS ]"}
                </p>
                {profile.is_admin ? (
                  <ConfirmSubmit
                    confirmLabel="Remove access"
                    message={`${name} will lose access to the moderation desk.`}
                    pendingLabel="…"
                    title={`Remove admin access from ${name}?`}
                  >
                    Remove admin
                  </ConfirmSubmit>
                ) : (
                  profile.verification_status === "verified" && (
                    <SubmitButton pendingLabel="…" variant="secondary">
                      <ShieldCheck className="size-4" /> Make admin
                    </SubmitButton>
                  )
                )}
              </form>
            </div>
          </Section>

          <Section icon={<Pencil className="size-3.5" />} title="Edit details">
            <form action={updateStudentDetails} className="grid gap-3 sm:grid-cols-2">
              {hidden}
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>FULL NAME</span>
                <input className={inputClass} defaultValue={profile.full_name} maxLength={80} minLength={2} name="full_name" required />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>DEPARTMENT</span>
                <input className={inputClass} defaultValue={profile.department ?? ""} maxLength={80} name="department" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>YEAR OF STUDY</span>
                <select className={inputClass} defaultValue={profile.year_of_study ?? ""} name="year_of_study">
                  <option value="">Not set</option>
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={year}>Year {year}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>PHONE</span>
                <input className={inputClass} defaultValue={profile.phone ?? ""} inputMode="numeric" maxLength={10} name="phone" pattern="[6-9][0-9]{9}" placeholder="10-digit mobile" />
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
                <span className={labelClass}>THE STUDENT ISN’T NOTIFIED. THE OLD VALUES GO TO THE AUDIT LOG.</span>
              </div>
            </form>
            {profile.avatar_path && (
              <form action={removeStudentAvatar} className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
                {hidden}
                <span className={`${labelClass} flex-1`}>REMOVE AN INAPPROPRIATE PROFILE PHOTO. THEY CAN UPLOAD A NEW ONE.</span>
                <ConfirmSubmit confirmLabel="Remove photo" message="The photo file is deleted." pendingLabel="…" title={`Remove ${name}'s profile photo?`}>
                  <ImageOff className="size-4" /> Remove photo
                </ConfirmSubmit>
              </form>
            )}
          </Section>

          <Section icon={<Gauge className="size-3.5" />} title="Trust score">
            <form action={setStudentTrust} className="flex flex-wrap items-end gap-3">
              {hidden}
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>SCORE (0–100)</span>
                <input className={`${inputClass} w-24`} defaultValue={Math.round(profile.trust_score)} max={100} min={0} name="trust_score" required step={1} type="number" />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-64">
                <span className={labelClass}>REASON (AUDIT LOG ONLY)</span>
                <input className={inputClass} maxLength={300} minLength={3} name="reason" placeholder="Why are you changing it?" required />
              </label>
              <SubmitButton pendingLabel="…" variant="secondary">Set score</SubmitButton>
            </form>
            <form action={recalculateStudentTrust} className="mt-4 flex flex-wrap items-center gap-3">
              {hidden}
              <span className={`${labelClass} flex-1`}>
                A SET SCORE LASTS UNTIL THEIR NEXT REVIEW OR LOAN CHANGE, WHICH RECALCULATES IT FROM RATINGS, RETURNS AND INCIDENTS.
              </span>
              <SubmitButton pendingLabel="…" variant="secondary">
                <RotateCcw className="size-4" /> Recalculate now
              </SubmitButton>
            </form>
          </Section>

          <Section icon={<Bell className="size-3.5" />} title="Send a notice">
            <form action={sendStudentNotice} className="grid gap-3">
              {hidden}
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>TITLE</span>
                <input className={inputClass} maxLength={100} minLength={3} name="title" placeholder="e.g. Please return the projector" required />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>MESSAGE</span>
                <textarea className={`${inputClass} min-h-24`} maxLength={1000} name="body" required />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton pendingLabel="Sending…">
                  <Bell className="size-4" /> Send notice
                </SubmitButton>
                <span className={labelClass}>LANDS IN THEIR NOTIFICATIONS (AND EMAIL, IF THEY GET EMAIL UPDATES).</span>
              </div>
            </form>
          </Section>

          <Section icon={<PackageX className="size-3.5" />} title="Listings & fines">
            <div className="flex flex-col gap-4">
              <form action={pauseStudentListings} className="flex flex-wrap items-center gap-3">
                {hidden}
                <span className={`${labelClass} flex-1`}>
                  {liveListings} LIVE LISTING{liveListings === 1 ? "" : "S"}. PAUSING TAKES THEM OFF THE SHELF; LOANS IN PROGRESS CARRY ON.
                </span>
                <ConfirmSubmit confirmLabel="Pause all" message={`All ${liveListings} live listings will be paused. ${name} is notified and can turn them back on.`} pendingLabel="…" title="Pause every live listing?">
                  <PackageX className="size-4" /> Pause listings
                </ConfirmSubmit>
              </form>
              <form action={waiveStudentFines} className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                {hidden}
                <span className={`${labelClass} flex-1`}>
                  {pendingFines.length} PENDING FINE{pendingFines.length === 1 ? "" : "S"} · {formatMoney(pendingTotal)}
                </span>
                <ConfirmSubmit confirmLabel="Waive all" message={`${pendingFines.length} fines totalling ${formatMoney(pendingTotal)} will be waived. ${name} is notified for each.`} pendingLabel="…" title="Waive every pending fine?">
                  <ReceiptText className="size-4" /> Waive fines
                </ConfirmSubmit>
              </form>
            </div>
          </Section>
        </div>
      )}

      <div className="mt-10 grid gap-4">
        <Section icon={<PackageX className="size-3.5" />} title={`Listings · ${items.length}`}>
          {items.length === 0 ? (
            <p className={labelClass}>NO LISTINGS.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <li className="flex items-center justify-between gap-3 py-2" key={item.id}>
                  <Link className="type-body truncate text-[13px] normal-case hover:text-accent" href={`/items/${item.id}`}>{item.title}</Link>
                  <span className="font-secondary shrink-0 text-[9px] uppercase text-ink/50">{item.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={<History className="size-3.5" />} title={`Recent loans · ${loans.length}`}>
          {loans.length === 0 ? (
            <p className={labelClass}>NO LOANS.</p>
          ) : (
            <ul className="divide-y divide-line">
              {loans.map((loan) => (
                <li className="flex flex-wrap items-center justify-between gap-3 py-2" key={loan.id}>
                  <Link className="min-w-0 hover:text-accent" href={`/loans/${loan.id}`}>
                    <span className="type-body block truncate text-[13px] normal-case">{loan.item_title}</span>
                    <span className={labelClass}>
                      {loan.role === "borrower" ? "BORROWED FROM" : "LENT TO"} {loan.other_name.toUpperCase()} ·{" "}
                      {formatDate(loan.start_date).toUpperCase()} → {formatDate(loan.due_date).toUpperCase()}
                    </span>
                  </Link>
                  <StatusBadge tone={loanTone(loan.status)}>{loanStatusLabel(loan.status as LoanStatus)}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={<ReceiptText className="size-3.5" />} title={`Fines · ${fines.length}`}>
          {fines.length === 0 ? (
            <p className={labelClass}>NO FINES.</p>
          ) : (
            <ul className="divide-y divide-line">
              {fines.map((fine) => (
                <li className="flex flex-wrap items-center justify-between gap-3 py-2" key={fine.id}>
                  <div className="min-w-0">
                    <p className="type-body text-[13px] normal-case">{formatMoney(fine.amount)} · {fine.reason}</p>
                    <p className={labelClass}>{fine.source.toUpperCase()} · {relativeTime(fine.created_at).toUpperCase()}</p>
                  </div>
                  <StatusBadge tone={fine.status === "pending" ? "warning" : "muted"}>{fineStatusLabel(fine.status as FineStatus)}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={<History className="size-3.5" />} title="Admin history">
          {audit.length === 0 ? (
            <p className={labelClass}>NO ADMIN ACTIONS YET.</p>
          ) : (
            <ul className="divide-y divide-line">
              {audit.map((entry) => {
                const note = entry.metadata?.note ?? entry.metadata?.reason ?? entry.metadata?.title;
                return (
                  <li className="py-2" key={entry.id}>
                    <p className="type-body text-[13px] normal-case">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                      {typeof note === "string" && note ? <span className="text-ink/60"> — {note}</span> : null}
                    </p>
                    <p className={labelClass}>
                      {(entry.actor_name ?? "System").toUpperCase()} · {relativeTime(entry.created_at).toUpperCase()}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
