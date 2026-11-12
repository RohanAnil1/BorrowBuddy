import { Heart, PackageSearch, PlusCircle } from "lucide-react";
import Link from "next/link";
import type { ItemCondition } from "@borrowbuddy/shared";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { ItemCard } from "@/components/app/item-card";
import { StaggerGrid } from "@/components/app/stagger-grid";
import { requireVerified } from "@/lib/auth/guards";
import { getCategories, getPickupLocations, parseItemSort, searchItems } from "@/lib/data/items";
import { getPendingRequestCount } from "@/lib/data/requests";
import { getSavedItemIds, savedState } from "@/lib/data/wishlist";

export const metadata = { title: "Browse" };

type SearchParams = Promise<{
  q?: string;
  category?: string;
  condition?: string;
  spot?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: string;
}>;

const PAGE_SIZE = 24;
const MAX_PAGES = 20;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireVerified();
  const params = await searchParams;
  const sort = parseItemSort(params.sort);
  const page = Math.min(MAX_PAGES, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));

  const [categories, locations, found, pendingCount, savedIds] = await Promise.all([
    getCategories(),
    getPickupLocations(),
    searchItems({
      q: params.q,
      categoryId: params.category,
      condition: params.condition as ItemCondition | undefined,
      pickupLocationId: params.spot,
      startDate: params.from,
      endDate: params.to,
      sort,
      // "Load more" re-renders every page so far; one extra row says whether more exist.
      limit: page * PAGE_SIZE + 1,
    }),
    getPendingRequestCount(profile.id),
    getSavedItemIds(profile.id),
  ]);

  const hasMore = found.length > page * PAGE_SIZE && page < MAX_PAGES;
  const items = found.slice(0, page * PAGE_SIZE);
  const moreParams = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "page"),
  );
  moreParams.set("page", String(page + 1));

  const filtered = Boolean(params.q || params.category || params.condition || params.spot);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="status-bracket text-[10px]">[ CAMPUS CATALOG ]</p>
          <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">
            What&apos;s on the shelf today
          </h1>
          <p className="font-secondary mt-2 text-[10px] text-ink/50">
            SIGNED IN AS {profile.full_name.toUpperCase()} · TRUST SCORE{" "}
            {Math.round(profile.trust_score)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        {savedIds && (
        <Link
          className="inline-flex w-fit items-center gap-2 border border-line px-4 py-2.5 font-secondary text-[10px] uppercase text-ink/75 transition-colors hover:border-accent hover:text-accent"
          href="/my/saved"
        >
          <Heart className={savedIds.size > 0 ? "size-3.5 fill-accent text-accent" : "size-3.5"} />
          SAVED{savedIds.size > 0 ? ` (${savedIds.size})` : ""}
        </Link>
        )}
        {pendingCount > 0 && (
          <Link
            className="w-fit border border-accent/60 bg-accent/10 px-4 py-2.5 font-secondary text-[10px] uppercase text-accent transition-colors hover:bg-accent/15"
            href="/my/items"
          >
            [ {pendingCount} REQUEST{pendingCount === 1 ? "" : "S"} WAITING ON YOU ]
          </Link>
        )}
        </div>
      </div>

      <div className="mt-8">
        <FilterBar categories={categories} locations={locations} />
      </div>

      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState
            action={
              <Link
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white transition-opacity hover:opacity-90"
                href="/items/new"
              >
                <PlusCircle className="size-4" />
                List an item
              </Link>
            }
            body={
              filtered
                ? "TRY CLEARING A FILTER OR WIDENING YOUR DATES — OR BE THE FIRST TO LIST SOMETHING LIKE THIS."
                : "NOTHING LISTED YET. BE THE FIRST TO PUT SOMETHING ON THE SHELF."
            }
            code={filtered ? "NO MATCHES" : "EMPTY SHELF"}
            icon={<PackageSearch className="size-7" />}
            title={filtered ? "No matches on this route" : "The shelves are empty"}
          />
        ) : (
          <>
            <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ItemCard item={item} key={item.id} saved={item.owner_id === profile.id ? undefined : savedState(savedIds, item.id)} />
              ))}
            </StaggerGrid>
            <div className="mt-8 flex flex-col items-center gap-3">
              <p className="font-secondary text-[10px] text-ink/50" aria-live="polite">
                SHOWING {items.length} {items.length === 1 ? "ITEM" : "ITEMS"}
              </p>
              {hasMore && (
                <Link
                  className="rounded-lg border border-line px-5 py-2.5 font-strong text-[12px] uppercase transition-colors hover:border-accent hover:text-accent"
                  href={`/home?${moreParams.toString()}`}
                  scroll={false}
                >
                  Load more
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
