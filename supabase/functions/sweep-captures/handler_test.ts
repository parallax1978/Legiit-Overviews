import { assert, assertEquals } from "@std/assert";
import { must, serviceClient } from "../_shared/db.ts";
import {
  cleanup,
  createCapture,
  createSeries,
  createTrackedQuery,
  createUser,
  cronRequest,
  startStubDfs,
  TASK_POST_PATH,
  type TestUser,
  uniqueKeyword,
} from "../_shared/capture_testkit.ts";
import { handle } from "./handler.ts";

const MIN = 60_000;

Deno.test("sweep-captures fetches missed results, retries failures and gives up after 3 attempts", async () => {
  const page = "https://example.com/forms/own";
  const stub = startStubDfs({ pages: { [page]: "# Own page\n\n## Section\n\nText." } });
  const keyword = uniqueKeyword("sweep");
  const series = await createSeries(keyword);
  const users: TestUser[] = [];
  try {
    const user = await createUser("sweep");
    users.push(user);
    const tq = await createTrackedQuery(user.id, series.id, { own_url: page, own_url_key: "example.com/forms/own" });
    const now = Date.now();
    const ago = (m: number) => new Date(now - m * MIN).toISOString();
    const task = (status?: number) => {
      const id = crypto.randomUUID();
      stub.posted.set(id, { keyword, device: "desktop", location_code: 2840, language_code: "en" });
      if (status) stub.taskGetStatus.set(id, status);
      return id;
    };
    let slot = 0;
    const capture = (minutesAgo: number, fields: Record<string, unknown>) =>
      createCapture(series.id, { scheduled_at: ago(minutesAgo + 5 + slot++ / 60), submitted_at: ago(minutesAgo), ...fields });

    const ready = await capture(30, { task_id: task() });
    const queued = await capture(30, { task_id: task(40602) });
    const stuck = await capture(200, { task_id: task(40602) });
    const failing = await capture(30, { task_id: task(40501), attempts: 3 });
    const fresh = await capture(5, { task_id: task() });
    const retry = await capture(20, { status: "pending", attempts: 1, submitted_at: null });
    const spent = await capture(20, { status: "pending", attempts: 3, submitted_at: null, last_error: "40501 Invalid Field." });
    must(await serviceClient().from("own_pages").insert({ tracked_query_id: tq.id, url: page, parsed_at: new Date(now - 8 * 1440 * MIN).toISOString(), markdown: "old" }), "own page");

    const res = await handle(cronRequest("sweep-captures", { series_ids: [series.id] }));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), {
      checked: 4, ingested: 1, waiting: 1, unreachable: 0, retry: 1,
      resubmitted: 2, resubmit_failed: 0, errors: 2, own_pages: { parsed: 1, failed: 0 },
    });

    const rows = new Map((must(await serviceClient().from("captures").select("*").eq("series_id", series.id), "captures") as any[]).map((c) => [c.id, c]));
    const snap = async (id: string) => (must(await serviceClient().from("snapshots").select("status").eq("capture_id", id).maybeSingle(), "snap") as any)?.status ?? null;
    assertEquals([rows.get(ready.id).status, await snap(ready.id)], ["received", "present"]);
    assertEquals([rows.get(queued.id).status, await snap(queued.id)], ["submitted", null]);
    assertEquals([rows.get(stuck.id).status, rows.get(stuck.id).attempts], ["submitted", 2], "a task stuck for 3 hours is resubmitted");
    assert(rows.get(stuck.id).last_error === null && stub.posted.has(rows.get(stuck.id).task_id));
    assertEquals([rows.get(failing.id).status, await snap(failing.id)], ["error", "error"]);
    assertEquals([rows.get(fresh.id).status, await snap(fresh.id)], ["submitted", null]);
    assertEquals([rows.get(retry.id).status, rows.get(retry.id).attempts], ["submitted", 2]);
    assertEquals([rows.get(spent.id).status, rows.get(spent.id).last_error, await snap(spent.id)], ["error", "40501 Invalid Field.", "error"]);
    assertEquals(stub.calls.filter((c) => c.path === TASK_POST_PATH).flatMap((c) => c.body.map((t: any) => t.tag)).sort(), [stuck.id, retry.id].sort());
    const own = must(await serviceClient().from("own_pages").select("markdown").eq("tracked_query_id", tq.id).single(), "own") as any;
    assertEquals(own.markdown, "# Own page\n\n## Section\n\nText.");

    assertEquals((await handle(new Request("http://localhost/sweep-captures", { method: "POST" }))).status, 401);
  } finally {
    await stub.close();
    await cleanup(users, [series.id]);
  }
});
