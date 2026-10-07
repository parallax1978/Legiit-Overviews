import { assertEquals } from "@std/assert";
import { must, serviceClient } from "../_shared/db.ts";
import { cleanup, createCapture, createSeries, fixtureResult, okTask, uniqueKeyword } from "../_shared/capture_testkit.ts";
import { handle } from "./handler.ts";

const url = (secret = Deno.env.get("POSTBACK_SECRET")!) => `http://localhost/dataforseo-postback?secret=${encodeURIComponent(secret)}`;

function envelope(tasks: unknown[]): string {
  return JSON.stringify({ version: "0.1", status_code: 20000, status_message: "Ok.", tasks });
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

function post(body: BodyInit, headers: Record<string, string> = {}, target = url()): Promise<Response> {
  return handle(new Request(target, { method: "POST", headers: { "content-type": "application/json", ...headers }, body }));
}

Deno.test("postback checks the secret and rejects unparseable bodies", async () => {
  const body = envelope([]);
  assertEquals((await post(body, {}, url("wrong"))).status, 401);
  assertEquals((await post(body, {}, "http://localhost/dataforseo-postback")).status, 401);
  assertEquals((await post("not json")).status, 400);
  assertEquals((await post(JSON.stringify({ status_code: 20000 }))).status, 400);
  assertEquals((await post(new Uint8Array([0x1f, 0x8b, 1, 2, 3]).buffer)).status, 400);
  const res = await post(envelope([okTask("not-a-capture", fixtureResult("synthetic-absent.json"))]));
  assertEquals(await res.json(), { ok: true, ingested: 0, duplicates: 0, retries: 0, errors: 0, skipped: 1, failed: 0 });
});

Deno.test("the same postback twice makes one snapshot; gzip postbacks with identical content reuse it", async () => {
  const series = await createSeries(uniqueKeyword("postback"));
  try {
    const a = await createCapture(series.id, { scheduled_at: "2026-10-07T09:00:00Z" });
    const plain = envelope([okTask(a.id, fixtureResult("synthetic-form-builders.json"))]);
    assertEquals(await (await post(plain)).json(), { ok: true, ingested: 1, duplicates: 0, retries: 0, errors: 0, skipped: 0, failed: 0 });
    assertEquals((await (await post(plain)).json()).duplicates, 1);
    const snaps = must(await serviceClient().from("snapshots").select("id").eq("capture_id", a.id), "snapshots") as any[];
    assertEquals(snaps.length, 1);

    // DataForSEO gzips postbacks; same content with references in another order.
    const result = fixtureResult("synthetic-form-builders.json");
    result.datetime = "2026-10-07 12:00:00 +00:00";
    result.items.find((i: any) => i.type === "ai_overview").references.reverse();
    const b = await createCapture(series.id, { scheduled_at: "2026-10-07T12:00:00Z" });
    const res = await post(await gzip(envelope([okTask(b.id, result)])), { "content-encoding": "gzip" });
    assertEquals((await res.json()).ingested, 1);
    const snapB = must(await serviceClient().from("snapshots").select("same_as, extraction").eq("capture_id", b.id).single(), "b") as any;
    assertEquals([snapB.same_as, snapB.extraction], [snaps[0].id, "reused"]);

    // Gzip magic bytes are honoured even without the header.
    const c = await createCapture(series.id, { scheduled_at: "2026-10-07T15:00:00Z" });
    const res2 = await post(await gzip(envelope([okTask(c.id, fixtureResult("synthetic-absent.json"))])));
    assertEquals((await res2.json()).ingested, 1);
    const cap = must(await serviceClient().from("captures").select("status").eq("id", c.id).single(), "c") as any;
    assertEquals(cap.status, "received");
  } finally {
    await cleanup([], [series.id]);
  }
});
