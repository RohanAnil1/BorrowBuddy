import { AlertTriangle, Check, ExternalLink, MapPin, Receipt, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PinForm } from "@/components/app/pin-form";
import { StatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { formatMoney, relativeTime } from "@/lib/format";
import { requireAdmin } from "@/lib/auth/guards";
import { getPendingFines } from "@/lib/data/fines";
import { getOpenIncidents } from "@/lib/data/incidents";
import { getAllPickupLocations } from "@/lib/data/items";
import { getPendingVerifications } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";
import { BUCKETS } from "@/lib/storage";
import { reviewVerification } from "./actions";
import { actOnFine, resolveIncident } from "./moderation-actions";
import { removePin, savePin } from "./pins-actions";

export const metadata = { title: "Admin" };

const inputClass =
  "rounded-lg border border-line bg-black px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  const [pending, incidents, fines, locations] = await Promise.all([
    getPendingVerifications(),
    getOpenIncidents(),
    getPendingFines(),
    getAllPickupLocations(),
  ]);

  const supabase = await createClient();
  const signedUrls = new Map<string, string>();

  for (const profile of pending) {
    if (!profile.student_id_path) continue;
    const { data } = await supabase.storage
      .from(BUCKETS.studentIds)
      .createSignedUrl(profile.student_id_path, 60 * 30);
    if (data?.signedUrl) signedUrls.set(profile.id, data.signedUrl);
  }

  const photoUrls = new Map<string, string>();
  for (const incident of incidents) {
    for (const photo of incident.photos ?? []) {
      const { data } = await supabase.storage
        .from(BUCKETS.incidentPhotos)
        .createSignedUrl(photo.path, 60 * 30);
      if (data?.signedUrl) photoUrls.set(photo.id, data.signedUrl);
    }
  }

  const mappedCount = locations.filter(
    (location) => location.xp !== null && location.yp !== null && location.is_active,
  ).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ CONTROL ROOM — ADMIN ONLY ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Moderation desk</h1>

      <Link href="/campus/admin" className="mt-6 inline-flex items-center gap-3 border border-accent/40 bg-black px-5 py-4 font-secondary text-xs text-accent hover:border-accent">
        <ShieldCheck className="size-5" /> CAMPUS OWNERSHIP CLAIMS & COLLECTION REVIEWS →
      </Link>

      {error && (
        <p className="mt-6 border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ {error} ]
        </p>
      )}

      <section className="mt-10">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">
          [ VERIFICATION QUEUE ]
          {pending.length > 0 && (
            <span className="ml-3 bg-accent px-2 py-0.5 font-secondary text-[10px] text-white">
              {pending.length}
            </span>
          )}
        </h2>
        <p className="type-body mt-1 text-[12px] text-ink/60 uppercase">
          {pending.length} student{pending.length === 1 ? "" : "s"} waiting for review.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {pending.length === 0 ? (
            <p className="border border-line bg-panel px-6 py-8 text-center font-secondary text-[10px] text-ink/50">
              QUEUE IS CLEAR. NEW SIGN-UPS LAND HERE WITH THEIR STUDENT ID.
            </p>
          ) : (
            pending.map((profile) => {
              const signedUrl = signedUrls.get(profile.id);
              return (
                <article className="border border-line bg-panel p-6" key={profile.id}>
                  <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="w-full min-w-0 dt:w-auto dt:min-w-56">
                      <p className="type-body-alt text-[15px] uppercase">
                        {profile.full_name || "Unnamed student"}
                      </p>
                      <p className="font-secondary mt-1 text-[10px] text-ink/50">
                        {profile.email.toUpperCase()}
                      </p>
                      <p className="type-body mt-1 text-[12px] uppercase text-ink/60">
                        {profile.department ?? "No department"} · YEAR{" "}
                        {profile.year_of_study ?? "NOT SET"}
                      </p>
                      <p className="font-secondary mt-3 text-[9px] text-ink/40">
                        SIGNED UP {relativeTime(profile.created_at).toUpperCase()}
                      </p>
                    </div>

                    <div className="flex flex-col gap-4">
                      {signedUrl ? (
                        <Link
                          className="inline-flex items-center gap-2 border border-line px-4 py-3 font-strong text-[12px] uppercase transition-colors hover:border-accent"
                          href={signedUrl}
                          target="_blank"
                        >
                          <ExternalLink className="size-4" />
                          View student ID
                        </Link>
                      ) : (
                        <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[9px] text-warn">
                          [ NO STUDENT ID UPLOADED ]
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <form action={reviewVerification} className="flex items-center gap-2">
                          <input name="profile_id" type="hidden" value={profile.id} />
                          <input name="decision" type="hidden" value="approve" />
                          <SubmitButton pendingLabel="…">
                            <Check className="size-4" />
                            Approve
                          </SubmitButton>
                        </form>

                        <form action={reviewVerification} className="flex items-center gap-2">
                          <input name="profile_id" type="hidden" value={profile.id} />
                          <input name="decision" type="hidden" value="reject" />
                          <input
                            className={`${inputClass} w-full sm:w-44`}
                            maxLength={500}
                            name="note"
                            placeholder="Reason (sent to them)"
                          />
                          <SubmitButton pendingLabel="…" variant="danger">
                            <X className="size-4" />
                            Reject
                          </SubmitButton>
                        </form>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">
          [ INCIDENT QUEUE ]
          {incidents.length > 0 && (
            <span className="ml-3 bg-warn px-2 py-0.5 font-secondary text-[10px] text-black">
              {incidents.length}
            </span>
          )}
        </h2>

        <div className="mt-4 flex flex-col gap-4">
          {incidents.length === 0 ? (
            <EmptyState
              body="DAMAGE, LOSS AND NO-SHOW REPORTS LAND HERE WITH PHOTOS FROM BOTH PARTIES."
              code="NO INCIDENTS"
              icon={<AlertTriangle className="size-7" />}
              title="No open incidents"
            />
          ) : (
            incidents.map((incident) => (
              <article className="border border-warn/40 bg-panel p-6" key={incident.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="type-body-alt text-[15px] uppercase">
                      {incident.type.replace("_", " ")}
                      <span className="ml-2 font-secondary text-[9px] text-ink/50">
                        {(incident.loan?.item_title ?? "LOAN").toUpperCase()} · REPORTED BY{" "}
                        {(incident.reporter?.full_name ?? "A PARTY").toUpperCase()}
                      </span>
                    </p>
                    <p className="type-body mt-2 max-w-2xl text-[13px] leading-6 text-ink/60 uppercase">
                      {incident.description}
                    </p>
                    <p className="font-secondary mt-2 text-[9px] text-ink/40">
                      {relativeTime(incident.created_at).toUpperCase()} · LOAN{" "}
                      <Link
                        className="text-accent underline-offset-4 transition-colors hover:underline"
                        href={`/loans/${incident.loan_id}`}
                      >
                        {incident.loan_id.slice(0, 8)}
                      </Link>
                    </p>
                  </div>
                  <StatusBadge tone="warning">{incident.status.replace("_", " ")}</StatusBadge>
                </div>

                {(incident.photos ?? []).length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {incident.photos.map((photo) => {
                      const url = photoUrls.get(photo.id);
                      return url ? (
                        <Link href={url} key={photo.id} target="_blank">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt="Incident evidence"
                            className="size-24 border border-line object-cover"
                            src={url}
                          />
                        </Link>
                      ) : null;
                    })}
                  </div>
                )}

                <form
                  action={resolveIncident}
                  className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5"
                >
                  <input name="incident_id" type="hidden" value={incident.id} />
                  <label className="flex flex-col gap-1.5">
                    <span className="font-secondary text-[9px] text-ink/50">DECISION</span>
                    <select className={inputClass} defaultValue="resolved" name="decision">
                      <option value="resolved">Resolved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label className="flex w-full min-w-0 flex-1 flex-col gap-1.5 sm:min-w-64">
                    <span className="font-secondary text-[9px] text-ink/50">RESOLUTION NOTE</span>
                    <input
                      className={inputClass}
                      maxLength={2000}
                      minLength={5}
                      name="resolution_note"
                      placeholder="What did you decide, and why?"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-secondary text-[9px] text-ink/50">FINE (INR)</span>
                    <input
                      className={`${inputClass} w-28`}
                      min={0}
                      name="fine_amount"
                      placeholder="0"
                      step={50}
                      type="number"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-secondary text-[9px] text-ink/50">FINE CHARGED TO</span>
                    <select
                      className={inputClass}
                      defaultValue={incident.loan?.borrower_id ?? ""}
                      name="fine_user_id"
                    >
                      {incident.loan && (
                        <>
                          <option value={incident.loan.borrower_id}>
                            {incident.loan.borrower_name ?? "Borrower"}
                          </option>
                          <option value={incident.loan.owner_id}>
                            {incident.loan.owner_name ?? "Owner"}
                          </option>
                        </>
                      )}
                    </select>
                  </label>
                  <SubmitButton pendingLabel="RESOLVING…">Resolve</SubmitButton>
                </form>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">
          [ PENDING FINES ]
          {fines.length > 0 && (
            <span className="ml-3 bg-warn px-2 py-0.5 font-secondary text-[10px] text-black">
              {fines.length}
            </span>
          )}
        </h2>

        <div className="mt-4 flex flex-col gap-3">
          {fines.length === 0 ? (
            <EmptyState
              body="OVERDUE FINES AND INCIDENT FINES LAND HERE FOR YOU TO MARK SETTLED OR WAIVED."
              code="NO FINES"
              icon={<Receipt className="size-7" />}
              title="No pending fines"
            />
          ) : (
            fines.map((fine) => (
              <article
                className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-5"
                key={fine.id}
              >
                <div>
                  <p className="type-body-alt text-[13px] uppercase">
                    {(fine.user?.full_name ?? "Student").toUpperCase()} ·{" "}
                    {formatMoney(fine.amount)}
                  </p>
                  <p className="type-body mt-1 text-[12px] text-ink/60 uppercase">{fine.reason}</p>
                  <p className="font-secondary mt-1 text-[9px] text-ink/40">
                    {fine.source.toUpperCase()} · {relativeTime(fine.created_at).toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={actOnFine}>
                    <input name="fine_id" type="hidden" value={fine.id} />
                    <input name="action" type="hidden" value="settle" />
                    <SubmitButton pendingLabel="…">
                      <Check className="size-4" />
                      Settled
                    </SubmitButton>
                  </form>
                  <form action={actOnFine}>
                    <input name="fine_id" type="hidden" value={fine.id} />
                    <input name="action" type="hidden" value="waive" />
                    <SubmitButton pendingLabel="…" variant="secondary">
                      Waive
                    </SubmitButton>
                  </form>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">
          [ CAMPUS PINS ]
          {mappedCount > 0 && (
            <span className="ml-3 bg-accent px-2 py-0.5 font-secondary text-[10px] text-white">
              {mappedCount}
            </span>
          )}
        </h2>
        <p className="type-body mt-1 text-[12px] text-ink/60 uppercase">
          Pins with a map position that are on the board appear on the landing within a
          minute. Drag the dot to place one.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {locations.map((location) => {
            const mapped = location.xp !== null && location.yp !== null;
            return (
              <article className="border border-line bg-panel" key={location.id}>
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-4">
                    {mapped ? (
                      <span
                        className="relative block aspect-[4/3] w-20 shrink-0 border border-line bg-[url(/campus-map-thumb.webp)] bg-cover bg-center"
                        title={`${location.xp}% / ${location.yp}%`}
                      >
                        <span
                          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#0c0906] bg-[#ffcf7a]"
                          style={{ left: `${location.xp}%`, top: `${location.yp}%` }}
                        />
                      </span>
                    ) : (
                      <span className="flex aspect-[4/3] w-20 shrink-0 items-center justify-center border border-line font-secondary text-[8px] text-ink/40">
                        NO MAP
                      </span>
                    )}
                    <div>
                      <p className="type-body-alt text-[13px] uppercase">{location.name}</p>
                      <p className="type-body mt-1 text-[12px] uppercase text-ink/60">
                        {location.description ?? "No description"}
                      </p>
                      <p className="font-secondary mt-1 text-[9px] text-ink/40">
                        {mapped
                          ? `MAP ${(location.xp as number).toFixed(1)}% / ${(location.yp as number).toFixed(1)}% · LABEL ${location.map_label.toUpperCase()}`
                          : "NO MAP POSITION"}{" "}
                        · {location.is_active ? "ON THE BOARD" : "HIDDEN"}
                      </p>
                    </div>
                  </div>
                  <form action={removePin}>
                    <input name="id" type="hidden" value={location.id} />
                    <SubmitButton pendingLabel="…" variant="danger">
                      Remove
                    </SubmitButton>
                  </form>
                </div>
                <details>
                  <summary className="cursor-pointer border-t border-line px-5 py-3 font-secondary text-[9px] text-ink/50 transition-colors hover:text-accent">
                    [ EDIT PIN ]
                  </summary>
                  <div className="border-t border-line p-5">
                    <PinForm action={savePin} pin={{ ...location }} submitLabel="Save pin" />
                  </div>
                </details>
              </article>
            );
          })}

          <div className="border border-line bg-panel p-5">
            <h3 className="flex items-center gap-2 font-secondary text-[10px] text-ink/60">
              <MapPin className="size-3.5 text-accent" />
              [ ADD A PIN ]
            </h3>
            <div className="mt-4">
              <PinForm action={savePin} submitLabel="Add pin" />
            </div>
          </div>
        </div>
      </section>

      <p className="font-secondary mt-12 flex items-center gap-2 text-[9px] text-ink/40">
        <ShieldCheck className="size-3.5" />
        EVERY ADMIN ACTION HERE IS WRITTEN TO THE AUDIT LOG.
      </p>
    </div>
  );
}
