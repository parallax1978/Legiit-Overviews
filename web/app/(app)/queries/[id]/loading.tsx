// Loading state for a query tab: the frame stays, the tab content shows skeleton cards.
import { SkeletonCard, SkeletonStats } from "@/components/ui/skeleton";

export default function QueryTabLoading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <SkeletonStats />
      <SkeletonCard lines={4} />
    </div>
  );
}
