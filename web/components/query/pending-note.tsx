// ExtractionPendingNote: how many captures with an overview Claude is still analysing in the window
// (series_metrics.extraction_pending). Their claims, brands and formats aren't in any share's n yet.
import { ClockIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

export function ExtractionPendingNote({ n, className }: { n: number | null | undefined; className?: string }) {
  if (!n || n <= 0) return null;
  const one = n === 1;
  return (
    <p className={cn("flex items-start gap-2 rounded-lg bg-brand-faint/50 px-3 py-2 text-xs leading-5 text-ink-muted ring-1 ring-inset ring-brand-soft", className)}>
      <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
      <span>
        <strong className="font-semibold text-ink">{one ? "1 capture is" : `${formatCount(n)} captures are`} still being analysed;</strong>{" "}
        {one ? "its" : "their"} claims and brands will be counted when done.
      </span>
    </p>
  );
}
