export default function LoadingCampus() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10"
      role="status"
      aria-label="Loading campus"
    >
      <div className="h-12 w-2/3 animate-pulse bg-black/50" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-80 animate-pulse border border-line bg-black/50"
          />
        ))}
      </div>
    </div>
  );
}
