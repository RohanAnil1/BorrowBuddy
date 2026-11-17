import { BadgeCheck, Check, ExternalLink, ImageOff, X } from "lucide-react";
import Link from "next/link";
import { Drawer } from "@/components/admin/drawer";
import { Field, Notice, PageHeader, WaitingTag, inputClass } from "@/components/admin/ui";
import { EmptyState } from "@/components/app/empty-state";
import { SubmitButton } from "@/components/app/submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { getVerificationQueue, isStale } from "@/lib/data/admin";
import { reviewVerification } from "../actions";

export const metadata = { title: "Verifications · Admin" };

export default async function VerificationsPage() {
  await requireAdmin();
  const { profiles, error } = await getVerificationQueue();
  const back = "/admin/verifications";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Check each student ID against the name on the account. Approving lets them borrow and lend; rejecting tells them why so they can upload a clearer photo."
        eyebrow={`QUEUE · ${profiles.length} WAITING`}
        title="Verifications"
      />

      {error && <Notice>Could not load the queue: {error}</Notice>}

      {profiles.length === 0 ? (
        <EmptyState
          body="New sign-ups land here with a photo of their Bennett student ID."
          code="QUEUE CLEAR"
          icon={<BadgeCheck className="size-7" />}
          title="Nobody is waiting"
        />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {profiles.map((profile) => {
            const name = profile.full_name || "Unnamed student";
            return (
              <li className="flex min-w-0 flex-col border border-line bg-panel" key={profile.id}>
                <div className="relative aspect-[16/9] border-b border-line bg-black">
                  {profile.id_url ? (
                    <Link
                      aria-label={`Open ${name}'s student ID full size`}
                      className="group block size-full"
                      href={profile.id_url}
                      target="_blank"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={`Student ID uploaded by ${name}`}
                        className="size-full object-contain"
                        src={profile.id_url}
                      />
                      <span className="font-secondary absolute right-3 bottom-3 inline-flex items-center gap-1.5 border border-line bg-black/85 px-2.5 py-1.5 text-[11px] text-ink/80 transition-colors group-hover:text-accent">
                        <ExternalLink aria-hidden className="size-3.5" /> Full size
                      </span>
                    </Link>
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 text-warn">
                      <ImageOff aria-hidden className="size-6" />
                      <span className="font-secondary text-[11px]">No student ID uploaded</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="type-body-alt truncate text-[17px] normal-case">{name}</p>
                      <p className="mt-0.5 break-all text-[13px] normal-case text-ink/60">{profile.email}</p>
                    </div>
                    <WaitingTag since={profile.created_at} stale={isStale(profile.created_at)} />
                  </div>

                  <dl className="grid grid-cols-3 gap-3 border-y border-line py-3">
                    <div className="min-w-0">
                      <dt className="font-secondary text-[11px] text-ink/55">Department</dt>
                      <dd className="mt-0.5 truncate text-[13px] normal-case">{profile.department ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-secondary text-[11px] text-ink/55">Year</dt>
                      <dd className="mt-0.5 text-[13px] normal-case">{profile.year_of_study ?? "—"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="font-secondary text-[11px] text-ink/55">Phone</dt>
                      <dd className="mt-0.5 truncate text-[13px] normal-case">{profile.phone ?? "—"}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <form action={reviewVerification}>
                      <input name="profile_id" type="hidden" value={profile.id} />
                      <input name="decision" type="hidden" value="approve" />
                      <input name="name" type="hidden" value={name} />
                      <input name="return_to" type="hidden" value={back} />
                      <SubmitButton disabled={!profile.id_url} pendingLabel="Approving…">
                        <Check aria-hidden className="size-4" /> Approve
                      </SubmitButton>
                    </form>

                    <Drawer
                      description={
                        <>
                          {name} gets a notification with your reason and can upload a new photo of their ID.
                        </>
                      }
                      eyebrow="REJECT STUDENT ID"
                      icon={<X aria-hidden className="size-4" />}
                      label="Reject"
                      title={name}
                      variant="danger"
                    >
                      <form action={reviewVerification} className="flex flex-col gap-4">
                        <input name="profile_id" type="hidden" value={profile.id} />
                        <input name="decision" type="hidden" value="reject" />
                        <input name="name" type="hidden" value={name} />
                        <input name="return_to" type="hidden" value={back} />
                        <Field hint="Sent to the student. Be specific: blurry photo, name doesn't match, expired card…" label="Reason">
                          <textarea
                            className={`${inputClass} min-h-28`}
                            maxLength={500}
                            minLength={5}
                            name="note"
                            placeholder="The photo is too blurry to read your name. Please upload a sharper one."
                            required
                          />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <SubmitButton pendingLabel="Rejecting…" variant="danger">
                            <X aria-hidden className="size-4" /> Reject ID
                          </SubmitButton>
                        </div>
                      </form>
                    </Drawer>

                    {!profile.id_url && (
                      <p className="w-full text-[12px] normal-case text-ink/55">
                        They haven&apos;t uploaded an ID yet, so there&apos;s nothing to approve.
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
