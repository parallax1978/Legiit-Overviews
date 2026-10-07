// Tracking tab skeleton: own-page form, stat cards, the 28-day strip and the events list.
import { Skeleton, SkeletonList, SkeletonStats } from "@/components/ui/skeleton";

export default function TrackingLoading() {
  return (
    <div role="status" aria-label="Loading tracking" className="space-y-8">
      <div className="rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-3 w-2/3" />
        <Skeleton className="mt-6 h-10 w-full" />
        <Skeleton className="mt-5 h-10 w-full" />
        <Skeleton className="mt-5 h-8 w-20 rounded-full" />
      </div>
      <SkeletonStats />
      <div className="rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
        <Skeleton className="h-4 w-32" />
        <div className="mt-6 flex h-28 items-end gap-1">
          {Array.from({ length: 28 }, (_, i) => (
            <Skeleton key={i} className="h-full flex-1 rounded-sm" />
          ))}
        </div>
      </div>
      <SkeletonList rows={3} />
    </div>
  );
}
