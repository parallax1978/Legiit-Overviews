// The Claude batch runner. submitAll (submit-batches, every 15 min) creates one Message Batch per kind
// of pending work and records it; collectAll (collect-batches, every 5 min) applies the results of
// ended batches through each kind's handleResult. See docs/architecture.md "Claude work".
import Anthropic from "@anthropic-ai/sdk";
import type { BatchItemResult, BatchRequest, WorkKind } from "./batch-work.ts";
import { addUsage, anthropic } from "./claude.ts";
import { must, serviceClient } from "./db.ts";
import { chunks, errorText } from "./work/common.ts";
import { LIMITS, type ScopedWork, WORK, WORK_ORDER, type WorkScope } from "./work/index.ts";

/** Serialized request bytes per batch; what doesn't fit goes in the next batch of the run. */
export const MAX_BATCH_BYTES = 32 * 1024 * 1024;
/** Batches created per kind in one run: the runner pages through pending work while a page is full. */
export const MAX_BATCHES_PER_KIND = 10;
/** Bytes of batch_items rows per insert request. */
const ITEM_INSERT_BYTES = 2 * 1024 * 1024;
/** collectAll stops starting new work after this long, leaving the rest for the next run. */
const COLLECT_BUDGET_MS = 110_000;
/** Collected and failed batches (with their items) are deleted after this long. */
const BATCH_RETENTION = "30 days";
/** After a failed creation, an unrecorded batch this recent with the same request count is ours. */
const ORPHAN_WINDOW_MS = 10 * 60_000;

export interface SubmitOptions {
  /** Restrict collection (tests). */
  scope?: WorkScope;
  /** Kinds to run; all by default. */
  kinds?: WorkKind[];
  limits?: Partial<Record<WorkKind, number>>;
}

export interface SubmitSummary {
  counts: Record<WorkKind, number>;
  batches: { kind: WorkKind; id: string; requests: number }[];
  errors: { kind: WorkKind; error: string }[];
}

/** Keeps requests (unique custom_ids) up to the byte budget; the first always goes. */
function withinBudget(requests: BatchRequest[]): BatchRequest[] {
  const out: BatchRequest[] = [];
  const ids = new Set<string>();
  let bytes = 0;
  for (const r of requests) {
    if (ids.has(r.custom_id)) continue;
    const size = JSON.stringify(r.params).length + r.custom_id.length + 32;
    if (out.length && bytes + size > MAX_BATCH_BYTES) break;
    ids.add(r.custom_id);
    bytes += size;
    out.push(r);
  }
  return out;
}

async function recordBatch(batchId: string, kind: WorkKind, requests: BatchRequest[]): Promise<void> {
  const db = serviceClient();
  must(await db.from("batches").insert({ id: batchId, kind, item_count: requests.length, status: "in_progress" }), "insert batch");
  try {
    let rows: Record<string, unknown>[] = [];
    let bytes = 0;
    const flush = async () => {
      if (rows.length) must(await db.from("batch_items").insert(rows), "insert batch items");
      rows = [];
      bytes = 0;
    };
    for (const r of requests) {
      const size = JSON.stringify(r.refs).length + 200;
      if (rows.length && (bytes + size > ITEM_INSERT_BYTES || rows.length >= 500)) await flush();
      rows.push({ batch_id: batchId, custom_id: r.custom_id, kind, target_id: r.target_id, refs: r.refs, status: "submitted" });
      bytes += size;
    }
    await flush();
  } catch (e) {
    await db.from("batches").delete().eq("id", batchId);
    throw e;
  }
}

/**
 * A batch creation whose response was lost (a gateway error or a dropped connection after the
 * request went through) leaves a batch that runs and is billed but is never collected. Creation is
 * not retried by the SDK, so after such an error the recent batches are listed and any unrecorded
 * one of this size is cancelled; the work stays pending and is resubmitted next run.
 */
async function cancelOrphans(requestCount: number): Promise<void> {
  const since = Date.now() - ORPHAN_WINDOW_MS;
  const known = new Set<string>();
  for await (const b of anthropic().messages.batches.list({ limit: 20 })) {
    if (Date.parse(b.created_at) < since) break;
    const c = b.request_counts;
    if (c.processing + c.succeeded + c.errored + c.canceled + c.expired !== requestCount) continue;
    if (!known.size) {
      const rows = must(await serviceClient().from("batches").select("id").gte("created_at", new Date(since).toISOString()), "load recent batches") as { id: string }[];
      for (const r of rows) known.add(r.id);
    }
    if (known.has(b.id)) continue;
    console.warn(`batch ${b.id} was created but never recorded; cancelling it`);
    await anthropic().messages.batches.cancel(b.id).catch((e) => console.error(`cancel ${b.id}: ${errorText(e)}`));
  }
}

async function createBatch(kind: WorkKind, requests: BatchRequest[]): Promise<string> {
  const work = WORK[kind];
  let batch: Anthropic.Messages.Batches.MessageBatch;
  try {
    batch = await anthropic().messages.batches.create(
      { requests: requests.map(({ custom_id, params }) => ({ custom_id, params })) },
      { maxRetries: 0 },
    );
  } catch (e) {
    // A rejected request (4xx) created nothing; anything else may have.
    if (!(e instanceof Anthropic.APIError && typeof e.status === "number" && e.status < 500)) {
      await cancelOrphans(requests.length).catch((c) => console.error(`orphan check: ${errorText(c)}`));
    }
    throw e;
  }
  try {
    await recordBatch(batch.id, kind, requests);
  } catch (e) {
    await anthropic().messages.batches.cancel(batch.id).catch((c) => console.error(`cancel ${batch.id}: ${errorText(c)}`));
    throw e;
  }
  await work.markSubmitted(requests.map((r) => r.custom_id), batch.id);
  return batch.id;
}

/** Pages through a kind's pending work, one batch per page, until a page comes back short. */
async function submitKind(kind: WorkKind, opts: SubmitOptions): Promise<{ id: string; requests: number }[]> {
  const work = WORK[kind];
  const limit = opts.limits?.[kind] ?? LIMITS[kind];
  const out: { id: string; requests: number }[] = [];
  for (let page = 0; page < MAX_BATCHES_PER_KIND; page++) {
    const collected = await work.collect(limit, opts.scope);
    const requests = withinBudget(collected);
    if (!requests.length) break;
    out.push({ id: await createBatch(kind, requests), requests: requests.length });
    if (collected.length < limit && requests.length === collected.length) break;
  }
  return out;
}

/** Creates batches for every kind with pending work, in registry order. One kind failing doesn't stop the others. */
export async function submitAll(opts: SubmitOptions = {}): Promise<SubmitSummary> {
  const summary: SubmitSummary = { counts: { extract: 0, consolidate: 0, page_tag: 0, brief: 0 }, batches: [], errors: [] };
  for (const kind of WORK_ORDER) {
    if (opts.kinds && !opts.kinds.includes(kind)) continue;
    try {
      for (const done of await submitKind(kind, opts)) {
        summary.counts[kind] += done.requests;
        summary.batches.push({ kind, ...done });
      }
    } catch (e) {
      console.error(`submit ${kind}: ${errorText(e)}`);
      summary.errors.push({ kind, error: errorText(e) });
    }
  }
  return summary;
}

// ------------------------------------------------------------------ collect

export interface CollectOptions {
  /** Only these batches (tests). */
  batchIds?: string[];
  /** Only reused snapshots of these series (tests). */
  seriesIds?: string[];
  deadlineMs?: number;
}

export interface BatchCollectSummary {
  id: string;
  kind: WorkKind;
  /** in_progress: still processing at Anthropic; partial: out of time, continues next run. */
  status: "in_progress" | "collected" | "partial" | "failed";
  applied: number;
  failed: number;
  skipped: number;
}

export interface CollectSummary {
  batches: BatchCollectSummary[];
  reused: { copied: number; reset: number } | null;
  /** Work whose result failed, released for another attempt (or failed). */
  released: { snapshots: number; pages: number; briefs: number; series: number } | null;
  /** Old collected and failed batches deleted. */
  purged: number | null;
  errors: { batch_id: string | null; error: string }[];
}

interface BatchRow {
  id: string;
  kind: WorkKind;
  status: "in_progress" | "ended";
  ended_at: string | null;
}

interface ItemRow {
  custom_id: string;
  status: "submitted" | "applied" | "failed";
  refs: Record<string, string> | null;
}

function toResult(r: Anthropic.Messages.Batches.MessageBatchResult): BatchItemResult {
  switch (r.type) {
    case "succeeded":
      return { type: "succeeded", message: r.message };
    case "errored":
      return { type: "errored", error: r.error };
    case "canceled":
      return { type: "canceled" };
    default:
      return { type: "expired" };
  }
}

/**
 * The batch's items. Captures of one series share one ref map, so identical maps are kept once
 * (a backlog of a large series can otherwise repeat a big map a thousand times).
 */
async function loadItems(batchId: string): Promise<Map<string, ItemRow>> {
  const out = new Map<string, ItemRow>();
  const interned = new Map<string, Record<string, string>>();
  const page = 250;
  for (let from = 0;; from += page) {
    const rows = must(
      await serviceClient().from("batch_items").select("custom_id, status, refs").eq("batch_id", batchId)
        .order("custom_id").range(from, from + page - 1),
      "load batch items",
    ) as ItemRow[];
    for (const r of rows) {
      const key = JSON.stringify(r.refs ?? {});
      let refs = interned.get(key);
      if (!refs) interned.set(key, refs = r.refs ?? {});
      out.set(r.custom_id, { ...r, refs });
    }
    if (rows.length < page) return out;
  }
}

/** Collects item outcomes and writes them in few requests. */
class ItemMarks {
  private applied: string[] = [];
  private failed: { custom_id: string; error: string }[] = [];
  appliedCount = 0;
  failedCount = 0;

  constructor(private readonly batchId: string) {}

  ok(customId: string) {
    this.applied.push(customId);
    this.appliedCount++;
  }

  fail(customId: string, error: string) {
    this.failed.push({ custom_id: customId, error });
    this.failedCount++;
  }

  get pending(): number {
    return this.applied.length + this.failed.length;
  }

  /** Marks the items; their refs are cleared, since a retry builds a fresh request. */
  async flush(): Promise<void> {
    const db = serviceClient();
    for (const part of chunks(this.applied, 200)) {
      must(
        await db.from("batch_items").update({ status: "applied", error: null, refs: {} }).eq("batch_id", this.batchId).in("custom_id", part),
        "mark batch items applied",
      );
    }
    for (const f of this.failed) {
      must(
        await db.from("batch_items").update({ status: "failed", error: f.error, refs: {} }).eq("batch_id", this.batchId).eq("custom_id", f.custom_id),
        "mark batch item failed",
      );
    }
    this.applied = [];
    this.failed = [];
  }
}

async function apply(work: ScopedWork, customId: string, result: BatchItemResult, item: ItemRow, marks: ItemMarks) {
  try {
    await work.handleResult(customId, result, item.refs ?? {});
    marks.ok(customId);
  } catch (e) {
    marks.fail(customId, errorText(e));
  }
}

/** The batch is gone at Anthropic: every unapplied item is handled as expired so its work is retried. */
async function abandon(b: BatchRow, reason: string): Promise<BatchCollectSummary> {
  const work = WORK[b.kind];
  const items = await loadItems(b.id);
  const marks = new ItemMarks(b.id);
  for (const [cid, item] of items) {
    if (item.status !== "submitted") continue;
    try {
      await work.handleResult(cid, { type: "expired" }, item.refs ?? {});
    } catch {
      // The expected outcome: handleResult reports an expired request by throwing.
    }
    marks.fail(cid, reason);
  }
  await marks.flush();
  must(
    await serviceClient().from("batches").update({ status: "failed", collected_at: new Date().toISOString() }).eq("id", b.id),
    "mark batch failed",
  );
  return { id: b.id, kind: b.kind, status: "failed", applied: 0, failed: marks.failedCount, skipped: 0 };
}

async function collectBatch(b: BatchRow, deadline: number): Promise<BatchCollectSummary> {
  const db = serviceClient();
  const work = WORK[b.kind];
  let endedAt = b.ended_at;
  if (b.status === "in_progress") {
    let remote: Anthropic.Messages.Batches.MessageBatch;
    try {
      remote = await anthropic().messages.batches.retrieve(b.id);
    } catch (e) {
      if (e instanceof Anthropic.NotFoundError) return await abandon(b, "batch not found at Anthropic");
      throw e;
    }
    if (remote.processing_status !== "ended") {
      return { id: b.id, kind: b.kind, status: "in_progress", applied: 0, failed: 0, skipped: 0 };
    }
    endedAt = remote.ended_at ?? new Date().toISOString();
    must(await db.from("batches").update({ status: "ended", ended_at: endedAt }).eq("id", b.id), "mark batch ended");
  }

  const items = await loadItems(b.id);
  const marks = new ItemMarks(b.id);
  const usage: Record<string, number> = {};
  const seen = new Set<string>();
  let skipped = 0;
  let complete = true;
  for await (const line of await anthropic().messages.batches.results(b.id)) {
    if (line.result.type === "succeeded") addUsage(usage, line.result.message.usage);
    const item = items.get(line.custom_id);
    if (seen.has(line.custom_id) || !item || item.status !== "submitted") {
      skipped++;
      continue;
    }
    seen.add(line.custom_id);
    if (Date.now() >= deadline) {
      complete = false;
      break;
    }
    await apply(work, line.custom_id, toResult(line.result), item, marks);
    if (marks.pending >= 100) await marks.flush();
  }

  if (complete) {
    // Every request has a result line; one without is retried like an expired request.
    for (const [cid, item] of items) {
      if (item.status !== "submitted" || seen.has(cid)) continue;
      try {
        await work.handleResult(cid, { type: "expired" }, item.refs ?? {});
      } catch {
        // Expected: an expired result is reported by throwing.
      }
      marks.fail(cid, "missing from batch results");
    }
  }
  await marks.flush();
  if (!complete) {
    return { id: b.id, kind: b.kind, status: "partial", applied: marks.appliedCount, failed: marks.failedCount, skipped };
  }
  must(
    await db.from("batches").update({
      status: "collected",
      ended_at: endedAt,
      collected_at: new Date().toISOString(),
      usage,
    }).eq("id", b.id),
    "mark batch collected",
  );
  return { id: b.id, kind: b.kind, status: "collected", applied: marks.appliedCount, failed: marks.failedCount, skipped };
}

/**
 * Applies the results of every ended batch, oldest first; then releases work whose result failed,
 * copies extractions into reused snapshots whose original is done (promoting the copies of one that
 * failed), and purges old batches. One bad result or one bad batch never stops the rest.
 */
export async function collectAll(opts: CollectOptions = {}): Promise<CollectSummary> {
  const deadline = Date.now() + (opts.deadlineMs ?? COLLECT_BUDGET_MS);
  const summary: CollectSummary = { batches: [], reused: null, released: null, purged: null, errors: [] };
  let q = serviceClient().from("batches").select("id, kind, status, ended_at")
    .in("status", ["in_progress", "ended"]).order("created_at").limit(500);
  if (opts.batchIds) q = q.in("id", opts.batchIds);
  const rows = must(await q, "load batches") as BatchRow[];

  for (const b of rows) {
    if (Date.now() >= deadline) break;
    try {
      summary.batches.push(await collectBatch(b, deadline));
    } catch (e) {
      console.error(`collect ${b.id}: ${errorText(e)}`);
      summary.errors.push({ batch_id: b.id, error: errorText(e) });
    }
  }

  try {
    summary.released = must(
      await serviceClient().rpc("release_stuck_work", { p_series_ids: opts.seriesIds ?? null }),
      "release_stuck_work",
    ) as CollectSummary["released"];
    summary.reused = must(
      await serviceClient().rpc("sync_reused_extractions", { p_series_ids: opts.seriesIds ?? null }),
      "sync_reused_extractions",
    ) as { copied: number; reset: number };
    summary.purged = must(await serviceClient().rpc("purge_batches", { p_keep: BATCH_RETENTION }), "purge_batches") as number;
  } catch (e) {
    summary.errors.push({ batch_id: null, error: errorText(e) });
  }
  return summary;
}
