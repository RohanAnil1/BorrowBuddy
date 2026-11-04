import Link from "next/link";
import { CampusGallery } from "@/components/campus/campus-gallery";
import { notFound } from "next/navigation";
import { campusDate } from "@borrowbuddy/shared";
import {
  CampusBadge,
  CampusFrame,
  fieldClass,
  secondaryClass,
} from "@/components/campus/campus-ui";
import {
  ActionForm,
  Label,
  ReservationPreview,
} from "@/components/campus/campus-forms";
import { requireVerified } from "@/lib/auth/guards";
import {
  campusClaims,
  campusNotes,
  campusPeople,
  campusPhotos,
  campusPost,
  campusTransfers,
} from "@/lib/data/campus";

export default async function CampusPostPage({
  params,
}: {
  params: Promise<{ section: string; id: string }>;
}) {
  const profile = await requireVerified();
  const { section, id } = await params;
  if (!["lost-found", "giveaways"].includes(section)) notFound();
  const post = await campusPost(id);
  if (!post || (post.kind === "found") !== (section === "lost-found"))
    notFound();
  const [photos, people, claims, transfers, notes] = await Promise.all([
    campusPhotos(post.images),
    campusPeople([post.owner_id]),
    post.kind === "found" ? campusClaims(id) : Promise.resolve([]),
    campusTransfers(),
    post.kind === "found" && (post.owner_id === profile.id || profile.is_admin)
      ? campusNotes(id)
      : Promise.resolve(null),
  ]);
  const own = post.owner_id === profile.id;
  const mine = claims.filter((c) => c.claimant_id === profile.id);
  const transfer = transfers.find(
    (t) =>
      t.post_id === id &&
      t.status === "active" &&
      [t.host_id, t.recipient_id].includes(profile.id),
  );
  return (
    <CampusFrame
      title={post.title}
      eyebrow={
        post.kind === "found" ? "FOUND ON CAMPUS" : "FREE TO A GOOD HOME"
      }
      description={`${post.location} · ${people[post.owner_id]?.full_name ?? "Campus member"}`}
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <CampusGallery
            key={post.id}
            paths={post.images}
            urls={photos}
            title={post.title}
          />
          <div className="mt-5 border border-line bg-black p-6">
            <CampusBadge>{post.status}</CampusBadge>
            <p className="mt-5 whitespace-pre-wrap break-words text-sm normal-case leading-7 text-ink/80">
              {post.description}
            </p>
            <p className="mt-5 font-secondary text-[10px] text-ink/50">
              {post.kind === "found"
                ? `FOUND ${campusDate(`${post.found_on}T12:00:00+05:30`, false)}`
                : `${post.condition} · NO PAYMENT · NO RETURN REQUIRED`}
            </p>
          </div>
        </section>
        <aside
          id="campus-action"
          className="scroll-mt-24 space-y-5 lg:sticky lg:top-32"
        >
          <div className="border border-line bg-black p-6">
            <h2 className="type-title text-2xl">
              {transfer
                ? "Your collection is ready"
                : own
                  ? "Your campus post"
                  : post.kind === "found"
                    ? "Does this belong to you?"
                    : "Make it yours. Pass it forward."}
            </h2>
            {transfer ? (
              <Link
                className={`${secondaryClass} mt-5 w-full`}
                href={`/campus/collections/${transfer.id}`}
              >
                OPEN PRIVATE COLLECTION →
              </Link>
            ) : !own && post.status === "open" && post.kind === "giveaway" ? (
              <div className="mt-5">
                <p className="mb-5 text-sm normal-case leading-6 text-ink/65">
                  The first eligible request reserves this giveaway for{" "}
                  <strong className="text-accent">
                    {post.hold_hours} hours
                  </strong>
                  . Collect it before the deadline. Scheduling or messaging does
                  not extend the reservation.
                </p>
                <ReservationPreview hours={post.hold_hours} />
                <ActionForm
                  action="reserve"
                  payload={{ id }}
                  label="RESERVE THIS GIVEAWAY"
                  confirm={`This free item will be held for you for ${post.hold_hours} hours from confirmation. Please reserve only if you can collect it in time.`}
                />
              </div>
            ) : !own &&
              post.status === "open" &&
              post.kind === "found" &&
              !mine.some((c) => c.status === "pending") ? (
              <div className="mt-5">
                <ActionForm
                  action="claim"
                  payload={{ id }}
                  label="SEND PRIVATE OWNERSHIP CLAIM"
                >
                  <Label
                    text="DETAILS THAT VERIFY OWNERSHIP"
                    hint="Only you and campus admins can read this. Include contents, unique markings or details absent from the photos."
                  >
                    <textarea
                      className={fieldClass}
                      name="evidence"
                      required
                      minLength={10}
                      maxLength={2000}
                      rows={5}
                    />
                  </Label>
                </ActionForm>
              </div>
            ) : (
              <p className="mt-4 text-sm normal-case leading-6 text-ink/60">
                {own
                  ? "Collection activity appears here when a claim is approved or a giveaway is reserved."
                  : "A claim is being reviewed or this item is no longer available. Check My activity for your updates."}
              </p>
            )}
          </div>
          {mine.map((c) => (
            <div
              key={c.id}
              className="space-y-3 border border-line bg-black p-5"
            >
              <CampusBadge>YOUR CLAIM · {c.status}</CampusBadge>
              <p className="whitespace-pre-wrap text-sm normal-case leading-6 text-ink/70">
                {c.evidence}
              </p>
              {c.decision_note && (
                <p className="text-sm normal-case text-accent">
                  {c.decision_note}
                </p>
              )}
              {c.status === "pending" && (
                <ActionForm
                  action="withdraw_claim"
                  payload={{ id: c.id }}
                  label="WITHDRAW CLAIM"
                  secondary
                  confirm="This removes your claim from the admin review queue."
                />
              )}
            </div>
          ))}
          {notes && (
            <div className="border border-accent/30 bg-black p-5">
              <p className="font-secondary text-[10px] text-accent">
                PRIVATE FINDER NOTES
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm normal-case leading-6">
                {notes}
              </p>
            </div>
          )}
          {own && post.status === "open" && (
            <Link
              className={secondaryClass}
              href={`/campus/${section}/${id}/edit`}
            >
              EDIT POST
            </Link>
          )}
          {(own || profile.is_admin) &&
            !["hidden", "completed"].includes(post.status) && (
              <div className="border border-line bg-black p-5">
                <ActionForm
                  action="hide_post"
                  payload={{ id }}
                  label={
                    profile.is_admin && !own
                      ? "HIDE THIS POST"
                      : "WITHDRAW THIS POST"
                  }
                  secondary
                  confirm="This removes the post from the board. Admin removal also closes an active collection."
                >
                  <Label text="REASON">
                    <input
                      className={fieldClass}
                      name="reason"
                      required
                      minLength={5}
                      maxLength={500}
                    />
                  </Label>
                </ActionForm>
              </div>
            )}
          {profile.is_admin && (
            <Link className={secondaryClass} href="/campus/admin">
              ADMIN CLAIM REVIEW →
            </Link>
          )}
        </aside>
      </div>
      {!own && post.status === "open" && (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-30 flex justify-center lg:hidden">
          <a
            href="#campus-action"
            className="pointer-events-auto border border-black bg-accent px-6 py-4 font-secondary text-xs text-black"
          >
            {post.kind === "found" ? "OWNERSHIP CLAIM" : "RESERVE THIS ITEM"} ↑
          </a>
        </div>
      )}
    </CampusFrame>
  );
}
