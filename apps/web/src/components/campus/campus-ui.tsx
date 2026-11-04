import Link from "next/link";
import { ArrowUpRight, MapPin, SearchX } from "lucide-react";
import type { CampusPost } from "@borrowbuddy/shared";
import { campusDate } from "@borrowbuddy/shared";

export const fieldClass =
  "min-w-0 max-w-full w-full rounded-lg border border-line bg-black px-4 py-3 text-sm normal-case text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50";
export const buttonClass =
  "inline-flex max-w-full min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 font-secondary text-center text-xs text-black transition-colors hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-wait";
export const secondaryClass =
  "inline-flex max-w-full min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-black px-4 py-2 font-secondary text-center text-xs text-ink/80 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent";
export function CampusFrame({
  title,
  eyebrow = "THE CAMPUS COMMONS",
  description,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10"
      style={{ overflowWrap: "anywhere" }}
    >
      <Link
        className="font-secondary text-[10px] text-ink/60 hover:text-accent"
        href="/campus"
      >
        ← CAMPUS COMMONS
      </Link>
      <div className="mb-8 mt-6 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <p className="status-bracket text-[10px]">[ {eyebrow} ]</p>
          <h1 className="type-title mt-3 break-words text-4xl sm:text-5xl">
            {title}
          </h1>
          <p className="type-body mt-3 text-sm leading-6 text-ink/65">
            {description}
          </p>
        </div>
        {action}
      </div>
      <nav
        aria-label="Campus sections"
        className="mb-8 flex flex-wrap gap-2 border-y border-ink/15 py-3"
      >
        {[
          ["/campus/lost-found", "Lost & Found"],
          ["/campus/giveaways", "Giveaway Shelf"],
          ["/campus/handovers", "Handovers & hours"],
          ["/campus/activity", "My activity"],
        ].map(([href, label]) => (
          <Link className={secondaryClass} key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
export function CampusEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-ink/25 bg-black/50 px-6 py-14 text-center">
      <SearchX className="mx-auto size-9 text-accent" />
      <h2 className="type-title mt-4 text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink/60">
        {body}
      </p>
    </div>
  );
}
export function CampusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block border border-accent/40 bg-black px-2 py-1 font-secondary text-[10px] text-accent">
      [ {children} ]
    </span>
  );
}
export function PostGrid({
  posts,
  photos,
}: {
  posts: CampusPost[];
  photos: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/campus/${post.kind === "found" ? "lost-found" : "giveaways"}/${post.id}`}
          className="group overflow-hidden border border-line bg-black transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-deep">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025]"
              alt={post.title}
              src={photos[post.images[0]]}
            />
            <span className="absolute left-3 top-3">
              <CampusBadge>
                {post.status === "open"
                  ? post.kind === "giveaway"
                    ? "FREE TO COLLECT"
                    : "OWNER WANTED"
                  : post.status}
              </CampusBadge>
            </span>
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="type-title break-words text-2xl">{post.title}</h2>
              <ArrowUpRight className="size-5 shrink-0 text-accent" />
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-ink/60">
              <MapPin className="size-3 shrink-0" />
              {post.location}
            </p>
            <p className="mt-4 border-t border-line pt-3 font-secondary text-[10px] text-ink/50">
              {post.kind === "found"
                ? `FOUND ${campusDate(`${post.found_on}T12:00:00+05:30`, false)}`
                : `${post.condition} · ${post.hold_hours}H COLLECTION HOLD`}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
