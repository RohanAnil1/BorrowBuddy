import type { FineStatus, LoanStatus } from "@borrowbuddy/shared";
import {
  Bell,
  ExternalLink,
  Gauge,
  History,
  ImageOff,
  PackageX,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserRound,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Avatar,
  DangerZone,
  Field,
  KeyValue,
  Notice,
  PageHeader,
  Panel,
  Tabs,
  VERIFICATION_TONE,
  buttonClass,
  inputClass,
} from "@/components/admin/ui";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { StatusBadge, loanTone } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { auditLabel, auditNote } from "@/lib/admin-audit";
import { UUID } from "@/lib/admin-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { signedUrls } from "@/lib/data/admin";
import { getStudentDetail } from "@/lib/data/profiles";
import { fineStatusLabel, formatDate, formatMoney, loanStatusLabel, relativeTime } from "@/lib/format";
import { BUCKETS, publicUrl } from "@/lib/storage";
import {
  deleteStudent,
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

const OPEN_LOAN_STATUSES = new Set(["awaiting_pickup", "active", "return_pending", "overdue", "disputed"]);
const TABS = ["overview", "access", "details", "trust", "activity", "danger"] as const;
type Tab = (typeof TABS)[number];

/** One action row inside a panel: what it does on the left, the control on the right. */
function ActionRow({ title, body, children }: { title: string; body: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0 dt:flex-row dt:items-center dt:justify-between dt:gap-6">
      <div className="min-w-0">
        <p className="font-strong text-[13px] uppercase">{title}</p>
        <div className="mt-0.5 text-[13px] normal-case leading-5 text-ink/65">{body}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default async function AdminStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : "overview";

  const detail = await getStudentDetail(id);
  if (!detail) notFound();
  const { profile, items, loans, fines, audit } = detail;

  const isSelf = profile.id === me.id;
  const name = profile.full_name || "Unnamed student";
  const base = `/admin/students/${profile.id}`;
  const tabHref = (key: Tab) => (key === "overview" ? base : `${base}?tab=${key}`);
  const returnTo = tabHref(tab);
  const avatar = publicUrl(BUCKETS.avatars, profile.avatar_path);
  const liveListings = items.filter((item) => item.status === "available").length;
  const pendingFines = fines.filter((fine) => fine.status === "pending");
  const pendingTotal = pendingFines.reduce((sum, fine) => sum + fine.amount, 0);
  const openLoans = loans.filter((loan) => OPEN_LOAN_STATUSES.has(loan.status)).length;
  const idUrl = profile.student_id_path
    ? ((await signedUrls(BUCKETS.studentIds, [profile.student_id_path])).get(profile.student_id_path) ?? null)
    : null;

  const hidden = (
    <>
      <input name="profile_id" type="hidden" value={profile.id} />
      <input name="return_to" type="hidden" value={returnTo} />
    </>
  );
  const selfNotice = <Notice tone="info">This is your account. Another admin has to change your access, details or trust score.</Notice>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {idUrl && (
              <Link className={buttonClass.secondary} href={idUrl} target="_blank">
                <ExternalLink aria-hidden className="size-4" /> Student ID
              </Link>
            )}
            {profile.verification_status === "verified" && (
              <Link className={buttonClass.secondary} href={`/users/${profile.id}`}>
                <UserRound aria-hidden className="size-4" /> Public profile
              </Link>
            )}
          </>
        }
        back={{ href: "/admin/students", label: "All students" }}
        eyebrow={`STUDENT · ${profile.verification_status}`}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={name} size={56} src={avatar} />
            <span className="min-w-0 normal-case">{name}</span>
          </span>
        }
      />

      <div className="flex flex-col gap-4 border border-line bg-panel p-5 dt:flex-row dt:items-center dt:justify-between">
        <div className="min-w-0">
          <p className="break-all text-[14px] normal-case text-ink/80">{profile.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={VERIFICATION_TONE[profile.verification_status]}>{profile.verification_status}</StatusBadge>
            {profile.is_admin && <StatusBadge tone="success">Admin</StatusBadge>}
            {isSelf && <StatusBadge>You</StatusBadge>}
          </div>
        </div>
        <KeyValue
          className="dt:min-w-[26rem]"
          items={[
            { label: "Trust", value: Math.round(profile.trust_score) },
            { label: "Listings", value: items.length },
            { label: "Open loans", value: openLoans },
            {
              label: "Unpaid",
              value: <span className={pendingTotal ? "text-warn" : undefined}>{formatMoney(pendingTotal)}</span>,
            },
          ]}
        />
      </div>

      <Tabs
        active={tab}
        label="Student sections"
        tabs={[
          { key: "overview", label: "Overview", href: tabHref("overview") },
          { key: "access", label: "Access", href: tabHref("access") },
          { key: "details", label: "Details", href: tabHref("details") },
          { key: "trust", label: "Trust & fines", href: tabHref("trust"), count: pendingFines.length || undefined },
          { key: "activity", label: "Activity", href: tabHref("activity"), count: loans.length },
          { key: "danger", label: "Danger zone", href: tabHref("danger"), tone: "danger" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel icon={<UserRound aria-hidden className="size-3.5" />} title="Profile">
            <dl className="grid grid-cols-2 gap-4 text-[14px] normal-case">
              <div>
                <dt className="font-secondary text-[11px] text-ink/55">Department</dt>
                <dd className="mt-0.5">{profile.department ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-secondary text-[11px] text-ink/55">Year</dt>
                <dd className="mt-0.5">{profile.year_of_study ? `Year ${profile.year_of_study}` : "—"}</dd>
              </div>
              <div>
                <dt className="font-secondary text-[11px] text-ink/55">Phone</dt>
                <dd className="mt-0.5">{profile.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-secondary text-[11px] text-ink/55">Joined</dt>
                <dd className="mt-0.5">{relativeTime(profile.created_at)}</dd>
              </div>
            </dl>
            {profile.verification_note && (
              <div className="mt-4 border-l-2 border-warn/60 pl-3">
                <p className="font-secondary text-[11px] text-ink/55">Last verification note</p>
                <p className="mt-0.5 text-[14px] normal-case">{profile.verification_note}</p>
              </div>
            )}
          </Panel>

          <Panel bodyClassName="p-3" title="Student ID">
            {idUrl ? (
              <Link className="block border border-line bg-black" href={idUrl} target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`Student ID uploaded by ${name}`} className="max-h-72 w-full object-contain" src={idUrl} />
              </Link>
            ) : (
              <p className="flex items-center gap-2 px-2 py-6 text-[13px] normal-case text-ink/60">
                <ImageOff aria-hidden className="size-4" /> No student ID on file.
              </p>
            )}
          </Panel>

          <Panel
            action={
              <Link className="font-secondary text-[11px] text-accent hover:underline" href={tabHref("activity")}>
                Full history →
              </Link>
            }
            bodyClassName="p-0"
            className="xl:col-span-2"
            icon={<History aria-hidden className="size-3.5" />}
            title="Latest admin actions"
          >
            {audit.length === 0 ? (
              <p className="px-5 py-6 text-[13px] normal-case text-ink/60">No admin has acted on this account yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {audit.slice(0, 5).map((entry) => (
                  <AuditItem entry={entry} key={entry.id} />
                ))}
              </ol>
            )}
          </Panel>
        </div>
      )}

      {tab === "access" &&
        (isSelf ? (
          selfNotice
        ) : (
          <Panel icon={<ShieldCheck aria-hidden className="size-3.5" />} title="Access">
            {profile.verification_status !== "verified" && (
              <ActionRow
                body={
                  profile.verification_status === "suspended"
                    ? "Lift the suspension. They can sign in and borrow again."
                    : "Confirm their student ID. They can start borrowing and lending."
                }
                title={profile.verification_status === "suspended" ? "Reinstate" : "Verify"}
              >
                <form action={setStudentStatus}>
                  {hidden}
                  <input name="status" type="hidden" value="verified" />
                  <SubmitButton pendingLabel="…">
                    <UserCheck aria-hidden className="size-4" />
                    {profile.verification_status === "suspended" ? "Reinstate" : "Verify"}
                  </SubmitButton>
                </form>
              </ActionRow>
            )}

            {profile.verification_status === "pending" && (
              <form action={setStudentStatus} className="border-b border-line py-4 first:pt-0 last:border-b-0">
                {hidden}
                <input name="status" type="hidden" value="rejected" />
                <p className="font-strong text-[13px] uppercase">Reject their ID</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input aria-label="Reason, sent to the student" className={inputClass} maxLength={500} name="note" placeholder="Reason (sent to them)" />
                  <SubmitButton pendingLabel="…" variant="danger">
                    <UserX aria-hidden className="size-4" /> Reject
                  </SubmitButton>
                </div>
              </form>
            )}

            {(profile.verification_status === "verified" || profile.verification_status === "rejected") && (
              <form action={revokeStudentVerification} className="border-b border-line py-4 first:pt-0 last:border-b-0">
                {hidden}
                <p className="font-strong text-[13px] uppercase">Revoke verification</p>
                <p className="mt-0.5 text-[13px] normal-case leading-5 text-ink/65">
                  Back to pending. Their student ID is cleared, so they must upload a new one
                  {profile.is_admin ? ", and they lose admin access" : ""}.
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input aria-label="Reason, sent to the student" className={inputClass} maxLength={500} name="note" placeholder="Reason (sent to them)" />
                  <ConfirmSubmit
                    confirmLabel="Revoke"
                    message={`${name} goes back to verification and must upload a new student ID.`}
                    pendingLabel="…"
                    title={`Revoke ${name}'s verification?`}
                  >
                    <RotateCcw aria-hidden className="size-4" /> Revoke
                  </ConfirmSubmit>
                </div>
              </form>
            )}

            {profile.verification_status !== "suspended" && (
              <form action={setStudentStatus} className="border-b border-line py-4 first:pt-0 last:border-b-0">
                {hidden}
                <input name="status" type="hidden" value="suspended" />
                <p className="font-strong text-[13px] uppercase">Suspend</p>
                <p className="mt-0.5 text-[13px] normal-case leading-5 text-ink/65">
                  Locks them out of BorrowBuddy until an admin reinstates them. Use this to keep someone out; deleting lets them sign up again.
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input aria-label="Reason for suspension, sent to the student" className={inputClass} maxLength={500} name="note" placeholder="Reason (sent to them)" />
                  <ConfirmSubmit
                    confirmLabel="Suspend"
                    message={`${name} will be locked out of BorrowBuddy until an admin reinstates them.`}
                    pendingLabel="…"
                    title={`Suspend ${name}?`}
                  >
                    <ShieldOff aria-hidden className="size-4" /> Suspend
                  </ConfirmSubmit>
                </div>
              </form>
            )}

            <ActionRow
              body={
                profile.is_admin
                  ? "Can review students, incidents, fines, claims and groups."
                  : profile.verification_status === "verified"
                    ? "No access to the admin console."
                    : "Only verified students can be made admins."
              }
              title="Admin access"
            >
              <form action={setStudentAdmin}>
                {hidden}
                <input name="is_admin" type="hidden" value={profile.is_admin ? "false" : "true"} />
                {profile.is_admin ? (
                  <ConfirmSubmit
                    confirmLabel="Remove access"
                    message={`${name} will lose access to the admin console.`}
                    pendingLabel="…"
                    title={`Remove admin access from ${name}?`}
                  >
                    Remove admin
                  </ConfirmSubmit>
                ) : (
                  profile.verification_status === "verified" && (
                    <SubmitButton pendingLabel="…" variant="secondary">
                      <ShieldCheck aria-hidden className="size-4" /> Make admin
                    </SubmitButton>
                  )
                )}
              </form>
            </ActionRow>
          </Panel>
        ))}

      {tab === "details" &&
        (isSelf ? (
          selfNotice
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Edit details">
              <form action={updateStudentDetails} className="grid gap-4 sm:grid-cols-2">
                {hidden}
                <Field className="sm:col-span-2" label="Full name">
                  <input className={inputClass} defaultValue={profile.full_name} maxLength={80} minLength={2} name="full_name" required />
                </Field>
                <Field label="Department">
                  <input className={inputClass} defaultValue={profile.department ?? ""} maxLength={80} name="department" />
                </Field>
                <Field label="Year of study">
                  <select className={inputClass} defaultValue={profile.year_of_study ?? ""} name="year_of_study">
                    <option value="">Not set</option>
                    {[1, 2, 3, 4, 5, 6].map((year) => (
                      <option key={year} value={year}>
                        Year {year}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field className="sm:col-span-2" hint="10-digit Indian mobile number." label="Phone">
                  <input className={inputClass} defaultValue={profile.phone ?? ""} inputMode="numeric" maxLength={10} name="phone" pattern="[6-9][0-9]{9}" />
                </Field>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
                  <span className="text-[12px] normal-case text-ink/55">The student isn&apos;t notified. Old values go to the audit log.</span>
                </div>
              </form>
              {profile.avatar_path && (
                <form action={removeStudentAvatar} className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                  {hidden}
                  <div className="flex items-center gap-3">
                    <Avatar name={name} size={44} src={avatar} />
                    <span className="text-[13px] normal-case text-ink/65">Remove an inappropriate profile photo. They can upload a new one.</span>
                  </div>
                  <ConfirmSubmit confirmLabel="Remove photo" message="The photo file is deleted." pendingLabel="…" title={`Remove ${name}'s profile photo?`}>
                    <ImageOff aria-hidden className="size-4" /> Remove photo
                  </ConfirmSubmit>
                </form>
              )}
            </Panel>

            <Panel icon={<Bell aria-hidden className="size-3.5" />} title="Send a notice">
              <form action={sendStudentNotice} className="flex flex-col gap-4">
                {hidden}
                <Field label="Title">
                  <input className={inputClass} maxLength={100} minLength={3} name="title" placeholder="Please return the projector" required />
                </Field>
                <Field hint="Lands in their notifications, and their email if they get email updates." label="Message">
                  <textarea className={`${inputClass} min-h-32`} maxLength={1000} name="body" required />
                </Field>
                <div>
                  <SubmitButton pendingLabel="Sending…">
                    <Bell aria-hidden className="size-4" /> Send notice
                  </SubmitButton>
                </div>
              </form>
            </Panel>
          </div>
        ))}

      {tab === "trust" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel icon={<Gauge aria-hidden className="size-3.5" />} title="Trust score">
            <div className="flex items-end gap-4">
              <span className="type-title leading-none tabular-nums" style={{ fontSize: "3.5rem" }}>
                {Math.round(profile.trust_score)}
              </span>
              <div className="mb-1 h-2 flex-1 overflow-hidden rounded-full bg-ink/10" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, profile.trust_score))}%` }} />
              </div>
            </div>
            {isSelf ? (
              <p className="mt-4 text-[13px] normal-case text-ink/60">Another admin has to change your trust score.</p>
            ) : (
              <>
                <form action={setStudentTrust} className="mt-5 grid gap-3 sm:grid-cols-[7rem_1fr]">
                  {hidden}
                  <Field label="New score">
                    <input className={inputClass} defaultValue={Math.round(profile.trust_score)} max={100} min={0} name="trust_score" required step={1} type="number" />
                  </Field>
                  <Field label="Reason (audit log only)">
                    <input className={inputClass} maxLength={300} minLength={3} name="reason" placeholder="Why are you changing it?" required />
                  </Field>
                  <div className="sm:col-span-2">
                    <SubmitButton pendingLabel="…" variant="secondary">Set score</SubmitButton>
                  </div>
                </form>
                <form action={recalculateStudentTrust} className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                  {hidden}
                  <span className="text-[13px] normal-case leading-5 text-ink/65">
                    A set score lasts until their next review or loan change, which recalculates it from ratings, returns and incidents.
                  </span>
                  <SubmitButton pendingLabel="…" variant="secondary">
                    <RotateCcw aria-hidden className="size-4" /> Recalculate
                  </SubmitButton>
                </form>
              </>
            )}
          </Panel>

          <Panel icon={<ReceiptText aria-hidden className="size-3.5" />} title="Penalties">
            <ActionRow
              body={`${pendingFines.length} unpaid fine${pendingFines.length === 1 ? "" : "s"} · ${formatMoney(pendingTotal)}. They're notified for each one waived.`}
              title="Waive every unpaid fine"
            >
              <form action={waiveStudentFines}>
                {hidden}
                <ConfirmSubmit
                  confirmLabel="Waive all"
                  message={`${pendingFines.length} fines totalling ${formatMoney(pendingTotal)} will be waived. ${name} is notified for each.`}
                  pendingLabel="…"
                  title="Waive every unpaid fine?"
                >
                  <ReceiptText aria-hidden className="size-4" /> Waive fines
                </ConfirmSubmit>
              </form>
            </ActionRow>
            <ActionRow
              body={`${liveListings} live listing${liveListings === 1 ? "" : "s"}. Pausing takes them off the shelf; loans in progress carry on.`}
              title="Pause every listing"
            >
              <form action={pauseStudentListings}>
                {hidden}
                <ConfirmSubmit
                  confirmLabel="Pause all"
                  message={`All ${liveListings} live listings will be paused. ${name} is notified and can turn them back on.`}
                  pendingLabel="…"
                  title="Pause every live listing?"
                >
                  <PackageX aria-hidden className="size-4" /> Pause listings
                </ConfirmSubmit>
              </form>
            </ActionRow>
          </Panel>

          <Panel bodyClassName="p-0" className="xl:col-span-2" count={fines.length} title="Fines">
            {fines.length === 0 ? (
              <p className="px-5 py-6 text-[13px] normal-case text-ink/60">No fines.</p>
            ) : (
              <ul className="divide-y divide-line">
                {fines.map((fine) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={fine.id}>
                    <div className="min-w-0">
                      <p className="text-[14px] normal-case">
                        <span className="type-body-alt tabular-nums">{formatMoney(fine.amount)}</span> · {fine.reason}
                      </p>
                      <p className="text-[12px] normal-case text-ink/55">
                        {fine.source} · {relativeTime(fine.created_at)}
                      </p>
                    </div>
                    <StatusBadge tone={fine.status === "pending" ? "warning" : "muted"}>{fineStatusLabel(fine.status as FineStatus)}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "activity" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel bodyClassName="p-0" count={loans.length} title="Recent loans">
            {loans.length === 0 ? (
              <p className="px-5 py-6 text-[13px] normal-case text-ink/60">No loans yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {loans.map((loan) => (
                  <li key={loan.id}>
                    <Link className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-ink/[0.03]" href={`/loans/${loan.id}`}>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] normal-case">{loan.item_title}</span>
                        <span className="block text-[12px] normal-case text-ink/55">
                          {loan.role === "borrower" ? "Borrowed from" : "Lent to"} {loan.other_name} · {formatDate(loan.start_date)} → {formatDate(loan.due_date)}
                        </span>
                      </span>
                      <StatusBadge tone={loanTone(loan.status)}>{loanStatusLabel(loan.status as LoanStatus)}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel bodyClassName="p-0" count={items.length} title="Listings">
            {items.length === 0 ? (
              <p className="px-5 py-6 text-[13px] normal-case text-ink/60">No listings.</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-ink/[0.03]" href={`/items/${item.id}`}>
                      <span className="truncate text-[14px] normal-case">{item.title}</span>
                      <StatusBadge tone={item.status === "available" ? "success" : "muted"}>{item.status}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            bodyClassName="p-0"
            className="xl:col-span-2"
            icon={<History aria-hidden className="size-3.5" />}
            title="Admin history"
          >
            {audit.length === 0 ? (
              <p className="px-5 py-6 text-[13px] normal-case text-ink/60">No admin actions yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {audit.map((entry) => (
                  <AuditItem entry={entry} key={entry.id} />
                ))}
              </ol>
            )}
          </Panel>
        </div>
      )}

      {tab === "danger" &&
        (isSelf ? (
          selfNotice
        ) : (
          <DangerZone title="Delete profile">
            {openLoans > 0 ? (
              <p className="text-[14px] normal-case leading-6 text-warn">
                {name} has {openLoans} loan{openLoans === 1 ? "" : "s"} in progress. Finish or cancel {openLoans === 1 ? "it" : "them"} before
                deleting the profile.
              </p>
            ) : (
              <form action={deleteStudent} className="flex max-w-2xl flex-col gap-4">
                <input name="profile_id" type="hidden" value={profile.id} />
                <p className="text-[14px] normal-case leading-6 text-ink/75">
                  Permanently removes {name}&apos;s profile, their {items.length} listing{items.length === 1 ? "" : "s"},{" "}
                  {loans.length} past loan{loans.length === 1 ? "" : "s"} (with those loans&apos; fines, reviews and incidents, including on the
                  other student&apos;s side), their photo and student ID. They&apos;re signed out everywhere. This can&apos;t be undone. They can
                  still sign up again with the same email; to keep them out, suspend them instead.
                </p>
                <Field label={`Type ${profile.email} to confirm`}>
                  <input autoComplete="off" className={inputClass} name="confirm_email" placeholder={profile.email} required spellCheck={false} />
                </Field>
                <div>
                  <ConfirmSubmit
                    confirmLabel="Delete forever"
                    message={`${name}'s profile, listings and past loans are deleted. This can't be undone.`}
                    pendingLabel="Deleting…"
                    title={`Delete ${name}'s profile?`}
                  >
                    <Trash2 aria-hidden className="size-4" /> Delete profile
                  </ConfirmSubmit>
                </div>
              </form>
            )}
          </DangerZone>
        ))}
    </div>
  );
}

function AuditItem({
  entry,
}: {
  entry: { id: number; action: string; metadata: Record<string, unknown>; created_at: string; actor_name: string | null };
}) {
  const note = auditNote(entry.metadata ?? {});
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] normal-case">{auditLabel(entry.action)}</p>
        {note && <p className="mt-0.5 text-[12px] normal-case text-ink/60">“{note}”</p>}
      </div>
      <span className="shrink-0 text-right text-[12px] normal-case text-ink/55">
        {entry.actor_name ?? "System"}
        <span className="block">{relativeTime(entry.created_at)}</span>
      </span>
    </li>
  );
}
