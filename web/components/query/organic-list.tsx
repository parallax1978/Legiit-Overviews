// OrganicList: the organic top 10 of one capture, marking results the overview also cited.
import { Chip, ExternalLinkIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { hostOf } from "@/lib/format";
import type { ParsedOrganic } from "@/lib/types";
import { displayUrl } from "./page-anchor";

export function OrganicList({ results, citedKeys, className }: { results: ParsedOrganic[]; citedKeys: Set<string>; className?: string }) {
  const top = [...results].filter((r) => r.rank <= 10).sort((a, b) => a.rank - b.rank);
  return (
    <ol className={cn("divide-y divide-line", className)}>
      {top.map((r) => {
        const cited = citedKeys.has(r.url_key);
        return (
          <li key={`${r.rank}-${r.url_key}`} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                cited ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted",
              )}
            >
              {r.rank}
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex max-w-full items-start gap-1 text-sm font-semibold text-ink hover:text-brand"
              >
                <span className="min-w-0 break-words">{r.title || hostOf(r.url)}</span>
                <ExternalLinkIcon className="mt-[3px] h-3 w-3 text-ink-soft group-hover:text-brand" />
              </a>
              <p className="truncate text-xs text-ink-muted">{displayUrl(r.url_key || r.url)}</p>
            </div>
            {cited && (
              <Chip tone="brand" dot size="sm" className="mt-0.5 shrink-0">
                Cited
              </Chip>
            )}
          </li>
        );
      })}
    </ol>
  );
}
