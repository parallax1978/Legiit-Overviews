// Static sample report visuals for the marketing page (illustrative data, not from the database).
import { BrowserCard } from "@/components/ui/card";
import { BucketChip, Chip, Tag } from "@/components/ui/chip";
import { CheckCircleIcon, FileTextIcon, QuoteIcon, SparklesIcon } from "@/components/ui/icons";
import { NumberBadge } from "@/components/ui/number-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionLabel } from "@/components/ui/typography";
import { formatPercent } from "@/lib/format";
import type { Bucket } from "@/lib/types";

const KEYWORD = "best crm for small business";

const CLAIMS: { type: string; text: string; share: number; bucket: Bucket; cited: string }[] = [
  { type: "Recommendation", text: "HubSpot CRM has a free plan that suits teams under five people", share: 0.82, bucket: "core", cited: "cited 9 times in 10" },
  { type: "Comparison", text: "Zoho CRM costs less than Salesforce as a team grows", share: 0.61, bucket: "recurring", cited: "cited 7 times in 10" },
  { type: "Fact", text: "Pipedrive organises deals in a visual sales pipeline", share: 0.34, bucket: "rotating", cited: "cited 5 times in 10" },
];

const SOURCES: { domain: string; share: number; bucket: Bucket }[] = [
  { domain: "hubspot.com", share: 0.91, bucket: "core" },
  { domain: "forbes.com", share: 0.57, bucket: "recurring" },
  { domain: "reddit.com", share: 0.23, bucket: "rotating" },
];

function Share({ share, n = 56 }: { share: number; n?: number }) {
  return (
    <span className="whitespace-nowrap text-xs font-semibold tabular-nums">
      {formatPercent(share)}
      <span className="font-normal text-ink-muted"> · n={n}</span>
    </span>
  );
}

/** The white product card on the right of the hero: recurring claims and sources with buckets. */
export function HeroReportCard() {
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-lg lg:max-w-none" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2rem] bg-brand/40 blur-3xl" />
      <div className="relative rounded-2xl border border-white/10 bg-white p-5 text-ink shadow-pop sm:p-6">
        <div className="pr-0 sm:pr-36">
          <p className="eyebrow text-brand">The patterns</p>
          <p className="mt-1 text-base font-bold tracking-tight">What keeps coming back</p>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{KEYWORD} · US · 56 renders</p>
        </div>
        <ol className="mt-4 divide-y divide-line rounded-xl border border-line">
          {CLAIMS.map((c, i) => (
            <li key={c.text} className="flex items-center gap-3 px-3 py-3">
              <NumberBadge n={i + 1} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-good">
                  <QuoteIcon className="h-3 w-3" /> {c.type} <span className="font-normal text-ink-soft">· {c.cited}</span>
                </p>
                <p className="line-clamp-1 text-sm font-semibold">{c.text}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <ProgressBar value={c.share} />
                  <Share share={c.share} />
                </div>
              </div>
              <div className="hidden shrink-0 sm:flex">
                <BucketChip bucket={c.bucket} />
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <SectionLabel>Most cited sources</SectionLabel>
          <ul className="mt-2 space-y-2">
            {SOURCES.map((s) => (
              <li key={s.domain} className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-[11px] font-bold uppercase text-ink-muted">
                  {s.domain[0]}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{s.domain}</span>
                <Share share={s.share} />
                <BucketChip bucket={s.bucket} className="w-[92px] justify-center" />
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex items-center justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-glow">
            <FileTextIcon className="h-3.5 w-3.5" /> Get the Brief
          </span>
        </div>
      </div>
      <div className="absolute -top-5 right-4 hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-pop sm:flex lg:-right-6">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-good-soft text-good">
          <CheckCircleIcon />
        </span>
        <span>
          <span className="block font-semibold text-ink">Your page was cited</span>
          <span className="block text-ink-muted">Quoted from &ldquo;Pricing for small teams&rdquo;</span>
        </span>
      </div>
    </div>
  );
}

const ENTITIES: { name: string; role: string; share: number; bucket: Bucket }[] = [
  { name: "HubSpot CRM", role: "Recommended", share: 0.88, bucket: "core" },
  { name: "Zoho CRM", role: "Recommended", share: 0.63, bucket: "recurring" },
  { name: "Salesforce", role: "Mentioned", share: 0.41, bucket: "recurring" },
];

/** "What you get" browser card: patterns with evidence. */
export function PatternsSample() {
  return (
    <BrowserCard label={`Legiit Overviews · ${KEYWORD} · Patterns`}>
      <p className="eyebrow text-brand">Patterns with evidence</p>
      <p className="mt-2 text-base font-semibold leading-snug">
        Across 56 renders this week, 4 claims and 3 brands appear in most overviews. 2 of the recurring claims carry no citation.
      </p>
      <p className="mt-2 text-xs text-ink-muted">56 renders · 49 with an overview · high confidence</p>
      <ol className="mt-4 divide-y divide-line rounded-xl border border-line">
        {ENTITIES.map((e, i) => (
          <li key={e.name} className="flex items-center gap-3 px-3 py-3">
            <NumberBadge n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className={e.role === "Recommended" ? "text-[11px] font-semibold text-good" : "text-[11px] font-semibold text-ink-muted"}>
                {e.role}
              </p>
              <p className="line-clamp-1 text-sm font-semibold">{e.name}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <ProgressBar value={e.share} />
                <Share share={e.share} n={49} />
              </div>
            </div>
            <div className="hidden shrink-0 sm:flex">
              <BucketChip bucket={e.bucket} />
            </div>
          </li>
        ))}
      </ol>
      <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm ring-1 ring-inset ring-line">
        Open the Evidence <SparklesIcon className="h-3.5 w-3.5" />
      </span>
    </BrowserCard>
  );
}

/** "What you get" browser card: one cited page taken apart. */
export function PageSample() {
  return (
    <BrowserCard label={`Legiit Overviews · ${KEYWORD} · Pages`}>
      <p className="eyebrow text-brand">Cited-page teardown</p>
      <p className="mt-2 break-words text-base font-semibold leading-snug">hubspot.com/crm/small-business</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <BucketChip bucket="core" />
        <Chip tone="good" dot>
          Answers in the first 40 words
        </Chip>
        <Chip tone="brand">Comparison table</Chip>
      </div>
      <SectionLabel className="mt-5">Where Google&rsquo;s passage sits</SectionLabel>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Under the heading &ldquo;Is HubSpot CRM free?&rdquo;, 18% of the way down the page.
      </p>
      <SectionLabel className="mt-5">What every cited page covers</SectionLabel>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Tag value="10/10">free plan limits</Tag>
        <Tag value="9/10">price per user</Tag>
        <Tag value="8/10">setup time</Tag>
        <Tag value="7/10">integrations</Tag>
      </div>
      <p className="mt-5 text-xs text-ink-soft">
        Measured in code: words before the answer, tables, lists, numbers per 100 words, author and dates.
      </p>
    </BrowserCard>
  );
}

const EVIDENCE = [
  {
    when: "Oct 6, 2026, 21:00 UTC · Desktop",
    sentence: "HubSpot CRM offers a free plan with contact management and deal tracking, which is enough for most teams under five people.",
    citations: ["hubspot.com", "forbes.com"],
  },
  {
    when: "Oct 6, 2026, 18:00 UTC · Desktop",
    sentence: "For very small teams, HubSpot's free CRM covers the basics without a paid plan.",
    citations: ["hubspot.com"],
  },
  {
    when: "Oct 6, 2026, 15:00 UTC · Desktop",
    sentence: "HubSpot is often recommended first because its free tier has no user limit for core CRM features.",
    citations: ["zapier.com", "hubspot.com"],
  },
];

/** Evidence explainer: one count opened to the captures and sentences behind it. */
export function EvidenceSample() {
  return (
    <BrowserCard label="Patterns · Evidence" flush>
      <div className="border-b border-line p-4 sm:p-5">
        <p className="eyebrow text-brand">Recurring claim</p>
        <p className="mt-1 text-base font-semibold leading-snug">HubSpot CRM has a free plan that suits teams under five people</p>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={0.82} className="max-w-48" />
          <Share share={0.82} />
          <BucketChip bucket="core" />
        </div>
        <p className="mt-2 text-xs text-ink-muted">In 40 of 49 renders with an overview, Sep 30 to Oct 6</p>
      </div>
      <ol className="divide-y divide-line">
        {EVIDENCE.map((e) => (
          <li key={e.when} className="p-4 sm:px-5">
            <p className="text-xs text-ink-muted">{e.when}</p>
            <blockquote className="mt-1.5 border-l-2 border-brand-soft pl-3 text-sm leading-6 text-ink">{e.sentence}</blockquote>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.citations.map((c, i) => (
                <Tag key={c} value={`[${i + 1}]`}>
                  {c}
                </Tag>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </BrowserCard>
  );
}
