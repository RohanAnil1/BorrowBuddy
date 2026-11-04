import Link from "next/link";
import {
  CampusBadge,
  CampusEmpty,
  CampusFrame,
  fieldClass,
  secondaryClass,
} from "@/components/campus/campus-ui";
import { ActionForm, Label } from "@/components/campus/campus-forms";
import { requireAdmin } from "@/lib/auth/guards";
import {
  campusClaims,
  campusNotes,
  campusPeople,
  campusPhotos,
  campusPost,
} from "@/lib/data/campus";
import { createClient } from "@/lib/supabase/server";

export default async function CampusAdmin() {
  const admin = await requireAdmin();
  const claims = await campusClaims(undefined, true);
  const people = await campusPeople(claims.map((c) => c.claimant_id));
  const reviews = await Promise.all(
    claims.map(async (claim) => {
      const post = await campusPost(claim.post_id);
      const notes = await campusNotes(claim.post_id);
      return { claim, post, notes };
    }),
  );
  const photos = await campusPhotos(
    reviews.flatMap((r) => r.post?.images.slice(0, 1) ?? []),
  );
  const db = await createClient();
  const { data: approved, error } = await db
    .from("campus_transfers")
    .select("id,post_id,recipient_id")
    .not("claim_id", "is", null)
    .eq("status", "active")
    .order("created_at")
    .limit(100);
  if (error) throw new Error("Could not load approved collections.");
  return (
    <CampusFrame
      title="A careful check. A safe return."
      eyebrow="CAMPUS ADMIN REVIEW"
      description="Review the oldest pending ownership claims. Evidence is private; finders do not choose or approve claimants."
    >
      <p className="mb-5 font-secondary text-[10px] text-ink/50">
        {claims.length} PENDING IN THIS BATCH · UP TO 100 OLDEST CLAIMS
      </p>
      {reviews.length ? (
        <div className="space-y-6">
          {reviews.map(({ claim, post, notes }) => (
            <article
              key={claim.id}
              className="grid grid-cols-1 gap-5 border border-line bg-black p-5 md:grid-cols-2"
            >
              <div>
                <CampusBadge>FINDER’S RECORD</CampusBadge>
                {post && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="mt-4 aspect-[4/3] w-full object-contain"
                      src={photos[post.images[0]]}
                      alt={post.title}
                    />
                    <h2 className="type-title mt-4 text-2xl">{post.title}</h2>
                    <p className="mt-3 text-sm normal-case text-ink/65">
                      {post.description}
                    </p>
                    <Link
                      className={`${secondaryClass} mt-4`}
                      href={`/campus/lost-found/${post.id}`}
                    >
                      OPEN POST / MODERATE →
                    </Link>
                  </>
                )}
                <p className="mt-4 whitespace-pre-wrap border-l-2 border-accent p-3 text-sm normal-case">
                  {notes}
                </p>
              </div>
              <div className="space-y-4">
                <CampusBadge>PRIVATE OWNERSHIP CLAIM</CampusBadge>
                <h3 className="type-title text-2xl">
                  {people[claim.claimant_id]?.full_name ?? "Campus member"}
                </h3>
                <p className="whitespace-pre-wrap text-sm normal-case leading-7">
                  {claim.evidence}
                </p>
                {claim.claimant_id === admin.id ? (
                  <p className="text-sm normal-case text-warn">
                    Another campus admin must review your own claim.
                  </p>
                ) : (
                  <>
                    {["approve", "reject"].map((decision) => (
                      <ActionForm
                        key={decision}
                        action="review_claim"
                        payload={{ id: claim.id, decision }}
                        label={
                          decision === "approve"
                            ? "APPROVE OWNERSHIP"
                            : "REJECT CLAIM"
                        }
                        secondary={decision === "reject"}
                        confirm={
                          decision === "approve"
                            ? "Approve this claimant only after checking the identifying details. Other pending claims will close and a private collection will open."
                            : undefined
                        }
                      >
                        <Label text={`${decision.toUpperCase()} REASON`}>
                          <textarea
                            className={fieldClass}
                            name="reason"
                            required
                            minLength={5}
                            maxLength={1000}
                            rows={2}
                          />
                        </Label>
                      </ActionForm>
                    ))}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <CampusEmpty
          title="All claims reviewed"
          body="New private ownership claims will appear here for campus admin review."
        />
      )}
      <h2 className="type-title mb-5 mt-10 text-2xl">
        Approved, awaiting collection
      </h2>
      <div className="space-y-4">
        {approved?.map((t) => (
          <div key={t.id} className="space-y-4 border border-line bg-black p-5">
            <Link
              className={secondaryClass}
              href={`/campus/lost-found/${t.post_id}`}
            >
              OPEN FOUND POST →
            </Link>
            <ActionForm
              action="revoke_claim"
              payload={{ id: t.id }}
              label="REVOKE UNCOMPLETED APPROVAL"
              secondary
              confirm="This closes collection access and releases the found item for new claims."
            >
              <Label text="REVOCATION REASON">
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
        ))}
      </div>
    </CampusFrame>
  );
}
