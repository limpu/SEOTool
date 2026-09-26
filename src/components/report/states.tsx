import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";

/**
 * The loading and error halves of the honest-state trio whose third member,
 * `EmptyState`, already exists in `src/components/ui/`. All three are used by
 * the report architecture; none of them is Site-Audit-specific.
 *
 * `LoadingState` is deliberately a skeleton and never placeholder numbers: a
 * zero or a dash shown while data loads is indistinguishable from a real
 * measurement, which is exactly the confusion the honesty rules exist to
 * prevent (the same reasoning the Overview dashboard's `loading.tsx`
 * documents).
 *
 * WHEN TO MOUNT `LoadingState`: in a module's route-level `loading.tsx`, or
 * behind a `<Suspense>` around a slow sub-tree. Site Audit deliberately does
 * NOT mount one — see the decision recorded in read.md (2026-08-23). A
 * `loading.tsx` anywhere above a route that calls `notFound()` flushes the
 * response shell early and commits a 200 status before the 404 can be set,
 * and Site Audit's shared layout already awaits the same `cache()`d fetch its
 * pages do, so the skeleton would only ever flash for a few milliseconds
 * while costing the issue-detail route its real 404. A module whose layout
 * does not pre-resolve its pages' data has neither problem and should mount
 * this.
 */
export function LoadingState({
  label = "Loading",
  rows = 4,
  showHeader = true,
}: {
  label?: string;
  rows?: number;
  showHeader?: boolean;
}) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {showHeader && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      )}
      <SkeletonText lines={rows} />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/**
 * A failed load, stated as a failure.
 *
 * This is NOT an empty state: "we could not read this" and "there is nothing
 * here" are different facts, and rendering a failure as "No data" would quietly
 * report a broken query as a clean site. `Alert` supplies the `role="alert"`
 * and the icon, so the failure is never carried by colour alone.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  detail,
  children,
}: {
  title?: string;
  description?: string;
  /** Optional technical detail (an error message). Shown verbatim, never invented. */
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <Alert variant="error">
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-0.5 text-sm text-secondary-foreground">{description}</p>}
      {detail && <p className="mt-1 font-mono text-xs break-words text-muted">{detail}</p>}
      {children && <div className="mt-2">{children}</div>}
    </Alert>
  );
}
