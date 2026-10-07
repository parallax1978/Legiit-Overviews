// DayDiff: what one UTC day added and dropped against the previous day with captures (claims,
// brands and entities, cited URLs), as green and red chips.
import Link from "next/link";
import type { ReactNode } from "react";
import { MinusIcon, PlusIcon, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DailyDiff } from "@/lib/types";
import { displayUrl } from "./page-anchor";

const DAY = 86_400_000;

/** The UTC day (YYYY-MM-DD) a rolling window cuts at its start, or null when it starts at midnight. */
export function cutFirstDay(windowFrom: string): string | null {
  const ms = Date.parse(windowFrom);
  return Number.isFinite(ms) && ms % DAY !== 0 ? new Date(ms).toISOString().slice(0, 10) : null;
}

/**
 * Days with renders that were captured in full inside the window: not today (still being captured) and
 * not a first day the window starts partway through. Only these are fair to compare.
 */
export function completeDays(daily: DailyDiff[], windowFrom: string, now: number): DailyDiff[] {
  const today = new Date(now).toISOString().slice(0, 10);
  const cut = cutFirstDay(windowFrom);
  return daily.filter((d) => d.renders > 0 && d.day < today && d.day !== cut);
}

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

/**
 * The day's changes grouped by claims, entities and citations; groups without changes are left out.
 * With `limit`, each group shows at most that many chips (added first) and a "more" link to `moreHref`.
 */
export function DayDiff({ diff, limit, moreHref, className }: { diff: DailyDiff; limit?: number; moreHref?: string; className?: string }) {
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
            <span className="font-normal normal-case tracking-normal text-ink-muted">
              {g.added.length > 0 && `${g.added.length} added`}
              {g.added.length > 0 && g.dropped.length > 0 && ", "}
              {g.dropped.length > 0 && `${g.dropped.length} dropped`}
            </span>
          </SectionLabel>
          <GroupChips group={g} limit={limit} moreHref={moreHref} />
        </div>
      ))}
    </div>
  );
}

function GroupChips({ group, limit, moreHref }: { group: Group; limit?: number; moreHref?: string }) {
  const all = [...group.added.map((x) => ({ ...x, kind: "added" as const })), ...group.dropped.map((x) => ({ ...x, kind: "dropped" as const }))];
  const shown = limit ? all.slice(0, limit) : all;
  const rest = all.length - shown.length;
  return (
    <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {shown.map((x) => (
        <DiffChip key={`${x.kind}-${x.key}`} kind={x.kind} title={x.title}>
          {x.text}
        </DiffChip>
      ))}
      {rest > 0 && moreHref && (
        <li className="text-xs">
          <Link href={moreHref} className="font-medium text-brand hover:text-brand-strong">
            {rest} more
          </Link>
        </li>
      )}
      {rest > 0 && !moreHref && (
        <li className="has-[details[open]]:basis-full">
          <details className="group/more">
            <summary className="cursor-pointer text-xs font-medium text-brand hover:text-brand-strong group-open/more:mb-1.5">
              <span className="group-open/more:hidden">Show {rest} more</span>
              <span className="hidden group-open/more:inline">Show fewer</span>
            </summary>
            <ul className="flex flex-wrap gap-1.5">
              {all.slice(shown.length).map((x) => (
                <DiffChip key={`${x.kind}-${x.key}`} kind={x.kind} title={x.title}>
                  {x.text}
                </DiffChip>
              ))}
            </ul>
          </details>
        </li>
      )}
    </ul>
  );
}
