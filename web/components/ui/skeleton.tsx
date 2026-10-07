// Skeleton placeholders for loading states: blocks, text lines, cards and list rows.
import { cn } from "@/lib/cn";

/** A pulsing grey block. Size it with className (e.g. "h-4 w-32"). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-sunken", className)} />;
}

/** A few text lines, the last one shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** A card-shaped placeholder with a title and text lines. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-card border border-line bg-white p-5 shadow-card", className)} aria-hidden="true">
      <Skeleton className="h-4 w-1/3" />
      <SkeletonText lines={lines} className="mt-4" />
    </div>
  );
}

/** A bordered list of row placeholders with a number circle and two lines. */
export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-line rounded-card border border-line bg-white shadow-card", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Four stat-card placeholders. */
export function SkeletonStats({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rounded-card border border-line bg-white p-4 shadow-card">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-6 w-12" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
