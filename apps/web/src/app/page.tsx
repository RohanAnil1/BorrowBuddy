import { BorrowQueue } from "@/components/landing/borrow-queue";
import { CampusMap } from "@/components/landing/campus-map";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHero } from "@/components/landing/hero";
import { Preloader } from "@/components/landing/preloader";
import { StatusTicker } from "@/components/landing/status-ticker";
import { TagWall } from "@/components/landing/tag-wall";
import { WhySection } from "@/components/landing/why-section";

export default function LandingPage() {
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
          <CampusMap />
        </div>
        <WhySection />
      </main>
      <StatusTicker />
      <LandingFooter />
    </>
  );
}
