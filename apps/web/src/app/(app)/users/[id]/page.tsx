import { CalendarCheck, MapPin, PackageSearch, ShieldCheck, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { ItemCard } from "@/components/app/item-card";
import { MemberIdCard } from "@/components/app/member-id-card";
import { toMemberCardProfile } from "@/components/app/member-card-profile";
import { StarRating } from "@/components/app/star-rating";
import { StatusBadge } from "@/components/app/status-badge";
import { relativeTime } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getProfile } from "@/lib/data/profiles";
import { searchItems } from "@/lib/data/items";
import { getCompletedLoanCount, getRatingSummary, getReviewsForUser } from "@/lib/data/reviews";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile(id);
  return { title: profile?.full_name ?? "Student" };
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireVerified();
  const { id } = await params;

  const profile = await getProfile(id);
  if (!profile) notFound();

  const [reviews, rating, completed, listings] = await Promise.all([
    getReviewsForUser(id),
    getRatingSummary(id),
    getCompletedLoanCount(id),
    searchItems({ ownerId: id, limit: 12 }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 dt:px-10">
      <section className="flex flex-wrap items-start justify-between gap-6 border border-line bg-panel p-6">
        <div className="flex items-center gap-5">
          <span className="flex size-16 items-center justify-center bg-black font-title text-xl text-ink">
            {(profile.full_name || "?").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="type-title text-[1.75rem]">
              {profile.full_name || "Unnamed student"}
            </h1>
            <p className="font-secondary mt-1 text-[10px] text-ink/50">
              {(profile.department ?? "Bennett University").toUpperCase()}
              {profile.year_of_study ? ` · YEAR ${profile.year_of_study}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {profile.verification_status === "verified" && (
                <StatusBadge tone="success">
                  <ShieldCheck className="size-3" />
                  Verified student
                </StatusBadge>
              )}
              <StatusBadge tone="muted">
                <CalendarCheck className="size-3" />
                Joined {relativeTime(profile.created_at)}
              </StatusBadge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-center sm:text-left">
          <div>
            <p className="flex items-center justify-center gap-1.5 font-secondary text-[1.5rem] text-accent sm:justify-start">
              <Star className="size-4" />
              {Math.round(profile.trust_score)}
            </p>
            <p className="font-secondary mt-1 text-[9px] text-ink/50">TRUST SCORE</p>
          </div>
          <div>
            <p className="font-secondary text-[1.5rem] text-ink">{completed}</p>
            <p className="font-secondary mt-1 text-[9px] text-ink/50">COMPLETED LOANS</p>
          </div>
        </div>
      </section>

      <MemberIdCard profile={toMemberCardProfile(profile)} />

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ REPUTATION ]</h2>
          {rating.average !== null && (
            <span className="flex items-center gap-2 font-secondary text-[10px] uppercase text-ink/60">
              <StarRating value={rating.average} size="md" />
              {rating.average.toFixed(1)} FROM {rating.count} REVIEW
              {rating.count === 1 ? "" : "S"}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {reviews.length === 0 ? (
            <p className="border border-line bg-panel px-6 py-8 text-center font-secondary text-[10px] text-ink/50">
              NO REVIEWS YET. REPUTATION BUILDS AFTER COMPLETED LOANS.
            </p>
          ) : (
            reviews.map((review) => (
              <article className="border border-line bg-panel p-5" key={review.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-secondary text-[11px] uppercase text-ink">
                    {(review.reviewer?.full_name ?? "A student").toUpperCase()}
                    <span className="ml-2 font-secondary text-[9px] text-ink/50">
                      {review.role === "as_owner" ? "LENT TO THEM" : "BORROWED FROM THEM"}
                    </span>
                  </span>
                  <StarRating value={review.rating} />
                </div>
                {review.comment && (
                  <p className="type-body mt-3 text-[13px] leading-6 text-ink/60 uppercase">
                    “{review.comment}”
                  </p>
                )}
                <p className="font-secondary mt-3 text-[9px] text-ink/40">
                  {relativeTime(review.created_at).toUpperCase()}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ LISTINGS ]</h2>
        <div className="mt-4">
          {listings.length === 0 ? (
            <EmptyState
              body="NOTHING LISTED RIGHT NOW. CHECK BACK LATER."
              code="NO LISTINGS"
              icon={<PackageSearch className="size-7" />}
              title="No active listings"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((item) => (
                <ItemCard item={item} key={item.id} />
              ))}
            </div>
          )}
        </div>
      </section>

      <p className="font-secondary mt-10 flex items-center gap-2 text-[9px] text-ink/40">
        <MapPin className="size-3.5" />
        HANDOVERS HAPPEN AT CAMPUS PICKUP SPOTS. AGREE ON ONE IN CHAT BEFORE YOU MEET.
      </p>
    </div>
  );
}
