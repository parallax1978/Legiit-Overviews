import { assert, assertEquals } from "@std/assert";
import { must, serviceClient } from "../_shared/db.ts";
import {
  cleanup,
  createUser,
  fixtureResult,
  LIVE_PATH,
  RELATED_PATH,
  seriesIdsFor,
  startStubDfs,
  type TestUser,
  uniqueKeyword,
  userClient,
  userRequest,
} from "../_shared/capture_testkit.ts";
import { normalizeKeyword } from "../_shared/normalize.ts";
import { handle } from "./handler.ts";

const add = (user: TestUser | null, body: unknown) => handle(userRequest("add-query", user, body));

Deno.test("two users adding the same keyword share one series; the second add makes no Live call", async () => {
  const stub = startStubDfs();
  const keyword = uniqueKeyword("shared");
  const users: TestUser[] = [];
  try {
    const [a, b] = [await createUser("add-a"), await createUser("add-b")];
    users.push(a, b);
    const raw = `  ${keyword.toUpperCase()}?? `;
    const resA = await add(a, { keyword: raw, location_code: 2840, devices: ["desktop"] });
    assertEquals(resA.status, 200);
    const bodyA = await resA.json();
    assertEquals(bodyA.siblings, []);
    const [rA] = bodyA.results;
    assertEquals([rA.device, rA.is_new_series, rA.overview_present, rA.status], ["desktop", true, true, "tracking"]);
    assertEquals(stub.count(LIVE_PATH), 1);
    assertEquals(stub.calls[0].body[0].tag.length, 36, "the Live task is tagged with the capture id");

    const series = must(await serviceClient().from("series").select("*").eq("id", rA.series_id).single(), "series") as any;
    assertEquals([series.keyword, series.language_code, series.device], [keyword, "en", "desktop"]);
    const wait = Date.parse(series.next_capture_at) - Date.now();
    assert(wait > -60_000 && wait <= 3 * 3_600_000, "first scheduled capture within 3 hours");
    const tqA = must(await serviceClient().from("tracked_queries").select("*").eq("id", rA.tracked_query_id).single(), "tq") as any;
    assertEquals([tqA.user_id, tqA.display_keyword], [a.id, `${keyword.toUpperCase()}??`]);
    const capture = must(await serviceClient().from("captures").select("*").eq("series_id", rA.series_id).single(), "capture") as any;
    assertEquals([capture.source, capture.status, capture.attempts], ["live", "received", 1]);

    const resB = await add(b, { keyword, location_code: 2840, language_code: "en", devices: ["desktop"] });
    const [rB] = (await resB.json()).results;
    assertEquals([rB.series_id, rB.is_new_series, rB.overview_present, rB.status], [rA.series_id, false, true, "tracking"]);
    assertEquals(stub.count(LIVE_PATH), 1, "a snapshot from the last 3 hours is reused");
    // The second user sees the shared history through RLS.
    const visible = await userClient(b).from("snapshots").select("id, status").eq("series_id", rA.series_id);
    assertEquals(visible.data?.map((s) => s.status), ["present"]);

    // Adding again unpauses a paused query without capturing.
    must(await serviceClient().from("tracked_queries").update({ status: "paused" }).eq("id", rA.tracked_query_id), "pause");
    const again = (await (await add(a, { keyword, location_code: 2840, devices: ["desktop"] })).json()).results[0];
    assertEquals([again.tracked_query_id, again.status], [rA.tracked_query_id, "tracking"]);
    assertEquals(stub.count(LIVE_PATH), 1);
  } finally {
    await stub.close();
    await cleanup(users, await seriesIdsFor([keyword]));
  }
});

Deno.test("no overview: watching, with siblings that trigger one; a DataForSEO failure keeps the query", async () => {
  const noOverview = uniqueKeyword("absent");
  const broken = uniqueKeyword("broken");
  const stub = startStubDfs({
    serp: (k) => k === broken ? "fail" : { ...fixtureResult("synthetic-absent.json"), keyword: k },
    related: (seed) => [
      [seed, 5000, true],
      ["form builder no ai", 9000, false],
      ...Array.from({ length: 12 }, (_, i) => [`sibling ${i}`, i * 100, true] as [string, number, boolean]),
      ["sibling null volume", null, true],
    ],
  });
  const users: TestUser[] = [];
  try {
    const user = await createUser("add-absent");
    users.push(user);
    const res = await add(user, { keyword: noOverview, location_code: 2840, devices: ["desktop", "mobile", "desktop"] });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.results.map((r: any) => [r.device, r.status, r.overview_present]), [["desktop", "watching", false], ["mobile", "watching", false]]);
    assertEquals(stub.count(LIVE_PATH), 2);
    assertEquals(stub.count(RELATED_PATH), 1);
    assertEquals(body.siblings.length, 10);
    assertEquals(body.siblings[0], { keyword: "sibling 11", search_volume: 1100 });
    assert(!body.siblings.some((s: any) => normalizeKeyword(s.keyword) === noOverview || s.keyword === "form builder no ai"));

    const failed = (await (await add(user, { keyword: broken, location_code: 2276, devices: ["mobile"] })).json()).results[0];
    assertEquals([failed.status, failed.overview_present], ["watching", false]);
    assert(failed.capture_error.includes("40200"));
    const tq = must(await serviceClient().from("tracked_queries").select("status").eq("id", failed.tracked_query_id).single(), "tq") as any;
    assertEquals(tq.status, "watching");
    const series = must(await serviceClient().from("series").select("language_code").eq("id", failed.series_id).single(), "series") as any;
    assertEquals(series.language_code, "de", "language defaults to the location's");
    const capture = must(await serviceClient().from("captures").select("status, attempts, last_error").eq("series_id", failed.series_id).single(), "capture") as any;
    assertEquals([capture.status, capture.attempts], ["pending", 1], "left for the sweeper to resubmit");
  } finally {
    await stub.close();
    await cleanup(users, await seriesIdsFor([noOverview, broken]));
  }
});

Deno.test("add-query validates its input", async () => {
  const users: TestUser[] = [];
  try {
    const user = await createUser("add-invalid");
    users.push(user);
    const status = async (body: unknown, u: TestUser | null = user) => (await add(u, body)).status;
    assertEquals(await status({ keyword: "best crm", location_code: 2840, devices: ["desktop"] }, null), 401);
    assertEquals(await status({ keyword: "site:example.com crm", location_code: 2840, devices: ["desktop"] }), 400);
    assertEquals(await status({ keyword: "   ", location_code: 2840, devices: ["desktop"] }), 400);
    assertEquals(await status({ keyword: "best crm", location_code: 1, devices: ["desktop"] }), 400);
    assertEquals(await status({ keyword: "best crm", location_code: 2840, devices: [] }), 400);
    assertEquals(await status({ keyword: "best crm", location_code: 2840, devices: ["tablet"] }), 400);
    assertEquals(await status({ keyword: "best crm", location_code: 2840, language_code: "en; drop", devices: ["mobile"] }), 400);
  } finally {
    await cleanup(users, []);
  }
});
