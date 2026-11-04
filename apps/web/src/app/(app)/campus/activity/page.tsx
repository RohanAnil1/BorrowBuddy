import Link from "next/link";
import { campusDate } from "@borrowbuddy/shared";
import {
  CampusBadge,
  CampusEmpty,
  CampusFrame,
  PostGrid,
  secondaryClass,
} from "@/components/campus/campus-ui";
import { Deadline } from "@/components/campus/campus-forms";
import { requireVerified } from "@/lib/auth/guards";
import {
  campusClaims,
  campusThreadHeads,
  campusPhotos,
  campusPosts,
  campusTransfers,
} from "@/lib/data/campus";

export default async function CampusActivity() {
  const profile = await requireVerified();
  const [{ posts }, transfers, allClaims, incoming] = await Promise.all([
    campusPosts({ owner: profile.id, status: "all" }),
    campusTransfers(),
    campusClaims(),
    campusThreadHeads(),
  ]);
  const photos = await campusPhotos(posts.flatMap((p) => p.images.slice(0, 1)));
  const claims = allClaims.filter((c) => c.claimant_id === profile.id);
  const heads = transfers.map((t) => {
    const read =
      profile.id === t.host_id ? t.host_read_at : t.recipient_read_at;
    return {
      transfer: t,
      unread: Boolean(incoming[t.id] && incoming[t.id]! > read),
    };
  });
  return (
    <CampusFrame
      title="Your part in the campus loop."
      description="Keep track of posts, private claims, reserved giveaways and collection conversations."
    >
      <section className="mb-10">
        <h2 className="type-title mb-5 text-2xl">
          Collections & conversations
        </h2>
        {heads.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {heads.map(({ transfer: t, unread }) => (
              <Link
                key={t.id}
                href={`/campus/collections/${t.id}`}
                className="space-y-3 border border-line bg-black p-5 hover:border-accent"
              >
                <CampusBadge>
                  {t.status}
                  {unread ? " · NEW MESSAGE" : ""}
                </CampusBadge>
                <h3 className="type-title text-2xl">
                  {t.claim_id ? "Found-item collection" : "Giveaway collection"}
                </h3>
                <p className="font-secondary text-[10px] text-ink/45">
                  STARTED {campusDate(t.created_at)}
                </p>
                {t.expires_at && t.status === "active" && (
                  <Deadline value={t.expires_at} />
                )}
                <p className="pt-3 text-xs text-accent">
                  OPEN CONVERSATION & RECEIPT →
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <CampusEmpty
            title="Your next collection starts here"
            body="Reserve a giveaway or receive an approved ownership claim to open a private collection conversation."
          />
        )}
      </section>
      <section className="mb-10">
        <h2 className="type-title mb-5 text-2xl">Your ownership claims</h2>
        {claims.length ? (
          <div className="space-y-3">
            {claims.map((c) => (
              <div key={c.id} className="border border-line bg-black p-5">
                <CampusBadge>{c.status}</CampusBadge>
                <p className="mt-3 whitespace-pre-wrap text-sm normal-case text-ink/70">
                  {c.evidence}
                </p>
                {c.decision_note && (
                  <p className="mt-3 text-sm normal-case text-accent">
                    {c.decision_note}
                  </p>
                )}
                <Link
                  className={`${secondaryClass} mt-4`}
                  href={`/campus/lost-found/${c.post_id}`}
                >
                  OPEN YOUR CLAIM →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm normal-case text-ink/50">
            No ownership claims yet.
          </p>
        )}
      </section>
      <section>
        <h2 className="type-title mb-5 text-2xl">Your posts</h2>
        {posts.length ? (
          <PostGrid posts={posts} photos={photos} />
        ) : (
          <CampusEmpty
            title="Your shelf is clear"
            body="Report a found item or give something away from the Campus board."
          />
        )}
      </section>
    </CampusFrame>
  );
}
