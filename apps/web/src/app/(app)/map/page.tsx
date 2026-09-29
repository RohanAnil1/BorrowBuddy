import { MapPin, Navigation } from "lucide-react";
import Link from "next/link";
import { CampusBoard } from "@/components/app/campus-board";
import { EmptyState } from "@/components/app/empty-state";
import { requireVerified } from "@/lib/auth/guards";
import { type MapSpot } from "@/lib/campus-map";
import { getPickupLocationStats } from "@/lib/data/items";

export const metadata = { title: "Pickup map" };

export default async function MapPage() {
  await requireVerified();
  const stats = await getPickupLocationStats();

  // The board shows the real master-plan pins: only spots an admin has placed
  // on the photo (xp/yp set) render, with their live availability counts.
  const mapped = stats.filter(
    (entry) => entry.location.xp !== null && entry.location.yp !== null,
  );

  const spots: MapSpot[] = mapped.map(({ location, availableCount }) => ({
    id: location.id,
    name: location.name,
    description: location.description ?? "",
    xp: location.xp as number,
    yp: location.yp as number,
    label: location.map_label,
    live: availableCount,
  }));

  if (spots.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 dt:px-10">
        <h1 className="type-title">Pickup map</h1>
        <div className="mt-6">
          <EmptyState
            body="CAMPUS PICKUP SPOTS WILL APPEAR HERE ONCE AN ADMIN PINS THEM ON THE MAP."
            icon={<MapPin className="size-7" />}
            title="No spots pinned yet"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ CAMPUS ROUTES ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Pickup map</h1>
      <p className="type-body mt-2 max-w-xl text-[13px] leading-6 uppercase text-ink/60">
        Every handover happens at one of these spots. Pick a pin to see what is
        waiting there, then open its shelf in the catalog.
      </p>

      <div className="mt-8">
        <CampusBoard spots={spots} variant="app" />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {mapped.map(({ location, availableCount }) => (
          <Link
            className="flex items-center justify-between gap-4 border border-line bg-panel p-5 transition-colors hover:border-accent"
            href={`/home?spot=${location.id}`}
            key={location.id}
          >
            <div>
              <p className="flex items-center gap-2 font-secondary text-[12px] uppercase text-ink">
                <Navigation className="size-4 text-accent" />
                {location.name}
              </p>
              {location.description && (
                <p className="type-body mt-1 text-[12px] text-ink/60 uppercase">
                  {location.description}
                </p>
              )}
            </div>
            <span className="shrink-0 border border-line px-3 py-1.5 font-secondary text-[9px] uppercase text-ink/60">
              {availableCount} ITEM{availableCount === 1 ? "" : "S"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
