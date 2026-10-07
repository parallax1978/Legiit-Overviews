// Evidence chips for typed refs in a stored brief: a claim or entity chip shows its label with the share
// and n from series_metrics over the report window (lib/query/ref-metrics.ts) and opens the captures
// behind it; a page chip links to the Pages tab.
import Link from "next/link";
import { EvidenceTrigger } from "@/components/query/evidence";
import { displayUrl, pageAnchorHref } from "@/components/query/page-anchor";
import { FileTextIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatShare, truncate } from "@/lib/format";
import { normText, parseRef } from "@/lib/query/report";
import type { ClaimMetric, EntityMetric } from "@/lib/types";

/** Everything a ref chip needs to resolve refs against the report it came from. */
export interface RefContext {
  queryId: string;
  seriesId: string;
  from: string;
  to: string;
  /** Overviews analysed (extraction done) in the report window: the n of every claim and entity share. */
  extracted: number;
  claims: Map<string, ClaimMetric>;
  entities: Map<string, EntityMetric>;
}

const CHIP =
  "inline-flex max-w-full items-baseline gap-2 rounded-lg px-2.5 py-1 text-left text-xs ring-1 ring-inset transition-colors";

/**
 * A claim as a chip: its label, then "82% · n=56"; opens the claim's captures. With showName false the
 * chip shows only the share (for rows whose title already is the claim).
 */
export function ClaimChip({ id, ctx, showName = true }: { id: string; ctx: RefContext; showName?: boolean }) {
  const m = ctx.claims.get(id);
  const share = formatShare(m?.share, ctx.extracted);
  const label = m?.label ?? "Claim not counted in this window";
  return (
    <EvidenceTrigger
      seriesId={ctx.seriesId}
      kind="claim"
      evidenceKey={id}
      from={ctx.from}
      to={ctx.to}
      title={label}
      subtitle={m ? share : undefined}
      n={ctx.extracted}
    >
      {showName ? (
        <span className={cn(CHIP, "bg-brand-faint/60 ring-brand-soft hover:bg-brand-faint hover:ring-brand/40")}>
          <span className="min-w-0 text-ink">{truncate(label, 140)}</span>
          {m && <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-brand-strong">{share}</span>}
        </span>
      ) : (
        <span className={cn(CHIP, "bg-white ring-line hover:bg-surface-alt hover:ring-line-strong")}>
          <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-brand-strong">{m ? share : "See captures"}</span>
        </span>
      )}
    </EvidenceTrigger>
  );
}

/**
 * An entity as a chip with its share; opens the entity's captures. With showName false the chip shows
 * only "64% · n=48" (for rows that already name the entity).
 */
export function EntityChip({ id, ctx, name, showName = true }: { id: string; ctx: RefContext; name?: string; showName?: boolean }) {
  const m = ctx.entities.get(id);
  const share = formatShare(m?.share, ctx.extracted);
  const label = m?.name ?? name ?? "Entity";
  return (
    <EvidenceTrigger seriesId={ctx.seriesId} kind="entity" evidenceKey={id} from={ctx.from} to={ctx.to} title={label} subtitle={m ? share : undefined} n={ctx.extracted}>
      <span className={cn(CHIP, "bg-white ring-line hover:bg-surface-alt hover:ring-line-strong")}>
        {showName && <span className="min-w-0 font-medium text-ink">{label}</span>}
        <span className={cn("shrink-0 whitespace-nowrap tabular-nums", showName ? "text-ink-muted" : "font-semibold text-brand-strong")}>
          {m ? share : showName ? "" : "See captures"}
        </span>
      </span>
    </EvidenceTrigger>
  );
}

/** A cited page as a link to its card on the Pages tab. */
export function PageChip({ urlKey, ctx }: { urlKey: string; ctx: RefContext }) {
  return (
    <Link
      href={pageAnchorHref(ctx.queryId, urlKey)}
      title={urlKey}
      className={cn(CHIP, "items-center bg-white ring-line hover:bg-surface-alt hover:ring-line-strong")}
    >
      <FileTextIcon className="h-3.5 w-3.5 text-ink-soft" />
      <span className="min-w-0 truncate font-medium text-brand-strong">{truncate(displayUrl(urlKey), 56)}</span>
    </Link>
  );
}

/**
 * Chips for a list of typed refs of any kind; refs that don't parse are skipped. A claim whose label
 * the row's title (`heading`) already contains shows only its share.
 */
export function RefChips({ refs, ctx, heading, className }: { refs: string[]; ctx: RefContext; heading?: string; className?: string }) {
  const parsed = refs.map(parseRef).filter((r) => r !== null);
  if (parsed.length === 0) return null;
  const head = heading ? normText(heading) : "";
  const same = (label: string | undefined) => {
    const l = label ? normText(label) : "";
    return !!head && !!l && head.includes(l);
  };
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {parsed.map((r) =>
        r.kind === "claim" ? (
          <ClaimChip key={`c:${r.id}`} id={r.id} ctx={ctx} showName={!same(ctx.claims.get(r.id)?.label)} />
        ) : r.kind === "entity" ? (
          <EntityChip key={`e:${r.id}`} id={r.id} ctx={ctx} />
        ) : (
          <PageChip key={`p:${r.id}`} urlKey={r.id} ctx={ctx} />
        ),
      )}
    </div>
  );
}
