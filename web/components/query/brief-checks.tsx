// Checks run in code before a brief is saved (brief_checks): each check passed or failed with its
// detail, and the items the checks removed from the brief.
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { AlertTriangleIcon, CheckCircleIcon, XIcon } from "@/components/ui/icons";
import { SectionLabel } from "@/components/ui/typography";
import { humanize } from "@/lib/format";
import type { BriefChecks as BriefChecksData } from "@/lib/types";

const CHECK_TITLES: Record<string, string> = {
  must_cover_recurrence: "Must-cover topics rest on claims in at least 40% of overviews",
  entity_recurrence: "Entities appear in at least 2 renders",
  outline_covers_must_cover: "The outline covers every must-cover topic",
  refs_resolve: "Every evidence link points to real data",
  no_figures_in_prose: "Claude's wording states no figures; every count comes from the database",
};

const REMOVED_LABELS: Record<string, string> = {
  must_cover_recurrence: "Must-cover topics",
  entity_recurrence: "Entities",
};

/**
 * Items a failed recurrence check dropped, read from its detail:
 * "Dropped 2 of 7 must-cover topics without ...: Topic A (best claim in 20%); Topic B (no known claim)."
 */
export function removedItems(detail: string): string[] {
  if (!/^Dropped\b/.test(detail)) return [];
  const i = detail.indexOf(": ");
  if (i < 0) return [];
  return detail
    .slice(i + 2)
    .replace(/\.\s*$/, "")
    .split("; ")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function BriefChecks({ checks }: { checks: BriefChecksData }) {
  const list = Array.isArray(checks.checks) ? checks.checks : [];
  const passed = list.filter((c) => c.passed).length;
  const removed = list
    .filter((c) => !c.passed && REMOVED_LABELS[c.name])
    .map((c) => ({ label: REMOVED_LABELS[c.name], items: removedItems(c.detail) }))
    .filter((g) => g.items.length > 0);
  const droppedRefs = Array.isArray(checks.dropped_refs) ? checks.dropped_refs : [];

  return (
    <Card padding="none">
      <div className="p-5 sm:p-6">
        <CardHeader
          as="h2"
          title="Checks on this brief"
          description="Run in code on the counts before the brief was saved. Items that fail the recurrence checks are removed."
          action={
            <Chip tone={checks.passed ? "good" : "warn"} dot>
              {checks.passed ? "All passed" : `${passed} of ${list.length} passed`}
            </Chip>
          }
        />
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {list.map((c) => (
          <li key={c.name} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
            {c.passed ? <CheckCircleIcon className="mt-0.5 text-good" /> : <AlertTriangleIcon className="mt-0.5 text-warn" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                <span className="sr-only">{c.passed ? "Passed: " : "Failed: "}</span>
                {CHECK_TITLES[c.name] ?? humanize(c.name)}
              </p>
              <p className="mt-0.5 break-words text-sm leading-6 text-ink-muted">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {(removed.length > 0 || droppedRefs.length > 0) && (
        <div className="space-y-4 border-t border-line bg-surface-alt/60 px-5 py-4 sm:px-6">
          <SectionLabel>Removed by checks</SectionLabel>
          {removed.map((g) => (
            <div key={g.label}>
              <p className="text-xs font-medium text-ink">{g.label}</p>
              <ul className="mt-1.5 space-y-1">
                {g.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink-muted">
                    <XIcon className="mt-0.5 h-3.5 w-3.5 text-bad" />
                    <span className="break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {droppedRefs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ink">Refs that matched nothing in the data</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {droppedRefs.map((r) => (
                  <code key={r} className="rounded-md bg-white px-1.5 py-0.5 font-mono text-xs text-ink-muted ring-1 ring-inset ring-line">
                    {r}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
