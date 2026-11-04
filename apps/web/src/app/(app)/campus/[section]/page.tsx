import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CampusEmpty,
  CampusFrame,
  PostGrid,
  buttonClass,
  fieldClass,
  secondaryClass,
} from "@/components/campus/campus-ui";
import { requireVerified } from "@/lib/auth/guards";
import { campusPhotos, campusPosts } from "@/lib/data/campus";
import { getCategories } from "@/lib/data/items";

export default async function CampusBoard({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireVerified();
  const { section } = await params;
  if (!["lost-found", "giveaways"].includes(section)) notFound();
  const raw = await searchParams;
  const get = (key: string) =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";
  const page = Math.max(0, Math.min(10000, Number(get("page")) || 0));
  const kind = section === "lost-found" ? "found" : "giveaway";
  const [{ posts, count }, categories] = await Promise.all([
    campusPosts({
      kind,
      q: get("q").slice(0, 100),
      category: get("category"),
      location: get("location"),
      date: kind === "found" ? get("date") : "",
      status: ["open", "reserved", "completed", "all"].includes(get("status"))
        ? get("status")
        : "open",
      page,
    }),
    getCategories(),
  ]);
  const photos = await campusPhotos(posts.flatMap((p) => p.images.slice(0, 1)));
  const pageHref = (n: number) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(raw))
      if (typeof v === "string" && k !== "page") s.set(k, v);
    s.set("page", String(n));
    return `?${s}`;
  };
  return (
    <CampusFrame
      title={
        kind === "found"
          ? "Found here. Claimed safely."
          : "One student’s spare. Your next essential."
      }
      eyebrow={
        kind === "found" ? "CAMPUS LOST & FOUND" : "THE SEMESTER GIVEAWAY SHELF"
      }
      description={
        kind === "found"
          ? "Recognize something? Send identifying details privately to campus admins. An approved claim opens a safe collection."
          : "Everything here is free. The first eligible request reserves the item for the donor’s collection period."
      }
      action={
        <Link className={buttonClass} href={`/campus/${section}/new`}>
          {kind === "found" ? "REPORT A FOUND ITEM" : "GIVE SOMETHING AWAY"} +
        </Link>
      }
    >
      <form
        className="mb-6 grid gap-3 border border-line bg-black p-4 sm:grid-cols-2 lg:grid-cols-3"
        role="search"
      >
        <label className="sr-only" htmlFor="campus-search">
          Search campus titles
        </label>
        <input
          id="campus-search"
          className={fieldClass}
          name="q"
          placeholder="Search titles…"
          defaultValue={get("q")}
          maxLength={100}
        />
        <select
          aria-label="Category"
          className={fieldClass}
          name="category"
          defaultValue={get("category")}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Approximate location"
          className={fieldClass}
          name="location"
          placeholder="Campus area…"
          defaultValue={get("location")}
        />
        {kind === "found" && (
          <input
            aria-label="Date found"
            className={fieldClass}
            name="date"
            type="date"
            defaultValue={get("date")}
          />
        )}
        <select
          aria-label="Post status"
          className={fieldClass}
          name="status"
          defaultValue={get("status") || "open"}
        >
          <option value="open">Available / owner wanted</option>
          <option value="reserved">Collection arranged</option>
          <option value="completed">Collected</option>
          <option value="all">All visible posts</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass}>SEARCH</button>
          <Link className={secondaryClass} href={`/campus/${section}`}>
            CLEAR
          </Link>
        </div>
      </form>
      <p className="mb-4 font-secondary text-[10px] text-ink/50">
        {count} POSTS · PAGE {page + 1}
      </p>
      {posts.length ? (
        <PostGrid posts={posts} photos={photos} />
      ) : (
        <CampusEmpty
          title="Nothing on this shelf yet"
          body="Try a different filter, or be the first student to post something useful."
        />
      )}
      <div className="mt-6 flex justify-between gap-3">
        {page > 0 ? (
          <Link className={secondaryClass} href={pageHref(page - 1)}>
            ← PREVIOUS
          </Link>
        ) : (
          <span />
        )}
        {(page + 1) * 24 < count && (
          <Link className={secondaryClass} href={pageHref(page + 1)}>
            NEXT →
          </Link>
        )}
      </div>
    </CampusFrame>
  );
}
