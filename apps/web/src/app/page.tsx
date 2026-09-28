import { BorrowQueue } from "@/components/landing/borrow-queue";
import { CampusMap } from "@/components/landing/campus-map";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHero } from "@/components/landing/hero";
import { SPOTS, type MapSpot } from "@/components/landing/map-data";
import { Preloader } from "@/components/landing/preloader";
import { StatusTicker } from "@/components/landing/status-ticker";
import { TagWall } from "@/components/landing/tag-wall";
import { WhySection } from "@/components/landing/why-section";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

// Pins are admin-managed in the database; a minute of cache keeps the landing
// fast while edits show up shortly after they are made.
export const revalidate = 60;

async function getPins(): Promise<MapSpot[]> {
  if (!isSupabaseConfigured()) return SPOTS;

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("pickup_locations")
      .select("id, name, description, xp, yp, map_label")
      .eq("is_active", true)
      .not("xp", "is", null)
      .not("yp", "is", null)
      .order("name")
      .abortSignal(AbortSignal.timeout(3000));

    if (error || !data || data.length === 0) return SPOTS;

    const rows = data as {
      id: string;
      name: string;
      description: string | null;
      xp: number;
      yp: number;
      map_label: string;
    }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      xp: row.xp,
      yp: row.yp,
      label: row.map_label === "left" ? "left" : "right",
    }));
  } catch {
    return SPOTS;
  }
}

export default async function LandingPage() {
  const pins = await getPins();

  return (
    <>
      <Preloader />
      <StatusTicker />
      <main className="flex flex-1 flex-col">
        <LandingHero />
        <div id="queue">
          <BorrowQueue />
        </div>
        <TagWall />
        <div id="map">
          <CampusMap spots={pins} />
        </div>
        <WhySection />
      </main>
      <StatusTicker />
      <LandingFooter />
    </>
  );
}
