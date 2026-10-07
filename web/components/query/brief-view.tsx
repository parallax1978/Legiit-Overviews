// A ready brief: answer first, must-cover topics with their claims, entities, format, outline, evidence
// to match, new-to-cite ideas, questions, checklist and what to avoid. Every claim and entity shows its
// share and n from the report's metrics and opens the captures behind it.
import type { ReactNode } from "react";
import { EntityChip, PageChip, RefChips, type RefContext } from "@/components/query/brief-refs";
import { Card } from "@/components/ui/card";
import { Chip, Tag } from "@/components/ui/chip";
import { CheckList } from "@/components/ui/feedback";
import { NumberedList, NumberedRow } from "@/components/ui/number-badge";
import { SectionHeading, SectionLabel } from "@/components/ui/typography";
import { formatCount, formatPercent, plural } from "@/lib/format";
import { parseRef, type HowToProduce, type StoredBrief } from "@/lib/query/report";

export const HOW_TO_LABELS: Record<HowToProduce, string> = {
  original_data: "Original data",
  first_hand_test: "First-hand test",
  new_statistics: "New statistics",
  better_comparison: "Better comparison",
  useful_table: "Useful table",
  unanswered_question: "Unanswered question",
  better_examples: "Better examples",
};

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="scroll-mt-20 space-y-4" aria-labelledby={id}>
      <SectionHeading id={id} title={title} description={description} />
      {children}
    </section>
  );
}

export function BriefView({ brief, ctx }: { brief: StoredBrief; ctx: RefContext }) {
  const b = brief.brief;
  const baseLevel = b.outline.length ? Math.min(...b.outline.map((s) => s.level)) : 2;
  const totalWords = b.outline.reduce((sum, s) => sum + (Number.isFinite(s.target_words) ? s.target_words : 0), 0);

  return (
    <div className="space-y-10">
      <Section id="brief-answer" title="Answer first" description="Open the page with this, before any intro.">
        <Card padding="lg" tinted>
          <blockquote className="border-l-4 border-brand pl-4 text-base leading-7 text-ink">{b.answer_first.text || "No opening was written."}</blockquote>
          <p className="mt-4 text-sm text-ink-muted">
            Word budget: start the direct answer within the first{" "}
            <strong className="font-semibold text-ink">{plural(b.answer_first.max_words, "word")}</strong> of the page, the median of the cited pages.
          </p>
        </Card>
      </Section>

      {b.must_cover.length > 0 && (
        <Section
          id="brief-must-cover"
          title="Must cover"
          description={`Topics the overview keeps stating. Each claim shows how many of the ${formatCount(ctx.present)} overviews contained it; click one for the captures.`}
        >
          <NumberedList>
            {b.must_cover.map((m, i) => (
              <NumberedRow key={i} n={i + 1} title={m.topic} meta={<span className="text-sm leading-6">{m.why}</span>}>
                <RefChips refs={m.claim_refs} ctx={ctx} className="mt-2.5" />
              </NumberedRow>
            ))}
          </NumberedList>
        </Section>
      )}

      {b.entities.length > 0 && (
        <Section id="brief-entities" title="Entities to name" description="Products and names the overview mentions, with how often.">
          <Card padding="none">
            <ul className="divide-y divide-line">
              {b.entities.map((e, i) => {
                const ref = parseRef(e.entity_ref);
                const metric = ref?.kind === "entity" ? ctx.entities.get(ref.id) : undefined;
                return (
                  <li key={i} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink">{e.name}</span>
                        <Chip tone={e.role === "recommended" ? "brand" : "grey"} size="sm">
                          {e.role === "recommended" ? "Recommended" : "Mentioned"}
                        </Chip>
                      </div>
                      {e.note && <p className="mt-1 text-sm leading-6 text-ink-muted">{e.note}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                      {ref?.kind === "entity" ? (
                        <EntityChip id={ref.id} ctx={ctx} name={e.name} showName={false} />
                      ) : (
                        <span className="text-xs text-ink-soft">No share recorded</span>
                      )}
                      {metric && metric.recommended_renders > 0 && (
                        <span className="text-xs text-ink-muted">Recommended in {formatPercent(metric.recommended_share)}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      )}

      <Section id="brief-format" title="Format" description="The shape the cited pages and the overview share.">
        <Card padding="lg">
          {b.format.structure && <p className="text-[15px] leading-7 text-ink">{b.format.structure}</p>}
          <dl className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-[2fr_1fr]">
            <div className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Table columns</dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {b.format.table_columns.length ? (
                  b.format.table_columns.map((c, i) => <Tag key={i}>{c}</Tag>)
                ) : (
                  <span className="text-sm text-ink-muted">No table needed</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Main list</dt>
              <dd className="mt-1.5 text-sm text-ink">{b.format.list_items !== null ? plural(b.format.list_items, "item") : "–"}</dd>
            </div>
          </dl>
        </Card>
      </Section>

      {b.outline.length > 0 && (
        <Section
          id="brief-outline"
          title="Outline"
          description={`${plural(b.outline.length, "section")}, about ${formatCount(totalWords)} words in total.`}
        >
          <NumberedList>
            {b.outline.map((s, i) => {
              const depth = Math.max(0, Math.min(3, s.level - baseLevel));
              return (
                <NumberedRow
                  key={i}
                  n={i + 1}
                  className={depth === 1 ? "pl-8 sm:pl-10" : depth === 2 ? "pl-12 sm:pl-16" : depth === 3 ? "pl-16 sm:pl-22" : undefined}
                  overline={
                    <span className="font-medium tracking-wide text-ink-soft">
                      H{s.level}
                      <span className="font-normal sm:hidden"> · about {formatCount(s.target_words)} words</span>
                    </span>
                  }
                  title={s.heading}
                  meta={<span className="text-sm leading-6">{s.purpose}</span>}
                  aside={
                    <span className="hidden sm:block">
                      <Chip tone="grey" size="sm" className="tabular-nums">
                        ~{formatCount(s.target_words)} words
                      </Chip>
                    </span>
                  }
                >
                  {s.covers.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Covers</span>
                      {s.covers.map((c, j) => (
                        <Tag key={j}>{c}</Tag>
                      ))}
                    </div>
                  )}
                </NumberedRow>
              );
            })}
          </NumberedList>
        </Section>
      )}

      {b.evidence_to_match.length > 0 && (
        <Section id="brief-evidence" title="Evidence to match" description="What the cited pages back their claims with.">
          <Card padding="none">
            <ul className="divide-y divide-line">
              {b.evidence_to_match.map((e, i) => {
                const pages = e.page_refs.map(parseRef).filter((r) => r?.kind === "page");
                return (
                  <li key={i} className="px-4 py-3.5 sm:px-5">
                    <p className="text-sm leading-6 text-ink">{e.what}</p>
                    {pages.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Seen on</span>
                        {pages.map((p) => p && <PageChip key={p.id} urlKey={p.id} ctx={ctx} />)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      )}

      {b.new_to_cite.length > 0 && (
        <Section id="brief-new" title="New to cite" description="What Google can't find on any cited page yet: the reason to cite yours.">
          <NumberedList>
            {b.new_to_cite.map((n, i) => (
              <NumberedRow
                key={i}
                n={i + 1}
                title={n.idea}
                aside={
                  <span className="hidden sm:block">
                    <Chip tone="brand" size="sm">
                      {HOW_TO_LABELS[n.how_to_produce] ?? n.how_to_produce}
                    </Chip>
                  </span>
                }
              >
                <div className="mt-1.5 sm:hidden">
                  <Chip tone="brand" size="sm">
                    {HOW_TO_LABELS[n.how_to_produce] ?? n.how_to_produce}
                  </Chip>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">
                  <span className="font-medium text-ink">Why Google lacks it: </span>
                  {n.why_google_lacks_it}
                </p>
                {n.evidence_refs.length > 0 && (
                  <div className="mt-2.5">
                    <SectionLabel>Evidence</SectionLabel>
                    <RefChips refs={n.evidence_refs} ctx={ctx} className="mt-1.5" />
                  </div>
                )}
              </NumberedRow>
            ))}
          </NumberedList>
        </Section>
      )}

      {b.questions.length > 0 && (
        <Section id="brief-questions" title="Questions to answer" description="Sub-questions the overview keeps answering.">
          <NumberedList>
            {b.questions.map((q, i) => (
              <NumberedRow key={i} n={i + 1} title={<span className="font-medium">{q}</span>} />
            ))}
          </NumberedList>
        </Section>
      )}

      {b.checklist.length > 0 && (
        <Section id="brief-checklist" title="Publishing checklist">
          <Card padding="lg">
            <CheckList items={b.checklist} />
          </Card>
        </Section>
      )}

      {b.avoid.length > 0 && (
        <Section id="brief-avoid" title="Avoid" description="What the overview never includes.">
          <Card padding="lg">
            <CheckList items={b.avoid} tone="cross" />
          </Card>
        </Section>
      )}
    </div>
  );
}
