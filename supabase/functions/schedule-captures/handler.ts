// schedule-captures (cron, every 10 min): one capture per due series that someone tracks, posted to
// DataForSEO task_post with a postback; next_capture_at moves forward in 3-hour steps.
import { must, serviceClient } from "../_shared/db.ts";
import { fail, json, requireCron } from "../_shared/http.ts";
import { type CaptureToSubmit, seriesScope, submitCaptures } from "../_shared/ingest.ts";

/** Series claimed per run; the rest are picked up 10 minutes later. */
const LIMIT = 1000;

export async function handle(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;
  let scope: string[] | null;
  try {
    scope = await seriesScope(req);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  // Inserting the captures and advancing the series happen in one transaction; the unique
  // (series_id, scheduled_at) makes overlapping runs harmless, and only inserted rows come back.
  const claimed = must(
    await serviceClient().rpc("claim_due_captures", { p_limit: LIMIT, p_series_ids: scope }),
    "claim due captures",
  ) as CaptureToSubmit[];
  const { submitted, failed } = await submitCaptures(claimed);
  return json({ captures: claimed.length, submitted, failed });
}
