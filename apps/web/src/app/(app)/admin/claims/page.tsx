import { ImageOff, PackageSearch } from "lucide-react";
import Link from "next/link";
import { Notice, PageHeader, Panel, PanelLink, WaitingTag } from "@/components/admin/ui";
import { ActionForm, Label } from "@/components/campus/campus-forms";
import { fieldClass } from "@/components/campus/campus-ui";
import { EmptyState } from "@/components/app/empty-state";
import { requireAdmin } from "@/lib/auth/guards";
import { getClaimReviews, isStale } from "@/lib/data/admin";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Lost & found claims · Admin" };

export default async function ClaimsPage() {
  const admin = await requireAdmin();
  const { reviews, approved, error } = await getClaimReviews();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Someone says a found item is theirs. Compare their description with the finder's private notes; finders never choose or see claimants. Approving opens a private collection and closes other claims on the item."
        eyebrow={`LOST & FOUND · ${reviews.length} TO REVIEW`}
        title="Ownership claims"
      />

      {error && <Notice>Could not load claims: {error}</Notice>}

      {reviews.length === 0 ? (
        <EmptyState
          body="New ownership claims on found items show up here, oldest first."
          code="ALL CLAIMS REVIEWED"
          icon={<PackageSearch className="size-7" />}
          title="Nothing to review"
        />
      ) : (
        <ul className="flex flex-col gap-5">
          {reviews.map(({ claim, claimant, post, photo, notes }) => (
            <li className="grid border border-line bg-panel xl:grid-cols-2" key={claim.id}>
              <section aria-label="Finder's record" className="flex flex-col gap-4 border-b border-line p-5 xl:border-r xl:border-b-0">
                <p className="font-secondary text-[11px] text-ink/55">Finder&apos;s record</p>
                <div className="flex gap-4">
                  <div className="size-28 shrink-0 border border-line bg-black">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={post?.title ?? "Found item"} className="size-full object-cover" src={photo} />
                    ) : (
                      <span className="grid size-full place-items-center text-ink/35">
                        <ImageOff aria-hidden className="size-5" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="type-body-alt text-[17px] normal-case">{post?.title ?? "Found item"}</p>
                    {post && (
                      <p className="mt-1 line-clamp-3 text-[13px] normal-case leading-5 text-ink/65">{post.description}</p>
                    )}
                    {post && (
                      <Link className="font-secondary mt-2 inline-block text-[11px] text-accent hover:underline" href={`/campus/lost-found/${post.id}`}>
                        Open post →
                      </Link>
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-secondary text-[11px] text-ink/55">Private identifying notes</p>
                  <p className="mt-1.5 whitespace-pre-wrap border-l-2 border-accent pl-3 text-[14px] normal-case leading-6">
                    {notes || "The finder left no identifying notes."}
                  </p>
                </div>
              </section>

              <section aria-label="Ownership claim" className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-secondary text-[11px] text-ink/55">Claim by</p>
                    <Link className="type-body-alt text-[17px] normal-case hover:text-accent" href={`/admin/students/${claim.claimant_id}`}>
                      {claimant}
                    </Link>
                  </div>
                  <WaitingTag since={claim.created_at} stale={isStale(claim.created_at)} />
                </div>
                <p className="whitespace-pre-wrap text-[14px] normal-case leading-6 text-ink/85">{claim.evidence}</p>

                {claim.claimant_id === admin.id ? (
                  <p className="text-[13px] normal-case text-warn">This is your own claim; another admin has to review it.</p>
                ) : (
                  <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                    <ActionForm
                      action="review_claim"
                      confirm="Approve only after the details match. Other pending claims on this item close, and a private collection opens between the finder and the claimant."
                      label="Approve owner"
                      payload={{ id: claim.id, decision: "approve" }}
                    >
                      <Label text="Why it matches">
                        <textarea className={fieldClass} maxLength={1000} minLength={5} name="reason" required rows={2} />
                      </Label>
                    </ActionForm>
                    <ActionForm
                      action="review_claim"
                      label="Reject claim"
                      payload={{ id: claim.id, decision: "reject" }}
                      secondary
                    >
                      <Label text="Why it doesn't">
                        <textarea className={fieldClass} maxLength={1000} minLength={5} name="reason" required rows={2} />
                      </Label>
                    </ActionForm>
                  </div>
                )}
              </section>
            </li>
          ))}
        </ul>
      )}

      <Panel bodyClassName="p-0" count={approved.length} title="Approved, waiting for collection">
        {approved.length === 0 ? (
          <p className="px-5 py-6 text-[13px] normal-case text-ink/60">No approved claims are waiting to be collected.</p>
        ) : (
          <ul className="divide-y divide-line">
            {approved.map((transfer) => (
              <li className="grid gap-4 p-5 dt:grid-cols-[1fr_minmax(0,22rem)]" key={transfer.id}>
                <div className="min-w-0">
                  <p className="text-[15px] normal-case">{transfer.title}</p>
                  <p className="mt-0.5 text-[13px] normal-case text-ink/60">
                    Going to {transfer.recipient} · approved {relativeTime(transfer.created_at)}
                  </p>
                  <div className="mt-1">
                    <PanelLink href={`/campus/lost-found/${transfer.post_id}`}>Open post</PanelLink>
                  </div>
                </div>
                <ActionForm
                  action="revoke_claim"
                  confirm="This closes collection access and releases the found item for new claims."
                  label="Revoke approval"
                  payload={{ id: transfer.id }}
                  secondary
                >
                  <Label text="Reason">
                    <input className={fieldClass} maxLength={500} minLength={5} name="reason" required />
                  </Label>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
