// Loading state for the Live tab (and any query tab without its own): stat cards, the overview card
// with its sources column, then the timeline and changes cards.
import { Skeleton, SkeletonCard, SkeletonStats, SkeletonText } from "@/components/ui/skeleton";

export default function QueryTabLoading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <SkeletonStats />
      <div className="rounded-card border border-line bg-white shadow-card" aria-hidden="true">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-lg border border-line p-5">
            <Skeleton className="h-4 w-32" />
            <SkeletonText lines={5} className="mt-4" />
            <SkeletonText lines={3} className="mt-5" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-3 w-28" />
            <SkeletonText lines={3} />
            <SkeletonText lines={3} />
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}
