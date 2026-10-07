// The Patterns tab sections: recurring claims, brands and entities, formats, sources and domains,
// organic overlap, day by day and unsupported claims. Every share opens its evidence.
import type { ReactNode } from "react";
import { BucketChip, Chip, LocalTime, NumberedRow, ProgressBar, Tag, TH, THead, TR, TD } from "@/components/ui";
import { formatCount, formatDayUTC, formatPercent, formatShare, plural } from "@/lib/format";
import type { Bucket, DailyDiff, SeriesMetrics } from "@/lib/types";
import { DayDiff, dayChangeCounts, dayHasChanges } from "./day-diff";
import { EvidenceTrigger } from "./evidence";
import { claimTypeName, formatLabelName } from "./labels";
import { displayUrl } from "./page-anchor";
import { SectionCard, SectionEmpty } from "./section-card";
import { ShowMore } from "./show-more";

export interface WindowRef {
  seriesId: string;
  from: string;
  to: string;
}

// ------------------------------------------------------------------ claims

export function ClaimsSection({ m, w }: { m: SeriesMetrics; w: WindowRef }) {
  const unsupported = new Set(m.unsupported_claims.map((u) => u.group_id));
  const claims = [...m.claims].sort((a, b) => b.share - a.share || b.renders - a.renders || a.label.localeCompare(b.label));
  const rows = claims.map((c, i) => {
    const share = formatShare(c.share, m.present);
    return (
      <NumberedRow
        key={c.group_id}
        n={i + 1}
        title={c.label}
        aside={
          <>
            <BucketChip bucket={c.bucket} />
            {unsupported.has(c.group_id) && (
              <Chip tone="warn" size="sm">
                Unsupported
              </Chip>
            )}
          </>
        }
        meta={
          <>
            Cited {formatShare(c.cited_share, c.renders)} · first seen <LocalTime value={c.first_seen} format="date" /> · last seen{" "}
            <LocalTime value={c.last_seen} format="date" />
          </>
        }
      >
        <ShareLine
          share={c.share}
          extra={c.types.map((t) => (
            <Tag key={t}>{claimTypeName(t)}</Tag>
          ))}
        >
          <EvidenceTrigger seriesId={w.seriesId} kind="claim" evidenceKey={c.group_id} from={w.from} to={w.to} title={c.label} subtitle={`Share of overviews: ${share}`}>
            {share}
          </EvidenceTrigger>
        </ShareLine>
      </NumberedRow>
    );
  });

  return (
    <SectionCard
      id="claims"
      label="Recurring claims"
      description={`How often each claim appears, out of ${plural(m.present, "overview")} in this window. Cited is the share of its mentions that carry a citation.`}
    >
      {rows.length ? (
        <ShowMore items={rows} noun="claims" containerClassName="border-t border-line" />
      ) : (
        <SectionEmpty>
          Claims appear once Claude has read the overviews in this window. Reading runs in batches, usually within a few hours of a capture.
        </SectionEmpty>
      )}
    </SectionCard>
  );
}

function ShareLine({ share, children, bar, extra }: { share: number | null; children: ReactNode; bar?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="w-full max-w-56 sm:w-56">{bar ?? <ProgressBar value={share} label="Share of overviews" valueText={formatPercent(share)} />}</div>
      <span className="text-xs tabular-nums">{children}</span>
      {extra}
    </div>
  );
}

// ------------------------------------------------------------------ entities

export function EntitiesSection({ m, w }: { m: SeriesMetrics; w: WindowRef }) {
  const rows = m.entities.map((e, i) => {
    const share = formatShare(e.share, m.present);
    const mentioned = Math.max(0, e.share - e.recommended_share);
    return (
      <NumberedRow
        key={e.entity_id}
        n={i + 1}
        title={e.name}
        aside={<BucketChip bucket={e.bucket} />}
        meta={`Recommended in ${formatShare(e.recommended_share, m.present)}, mentioned only in ${formatPercent(mentioned)}`}
      >
        <ShareLine
          share={e.share}
          bar={
            <div
              role="img"
              aria-label={`Recommended in ${formatPercent(e.recommended_share)}, mentioned only in ${formatPercent(mentioned)} of overviews`}
              className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
            >
              <span className="h-full bg-brand" style={{ width: `${Math.min(100, e.recommended_share * 100)}%` }} />
              <span className="h-full bg-brand/35" style={{ width: `${Math.min(100, mentioned * 100)}%` }} />
            </div>
          }
        >
          <EvidenceTrigger seriesId={w.seriesId} kind="entity" evidenceKey={e.entity_id} from={w.from} to={w.to} title={e.name} subtitle={`Share of overviews: ${share}`}>
            {share}
          </EvidenceTrigger>
        </ShareLine>
        {e.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {e.labels.map((l) => (
              <Tag key={l}>{l}</Tag>
            ))}
          </div>
        )}
      </NumberedRow>
    );
  });

  return (
    <SectionCard
      id="entities"
      label="Brands and entities"
      description={`Named in the overview, out of ${plural(m.present, "overview")}. Labels are how Google described them.`}
      action={
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-brand" />
            Recommended
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-brand/35" />
            Mentioned only
          </li>
        </ul>
      }
    >
      {rows.length ? (
        <ShowMore items={rows} noun="brands and entities" containerClassName="border-t border-line" />
      ) : (
        <SectionEmpty>No brand, product or other entity was named in the overviews of this window yet.</SectionEmpty>
      )}
    </SectionCard>
  );
}

// ------------------------------------------------------------------ formats

export function FormatsSection({ m, w }: { m: SeriesMetrics; w: WindowRef }) {
  return (
    <SectionCard
      id="formats"
      label="Formats"
      description={
        <>
          How the overview is built. Median length{" "}
          <span className="font-semibold text-ink">{m.median_word_count === null ? "–" : `${formatCount(Math.round(m.median_word_count))} words`}</span>{" "}
          (n={formatCount(m.present)}).
        </>
      }
    >
      {m.formats.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {m.formats.map((f) => {
            const name = formatLabelName(f.label);
            const share = formatShare(f.share, m.present);
            return (
              <li key={f.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-3">
                <span className="text-sm font-semibold text-ink">{name}</span>
                <span className="flex w-full items-center gap-3 sm:w-auto">
                  <ProgressBar value={f.share} className="w-full sm:w-36" label={name} valueText={formatPercent(f.share)} />
                  <span className="shrink-0 text-xs tabular-nums">
                    <EvidenceTrigger seriesId={w.seriesId} kind="format" evidenceKey={f.label} from={w.from} to={w.to} title={name} subtitle={`Share of overviews: ${share}`}>
                      {share}
                    </EvidenceTrigger>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <SectionEmpty>Format labels (ranked list, table, steps and so on) appear once Claude has read the overviews in this window.</SectionEmpty>
      )}
    </SectionCard>
  );
}

// ------------------------------------------------------------------ organic overlap

export function OverlapSection({ m }: { m: SeriesMetrics }) {
  const n = m.citations_per_render === null ? 0 : Math.round(m.citations_per_render * m.present);
  const rows = [
    { label: "Also rank in the organic top 10", share: m.organic_overlap.top10 },
    { label: "Also rank in the organic top 20", share: m.organic_overlap.top20 },
  ];
  return (
    <SectionCard
      id="overlap"
      label="Organic overlap"
      description={`Cited URLs that also rank in the same search, across ${plural(n, "citation")}. A low share means Google cites pages beyond the blue links.`}
    >
      {n === 0 ? (
        <SectionEmpty>No overview in this window cited a URL yet.</SectionEmpty>
      ) : (
        <div className="space-y-4 px-5 pb-5">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink">{r.label}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatShare(r.share, n)}</span>
              </div>
              <ProgressBar value={r.share} className="mt-2" label={r.label} valueText={formatPercent(r.share)} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ------------------------------------------------------------------ sources and domains

const BUCKETS: { bucket: Bucket; text: string }[] = [
  { bucket: "core", text: "80% or more" },
  { bucket: "recurring", text: "40 to 80%" },
  { bucket: "rotating", text: "under 40%" },
];

export function BucketLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted">
      {BUCKETS.map((b) => (
        <li key={b.bucket} className="inline-flex items-center gap-1.5">
          <BucketChip bucket={b.bucket} /> {b.text} of overviews
        </li>
      ))}
    </ul>
  );
}

export function SourcesSection({ m, w }: { m: SeriesMetrics; w: WindowRef }) {
  const sourceRows = m.sources.map((s, i) => {
    const share = formatShare(s.share, m.present);
    return (
      <TR key={s.url_key}>
        <TD muted numeric align="left" className="w-10 pr-0 align-top">
          {i + 1}
        </TD>
        <TD className="align-top sm:min-w-56">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-ink hover:text-brand">
            {displayUrl(s.url_key)}
          </a>
          {s.title && <p className="mt-0.5 text-xs text-ink-muted">{s.title}</p>}
          {s.platform && (
            <Tag className="mt-1.5" title="Platform pages are reported as a platform presence, not analysed as pages">
              Platform
            </Tag>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:hidden">
            <BucketChip bucket={s.bucket} />
            <span>
              Cited in{" "}
              <EvidenceTrigger seriesId={w.seriesId} kind="source" evidenceKey={s.url_key} from={w.from} to={w.to} title={displayUrl(s.url_key)} subtitle={`Share of overviews: ${share}`}>
                {share}
              </EvidenceTrigger>
            </span>
            <span className="text-ink-muted">Top 10: {formatShare(s.organic_top10_share, s.renders)}</span>
          </div>
        </TD>
        <TD className="hidden align-top sm:table-cell">
          <BucketChip bucket={s.bucket} />
        </TD>
        <TD numeric className="hidden align-top sm:table-cell">
          <EvidenceTrigger seriesId={w.seriesId} kind="source" evidenceKey={s.url_key} from={w.from} to={w.to} title={displayUrl(s.url_key)} subtitle={`Share of overviews: ${share}`}>
            {share}
          </EvidenceTrigger>
        </TD>
        <TD numeric muted className="hidden align-top sm:table-cell">
          {formatShare(s.organic_top10_share, s.renders)}
        </TD>
      </TR>
    );
  });

  const domainRows = m.domains.map((d, i) => {
    const share = formatShare(d.share, m.present);
    return (
      <TR key={d.reg_domain}>
        <TD muted numeric align="left" className="w-10 pr-0">
          {i + 1}
        </TD>
        <TD className="sm:min-w-40">
          <span className="break-all font-semibold text-ink">{d.reg_domain}</span>
          {d.platform && <Tag className="ml-2">Platform</Tag>}
          <div className="mt-1.5 sm:hidden">
            <BucketChip bucket={d.bucket} />
          </div>
        </TD>
        <TD className="hidden sm:table-cell">
          <BucketChip bucket={d.bucket} />
        </TD>
        <TD numeric className="align-top sm:align-middle">
          <EvidenceTrigger seriesId={w.seriesId} kind="domain" evidenceKey={d.reg_domain} from={w.from} to={w.to} title={d.reg_domain} subtitle={`Share of overviews: ${share}`}>
            {share}
          </EvidenceTrigger>
        </TD>
      </TR>
    );
  });

  return (
    <SectionCard
      id="sources"
      label="Sources"
      description={`URLs Google cited and how reliably they survive, out of ${plural(m.present, "overview")}. Organic top 10 is how often the URL also ranked on page one when cited.`}
    >
      <div className="px-5 pb-4">
        <BucketLegend />
      </div>
      {sourceRows.length ? (
        <ShowMore
          variant="table"
          items={sourceRows}
          noun="sources"
          containerClassName="border-t border-line"
          head={
            <THead>
              <tr>
                <TH className="w-10 pr-0">#</TH>
                <TH>URL</TH>
                <TH className="hidden sm:table-cell">Survival</TH>
                <TH align="right" className="hidden sm:table-cell">
                  Cited in
                </TH>
                <TH align="right" className="hidden sm:table-cell">
                  Organic top 10
                </TH>
              </tr>
            </THead>
          }
        />
      ) : (
        <SectionEmpty>No overview in this window cited a source.</SectionEmpty>
      )}
      {domainRows.length > 0 && (
        <div className="border-t border-line pt-5">
          <h3 className="px-5 text-sm font-semibold text-ink">Domains</h3>
          <p className="px-5 text-xs text-ink-muted">Any URL on the domain counts.</p>
          <ShowMore
            className="mt-3"
            variant="table"
            items={domainRows}
            initial={15}
            noun="domains"
            containerClassName="border-t border-line"
            head={
              <THead>
                <tr>
                  <TH className="w-10 pr-0">#</TH>
                  <TH>Domain</TH>
                  <TH className="hidden sm:table-cell">Survival</TH>
                  <TH align="right">Cited in</TH>
                </tr>
              </THead>
            }
          />
        </div>
      )}
    </SectionCard>
  );
}

// ------------------------------------------------------------------ day by day

export function DailySection({ m }: { m: SeriesMetrics }) {
  const days = [...m.daily].reverse();
  const prevOf = new Map<string, DailyDiff | undefined>();
  const withRenders = m.daily.filter((d) => d.renders > 0);
  withRenders.forEach((d, i) => prevOf.set(d.day, withRenders[i - 1]));

  const items = days.map((d) => {
    const prev = prevOf.get(d.day);
    const counts = dayChangeCounts(d);
    let body: ReactNode;
    if (d.renders === 0) body = <p className="mt-1 text-sm text-ink-muted">Every capture failed this day, so it isn&rsquo;t compared.</p>;
    else if (!prev) body = <p className="mt-1 text-sm text-ink-muted">First day in this window; changes are counted from the next day.</p>;
    else if (!dayHasChanges(d)) body = <p className="mt-1 text-sm text-ink-muted">No changes from {formatDayUTC(prev.day)}.</p>;
    else body = <DayDiff diff={d} limit={8} className="mt-3" />;
    return (
      <li key={d.day} className="relative py-3 pl-6">
        <span aria-hidden="true" className="absolute left-0 top-[18px] h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-brand-faint" />
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 className="text-sm font-semibold text-ink">{formatDayUTC(d.day)}</h3>
          <p className="text-xs text-ink-muted">
            {plural(d.present, "overview")} in {plural(d.renders, "render")}
            {prev && dayHasChanges(d) && (
              <>
                {" · "}
                <span className="text-good">+{counts.added}</span> <span className="text-bad">−{counts.dropped}</span>
              </>
            )}
          </p>
        </div>
        {body}
      </li>
    );
  });

  return (
    <SectionCard id="daily" label="Day by day" description="Claims, brands and cited URLs added and dropped against the previous day with captures (UTC days), newest first.">
      {items.length ? (
        <ShowMore
          variant="plain"
          items={items}
          initial={days.length > 8 ? 7 : 8}
          noun="days"
          containerClassName="relative mx-5 mb-2 before:absolute before:bottom-5 before:left-[4px] before:top-5 before:w-px before:bg-line"
        />
      ) : (
        <SectionEmpty>No captures in this window yet.</SectionEmpty>
      )}
    </SectionCard>
  );
}

// ------------------------------------------------------------------ unsupported claims

export function UnsupportedSection({ m, w }: { m: SeriesMetrics; w: WindowRef }) {
  return (
    <SectionCard
      id="unsupported"
      label="Unsupported claims"
      description="Recurring claims (in 40% or more of overviews) that no capture backed with a citation. A page that backs one with evidence is an opening: Google has nothing to cite for it yet."
    >
      {m.unsupported_claims.length ? (
        <ol className="divide-y divide-line border-t border-line">
          {m.unsupported_claims.map((u, i) => {
            const share = formatShare(u.share, m.present);
            return (
              <NumberedRow key={u.group_id} n={i + 1} title={u.label} aside={<Chip tone="warn" size="sm">Unsupported</Chip>}>
                <ShareLine share={u.share}>
                  <EvidenceTrigger
                    seriesId={w.seriesId}
                    kind="unsupported"
                    evidenceKey={u.group_id}
                    from={w.from}
                    to={w.to}
                    title={u.label}
                    subtitle={`Share of overviews: ${share}, never cited`}
                  >
                    {share}
                  </EvidenceTrigger>
                </ShareLine>
              </NumberedRow>
            );
          })}
        </ol>
      ) : (
        <SectionEmpty>
          {m.claims.length
            ? "Every recurring claim in this window carries at least one citation."
            : "Unsupported claims show here once Claude has read the overviews in this window."}
        </SectionEmpty>
      )}
    </SectionCard>
  );
}
