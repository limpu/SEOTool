/**
 * Loading placeholder. Deliberately a neutral chrome tone (`--surface-hover`)
 * and never a status or chart colour — a skeleton is the absence of a
 * measurement, and must not look like one.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-surface-hover ${className}`}
    />
  );
}

/** Convenience: N stacked text-height bars, for a list/table loading state. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={`h-3.5 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}
