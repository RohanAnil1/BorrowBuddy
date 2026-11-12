"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Parcel } from "@/components/assistant/mascot/parcel";

/**
 * Error boundary for every signed-in page. Most failures here are a dropped
 * connection to the server or database, so it retries by itself when the
 * device comes back online and offers a manual retry otherwise.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    console.error(error);
    const sync = () => setOnline(navigator.onLine);
    const back = () => {
      setOnline(true);
      retry();
    };
    sync();
    window.addEventListener("online", back);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", back);
      window.removeEventListener("offline", sync);
    };
  }, [error, retry]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 py-14 text-center">
      <Parcel mood={online ? "confused" : "offline"} size={150} title="Parcel looks puzzled" track />
      <p className="status-bracket mt-4 text-[11px]">[ {online ? "SOMETHING JAMMED" : "SIGNAL LOST"} ]</p>
      <h1 className="type-title mt-3 text-[2rem] leading-tight">
        {online ? "This page didn't load." : "You're offline."}
      </h1>
      <p className="type-body mt-3 max-w-md text-[14px] normal-case leading-6 text-ink/75">
        {online
          ? "Your loans, requests and account are safe. Give it another go — it's usually a brief hiccup reaching the campus server."
          : "We'll try again as soon as your connection is back. Nothing you've saved is lost."}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-strong text-[13px] uppercase text-white transition-opacity hover:opacity-90"
          onClick={() => retry()}
          type="button"
        >
          <RotateCcw className="size-4" />
          Try again
        </button>
        <Link
          className="rounded-lg border border-line px-5 py-2.5 font-strong text-[13px] uppercase transition-colors hover:border-accent"
          href="/dashboard"
        >
          Go to dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="font-secondary mt-8 text-[11px] text-ink/50">REF {error.digest}</p>
      )}
    </div>
  );
}
