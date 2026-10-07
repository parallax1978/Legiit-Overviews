// Previous draft scores for a query, newest first. Each row opens its result with ?score=<id>.
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { FileTextIcon, LinkIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/lib/cn";
import { hostOf } from "@/lib/format";
import type { DraftScoreSummary } from "@/lib/query/report";

export function DraftHistory({ queryId, scores, selectedId }: { queryId: string; scores: DraftScoreSummary[]; selectedId: string | null }) {
  return (
    <Card padding="none">
      <ul className="divide-y divide-line">
        {scores.map((s) => {
          const selected = s.id === selectedId;
          return (
            <li key={s.id}>
              <Link
                href={`/queries/${queryId}/draft?score=${s.id}`}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors sm:px-5",
                  selected ? "bg-brand-faint/60" : "hover:bg-surface-alt",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
                  {s.source === "url" ? <LinkIcon /> : <FileTextIcon />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{s.source === "url" && s.url ? hostOf(s.url) : "Pasted text"}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    <LocalTime value={s.created_at} format="datetime" />
                    {s.source === "url" && s.url ? <span className="hidden sm:inline"> · {s.url}</span> : null}
                  </span>
                </span>
                {s.status === "done" && s.score !== null ? (
                  <span className={cn("text-lg font-bold tabular-nums", selected ? "text-brand" : "text-ink")}>{Math.round(s.score)}</span>
                ) : s.status === "running" ? (
                  <Chip tone="brand" dot>
                    Scoring
                  </Chip>
                ) : (
                  <Chip tone="bad" dot>
                    Failed
                  </Chip>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
