// OverviewText: an AI Overview rebuilt from its stored sentences, grouped by block and kind (headings,
// paragraphs, list items, table rows), with numbered citation chips after each cited sentence.
// SourceList: the citations of one capture with host, title and Google's passage.
import { Fragment, type ReactNode } from "react";
import { ExternalLinkIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { hostOf, truncate } from "@/lib/format";
import type { CitationRow, ParsedSentence, SentenceKind } from "@/lib/types";
import { Hint } from "./hint";

export type OverviewCitation = Pick<CitationRow, "idx" | "url" | "url_key" | "host" | "title" | "passage">;

interface Block {
  block: number;
  kind: SentenceKind;
  sentences: ParsedSentence[];
}

type Run =
  | { kind: "heading" | "paragraph"; blocks: Block[] }
  | { kind: "list"; blocks: Block[] }
  | { kind: "table"; blocks: Block[] }
  | { kind: "expanded"; blocks: Block[] };

function toBlocks(sentences: ParsedSentence[]): Block[] {
  const sorted = [...sentences].sort((a, b) => a.i - b.i);
  const blocks: Block[] = [];
  for (const s of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.block === s.block) last.sentences.push(s);
    else blocks.push({ block: s.block, kind: s.kind, sentences: [s] });
  }
  return blocks;
}

function toRuns(blocks: Block[]): Run[] {
  const runs: Run[] = [];
  for (const b of blocks) {
    const kind: Run["kind"] =
      b.kind === "list_item" ? "list" : b.kind === "table_row" ? "table" : b.kind === "expanded" ? "expanded" : b.kind === "heading" ? "heading" : "paragraph";
    const last = runs[runs.length - 1];
    if (last && last.kind === kind && (kind === "list" || kind === "table" || kind === "expanded")) last.blocks.push(b);
    else runs.push({ kind, blocks: [b] } as Run);
  }
  return runs;
}

/** The overview as Google showed it, with citation chips linking to the cited pages. */
export function OverviewText({ sentences, citations, className }: { sentences: ParsedSentence[]; citations: OverviewCitation[]; className?: string }) {
  const byIdx = new Map(citations.map((c) => [c.idx, c]));
  const runs = toRuns(toBlocks(sentences));
  const line = (b: Block) => <BlockText block={b} byIdx={byIdx} />;

  return (
    <div className={cn("space-y-3 text-[15px] leading-7 text-ink", className)}>
      {runs.map((run, r) => {
        const key = `${run.kind}-${run.blocks[0].block}-${r}`;
        if (run.kind === "heading") {
          return (
            <h4 key={key} className="pt-1 text-[15px] font-semibold leading-6 text-ink">
              {line(run.blocks[0])}
            </h4>
          );
        }
        if (run.kind === "paragraph") return <p key={key}>{line(run.blocks[0])}</p>;
        if (run.kind === "list") {
          return (
            <ul key={key} className="list-disc space-y-1.5 pl-5 marker:text-ink-soft">
              {run.blocks.map((b) => (
                <li key={b.block}>{line(b)}</li>
              ))}
            </ul>
          );
        }
        if (run.kind === "expanded") {
          return (
            <div key={key} className="space-y-2 border-l-2 border-brand-soft pl-3">
              {run.blocks.map((b) => (
                <p key={b.block}>{line(b)}</p>
              ))}
            </div>
          );
        }
        return <OverviewTable key={key} blocks={run.blocks} byIdx={byIdx} />;
      })}
    </div>
  );
}

function BlockText({ block, byIdx }: { block: Block; byIdx: Map<number, OverviewCitation> }) {
  return (
    <>
      {block.sentences.map((s, k) => (
        <Fragment key={s.i}>
          {k > 0 && s.text ? " " : null}
          {s.text}
          <CitationChips idx={s.citations} byIdx={byIdx} />
        </Fragment>
      ))}
    </>
  );
}

function OverviewTable({ blocks, byIdx }: { blocks: Block[]; byIdx: Map<number, OverviewCitation> }) {
  const rows = blocks.map((b) => {
    const text = b.sentences.map((s) => s.text).join(" ");
    const cites = b.sentences.flatMap((s) => s.citations);
    return { key: b.block, cells: text.split(/\s*\|\s*/), cites };
  });
  const head = rows.length > 1 ? rows[0] : null;
  const body = rows.length > 1 ? rows.slice(1) : rows;
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const cells = (r: (typeof rows)[number], header: boolean) =>
    Array.from({ length: cols }, (_, c) => {
      const content: ReactNode = (
        <>
          {r.cells[c] ?? ""}
          {c === r.cells.length - 1 && <CitationChips idx={r.cites} byIdx={byIdx} />}
        </>
      );
      return header ? (
        <th key={c} scope="col" className="border-b border-line bg-surface-alt px-3 py-2 text-left text-[13px] font-semibold">
          {content}
        </th>
      ) : (
        <td key={c} className="px-3 py-2 align-top text-[13px] leading-5">
          {content}
        </td>
      );
    });
  return (
    <div className="relative overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse">
        {head && (
          <thead>
            <tr>{cells(head, true)}</tr>
          </thead>
        )}
        <tbody className="divide-y divide-line">
          {body.map((r) => (
            <tr key={r.key}>{cells(r, false)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CHIP =
  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums ring-1 ring-inset align-[2px]";

function CitationChips({ idx, byIdx }: { idx: number[]; byIdx: Map<number, OverviewCitation> }) {
  if (!idx.length) return null;
  const unique = [...new Set(idx)].sort((a, b) => a - b);
  return (
    <span className="ml-1 inline-flex flex-wrap gap-0.5 align-baseline">
      {unique.map((i) => {
        const c = byIdx.get(i);
        if (!c) {
          return (
            <span key={i} className={cn(CHIP, "bg-surface-sunken text-ink-muted ring-line")}>
              {i + 1}
            </span>
          );
        }
        const host = c.host || hostOf(c.url);
        return (
          <Hint
            key={i}
            content={
              <>
                <span className="block font-semibold">{host}</span>
                {c.passage && <span className="mt-0.5 block text-white/80">{truncate(c.passage, 180)}</span>}
              </>
            }
          >
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Source ${i + 1}: ${host}`}
              className={cn(CHIP, "bg-brand-faint text-brand-strong ring-brand-soft transition-colors hover:bg-brand hover:text-white hover:ring-brand")}
            >
              {i + 1}
            </a>
          </Hint>
        );
      })}
    </span>
  );
}

/** Numbered list of the sources cited in one capture. */
export function SourceList({ citations, className }: { citations: OverviewCitation[]; className?: string }) {
  return (
    <ol className={cn("divide-y divide-line", className)}>
      {citations.map((c) => {
        const host = c.host || hostOf(c.url);
        return (
          <li key={c.idx} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-faint text-[11px] font-semibold tabular-nums text-brand-strong">
              {c.idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex max-w-full items-center gap-1 text-sm font-semibold text-ink hover:text-brand"
              >
                <span className="truncate">{host}</span>
                <ExternalLinkIcon className="h-3 w-3 text-ink-soft group-hover:text-brand" />
              </a>
              {c.title && <p className="break-words text-sm text-ink-muted">{c.title}</p>}
              {c.passage && <p className="mt-1 break-words text-xs leading-5 text-ink-soft">&ldquo;{truncate(c.passage, 240)}&rdquo;</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
