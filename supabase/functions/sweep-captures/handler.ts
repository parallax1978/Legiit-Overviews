// sweep-captures (cron, every 30 min): fetches results DataForSEO never posted back, resubmits failed
// attempts, records captures that failed 3 times as error renders, and re-parses stale own pages.
import { DFS_PENDING_CODES, type DfsTask, serpTaskGet } from "../_shared/dataforseo.ts";
import { must, serviceClient } from "../_shared/db.ts";
import { fail, json, requireCron } from "../_shared/http.ts";
import {
  type CaptureToSubmit,
  failAttempt,
  type IngestResult,
  ingestTask,
  MAX_ATTEMPTS,
  recordCaptureFailure,
  seriesScope,
  submitCaptures,
} from "../_shared/ingest.ts";
import { refreshOwnPages } from "../_shared/tracking.ts";

const MINUTE_MS = 60_000;
/** Captures handled per phase per run. */
const LIMIT = 200;
const NO_POSTBACK_MS = 20 * MINUTE_MS;
const PENDING_MS = 10 * MINUTE_MS;
const GIVE_UP_MS = 180 * MINUTE_MS;
const CONCURRENCY = 8;
const OWN_PAGES_PER_RUN = 5;

interface SubmittedCapture {
  id: string;
  series_id: string;
  task_id: string | null;
  attempts: number;
  submitted_at: string;
}

interface PendingCapture {
  id: string;
  series_id: string;
  attempts: number;
  last_error: string | null;
  series: { keyword: string; location_code: number; language_code: string; device: "desktop" | "mobile" } | null;
}

export async function handle(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;
  let scope: string[] | null;
  try {
    scope = await seriesScope(req);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  const db = serviceClient();
  const now = Date.now();
  const summary = {
    checked: 0, ingested: 0, waiting: 0, unreachable: 0, retry: 0,
    resubmitted: 0, resubmit_failed: 0, errors: 0, own_pages: { parsed: 0, failed: 0 },
  };
  const count = (r: IngestResult) => {
    if (r.status === "retry") summary.retry++;
    else if (r.status === "error") summary.errors++;
    else if (r.status !== "unknown") summary.ingested++;
  };

  // 1. Submitted with no postback after 20 minutes: ask task_get.
  let stale = db.from("captures").select("id, series_id, task_id, attempts, submitted_at")
    .eq("status", "submitted").lt("submitted_at", new Date(now - NO_POSTBACK_MS).toISOString())
    .order("submitted_at").limit(LIMIT);
  if (scope) stale = stale.in("series_id", scope);
  const submitted = must(await stale, "load submitted captures") as SubmittedCapture[];
  await pool(submitted, CONCURRENCY, async (c) => {
    summary.checked++;
    if (!c.task_id) return count(await failAttempt(c, "submitted without a task id"));
    let task: DfsTask;
    try {
      task = await serpTaskGet(c.task_id);
    } catch (e) {
      summary.unreachable++;
      console.error(`task_get ${c.task_id}:`, e instanceof Error ? e.message : e);
      return;
    }
    if (DFS_PENDING_CODES.has(task?.status_code)) {
      if (Date.parse(c.submitted_at) >= now - GIVE_UP_MS) return void summary.waiting++;
      return count(await failAttempt(c, `not ready after 3 hours (${task.status_code} ${task.status_message})`));
    }
    count(await ingestTask(c.id, task));
  });

  // 2. Pending for 10 minutes (failed attempts, or never accepted): resubmit, or give up after 3 attempts.
  const cut = new Date(now - PENDING_MS).toISOString();
  let waiting = db.from("captures")
    .select("id, series_id, attempts, last_error, series(keyword, location_code, language_code, device)")
    .eq("status", "pending")
    .or(`submitted_at.lt."${cut}",and(submitted_at.is.null,scheduled_at.lt."${cut}")`)
    .order("scheduled_at").limit(LIMIT);
  if (scope) waiting = waiting.in("series_id", scope);
  const pending = must(await waiting, "load pending captures") as unknown as PendingCapture[];
  const resubmit: CaptureToSubmit[] = [];
  for (const c of pending) {
    if (c.attempts >= MAX_ATTEMPTS || !c.series) {
      await recordCaptureFailure(c.id, c.last_error ?? `failed after ${c.attempts} attempts`);
      summary.errors++;
    } else {
      resubmit.push({ capture_id: c.id, ...c.series });
    }
  }
  const r = await submitCaptures(resubmit);
  summary.resubmitted = r.submitted;
  summary.resubmit_failed = r.failed;

  // 3. Own pages last parsed more than 7 days ago.
  summary.own_pages = await refreshOwnPages(OWN_PAGES_PER_RUN, scope ?? undefined);
  return json(summary);
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        console.error("sweep:", e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
