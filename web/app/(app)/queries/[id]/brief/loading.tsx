// Brief tab skeleton: report header with summary, the stat row and the first brief sections.
import { Skeleton, SkeletonCard, SkeletonList, SkeletonStats, SkeletonText } from "@/components/ui/skeleton";

export default function BriefLoading() {
  return (
    <div role="status" aria-label="Loading brief" className="space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-3 w-48" />
        <SkeletonText lines={3} />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>
      </div>
      <SkeletonStats />
      <SkeletonCard lines={2} />
      <SkeletonList rows={4} />
    </div>
  );
}
