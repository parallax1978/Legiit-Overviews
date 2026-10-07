import { assertEquals, assertRejects } from "@std/assert";
import { DataForSeoError, serpLive, serpTaskGet, serpTaskPost } from "./dataforseo.ts";

/** A DataForSEO stub that answers each path with the scripted HTTP statuses in turn, then 200. */
function scripted(statuses: Record<string, number[]>) {
  const calls: string[] = [];
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, async (req) => {
    const path = new URL(req.url).pathname;
    calls.push(path);
    const body = req.method === "POST" ? await req.json() : null;
    const status = statuses[path]?.shift() ?? 200;
    if (status !== 200) return new Response(`upstream ${status}`, { status });
    const task = (data: any, code: number) => ({ id: crypto.randomUUID(), status_code: code, status_message: "Ok.", data, result: [] });
    const tasks = body ? body.map((data: any) => task(data, path.endsWith("task_post") ? 20100 : 20000)) : [task({}, 20000)];
    return Response.json({ status_code: 20000, status_message: "Ok.", tasks });
  });
  Deno.env.set("DATAFORSEO_BASE_URL", `http://127.0.0.1:${server.addr.port}`);
  return { calls, count: (p: string) => calls.filter((c) => c === p).length, close: () => server.shutdown() };
}

const LIVE = "/v3/serp/google/organic/live/advanced";
const POST = "/v3/serp/google/organic/task_post";
const GET = "/v3/serp/google/organic/task_get/advanced/t1";
const params = { keyword: "k", location_code: 2840, language_code: "en", device: "desktop" as const };

Deno.test("task-creating POSTs are not repeated after a 5xx; 429 and idempotent GETs are retried", async () => {
  const stub = scripted({ [POST]: [502], [LIVE]: [500], [GET]: [503, 502] });
  try {
    await assertRejects(() => serpTaskPost([params], "https://x/postback"), DataForSeoError, "HTTP 502");
    assertEquals(stub.count(POST), 1, "a task_post that may have been charged is not sent again");
    await assertRejects(() => serpLive(params), DataForSeoError, "HTTP 500");
    assertEquals(stub.count(LIVE), 1);

    const task = await serpTaskGet("t1");
    assertEquals([task.status_code, stub.count(GET)], [20000, 3], "task_get is retried through 5xx");

    stub.calls.length = 0;
    const stub429 = scripted({ [POST]: [429] });
    try {
      const tasks = await serpTaskPost([params], "https://x/postback");
      assertEquals([tasks.length, tasks[0].status_code, stub429.count(POST)], [1, 20100, 2], "429 means nothing was created: retried");
    } finally {
      await stub429.close();
    }
  } finally {
    await stub.close();
  }
});
