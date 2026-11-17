import { BorrowQueue } from "@/components/landing/borrow-queue";
import { CampusMap } from "@/components/landing/campus-map";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHero } from "@/components/landing/hero";
import { SPOTS, spotPhoto, type MapSpot } from "@/lib/campus-map";
import { Preloader } from "@/components/landing/preloader";
import { StatusTicker } from "@/components/landing/status-ticker";
import { TagWall } from "@/components/landing/tag-wall";
import { WhySection } from "@/components/landing/why-section";
import { isSupabaseConfigured } from "@/lib/env";
import { SITE_URL } from "@/lib/site";
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
      .select("id, name, description, xp, yp, map_label, photo_path")
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
      photo_path: string | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      xp: row.xp,
      yp: row.yp,
      label: row.map_label === "left" ? "left" : "right",
      photo: row.photo_path ?? spotPhoto(row.name),
    }));
  } catch {
    return SPOTS;
  }
}

/** Structured data so search engines know what BorrowBuddy is and who it's for. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "BorrowBuddy",
      inLanguage: "en-IN",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "BorrowBuddy",
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512.png`,
    },
    {
      "@type": "WebApplication",
      name: "BorrowBuddy",
      url: SITE_URL,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web, Android",
      description:
        "Campus lending app for Bennett University students: borrow and lend cameras, projectors, books and sports gear with QR handovers.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      audience: { "@type": "EducationalAudience", educationalRole: "student" },
    },
  ],
};

export default async function LandingPage() {
  const pins = await getPins();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
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
