import Link from "next/link";
import { Parcel } from "@/components/assistant/mascot/parcel";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center px-4 py-16 text-center">
      <Parcel mood="sleepy" size={160} title="Parcel dozing off" />
      <p className="status-bracket mt-4 text-[11px]">[ 404 · PARCEL NOT FOUND ]</p>
      <h1 className="type-title mt-3 text-[2.2rem] leading-tight">Nothing on this shelf.</h1>
      <p className="type-body mt-3 max-w-md text-[14px] normal-case leading-6 text-ink/75">
        The page may have moved, or the item was taken down by its owner.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link
          className="rounded-lg bg-accent px-5 py-2.5 font-strong text-[13px] uppercase text-white transition-opacity hover:opacity-90"
          href="/home"
        >
          Browse the shelf
        </Link>
        <Link
          className="rounded-lg border border-line bg-black px-5 py-2.5 font-strong text-[13px] uppercase transition-colors hover:border-accent"
          href="/dashboard"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
