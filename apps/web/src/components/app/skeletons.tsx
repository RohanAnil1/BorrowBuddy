import { cn } from "@/lib/utils";

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-[pulse-soft_1.6s_ease-in-out_infinite] bg-ink/10",
        className,
      )}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden border border-line bg-panel">
      <SkeletonBlock className="aspect-[4/3] rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <SkeletonBlock className="h-4 w-2/3" />
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-4/5" />
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <SkeletonBlock className="h-3 w-32" />
      <SkeletonBlock className="mt-4 h-10 w-80" />
      <SkeletonBlock className="mt-6 h-12 w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 dt:px-10">
      <SkeletonBlock className="h-3 w-28" />
      <SkeletonBlock className="mt-4 h-10 w-64" />
      <div className="mt-8 flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock className="h-24 w-full" key={index} />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6">
          <SkeletonBlock className="aspect-[4/3] w-full" />
          <SkeletonBlock className="h-10 w-2/3" />
          <SkeletonBlock className="h-24 w-full" />
        </div>
        <div className="flex flex-col gap-6">
          <SkeletonBlock className="h-28 w-full" />
          <SkeletonBlock className="h-96 w-full" />
        </div>
      </div>
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 dt:px-10">
      <SkeletonBlock className="h-12 w-64" />
      <div className="mt-6 flex flex-col gap-4">
        <SkeletonBlock className="h-14 w-2/3" />
        <SkeletonBlock className="ml-auto h-14 w-1/2" />
        <SkeletonBlock className="h-14 w-3/5" />
        <SkeletonBlock className="ml-auto h-14 w-2/5" />
      </div>
      <SkeletonBlock className="mt-8 h-12 w-full" />
    </div>
  );
}
