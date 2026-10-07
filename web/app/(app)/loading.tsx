// Loading state for app pages: a page header and list skeleton.
import { Skeleton, SkeletonList, SkeletonStats } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-64" />
      <Skeleton className="mt-3 h-4 w-48" />
      <SkeletonStats className="mt-8" />
      <SkeletonList className="mt-8" />
    </div>
  );
}
