// A draft score: the 0 to 100 ring with a verdict, six subscores, the fix list, topic, entity and
// new-to-cite coverage, and the draft's measurements against the cited pages' medians.
import { Card, CardHeader } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { CheckIcon, ExternalLinkIcon, XIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { NumberedList, NumberedRow } from "@/components/ui/number-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SectionHeading } from "@/components/ui/typography";
import { formatCount, formatDecimal, formatPercent, hostOf, plural } from "@/lib/format";
import type { DraftScoreResult, DraftScoreRow, PageMeasures } from "@/lib/types";

type Status = "covered" | "partial" | "missing";

const STATUS: Record<Status, { label: string; tone: ChipTone }> = {
  covered: { label: "Covered", tone: "good" },
  partial: { label: "Partial", tone: "warn" },
  missing: { label: "Missing", tone: "bad" },
};

/** Subscores in the order and with the weights score-draft uses. */
const SUBSCORES: { key: keyof DraftScoreResult["subscores"]; label: string; weight: number; what: string }[] = [
  { key: "topic_coverage", label: "Topic coverage", weight: 30, what: "Must-cover topics from the brief" },
  { key: "entity_coverage", label: "Entity coverage", weight: 15, what: "Products and names the overview keeps citing" },
  { key: "format_match", label: "Format match", weight: 15, what: "Table, list length, sections and length" },
  { key: "answer_first", label: "Answer first", weight: 15, what: "How soon the direct answer comes" },
  { key: "evidence", label: "Evidence", weight: 15, what: "Numbers and proof like the cited pages" },
  { key: "checklist", label: "Checklist", weight: 10, what: "Indexable, author, date, schema" },
];

function verdict(score: number): string {
  if (score >= 85) return "Strong: this draft matches what Google cites for this search.";
  if (score >= 70) return "Close: a few fixes away from what the cited pages do.";
  if (score >= 50) return "Partial: it covers some of what the overview rewards, with clear gaps.";
  return "Far off: most of what the overview rewards is missing.";
}

/** Inline SVG ring, 0 to 100, in brand purple. */
export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${value} out of 100`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-sunken)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy="0.1em" textAnchor="middle" dominantBaseline="middle" className="fill-ink text-[32px] font-bold tracking-tight">
        {value}
      </text>
      <text x="50%" y="50%" dy="1.9em" textAnchor="middle" dominantBaseline="middle" className="fill-ink-muted text-[11px] font-medium">
        of 100
      </text>
    </svg>
  );
}

function num(n: number | null | undefined, digits = 0): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "–";
  return digits ? formatDecimal(n, digits) : formatCount(Math.round(n));
}

interface Row {
  label: string;
  draft: string;
  winners: string;
}

function measureRows(m: PageMeasures, w: Partial<PageMeasures>, faq: { withFaq: number; measured: number } | null): Row[] {
  return [
    { label: "Words", draft: num(m.word_count), winners: num(w.word_count) },
    { label: "Words before the answer", draft: num(m.words_before_answer), winners: num(w.words_before_answer) },
    { label: "Headings", draft: num(m.headings), winners: num(w.headings) },
    { label: "Tables", draft: num(m.tables), winners: num(w.tables, Number.isInteger(w.tables ?? 0) ? 0 : 1) },
    { label: "List items", draft: num(m.list_items), winners: num(w.list_items) },
    { label: "Numbers per 100 words", draft: num(m.numbers_per_100_words, 1), winners: num(w.numbers_per_100_words, 1) },
    {
      label: "FAQ section",
      draft: m.has_faq ? "Yes" : "No",
      winners: faq && faq.measured > 0 ? `${faq.withFaq} of ${plural(faq.measured, "page")}` : "–",
    },
  ];
}

export interface DraftResultProps {
  row: DraftScoreRow & { result: DraftScoreResult };
  /** How many of the cited pages have an FAQ section. */
  faq: { withFaq: number; measured: number } | null;
}

export function DraftResult({ row, faq }: DraftResultProps) {
  const r = row.result;
  const fixes = [...(r.fixes ?? [])].sort((a, b) => a.priority - b.priority);
  const present = r.entities.filter((e) => e.present);
  const missing = r.entities.filter((e) => !e.present);
  const rows = measureRows(r.measures, r.winners_median ?? {}, faq);

  return (
    <div className="space-y-8">
      <Card padding="lg">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <ScoreRing score={r.score} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-brand">Draft score</p>
            <p className="mt-1 text-lg font-semibold leading-7 tracking-tight text-ink">{verdict(r.score)}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-ink-muted">
              {row.source === "url" ? (
                <a href={row.input} target="_blank" rel="noreferrer noopener" className="inline-flex min-w-0 items-center gap-1 text-brand hover:text-brand-strong">
                  <span className="truncate">{hostOf(row.input)}</span>
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span>Pasted text, {plural(r.measures.word_count, "word")}</span>
              )}
              <span aria-hidden="true">·</span>
              <span>
                Scored <LocalTime value={row.created_at} format="datetime" />
              </span>
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-x-8 gap-y-4 border-t border-line pt-5 sm:grid-cols-2">
          {SUBSCORES.map((s) => {
            const v = r.subscores?.[s.key];
            return (
              <div key={s.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-ink">
                    {s.label} <span className="text-xs font-normal text-ink-muted">{s.weight}% of score</span>
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-ink">{formatPercent(v)}</p>
                </div>
                <ProgressBar className="mt-1.5" value={v} label={s.label} valueText={formatPercent(v)} />
                <p className="mt-1 text-xs text-ink-muted">{s.what}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <section className="space-y-4" aria-labelledby="draft-fixes">
        <SectionHeading id="draft-fixes" title="Fixes" description="Most important first." />
        {fixes.length ? (
          <NumberedList>
            {fixes.map((f, i) => (
              <NumberedRow key={i} n={i + 1} title={<span className="font-medium">{f.fix}</span>} />
            ))}
          </NumberedList>
        ) : (
          <Card>
            <p className="text-sm text-ink-muted">No fixes: the draft already does what the brief asks.</p>
          </Card>
        )}
      </section>

      {r.topics.length > 0 && (
        <section className="space-y-4" aria-labelledby="draft-topics">
          <SectionHeading
            id="draft-topics"
            title="Must-cover topics"
            description={`${r.topics.filter((t) => t.status === "covered").length} of ${r.topics.length} covered`}
          />
          <Card padding="none">
            <ul className="divide-y divide-line">
              {r.topics.map((t, i) => (
                <li key={i} className="flex flex-col gap-1.5 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-ink">{t.topic}</p>
                    {t.note && <p className="mt-0.5 text-sm text-ink-muted">{t.note}</p>}
                  </div>
                  <Chip tone={STATUS[t.status]?.tone ?? "grey"} dot className="self-start">
                    {STATUS[t.status]?.label ?? t.status}
                  </Chip>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {r.entities.length > 0 && (
        <section className="space-y-4" aria-labelledby="draft-entities">
          <SectionHeading id="draft-entities" title="Entities" description={`${present.length} of ${r.entities.length} named in the draft`} />
          <Card>
            {missing.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Missing</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missing.map((e) => (
                    <Chip key={e.name} tone="bad" icon={<XIcon className="h-3 w-3" />}>
                      {e.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {present.length > 0 && (
              <div className={missing.length ? "mt-4" : undefined}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Named</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {present.map((e) => (
                    <Chip key={e.name} tone="good" icon={<CheckIcon className="h-3 w-3" />}>
                      {e.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </section>
      )}

      {r.new_to_cite.length > 0 && (
        <section className="space-y-4" aria-labelledby="draft-new">
          <SectionHeading id="draft-new" title="New to cite" description="Ideas from the brief that Google can't find elsewhere yet." />
          <Card padding="none">
            <ul className="divide-y divide-line">
              {r.new_to_cite.map((n, i) => (
                <li key={i} className="flex flex-col gap-1.5 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-ink">{n.idea}</p>
                    {n.note && <p className="mt-0.5 text-sm text-ink-muted">{n.note}</p>}
                  </div>
                  <Chip tone={STATUS[n.status]?.tone ?? "grey"} dot className="self-start">
                    {STATUS[n.status]?.label ?? n.status}
                  </Chip>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="draft-measures">
        <SectionHeading id="draft-measures" title="Your draft and the cited pages" description="Measured the same way for both. The cited pages' column is the median." />
        <Table>
          <THead>
            <tr>
              <TH>Measure</TH>
              <TH align="right">Your draft</TH>
              <TH align="right">Cited pages</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((m) => (
              <TR key={m.label}>
                <TD>{m.label}</TD>
                <TD numeric className="font-semibold">
                  {m.draft}
                </TD>
                <TD numeric muted>
                  {m.winners}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}

/** A score that failed, with its error. */
export function DraftFailed({ row }: { row: DraftScoreRow }) {
  return (
    <Card padding="lg">
      <CardHeader
        eyebrow="Not scored"
        title={row.source === "url" ? hostOf(row.input) : "Pasted text"}
        description={
          <>
            Started <LocalTime value={row.created_at} format="datetime" />
          </>
        }
      />
      <p className="mt-3 rounded-lg bg-bad-soft/60 px-3 py-2 text-sm text-ink">{row.error?.trim() || "Scoring failed without an error message."}</p>
      <p className="mt-3 text-sm text-ink-muted">Fix what the error says and score the draft again.</p>
    </Card>
  );
}
