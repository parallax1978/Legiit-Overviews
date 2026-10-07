import { assertEquals } from "@std/assert";
import type { SubmitSummary } from "../_shared/batches.ts";
import { deps, handle } from "./handler.ts";

const summary: SubmitSummary = {
  counts: { extract: 3, consolidate: 1, page_tag: 0, brief: 0 },
  batches: [{ kind: "extract", id: "msgbatch_1", requests: 3 }, { kind: "consolidate", id: "msgbatch_2", requests: 1 }],
  errors: [],
};

function request(secret?: string): Request {
  return new Request("http://localhost/submit-batches", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} });
}

Deno.test("submit-batches rejects calls without the cron secret", async () => {
  let called = false;
  deps.submitAll = () => {
    called = true;
    return Promise.resolve(summary);
  };
  assertEquals((await handle(request())).status, 401);
  assertEquals((await handle(request("wrong"))).status, 401);
  assertEquals(called, false);
});

Deno.test("submit-batches runs the runner and returns its summary", async () => {
  deps.submitAll = () => Promise.resolve(summary);
  const res = await handle(request(Deno.env.get("CRON_SECRET")!));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), summary);
});
