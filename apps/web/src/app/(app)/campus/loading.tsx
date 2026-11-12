import { SkeletonBlock } from "@/components/app/skeletons";

export default function LoadingCampus() {
  return (
    <div aria-label="Loading campus" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10" role="status">
      <SkeletonBlock className="h-12 w-2/3" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonBlock className="h-80 border border-line" key={i} />
        ))}
      </div>
    </div>
  );
}
