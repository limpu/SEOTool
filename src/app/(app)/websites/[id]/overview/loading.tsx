import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streaming fallback for the Overview dashboard.
 *
 * This page does genuinely heavy work before it can render anything honest —
 * five module reports, a score computation per recent crawl run, and a live
 * best-effort GA4 fetch. Next renders this instantly while that resolves, so
 * the user sees the dashboard's shape rather than a blank screen.
 *
 * Deliberately a skeleton and NOT placeholder numbers: showing zeros or dashes
 * that later change would be indistinguishable from a real measurement while
 * it loaded, which is exactly the confusion the honesty rules exist to prevent.
 */
export default function OverviewLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className={index === 0 ? "lg:col-span-2" : undefined}>
            <CardHeader>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-28" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>

      <span className="sr-only">Loading dashboard data…</span>
    </div>
  );
}
