// Loading state for the Patterns tab: window row, note, stat cards and section cards with rows.
import { Skeleton, SkeletonCard, SkeletonList, SkeletonStats } from "@/components/ui/skeleton";

export default function PatternsLoading() {
  return (
    <div role="status" aria-label="Loading patterns" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-hidden="true">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-9 w-64 rounded-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-card" />
      <SkeletonStats />
      <SkeletonList rows={6} />
      <SkeletonList rows={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
