"use client";
import { buttonClass } from "@/components/campus/campus-ui";
export default function CampusError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-14">
      <p className="font-secondary text-xs text-accent">
        [ CONNECTION INTERRUPTED ]
      </p>
      <h1 className="type-title my-5 text-3xl">
        The campus board couldn’t load.
      </h1>
      <p className="mb-6 text-sm normal-case leading-6 text-ink/65">
        Your existing loans and account are unchanged. Check your connection and
        retry.
      </p>
      <button className={buttonClass} onClick={retry}>
        TRY AGAIN
      </button>
    </div>
  );
}
