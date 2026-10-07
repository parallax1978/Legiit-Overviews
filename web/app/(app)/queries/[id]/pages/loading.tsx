// Loading state for the Pages tab: report header, page index and page cards.
import { Skeleton, SkeletonCard, SkeletonText } from "@/components/ui/skeleton";

function PageCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-white p-5 shadow-card sm:p-6" aria-hidden="true">
      <div className="flex items-start gap-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-3.5 w-12" />
          </div>
        ))}
      </div>
      <SkeletonText lines={3} className="mt-6" />
    </div>
  );
}

export default function PagesLoading() {
  return (
    <div role="status" aria-label="Loading cited pages" className="space-y-6">
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <SkeletonCard lines={3} />
      <PageCardSkeleton />
      <PageCardSkeleton />
    </div>
  );
}
