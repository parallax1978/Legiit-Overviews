import { assertEquals } from "@std/assert";
import type { CollectSummary } from "../_shared/batches.ts";
import { deps, handle } from "./handler.ts";

const summary: CollectSummary = {
  batches: [{ id: "msgbatch_1", kind: "extract", status: "collected", applied: 3, failed: 1, skipped: 0 }],
  reused: { copied: 2, reset: 0 },
  released: { snapshots: 0, pages: 0, briefs: 0 },
  errors: [],
};

function request(secret?: string): Request {
  return new Request("http://localhost/collect-batches", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} });
}

Deno.test("collect-batches rejects calls without the cron secret", async () => {
  let called = false;
  deps.collectAll = () => {
    called = true;
    return Promise.resolve(summary);
  };
  assertEquals((await handle(request())).status, 401);
  assertEquals((await handle(request("wrong"))).status, 401);
  assertEquals(called, false);
});

Deno.test("collect-batches runs the collector and returns its summary", async () => {
  deps.collectAll = () => Promise.resolve(summary);
  const res = await handle(request(Deno.env.get("CRON_SECRET")!));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), summary);
});
