"use client";
// Evidence drawers: a number opens the captures behind it, newest first, from the metric_evidence RPC
// (sentences with citation markers and a note per capture). EvidenceTrigger wraps an inline number in a
// link-style button; EvidenceStatCard makes a whole stat card the trigger.
import { useRef, useState, type ReactNode } from "react";
import { Alert, Button, Chip, Drawer, LocalTime, RefreshIcon, SegmentedControl, Skeleton, StatCard, type StatCardProps } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCount, formatShare, humanize, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { EvidenceItem, EvidenceKind, MetricEvidence, SnapshotStatus } from "@/lib/types";
import { CaptureStatusChip } from "./capture-status";

export type { EvidenceKind };

/** What a drawer lists: one metric_evidence call, and how to title it. */
export interface EvidenceSource {
  seriesId: string;
  kind: EvidenceKind;
  /**
   * Claim group id, entity id, url_key, reg_domain or format label, depending on kind; 'all',
   * 'present' or 'absent' for presence; 'top10' or 'top20' for overlap.
   */
  evidenceKey: string;
  /** Window start and end (ISO), the same window the number was computed over. */
  from: string;
  to: string;
  /** Drawer title, usually the claim, entity, URL or format label. */
  title: string;
  /** Drawer subtitle, usually the number itself ("82% · n=56"). */
  subtitle?: string;
  /**
   * The share's denominator. When set, the subtitle is recomputed from the evidence total once it loads
   * ("Share of overviews: 56% · n=48"), so the drawer never shows a number its own list contradicts.
   */
  n?: number;
  /** Other keys the drawer can switch between, shown as a filter (presence: all, shown, not shown). */
  keyOptions?: { value: string; label: string }[];
}

export interface EvidenceTriggerProps extends EvidenceSource {
  className?: string;
  children: ReactNode;
}

const PAGE = 50;
const MAX_LIMIT = 500;

const KIND_EYEBROWS: Record<EvidenceKind, string> = {
  claim: "Claim evidence",
  unsupported: "Uncited claim evidence",
  entity: "Entity evidence",
  source: "Source evidence",
  domain: "Domain evidence",
  format: "Format evidence",
  presence: "Captures",
  overlap: "Organic overlap evidence",
};

const NOTE_LABELS: Record<EvidenceKind, string> = {
  claim: "Claim as extracted",
  unsupported: "Claim as extracted",
  entity: "How it was mentioned",
  source: "Google's passage",
  domain: "URLs cited",
  format: "",
  presence: "",
  overlap: "Cited pages and their organic rank",
};

/** "top10" -> 10. */
function cutOf(key: string): number {
  return key === "top20" ? 20 : 10;
}

/** The drawer's subtitle: recomputed from what loaded where the list itself defines the number. */
function describe(src: EvidenceSource, data: MetricEvidence | null): string | undefined {
  if (!data) return src.subtitle;
  if (src.kind === "overlap") {
    if (typeof data.citations !== "number" || typeof data.occurrences !== "number" || data.occurrences === 0) return src.subtitle;
    return `${formatShare(data.citations / data.occurrences, data.occurrences)} cited URLs; ${formatCount(data.citations)} also ranked in the organic top ${cutOf(src.evidenceKey)}`;
  }
  if (src.kind !== "presence" && typeof src.n === "number" && src.n > 0) return `Share of overviews: ${formatShare(data.total / src.n, src.n)}`;
  return src.subtitle;
}

/** The line above the list: how many captures and what they have in common. */
function countLine(kind: EvidenceKind, key: string, total: number): ReactNode {
  const n = <span className="font-semibold text-ink">{plural(total, "capture")}</span>;
  if (kind === "presence") {
    if (key === "present") return <>{n} showed an AI Overview, newest first.</>;
    if (key === "absent") return <>{n} showed no AI Overview, newest first.</>;
    return <>{n} in this window, newest first. Failed captures aren&rsquo;t counted.</>;
  }
  if (kind === "overlap") {
    return (
      <>
        {n} cited a page that also ranked in that capture&rsquo;s organic top {cutOf(key)}, newest first. The sentences citing those pages are
        shown.
      </>
    );
  }
  return <>{n} behind this number, newest first.</>;
}

function emptyText(kind: EvidenceKind, key: string): string {
  if (kind === "presence") return "No capture in this window matches.";
  if (kind === "overlap") return `No overview in this window cited a page that ranked in its organic top ${cutOf(key)}.`;
  return "No capture in this window shows this. It may have appeared outside the selected window.";
}

/** Drawer state and markup for one evidence source; `openDrawer` loads the first page on first open. */
function useEvidenceDrawer(src: EvidenceSource): { openDrawer: () => void; drawer: ReactNode } {
  const { seriesId, kind, from, to } = src;
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(src.evidenceKey);
  const [data, setData] = useState<MetricEvidence | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const request = useRef(0);

  const requestKeyFor = (key: string) => `${seriesId}|${kind}|${key}|${from}|${to}`;

  async function load(key: string, nextLimit: number) {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    const { data: result, error: rpcError } = await createClient().rpc("metric_evidence", {
      p_series_id: seriesId,
      p_kind: kind,
      p_key: key,
      p_from: from,
      p_to: to,
      p_limit: nextLimit,
    });
    if (id !== request.current) return;
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setData(normalize(result));
    setLimit(nextLimit);
    setLoadedKey(requestKeyFor(key));
  }

  function select(key: string) {
    setActiveKey(key);
    if (loadedKey !== requestKeyFor(key)) {
      setData(null);
      void load(key, PAGE);
    }
  }

  function openDrawer() {
    setOpen(true);
    // Every open starts from the number that was clicked.
    const key = src.evidenceKey;
    setActiveKey(key);
    if (loadedKey !== requestKeyFor(key) || error) {
      setData(null);
      void load(key, PAGE);
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const canLoadMore = !!data && total > items.length && limit < MAX_LIMIT;
  const current = { ...src, evidenceKey: activeKey };

  const drawer = (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      eyebrow={KIND_EYEBROWS[kind]}
      title={<span className="[overflow-wrap:anywhere]">{src.title}</span>}
      description={describe(current, data)}
      footer={
        canLoadMore ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              Showing {formatCount(items.length)} of {formatCount(total)}
            </p>
            <Button variant="secondary" size="sm" loading={loading} onClick={() => void load(activeKey, Math.min(limit + PAGE, MAX_LIMIT))}>
              Load More
            </Button>
          </div>
        ) : undefined
      }
    >
      {src.keyOptions && src.keyOptions.length > 1 && (
        <SegmentedControl
          className="mb-4"
          size="sm"
          aria-label="Show captures"
          options={src.keyOptions}
          value={activeKey}
          onChange={select}
          disabled={loading && !data}
        />
      )}
      {error ? (
        <Alert
          tone="bad"
          title="The captures didn't load"
          action={
            <Button variant="secondary" size="sm" iconLeft={<RefreshIcon />} loading={loading} onClick={() => void load(activeKey, data ? limit : PAGE)}>
              Try Again
            </Button>
          }
        >
          <span className="break-words font-mono text-xs">{error}</span>
        </Alert>
      ) : !data ? (
        <EvidenceSkeleton />
      ) : total === 0 ? (
        <p className="rounded-lg bg-surface-alt px-4 py-6 text-center text-sm text-ink-muted">{emptyText(kind, activeKey)}</p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">{countLine(kind, activeKey, total)}</p>
          {kind === "presence" ? (
            <ol className="mt-4 divide-y divide-line rounded-lg border border-line">
              {items.map((item) => (
                <PresenceRow key={item.snapshot_id} item={item} />
              ))}
            </ol>
          ) : (
            <ol className="mt-4 space-y-3">
              {items.map((item) => (
                <EvidenceRow key={item.snapshot_id} item={item} kind={kind} />
              ))}
            </ol>
          )}
          {total > items.length && !canLoadMore && (
            <p className="mt-4 text-xs text-ink-muted">
              Showing the newest {formatCount(items.length)} of {formatCount(total)}.
            </p>
          )}
        </>
      )}
    </Drawer>
  );

  return { openDrawer, drawer };
}

/** The number as a link-style button; click opens the captures behind it. */
export function EvidenceTrigger({ className, children, ...src }: EvidenceTriggerProps) {
  const { openDrawer, drawer } = useEvidenceDrawer(src);
  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className={cn(
          "inline rounded-sm text-left font-medium text-brand-strong underline decoration-brand/30 decoration-dotted underline-offset-4 transition-colors hover:text-brand hover:decoration-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          className,
        )}
        aria-haspopup="dialog"
        title="Show the captures behind this number"
      >
        {children}
      </button>
      {drawer}
    </>
  );
}

export type EvidenceStatCardProps = Omit<StatCardProps, "href" | "onClick"> & EvidenceSource;

/** A stat card that opens the captures behind its number. */
export function EvidenceStatCard({ label, value, caption, icon, tone, className, ...src }: EvidenceStatCardProps) {
  const { openDrawer, drawer } = useEvidenceDrawer(src);
  return (
    <>
      <StatCard
        label={label}
        icon={icon}
        tone={tone}
        className={className}
        caption={caption}
        onClick={openDrawer}
        aria-haspopup="dialog"
        title="Show the captures behind this number"
        value={<span className="underline decoration-current/30 decoration-dotted decoration-2 underline-offset-[6px]">{value}</span>}
      />
      {drawer}
    </>
  );
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function PresenceRow({ item }: { item: EvidenceItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
      <LocalTime value={item.captured_at} format="datetime" className="text-ink" />
      {item.status && <CaptureStatusChip status={item.status} size="sm" />}
    </li>
  );
}

/** "zapier.com/blog/x (#1), forbes.com/y (#2)" -> [{ page, rank }]. */
function rankedPages(note: string): { page: string; rank: string | null }[] {
  return [...note.matchAll(/(.+?) \(#(\d+)\)(?:, |$)/g)].map((m) => ({ page: m[1], rank: m[2] }));
}

function EvidenceRow({ item, kind }: { item: EvidenceItem; kind: EvidenceKind }) {
  const sentenceText = normalizeText(item.sentences.map((s) => s.text).join(" "));
  // A claim note that repeats its sentence word for word adds nothing.
  const notes = noteParts(item.note, kind).filter((n) => !((kind === "claim" || kind === "unsupported") && normalizeText(n) === sentenceText));
  return (
    <li className="rounded-lg border border-line bg-white p-3.5">
      <p className="text-xs font-medium text-ink-muted">
        <LocalTime value={item.captured_at} format="datetime" />
      </p>
      {item.sentences.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {item.sentences.map((s) => (
            <p key={s.i} className="text-sm leading-6 text-ink">
              {s.text}
              {s.citations.map((c) => (
                <Chip key={c} tone="grey" size="sm" className="ml-1 align-[1px] tabular-nums" aria-label={`Citation ${c + 1}`}>
                  {c + 1}
                </Chip>
              ))}
            </p>
          ))}
        </div>
      )}
      {kind === "format" && item.sentences.length === 0 && (
        <p className="mt-1.5 text-sm text-ink-muted">The overview used this format in this capture.</p>
      )}
      {notes.length > 0 && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          {NOTE_LABELS[kind] && <p className="eyebrow text-ink-muted">{NOTE_LABELS[kind]}</p>}
          {kind === "overlap" ? (
            <ul className="mt-1.5 space-y-1">
              {notes.flatMap((n) => {
                const pages = rankedPages(n);
                return pages.length ? pages : [{ page: n, rank: null }];
              }).map((p) => (
                <li key={p.page} className="flex items-baseline gap-2 text-xs">
                  {p.rank && (
                    <Chip tone="brand" size="sm" className="shrink-0 tabular-nums" aria-label={`Organic rank ${p.rank}`}>
                      #{p.rank}
                    </Chip>
                  )}
                  <span className="min-w-0 break-all text-ink">{p.page}</span>
                </li>
              ))}
            </ul>
          ) : kind === "entity" || kind === "domain" ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {notes.map((n) => (
                <span
                  key={n}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs",
                    kind === "entity" && n.startsWith("Recommended") ? "bg-brand-faint text-brand-strong" : "bg-surface-sunken text-ink",
                  )}
                >
                  {n}
                </span>
              ))}
            </div>
          ) : (
            <ul className="mt-1 space-y-1">
              {notes.map((n) => (
                <li key={n} className={cn("text-sm leading-6 text-ink-muted", kind === "source" && "italic")}>
                  {kind === "source" ? `"${n}"` : n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** Splits the RPC note into display parts: entity roles become "Recommended: label". */
function noteParts(note: string | null, kind: EvidenceKind): string[] {
  if (!note || kind === "format" || kind === "presence") return [];
  if (kind === "source" || kind === "overlap") return [note];
  const sep = kind === "domain" ? ", " : " / ";
  const parts = note
    .split(sep)
    .map((p) => p.trim())
    .filter(Boolean);
  if (kind !== "entity") return parts;
  return parts.map((p) => {
    const [role, ...rest] = p.split(": ");
    const label = rest.join(": ").trim();
    return label ? `${humanize(role)}: ${label}` : humanize(role);
  });
}

const STATUSES: SnapshotStatus[] = ["present", "absent", "error"];

function normalize(raw: unknown): MetricEvidence {
  const r = (raw ?? {}) as Partial<MetricEvidence>;
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    total: typeof r.total === "number" ? r.total : items.length,
    citations: typeof r.citations === "number" ? r.citations : undefined,
    occurrences: typeof r.occurrences === "number" ? r.occurrences : undefined,
    items: items.map((it) => ({
      snapshot_id: it.snapshot_id,
      captured_at: it.captured_at,
      note: it.note ?? null,
      status: it.status && STATUSES.includes(it.status) ? it.status : undefined,
      sentences: Array.isArray(it.sentences)
        ? it.sentences.map((s) => ({ i: s.i, text: s.text, citations: Array.isArray(s.citations) ? s.citations : [] }))
        : [],
    })),
  };
}

function EvidenceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading captures">
      <Skeleton className="h-4 w-48" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-lg border border-line p-3.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-2 h-3.5 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
