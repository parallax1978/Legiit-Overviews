// dataforseo-postback: DataForSEO posts each finished task here (gzip JSON, ?secret=). Every task is
// ingested against the capture named by its tag; unknown tags are logged and skipped.
import { fail, json } from "../_shared/http.ts";
import { env } from "../_shared/env.ts";
import { ingestTask } from "../_shared/ingest.ts";

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail("method not allowed", 405);
  if (!safeEqual(new URL(req.url).searchParams.get("secret") ?? "", env.postbackSecret())) {
    return fail("unauthorized", 401);
  }

  let envelope: any;
  try {
    envelope = JSON.parse(await bodyText(await req.arrayBuffer()));
  } catch {
    return fail("body is not JSON or gzip JSON");
  }
  if (!Array.isArray(envelope?.tasks)) return fail("body has no tasks");

  const summary = { ingested: 0, duplicates: 0, retries: 0, errors: 0, skipped: 0, failed: 0 };
  for (const task of envelope.tasks) {
    const tag = task?.data?.tag;
    try {
      const r = await ingestTask(typeof tag === "string" ? tag : "", task);
      if (r.status === "unknown") {
        console.warn(`postback: unknown tag ${JSON.stringify(tag)} (task ${task?.id})`);
        summary.skipped++;
      } else if (r.duplicate) summary.duplicates++;
      else if (r.status === "retry") summary.retries++;
      else if (r.status === "error") summary.errors++;
      else summary.ingested++;
    } catch (e) {
      // The capture stays submitted, so the sweeper fetches it again with task_get.
      console.error(`postback: task ${task?.id} (tag ${tag}):`, e);
      summary.failed++;
    }
  }
  return json({ ok: true, ...summary });
}

/** The body as text, gunzipped when it starts with the gzip magic bytes (whatever the headers say). */
async function bodyText(body: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(body);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

/** Constant-time comparison; its running time depends only on the expected value's length. */
function safeEqual(got: string, expected: string): boolean {
  const a = new TextEncoder().encode(got);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0 && b.length > 0;
}
