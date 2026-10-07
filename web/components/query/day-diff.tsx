// DayDiff: what one UTC day added and dropped against the previous day with captures (claims,
// brands and entities, cited URLs), as green and red chips.
import type { ReactNode } from "react";
import { MinusIcon, PlusIcon, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DailyDiff } from "@/lib/types";
import { displayUrl } from "./page-anchor";

/** True when the day added or dropped anything. */
export function dayHasChanges(d: DailyDiff): boolean {
  return (
    d.claims_added.length + d.claims_dropped.length + d.entities_added.length + d.entities_dropped.length + d.citations_added.length + d.citations_dropped.length >
    0
  );
}

/** Total added and dropped items of a day. */
export function dayChangeCounts(d: DailyDiff): { added: number; dropped: number } {
  return {
    added: d.claims_added.length + d.entities_added.length + d.citations_added.length,
    dropped: d.claims_dropped.length + d.entities_dropped.length + d.citations_dropped.length,
  };
}

export function DiffChip({ kind, children, title }: { kind: "added" | "dropped"; children: ReactNode; title?: string }) {
  const added = kind === "added";
  return (
    <li
      title={title}
      className={cn(
        "inline-flex max-w-full items-start gap-1 rounded-md px-2 py-0.5 text-xs leading-5",
        added ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
      )}
    >
      {added ? <PlusIcon className="mt-[3px] h-3 w-3" /> : <MinusIcon className="mt-[3px] h-3 w-3" />}
      <span className="sr-only">{added ? "Added: " : "Dropped: "}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

interface Group {
  label: string;
  added: { key: string; text: string; title?: string }[];
  dropped: { key: string; text: string; title?: string }[];
}

/** The day's changes grouped by claims, entities and citations; groups without changes are left out. */
export function DayDiff({ diff, className }: { diff: DailyDiff; className?: string }) {
  const groups: Group[] = [
    {
      label: "Claims",
      added: diff.claims_added.map((c) => ({ key: c.group_id, text: c.label })),
      dropped: diff.claims_dropped.map((c) => ({ key: c.group_id, text: c.label })),
    },
    {
      label: "Brands and entities",
      added: diff.entities_added.map((e) => ({ key: e.entity_id, text: e.name })),
      dropped: diff.entities_dropped.map((e) => ({ key: e.entity_id, text: e.name })),
    },
    {
      label: "Cited URLs",
      added: diff.citations_added.map((c) => ({ key: c.url_key, text: displayUrl(c.url_key), title: c.reg_domain })),
      dropped: diff.citations_dropped.map((c) => ({ key: c.url_key, text: displayUrl(c.url_key), title: c.reg_domain })),
    },
  ].filter((g) => g.added.length + g.dropped.length > 0);

  return (
    <div className={cn("space-y-3", className)}>
      {groups.map((g) => (
        <div key={g.label}>
          <SectionLabel>
            {g.label}{" "}
            <span className="font-normal normal-case tracking-normal text-ink-soft">
              {g.added.length > 0 && `${g.added.length} added`}
              {g.added.length > 0 && g.dropped.length > 0 && ", "}
              {g.dropped.length > 0 && `${g.dropped.length} dropped`}
            </span>
          </SectionLabel>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {g.added.map((x) => (
              <DiffChip key={`a-${x.key}`} kind="added" title={x.title}>
                {x.text}
              </DiffChip>
            ))}
            {g.dropped.map((x) => (
              <DiffChip key={`d-${x.key}`} kind="dropped" title={x.title}>
                {x.text}
              </DiffChip>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
