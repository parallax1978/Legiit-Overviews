// collect-batches (cron, every 5 min): applies the results of ended Claude batches and copies
// extractions into reused snapshots.
import { collectAll } from "../_shared/batches.ts";
import { json, requireCron } from "../_shared/http.ts";

/** Replaceable in tests. */
export const deps = { collectAll };

export async function handle(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;
  return json(await deps.collectAll());
}
