// submit-batches (cron, every 15 min): one Claude Message Batch per kind of pending work.
import { submitAll } from "../_shared/batches.ts";
import { json, requireCron } from "../_shared/http.ts";

/** Replaceable in tests. */
export const deps = { submitAll };

export async function handle(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;
  return json(await deps.submitAll());
}
