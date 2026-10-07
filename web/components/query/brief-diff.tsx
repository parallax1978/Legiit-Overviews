// Changes since the first brief: must-cover topics, entities and new-to-cite ideas added (green) and
// removed (red) between the full report's brief and a 28-day refresh.
import { Card, CardHeader } from "@/components/ui/card";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { BriefDiff, ListDiff } from "@/lib/query/report";

function DiffChip({ text, added }: { text: string; added: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-start gap-1 rounded-lg px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        added ? "bg-good-soft text-good ring-good-soft" : "bg-bad-soft text-bad ring-bad-soft",
      )}
    >
      {added ? <PlusIcon className="mt-px h-3 w-3" /> : <MinusIcon className="mt-px h-3 w-3" />}
      <span className="sr-only">{added ? "Added: " : "Removed: "}</span>
      <span className={cn("min-w-0 break-words", !added && "line-through decoration-bad/40")}>{text}</span>
    </span>
  );
}

function Group({ label, diff }: { label: string; diff: ListDiff }) {
  const none = diff.added.length === 0 && diff.removed.length === 0;
  return (
    <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:gap-6 sm:px-6">
      <p className="w-40 shrink-0 text-sm font-semibold text-ink">{label}</p>
      {none ? (
        <p className="text-sm text-ink-muted">No change</p>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {diff.added.map((t) => (
            <DiffChip key={`a:${t}`} text={t} added />
          ))}
          {diff.removed.map((t) => (
            <DiffChip key={`r:${t}`} text={t} added={false} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BriefDiffCard({ diff, firstLabel }: { diff: BriefDiff; firstLabel: string }) {
  const total =
    diff.mustCover.added.length +
    diff.mustCover.removed.length +
    diff.entities.added.length +
    diff.entities.removed.length +
    diff.newToCite.added.length +
    diff.newToCite.removed.length;
  return (
    <Card padding="none">
      <div className="p-5 sm:p-6">
        <CardHeader
          eyebrow="28-day refresh"
          title="Changes since the first brief"
          description={
            total === 0
              ? `Compared with the ${firstLabel}: the same topics, entities and ideas still hold.`
              : `Compared with the ${firstLabel}. Green was added in this refresh; red was in the first brief and is gone now.`
          }
        />
      </div>
      <div className="divide-y divide-line border-t border-line">
        <Group label="Must cover" diff={diff.mustCover} />
        <Group label="Entities" diff={diff.entities} />
        <Group label="New to cite" diff={diff.newToCite} />
      </div>
    </Card>
  );
}
