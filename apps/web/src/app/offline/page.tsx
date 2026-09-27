import Link from "next/link";
import { OfflinePanel } from "./offline-panel";
import { CargoMark } from "@/components/landing/hero";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center bg-canvas px-4 py-24 dt:px-10">
      <div aria-hidden className="atmos-pattern" />
      <Link className="mb-8 relative flex items-center gap-3" href="/">
        <CargoMark className="size-8" />
        <span className="font-secondary text-ink">BORROWBUDDY</span>
      </Link>

      <OfflinePanel />
    </div>
  );
}
