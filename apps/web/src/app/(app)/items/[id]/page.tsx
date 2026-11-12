import { ArrowRight, Pencil, Settings2, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageGallery } from "@/components/app/image-gallery";
import { ItemCard } from "@/components/app/item-card";
import { SaveButton } from "@/components/app/save-button";
import { RequestForm } from "@/components/app/request-form";
import { StarRating } from "@/components/app/star-rating";
import { StatusBadge } from "@/components/app/status-badge";
import { conditionLabel, formatDeposit, itemStatusLabel, relativeTime } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getItem, getItemAvailability, searchItems } from "@/lib/data/items";
import { getSavedItemIds, savedState } from "@/lib/data/wishlist";
import { getReputation, getReviewsForUser } from "@/lib/data/reviews";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  return { title: item?.title ?? "Item" };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const profile = await requireVerified();
  const { id } = await params;
  // Buddy's "Request" action links here with dates prefilled; the form still validates.
  const { start, end } = await searchParams;
  const prefill =
    start && end && ISO_DATE.test(start) && ISO_DATE.test(end) && start <= end ? { start, end } : null;

  const item = await getItem(id);
  if (!item) notFound();

  const [windows, reputation, reviews, savedIds, sameCategory] = await Promise.all([
    getItemAvailability(id),
    getReputation(item.owner_id),
    getReviewsForUser(item.owner_id, 3).catch(() => []),
    getSavedItemIds(profile.id),
    item.category_id ? searchItems({ categoryId: item.category_id, limit: 12 }).catch(() => []) : Promise.resolve([]),
  ]);
  const similar = sameCategory
    .filter((other) => other.id !== item.id && other.owner_id !== profile.id)
    .slice(0, 6);
  const isOwner = item.owner_id === profile.id;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <Link
        className="font-secondary text-[10px] uppercase text-ink/50 transition-colors hover:text-accent"
        href="/home"
      >
        ← BACK TO THE CATALOG
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6">
          <ImageGallery images={item.images} title={item.title} />

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="info">{conditionLabel(item.condition)}</StatusBadge>
            {item.category && <StatusBadge tone="muted">{item.category.name}</StatusBadge>}
            {item.status !== "available" && (
              <StatusBadge tone="warning">{itemStatusLabel(item.status)}</StatusBadge>
            )}
          </div>

          <div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="type-title text-[2rem] dt:text-[2.5rem]">{item.title}</h1>
              {item.owner_id !== profile.id && savedIds && (
                <div className="shrink-0 pt-1">
                  <SaveButton itemId={item.id} saved={savedIds.has(item.id)} title={item.title} variant="inline" />
                </div>
              )}
            </div>
            <p className="type-body mt-4 whitespace-pre-line text-[14px] leading-7 text-ink/60 uppercase">
              {item.description}
            </p>
          </div>

          <dl className="grid gap-4 border border-line bg-panel p-6 sm:grid-cols-3">
            <Spec label="DEPOSIT" value={formatDeposit(item.deposit_amount)} />
            <Spec label="MAX LOAN" value={`${item.max_loan_days} DAYS`} />
            <Spec
              label="PICKUP"
              value={(item.pickup_location?.name ?? "COORDINATE IN CHAT").toUpperCase()}
            />
          </dl>
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="border border-line bg-panel p-6">
            <Link className="group flex items-center justify-between gap-3" href={`/users/${item.owner_id}`}>
              <div>
                <p className="font-secondary text-[9px] text-ink/50">[ OWNER ]</p>
                <p className="type-body-alt mt-1 text-[16px] uppercase underline-offset-4 group-hover:text-accent group-hover:underline">
                  {item.owner.full_name}
                </p>
                {reputation && (
                  <p className="mt-1 text-[12px] normal-case text-ink/60">
                    {reputation.completed === 0
                      ? "New to lending"
                      : `${reputation.completed} completed ${reputation.completed === 1 ? "loan" : "loans"}`}
                    {reputation.average !== null &&
                      ` · ${reputation.average.toFixed(1)}★ from ${reputation.reviewCount} ${reputation.reviewCount === 1 ? "review" : "reviews"}`}
                  </p>
                )}
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center bg-black font-title text-sm text-ink transition-colors group-hover:text-accent">
                {item.owner.full_name.slice(0, 1).toUpperCase()}
              </span>
            </Link>

            {/* reputation badge */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 border border-accent/60 bg-accent/10 px-2.5 py-1 font-secondary text-[9px] uppercase text-accent">
                <Star className="size-3" />
                TRUST SCORE {Math.round(item.owner.trust_score)}
              </span>
              {item.owner.verification_status === "verified" && (
                <span className="border border-line px-2.5 py-1 font-secondary text-[9px] uppercase text-ink/60">
                  [ ID VERIFIED ]
                </span>
              )}
            </div>

            {isOwner && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
                <Link
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 font-strong text-[11px] uppercase transition-colors hover:border-accent"
                  href={`/items/${item.id}/edit`}
                >
                  <Pencil className="size-3.5" />
                  Edit listing
                </Link>
                <Link
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 font-strong text-[11px] uppercase transition-colors hover:border-accent"
                  href="/my/items"
                >
                  <Settings2 className="size-3.5" />
                  Manage
                </Link>
              </div>
            )}
          </div>

          {!isOwner && <OwnerReviews ownerId={item.owner_id} ownerName={item.owner.full_name} reviews={reviews} />}

          <RequestForm
            canRequest={profile.verification_status === "verified"}
            initialRange={prefill}
            isOwner={isOwner}
            itemId={item.id}
            maxLoanDays={item.max_loan_days}
            windows={windows}
          />
        </div>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar-items" className="mt-14">
          <div className="flex items-center justify-between">
            <h2 className="font-secondary text-[12px] uppercase text-ink/75" id="similar-items">
              More in {item.category?.name ?? "this category"}
            </h2>
            <Link
              className="font-secondary text-[11px] uppercase text-accent hover:underline"
              href={`/home?category=${item.category_id}`}
            >
              See all →
            </Link>
          </div>
          <div className="-mx-4 mt-4 flex rail-scroll snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
            {similar.map((other) => (
              <div className="w-60 shrink-0 snap-start" key={other.id}>
                <ItemCard item={other} saved={savedState(savedIds, other.id)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-secondary text-[9px] text-ink/50">{label}</dt>
      <dd className="type-body-alt mt-1 text-[13px] uppercase">{value}</dd>
    </div>
  );
}

type OwnerReview = Awaited<ReturnType<typeof getReviewsForUser>>[number];

/** The owner's three latest reviews, so borrowers can judge before requesting. */
function OwnerReviews({ ownerId, ownerName, reviews }: { ownerId: string; ownerName: string; reviews: OwnerReview[] }) {
  const firstName = ownerName.split(" ")[0];
  return (
    <section aria-labelledby="owner-reviews" className="border border-line bg-panel p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-secondary text-[9px] text-ink/50" id="owner-reviews">
          [ WHAT STUDENTS SAY ]
        </h2>
        <Link
          className="inline-flex items-center gap-1 font-secondary text-[9px] uppercase text-accent hover:underline"
          href={`/users/${ownerId}`}
        >
          Full profile <ArrowRight className="size-3" />
        </Link>
      </div>
      {reviews.length === 0 ? (
        <p className="mt-3 text-[13px] normal-case leading-6 text-ink/60">
          No reviews for {firstName} yet. Every student is ID-verified, and reviews appear after a completed loan.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {reviews.map((review) => (
            <li className="py-3 first:pt-0 last:pb-0" key={review.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-secondary text-[10px] uppercase text-ink/80">
                  {review.reviewer?.full_name ?? "A student"}
                </span>
                <StarRating value={review.rating} />
              </div>
              {review.comment && (
                <p className="mt-1.5 line-clamp-3 text-[13px] normal-case leading-6 text-ink/70">“{review.comment}”</p>
              )}
              <p className="mt-1 font-secondary text-[9px] text-ink/40">{relativeTime(review.created_at).toUpperCase()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
