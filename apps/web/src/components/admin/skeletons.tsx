import { SkeletonBlock } from "@/components/app/skeletons";

/** Loading states for console pages, shaped like the page that's coming. */
export function AdminSkeleton({ variant }: { variant: "overview" | "table" | "cards" | "detail" }) {
  return (
    <div aria-label="Loading" className="flex flex-col gap-8" role="status">
      <div className="flex flex-col gap-3 border-b border-line pb-6">
        <SkeletonBlock className="h-3 w-40" />
        <SkeletonBlock className="h-10 w-64 max-w-full" />
        <SkeletonBlock className="h-4 w-full max-w-xl" />
      </div>

      {variant === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock className="h-36" key={index} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock className="h-28" key={index} />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonBlock className="h-56" key={index} />
            ))}
          </div>
        </>
      )}

      {variant === "table" && (
        <>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock className="h-9 w-24 rounded-full" key={index} />
            ))}
          </div>
          <div className="flex flex-col border border-line">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="flex items-center gap-4 border-b border-line p-4 last:border-b-0" key={index}>
                <SkeletonBlock className="size-9 shrink-0 rounded-full" />
                <SkeletonBlock className="h-4 flex-1" />
                <SkeletonBlock className="hidden h-4 w-24 dt:block" />
                <SkeletonBlock className="hidden h-4 w-20 dt:block" />
              </div>
            ))}
          </div>
        </>
      )}

      {variant === "cards" && (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock className="h-80" key={index} />
          ))}
        </div>
      )}

      {variant === "detail" && (
        <>
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-11 w-full max-w-2xl" />
          <div className="grid gap-4 xl:grid-cols-2">
            <SkeletonBlock className="h-72" />
            <SkeletonBlock className="h-72" />
          </div>
        </>
      )}
    </div>
  );
}
