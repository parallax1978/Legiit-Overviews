"use client";
// EvidenceTrigger: wraps a number in a link-style button that opens a drawer listing the captures behind it,
// newest first, from the metric_evidence RPC (sentences with citation markers and a note per capture).
import { useRef, useState, type ReactNode } from "react";
import { Alert, Button, Chip, Drawer, LocalTime, RefreshIcon, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCount, humanize, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { EvidenceItem, MetricEvidence } from "@/lib/types";

export type EvidenceKind = "claim" | "unsupported" | "entity" | "source" | "domain" | "format";

export interface EvidenceTriggerProps {
  seriesId: string;
  kind: EvidenceKind;
  /** Claim group id, entity id, url_key, reg_domain or format label, depending on kind. */
  evidenceKey: string;
  /** Window start and end (ISO), the same window the number was computed over. */
  from: string;
  to: string;
  /** Drawer title, usually the claim, entity, URL or format label. */
  title: string;
  /** Drawer subtitle, usually the number itself ("82% · n=56"). */
  subtitle?: string;
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
};

const NOTE_LABELS: Record<EvidenceKind, string> = {
  claim: "Claim as extracted",
  unsupported: "Claim as extracted",
  entity: "How it was mentioned",
  source: "Google's passage",
  domain: "URLs cited",
  format: "",
};

/** The number as a link-style button; click opens the captures behind it. */
export function EvidenceTrigger({ seriesId, kind, evidenceKey, from, to, title, subtitle, className, children }: EvidenceTriggerProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MetricEvidence | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const request = useRef(0);

  const requestKey = `${seriesId}|${kind}|${evidenceKey}|${from}|${to}`;

  async function load(nextLimit: number) {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    const { data: result, error: rpcError } = await createClient().rpc("metric_evidence", {
      p_series_id: seriesId,
      p_kind: kind,
      p_key: evidenceKey,
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
    setLoadedKey(requestKey);
  }

  function openDrawer() {
    setOpen(true);
    if (loadedKey !== requestKey || error) {
      setData(null);
      void load(PAGE);
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const canLoadMore = !!data && total > items.length && limit < MAX_LIMIT;

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
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={KIND_EYEBROWS[kind]}
        title={kind === "format" ? humanize(title) : title}
        description={subtitle}
        footer={
          canLoadMore ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-ink-muted">
                Showing {formatCount(items.length)} of {formatCount(total)}
              </p>
              <Button variant="secondary" size="sm" loading={loading} onClick={() => void load(Math.min(limit + PAGE, MAX_LIMIT))}>
                Load more
              </Button>
            </div>
          ) : undefined
        }
      >
        {error ? (
          <Alert
            tone="bad"
            title="The captures didn't load"
            action={
              <Button variant="secondary" size="sm" iconLeft={<RefreshIcon />} loading={loading} onClick={() => void load(data ? limit : PAGE)}>
                Try Again
              </Button>
            }
          >
            <span className="break-words font-mono text-xs">{error}</span>
          </Alert>
        ) : !data ? (
          <EvidenceSkeleton />
        ) : total === 0 ? (
          <p className="rounded-lg bg-surface-alt px-4 py-6 text-center text-sm text-ink-muted">
            No capture in this window shows this. It may have appeared outside the selected window.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              <span className="font-semibold text-ink">{plural(total, "capture")}</span> behind this number, newest first.
            </p>
            <ol className="mt-4 space-y-3">
              {items.map((item) => (
                <EvidenceRow key={item.snapshot_id} item={item} kind={kind} />
              ))}
            </ol>
            {total > items.length && !canLoadMore && (
              <p className="mt-4 text-xs text-ink-muted">
                Showing the newest {formatCount(items.length)} of {formatCount(total)}.
              </p>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}

function EvidenceRow({ item, kind }: { item: EvidenceItem; kind: EvidenceKind }) {
  const notes = noteParts(item.note, kind);
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
          {NOTE_LABELS[kind] && <p className="eyebrow text-ink-soft">{NOTE_LABELS[kind]}</p>}
          {kind === "entity" || kind === "domain" ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {notes.map((n) => (
                <Chip key={n} tone={kind === "entity" && n.startsWith("Recommended") ? "brand" : "grey"} size="sm" className="whitespace-normal">
                  {n}
                </Chip>
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
  if (!note || kind === "format") return [];
  if (kind === "source") return [note];
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

function normalize(raw: unknown): MetricEvidence {
  const r = (raw ?? {}) as Partial<MetricEvidence>;
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    total: typeof r.total === "number" ? r.total : items.length,
    items: items.map((it) => ({
      snapshot_id: it.snapshot_id,
      captured_at: it.captured_at,
      note: it.note ?? null,
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
