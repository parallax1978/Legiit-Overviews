// PageCard: one cited page of a report: ref badge, title and URL, share with survival bucket, measures,
// Claude's tags, and where Google quotes the page (heading and position down the page).
import type { ReactNode } from "react";
import { BucketChip, Chip, ExternalLinkIcon, LabelValue, LocalTime, NumberBadge, SectionLabel, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { bucketForShare, formatCount, formatDecimal, formatPercent, formatShare, plural, truncate } from "@/lib/format";
import type { PageInfo } from "@/lib/query/pages";
import type { PassageLocation, ReportPageDetail } from "@/lib/types";
import { pageEvidenceName } from "./labels";
import { displayUrl, pageAnchorId } from "./page-anchor";

export interface PageCardProps {
  detail: ReportPageDetail;
  page: PageInfo | undefined;
  title: string | null;
  /** Overviews in the report window (n for the share). */
  present: number | null;
  isOwn: boolean;
}

export function PageCard({ detail, page, title, present, isOwn }: PageCardProps) {
  const url = page?.url ?? `https://${detail.url_key}`;
  return (
    <article id={pageAnchorId(detail.url_key)} className="scroll-mt-20 rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <NumberBadge n={detail.ref} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-[15px] font-semibold leading-snug text-ink">{title || displayUrl(detail.url_key)}</h3>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-ink-muted hover:text-brand"
              >
                <span className="truncate">{displayUrl(detail.url_key)}</span>
                <ExternalLinkIcon className="h-3 w-3 shrink-0 text-ink-soft group-hover:text-brand" />
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {isOwn && (
                <Chip tone="good" dot>
                  Your page
                </Chip>
              )}
              <BucketChip bucket={bucketForShare(detail.share)} />
            </div>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Share of overviews citing it in the report window:{" "}
            <span className="font-semibold text-ink">{present === null ? formatPercent(detail.share) : formatShare(detail.share, present)}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <PageMeasuresBlock page={page} />
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <PageTagsBlock page={page} />
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <SectionLabel>Where Google quotes this page</SectionLabel>
        {detail.passages.length ? (
          <Passages passages={detail.passages} />
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Google cited this page without quoting a passage in the report window.</p>
        )}
      </div>
    </article>
  );
}

function PageMeasuresBlock({ page }: { page: PageInfo | undefined }) {
  if (!page || page.parse_status === "pending") {
    return <p className="text-sm text-ink-muted">This page is being read. Its measurements appear here when parsing finishes.</p>;
  }
  if (page.parse_status === "failed" || !page.measures) {
    return (
      <p className="text-sm text-ink-muted">
        We couldn&rsquo;t read this page, so it has no measurements.
        {page.parse_error && <span className="mt-1 block break-words font-mono text-xs text-ink-muted">{page.parse_error}</span>}
      </p>
    );
  }
  const m = page.measures;
  const date = m.updated ?? m.published;
  const items: [string, ReactNode][] = [
    ["Words", formatCount(m.word_count)],
    ["Words before the answer", m.words_before_answer === null ? "Answer not found" : formatCount(m.words_before_answer)],
    ["Headings", `${formatCount(m.headings)}${m.outline_depth ? `, ${m.outline_depth} levels deep` : ""}`],
    ["Tables", m.tables ? `${plural(m.tables, "table")}, ${plural(m.table_rows, "row")}` : "None"],
    ["List items", m.lists ? `${formatCount(m.list_items)} in ${plural(m.lists, "list")}` : "None"],
    ["Comparison blocks", formatCount(m.comparison_blocks)],
    ["Numbers per 100 words", formatDecimal(m.numbers_per_100_words, 1)],
    ["Author", m.author || "Not shown"],
    [m.updated ? "Updated" : "Published", date ? <LocalTime value={date} format="date" /> : "Not shown"],
    ["FAQ section", m.has_faq ? "Yes" : "No"],
    ["Links", `${formatCount(m.internal_links)} internal, ${formatCount(m.external_links)} external`],
  ];
  return (
    <>
      <SectionLabel>Measures</SectionLabel>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <LabelValue key={label} label={label}>
            <span className="tabular-nums">{value}</span>
          </LabelValue>
        ))}
      </dl>
    </>
  );
}

function TagRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PageTagsBlock({ page }: { page: PageInfo | undefined }) {
  if (!page || page.parse_status !== "ok") {
    return (
      <>
        <SectionLabel>What the page covers</SectionLabel>
        <p className="mt-2 text-sm text-ink-muted">Tags come after the page is read.</p>
      </>
    );
  }
  const t = page.tags;
  if (!t || page.tag_status !== "done") {
    return (
      <>
        <SectionLabel>What the page covers</SectionLabel>
        <p className="mt-2 text-sm text-ink-muted">
          {page.tag_status === "failed"
            ? "Claude couldn't tag this page; the brief uses its measurements only."
            : "Claude is tagging this page's topics, entities and evidence. This usually takes under an hour."}
        </p>
      </>
    );
  }
  return (
    <div className="space-y-4">
      <SectionLabel>What the page covers</SectionLabel>
      {t.approach && <p className="text-sm leading-6 text-ink">{t.approach}</p>}
      {t.answer_sentence && (
        <TagRow label="First sentence that answers">
          <p className="text-sm italic leading-6 text-ink-muted">&ldquo;{truncate(t.answer_sentence, 280)}&rdquo;</p>
        </TagRow>
      )}
      {t.topics.length > 0 && (
        <TagRow label="Topics">
          <div className="flex flex-wrap gap-1.5">
            {t.topics.map((x) => (
              <Tag key={x}>{x}</Tag>
            ))}
          </div>
        </TagRow>
      )}
      {t.entities.length > 0 && (
        <TagRow label="Entities">
          <div className="flex flex-wrap gap-1.5">
            {t.entities.map((x) => (
              <Tag key={x}>{x}</Tag>
            ))}
          </div>
        </TagRow>
      )}
      {t.evidence.length > 0 && (
        <TagRow label="Evidence">
          <ul className="space-y-2.5">
            {t.evidence.map((e, i) => (
              <li key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2.5">
                <Chip tone="brand" size="sm" className="self-start">
                  {pageEvidenceName(e.kind)}
                </Chip>
                <div className="min-w-0 text-sm leading-6">
                  <p className="text-ink">{e.description}</p>
                  {e.excerpt && <p className="break-words text-xs leading-5 text-ink-muted">&ldquo;{truncate(e.excerpt, 200)}&rdquo;</p>}
                </div>
              </li>
            ))}
          </ul>
        </TagRow>
      )}
      {t.questions_answered.length > 0 && (
        <TagRow label="Questions answered">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-ink marker:text-ink-soft">
            {t.questions_answered.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </TagRow>
      )}
    </div>
  );
}

interface PassageGroup {
  passage: PassageLocation;
  /** Distinct quotes Google took from this place. */
  count: number;
}

/** Google's "Sep 18, 2026 — " prefix on some passages. */
const DATE_PREFIX = /^[A-Z][a-z]{2,8}\.? \d{1,2}, \d{4}\s*[—–-]\s*/;
const TRAILING_ELLIPSIS = /\s*(?:\.{3}|…)\s*$/;

function quoteKey(text: string): string {
  return text.replace(DATE_PREFIX, "").replace(TRAILING_ELLIPSIS, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * One entry per distinct quote: Google cites the same sentence cut short ("…") or with a date in front,
 * so variants whose text is a prefix of another are merged. The variant without a date prefix gives the
 * location (a date prefix shifts the passage locator back into the previous section).
 */
function distinctQuotes(passages: PassageLocation[]): PassageLocation[] {
  const sorted = [...passages].sort((a, b) => quoteKey(b.passage).length - quoteKey(a.passage).length);
  const quotes: { key: string; variants: PassageLocation[] }[] = [];
  for (const p of sorted) {
    const key = quoteKey(p.passage);
    const match = quotes.find((q) => q.key.startsWith(key));
    if (match) match.variants.push(p);
    else quotes.push({ key, variants: [p] });
  }
  return quotes.map(({ variants }) => {
    const clean = variants.filter((v) => !DATE_PREFIX.test(v.passage));
    const located = clean.find((v) => v.found) ?? variants.find((v) => v.found) ?? variants[0];
    const text = (clean[0] ?? variants[0]).passage.replace(DATE_PREFIX, "");
    return { ...located, passage: text };
  });
}

/** Distinct quotes grouped by where they sit (heading and position), most quoted place first. */
function groupPassages(quotes: PassageLocation[]): PassageGroup[] {
  const groups = new Map<string, PassageGroup>();
  for (const p of quotes) {
    const key = p.found ? `f|${p.heading ?? ""}|${Math.round((p.position ?? 0) * 50)}` : `n|${p.passage.slice(0, 60)}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { passage: p, count: 1 });
    else {
      g.count++;
      if (p.passage.length > g.passage.passage.length) g.passage = p;
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.passage.position ?? 2) - (b.passage.position ?? 2));
}

const SHOWN_PASSAGES = 4;

function Passages({ passages }: { passages: PassageLocation[] }) {
  const quotes = distinctQuotes(passages);
  const groups = groupPassages(quotes);
  const shown = groups.slice(0, SHOWN_PASSAGES);
  const rest = groups.slice(SHOWN_PASSAGES);
  return (
    <>
      <p className="mt-1 text-xs text-ink-muted">
        {plural(quotes.length, "distinct quote")} in the report window
        {groups.length < quotes.length ? `, from ${plural(groups.length, "place")} on the page` : ""}
        {passages.length > quotes.length ? ` (Google trimmed or dated some, so ${plural(passages.length, "text variant")} are merged)` : ""}.
      </p>
      <ul className="mt-3 space-y-4">
        {shown.map((g, i) => (
          <PassageItem key={i} group={g} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group/more mt-4">
          <summary className="cursor-pointer text-xs font-medium text-brand hover:text-brand-strong">
            <span className="group-open/more:hidden">Show {plural(rest.length, "more place")}</span>
            <span className="hidden group-open/more:inline">Show fewer</span>
          </summary>
          <ul className="mt-3 space-y-4">
            {rest.map((g, i) => (
              <PassageItem key={i} group={g} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function PassageItem({ group }: { group: PassageGroup }) {
  const { passage, count } = group;
  const pos = passage.found && typeof passage.position === "number" ? Math.min(1, Math.max(0, passage.position)) : null;
  return (
    <li>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-sm font-semibold text-ink">
          {passage.found ? passage.heading || "Before the first heading" : "Not found in the page"}
        </p>
        {passage.found ? (
          pos !== null && (
            <span className="text-xs tabular-nums text-ink-muted">
              {formatPercent(pos)} down the page{count > 1 ? ` · ${count} different quotes` : ""}
            </span>
          )
        ) : (
          <Chip tone="grey" size="sm">
            Not found
          </Chip>
        )}
      </div>
      {pos !== null && <PositionBar position={pos} />}
      <p className={cn("mt-2 break-words text-xs leading-5", passage.found ? "text-ink-muted" : "italic text-ink-muted")}>
        &ldquo;{truncate(passage.passage, 280)}&rdquo;
      </p>
    </li>
  );
}

/** A thin top-to-bottom bar with a marker where the passage sits. */
function PositionBar({ position }: { position: number }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
      <span>Top</span>
      <div className="relative h-1.5 flex-1 rounded-full bg-surface-sunken" role="img" aria-label={`${formatPercent(position)} of the way down the page`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand-soft" style={{ width: `${position * 100}%` }} />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-sm"
          style={{ left: `${position * 100}%` }}
        />
      </div>
      <span>Bottom</span>
    </div>
  );
}
