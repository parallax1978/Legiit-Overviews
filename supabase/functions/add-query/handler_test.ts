import { assert, assertEquals } from "@std/assert";
import { must, serviceClient } from "../_shared/db.ts";
import {
  cleanup,
  createCapture,
  createSeries,
  createTrackedQuery,
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

const HOUR = 3_600_000;
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

Deno.test("concurrent adds of one new keyword make one Live call; the second sees the capture in flight", async () => {
  const stub = startStubDfs({ liveDelayMs: 1500 });
  const keyword = uniqueKeyword("race");
  const users: TestUser[] = [];
  try {
    const [a, b] = [await createUser("race-a"), await createUser("race-b")];
    users.push(a, b);
    const body = { keyword, location_code: 2840, devices: ["desktop"] };
    const first = add(a, body);
    await new Promise((r) => setTimeout(r, 500));
    const second = add(b, body);
    const [resA, resB] = await Promise.all([first, second]);
    const [rA] = (await resA.json()).results;
    const bodyB = await resB.json();
    const [rB] = bodyB.results;
    assertEquals(stub.count(LIVE_PATH), 1, "the second add does not pay for another render");
    assertEquals([rA.overview_present, rA.status, rA.capture_pending], [true, "tracking", undefined]);
    assertEquals([rB.series_id, rB.overview_present, rB.capture_pending], [rA.series_id, false, true]);
    assertEquals([bodyB.siblings, stub.count(RELATED_PATH)], [[], 0], "no siblings while the render is still on its way");
    const captures = must(await serviceClient().from("captures").select("id").eq("series_id", rA.series_id), "captures") as any[];
    assertEquals(captures.length, 1);
    const tqB = must(await serviceClient().from("tracked_queries").select("status").eq("id", rB.tracked_query_id).single(), "tq") as any;
    assertEquals(tqB.status, "tracking", "the first add's render flipped the second user's query");
  } finally {
    await stub.close();
    await cleanup(users, await seriesIdsFor([keyword]));
  }
});

Deno.test("a scheduled capture under way counts as fresh; a Live on a series that fell behind replaces its catch-up slot", async () => {
  const stub = startStubDfs();
  const users: TestUser[] = [];
  const seriesIds: string[] = [];
  try {
    const user = await createUser("add-behind");
    users.push(user);
    const body = (keyword: string) => ({ keyword, location_code: 2840, devices: ["desktop"] });

    // A scheduled capture posted 20 minutes ago, no render yet: no Live call, no siblings.
    const busy = uniqueKeyword("busy");
    const busySeries = await createSeries(busy);
    seriesIds.push(busySeries.id);
    await createCapture(busySeries.id, { scheduled_at: new Date(Date.now() - 20 * 60_000).toISOString(), status: "submitted", task_id: "t" });
    const resBusy = await (await add(user, body(busy))).json();
    assertEquals([resBusy.results[0].capture_pending, resBusy.results[0].overview_present, resBusy.siblings], [true, false, []]);
    assertEquals([stub.count(LIVE_PATH), stub.count(RELATED_PATH)], [0, 0]);

    // Every tracker paused for days: next_capture_at is 2 days (and 17 minutes) behind. Adding the
    // query captures live now and moves the series to its next own slot at least 3 hours ahead, so
    // schedule-captures does not post a second render minutes later.
    const behind = uniqueKeyword("behind");
    const was = Date.now() - 2 * 24 * HOUR - 17 * 60_000;
    const behindSeries = await createSeries(behind, { next_capture_at: new Date(was).toISOString() });
    seriesIds.push(behindSeries.id);
    await createTrackedQuery(user.id, behindSeries.id, { status: "paused" });
    const resBehind = await (await add(user, body(behind))).json();
    assertEquals([resBehind.results[0].overview_present, resBehind.results[0].status, stub.count(LIVE_PATH)], [true, "tracking", 1]);
    const series = must(await serviceClient().from("series").select("next_capture_at").eq("id", behindSeries.id).single(), "series") as any;
    const next = Date.parse(series.next_capture_at);
    assert(next >= Date.now() + 3 * HOUR - 5000 && next < Date.now() + 6 * HOUR, `next slot at least 3 hours ahead: ${series.next_capture_at}`);
    assertEquals((next - was) % (3 * HOUR), 0, "the series keeps its own offset");
    const due = must(await serviceClient().rpc("claim_due_captures", { p_limit: 10, p_series_ids: [behindSeries.id] }), "claim") as any[];
    assertEquals(due, [], "nothing to catch up");
    const captures = must(await serviceClient().from("captures").select("source").eq("series_id", behindSeries.id), "captures") as any[];
    assertEquals(captures.map((c) => c.source), ["live"]);
  } finally {
    await stub.close();
    await cleanup(users, seriesIds);
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
    assertEquals(await status({ keyword: "best crm site：hubspot.com", location_code: 2840, devices: ["desktop"] }), 400, "full-width operators are rejected too");
    assertEquals(await status({ keyword: "   ", location_code: 2840, devices: ["desktop"] }), 400);
    assertEquals(await status({ keyword: "best crm", location_code: 1, devices: ["desktop"] }), 400);
    assertEquals(await status({ keyword: "best crm", location_code: 2840, devices: [] }), 400);
    assertEquals(await status({ keyword: "best crm", location_code: 2840, devices: ["tablet"] }), 400);
    assertEquals(await status({ keyword: "best crm", location_code: 2840, language_code: "en; drop", devices: ["mobile"] }), 400);
  } finally {
    await cleanup(users, []);
  }
});
