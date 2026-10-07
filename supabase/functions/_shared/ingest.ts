// Capture lifecycle: submitting captures to DataForSEO, ingesting results into snapshots (raw payload
// to Storage, parse, one-transaction write via ingest_snapshot), failed attempts and own-page matching.
import { DFS_CREATED, DFS_OK, type DfsTask, serpTaskPost } from "./dataforseo.ts";
import { must, serviceClient } from "./db.ts";
import { env } from "./env.ts";
import { parseCapture, parsedCapturedAt } from "./parse-serp.ts";
import { applyMatches } from "./tracking.ts";

/** Attempts per capture before it is recorded as an `error` render. */
export const MAX_ATTEMPTS = 3;
export const RAW_BUCKET = "raw";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IngestResult {
  snapshot_id: string | null;
  /** present | absent | error (failed for good) | retry (failed attempt, will be resubmitted) | unknown (no such capture) */
  status: string;
  duplicate: boolean;
}

interface CaptureRow {
  id: string;
  series_id: string;
  attempts: number;
}

/**
 * Ingests one DataForSEO task for a capture. Idempotent: a capture that already has a snapshot is not
 * written again (own-page matching re-runs, which creates nothing new). A task that is not OK counts
 * as a failed attempt.
 */
export async function ingestTask(captureId: string, task: DfsTask): Promise<IngestResult> {
  if (!UUID.test(captureId ?? "")) return { snapshot_id: null, status: "unknown", duplicate: false };
  const db = serviceClient();
  const capture = must(
    await db.from("captures").select("id, series_id, attempts").eq("id", captureId).maybeSingle(),
    "load capture",
  ) as CaptureRow | null;
  if (!capture) return { snapshot_id: null, status: "unknown", duplicate: false };

  const existing = must(
    await db.from("snapshots").select("id, status").eq("capture_id", captureId).maybeSingle(),
    "load snapshot",
  ) as { id: string; status: string } | null;
  if (existing && existing.status !== "error") {
    await matchSafely(existing.id);
    return { snapshot_id: existing.id, status: existing.status, duplicate: true };
  }

  const result = task?.result?.[0];
  if (task?.status_code !== DFS_OK || !result) {
    if (existing) return { snapshot_id: existing.id, status: "error", duplicate: true };
    const message = task?.status_code === DFS_OK ? "empty result" : `${task?.status_code} ${task?.status_message ?? ""}`.trim();
    return await failAttempt(capture, message);
  }

  const parsed = parseCapture(result);
  const rawPath = await saveRaw(capture, task);
  const row = must(
    await db.rpc("ingest_snapshot", {
      p_capture_id: capture.id,
      p_captured_at: parsedCapturedAt(result) ?? new Date().toISOString(),
      p_parsed: parsed,
      p_raw_path: rawPath,
    }).single(),
    "ingest snapshot",
  ) as { snapshot_id: string; duplicate: boolean };
  await matchSafely(row.snapshot_id);
  return { snapshot_id: row.snapshot_id, status: parsed.status, duplicate: row.duplicate };
}

/** Writes the `error` snapshot (captured_at = scheduled_at) and marks the capture `error`. */
export async function recordCaptureFailure(captureId: string, message: string): Promise<string> {
  return must(
    await serviceClient().rpc("record_capture_failure", { p_capture_id: captureId, p_message: message.slice(0, 1000) }),
    "record capture failure",
  ) as string;
}

/**
 * One failed attempt: back to `pending` so the sweeper resubmits it, or an `error` render once the
 * capture has used all its attempts.
 */
export async function failAttempt(capture: CaptureRow, message: string): Promise<IngestResult> {
  if (capture.attempts >= MAX_ATTEMPTS) {
    const id = await recordCaptureFailure(capture.id, message);
    return { snapshot_id: id, status: "error", duplicate: false };
  }
  must(
    await serviceClient().from("captures").update({ status: "pending", last_error: message.slice(0, 1000) })
      .eq("id", capture.id).in("status", ["pending", "submitted"]),
    "mark capture pending",
  );
  return { snapshot_id: null, status: "retry", duplicate: false };
}

export interface CaptureToSubmit {
  capture_id: string;
  keyword: string;
  location_code: number;
  language_code: string;
  device: "desktop" | "mobile";
}

/** The postback URL DataForSEO calls with each finished task. */
export function postbackUrl(): string {
  return `${env.functionsPublicUrl()}/dataforseo-postback?secret=${encodeURIComponent(env.postbackSecret())}`;
}

/**
 * Posts captures to DataForSEO task_post in chunks of 100 (tag = capture id). Every capture uses one
 * attempt: accepted ones become `submitted` with their task id, rejected ones stay `pending` with
 * last_error for the sweeper.
 */
export async function submitCaptures(captures: CaptureToSubmit[]): Promise<{ submitted: number; failed: number }> {
  let submitted = 0;
  let failed = 0;
  for (let i = 0; i < captures.length; i += 100) {
    const chunk = captures.slice(i, i + 100);
    const outcomes: { id: string; task_id: string | null; error: string | null }[] = [];
    try {
      const tasks = await serpTaskPost(
        chunk.map((c) => ({
          keyword: c.keyword,
          location_code: c.location_code,
          language_code: c.language_code,
          device: c.device,
          tag: c.capture_id,
        })),
        postbackUrl(),
      );
      const byTag = new Map(tasks.filter((t) => t?.data?.tag).map((t) => [String(t.data.tag), t]));
      chunk.forEach((c, j) => {
        const t = byTag.get(c.capture_id) ?? tasks[j];
        if (t && t.status_code === DFS_CREATED && t.id) outcomes.push({ id: c.capture_id, task_id: t.id, error: null });
        else outcomes.push({ id: c.capture_id, task_id: null, error: t ? `${t.status_code} ${t.status_message}` : "no task returned" });
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("task_post failed", message);
      for (const c of chunk) outcomes.push({ id: c.capture_id, task_id: null, error: message.slice(0, 1000) });
    }
    must(await serviceClient().rpc("mark_capture_submissions", { p_rows: outcomes }), "mark capture submissions");
    for (const o of outcomes) o.error ? failed++ : submitted++;
  }
  return { submitted, failed };
}

/**
 * Optional `{ series_ids: uuid[] }` body of the capture cron functions, limiting a run to those series
 * (manual re-runs, tests). An empty body means every series. Throws on a malformed body.
 */
export async function seriesScope(req: Request): Promise<string[] | null> {
  const text = (await req.text()).trim();
  if (!text) return null;
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("body must be JSON");
  }
  const ids = body?.series_ids;
  if (ids === undefined || ids === null) return null;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
    throw new Error("series_ids must be a list of series ids");
  }
  return ids;
}

async function saveRaw(capture: CaptureRow, task: DfsTask): Promise<string | null> {
  const path = `${capture.series_id}/${capture.id}.json`;
  // DataForSEO echoes the task back, including the postback URL that carries our secret.
  const { postback_url: _secret, ...data } = (task.data ?? {}) as Record<string, unknown>;
  const { error } = await serviceClient().storage.from(RAW_BUCKET).upload(
    path,
    new Blob([JSON.stringify({ ...task, data })], { type: "application/json" }),
    { upsert: true, contentType: "application/json" },
  );
  if (error) {
    // The parsed snapshot is what the product needs; a missing raw copy is logged, not fatal.
    console.error(`raw upload ${path}: ${error.message}`);
    return null;
  }
  return path;
}

async function matchSafely(snapshotId: string): Promise<void> {
  try {
    await applyMatches(snapshotId);
  } catch (e) {
    console.error(`own-page matching for snapshot ${snapshotId}:`, e);
  }
}
