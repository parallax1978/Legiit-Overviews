// Draft score tab skeleton: the scoring form, a result card and the history list.
import { Skeleton, SkeletonList } from "@/components/ui/skeleton";

export default function DraftLoading() {
  return (
    <div role="status" aria-label="Loading draft scores" className="space-y-8">
      <div className="rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
        <Skeleton className="h-8 w-56 rounded-full" />
        <Skeleton className="mt-5 h-3 w-24" />
        <Skeleton className="mt-2 h-48 w-full" />
        <Skeleton className="mt-5 h-9 w-32 rounded-full" />
      </div>
      <div className="rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-6">
          <Skeleton className="h-28 w-28 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </div>
      <SkeletonList rows={3} />
    </div>
  );
}
