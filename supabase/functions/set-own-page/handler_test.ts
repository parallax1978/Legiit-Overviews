import { assert, assertEquals } from "@std/assert";
import { must, serviceClient } from "../_shared/db.ts";
import { ingestTask } from "../_shared/ingest.ts";
import {
  cleanup,
  createCapture,
  createSeries,
  createTrackedQuery,
  createUser,
  fixtureResult,
  okTask,
  startStubDfs,
  type TestUser,
  uniqueKeyword,
  userClient,
  userRequest,
} from "../_shared/capture_testkit.ts";
import { handle } from "./handler.ts";

const OWN_URL = "https://www.jotform.com/blog/best-form-builders/";
const OWN_PAGE = "# Best form builders\n\n## Our top pick\n\nJotform offers over 10,000 templates and a free plan that includes 5 forms and 100 monthly submissions.\n";

Deno.test("set-own-page saves the page, parses it and re-matches recent captures", async () => {
  const stub = startStubDfs({ pages: { [OWN_URL]: OWN_PAGE } });
  const series = await createSeries(uniqueKeyword("own"));
  const users: TestUser[] = [];
  try {
    const [user, stranger] = [await createUser("own"), await createUser("own-stranger")];
    users.push(user, stranger);
    const tq = await createTrackedQuery(user.id, series.id, { display_keyword: "best form builder" });
    const at = new Date(Date.now() - 2 * 3_600_000);
    const capture = await createCapture(series.id, { scheduled_at: at.toISOString() });
    const result = { ...fixtureResult("synthetic-form-builders.json"), datetime: at.toISOString().replace("T", " ").replace(/\.\d+Z$/, " +00:00") };
    const ingested = await ingestTask(capture.id, okTask(capture.id, result));

    const set = (u: TestUser | null, body: Record<string, unknown>) => handle(userRequest("set-own-page", u, { tracked_query_id: tq.id, ...body }));
    assertEquals((await set(null, { own_url: OWN_URL, brand_names: [] })).status, 401);
    assertEquals((await set(stranger, { own_url: OWN_URL, brand_names: [] })).status, 404);
    assertEquals((await set(user, { own_url: "ftp://example.com/x", brand_names: [] })).status, 400);
    assertEquals((await set(user, { own_url: OWN_URL, brand_names: Array.from({ length: 11 }, (_, i) => `b${i}`) })).status, 400);
    assertEquals((await set(user, { own_url: OWN_URL, brand_names: ["X"] })).status, 400, "one character");
    assertEquals((await set(user, { own_url: OWN_URL, brand_names: ["🙂"] })).status, 400, "one character, two UTF-16 units");
    assertEquals((await set(user, { own_url: OWN_URL, brand_names: ["a".repeat(61)] })).status, 400);
    assertEquals((await handle(userRequest("set-own-page", user, { tracked_query_id: "x" }))).status, 400);

    const res = await set(user, { own_url: ` ${OWN_URL} `, brand_names: [" Typeform ", "typeform", "", "Tally"] });
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true, parsed: true, matches: 1 });
    const row = must(await serviceClient().from("tracked_queries").select("own_url, own_url_key, brand_names").eq("id", tq.id).single(), "tq") as any;
    assertEquals(row, { own_url: OWN_URL, own_url_key: "jotform.com/blog/best-form-builders", brand_names: ["Typeform", "Tally"] });
    const match = must(await serviceClient().from("own_matches").select("*").eq("tracked_query_id", tq.id).single(), "match") as any;
    assertEquals([match.snapshot_id, match.level, match.quoted_heading, match.brand_mentioned], [ingested.snapshot_id, "exact_url", "Our top pick", true]);
    const events = must(await serviceClient().from("citation_events").select("kind").eq("tracked_query_id", tq.id), "events") as any[];
    assertEquals(events.map((e) => e.kind).sort(), ["brand_mention", "first_seen"]);

    // Saving again re-matches without new events, and keeps matches older than the 28 days re-matched.
    const old = must(
      await serviceClient().from("snapshots").insert({ series_id: series.id, captured_at: new Date(Date.now() - 40 * 86_400_000).toISOString(), status: "present" })
        .select("id").single(),
      "old snapshot",
    ) as { id: string };
    must(await serviceClient().from("own_matches").insert({ tracked_query_id: tq.id, snapshot_id: old.id, level: "exact_url" }), "old match");
    assertEquals(await (await set(user, { own_url: OWN_URL, brand_names: ["Typeform"] })).json(), { ok: true, parsed: true, matches: 1 });
    assertEquals((await serviceClient().from("citation_events").select("id").eq("tracked_query_id", tq.id)).data?.length, 2);
    assertEquals((await serviceClient().from("own_matches").select("level").eq("snapshot_id", old.id)).data, [{ level: "exact_url" }]);

    // Brand names written directly through the column grant are held to the same rules.
    const direct = (brand_names: string[]) => userClient(user).from("tracked_queries").update({ brand_names }).eq("id", tq.id);
    for (const bad of [Array.from({ length: 11 }, (_, i) => `brand ${i}`), ["a".repeat(61)], ["X"], [" Acme"], ["Acme", "ACME"]]) {
      assertEquals((await direct(bad)).error?.code, "23514", JSON.stringify(bad).slice(0, 40));
    }
    assertEquals((await direct(["Typeform", "Tally"])).error, null);

    // A page DataForSEO can't parse is saved anyway.
    const missing = "https://www.jotform.com/blog/missing/";
    assertEquals(await (await set(user, { own_url: missing, brand_names: [] })).json(), { ok: true, parsed: false, matches: 1 });
    const page = must(await serviceClient().from("own_pages").select("url, markdown").eq("tracked_query_id", tq.id).single(), "page") as any;
    assertEquals(page, { url: missing, markdown: null });
    const sameDomain = must(await serviceClient().from("own_matches").select("level").eq("tracked_query_id", tq.id).single(), "match") as any;
    assertEquals(sameDomain.level, "same_host", "the old page's matches, the 40-day one included, are gone");

    assertEquals(await (await set(user, { own_url: null, brand_names: [] })).json(), { ok: true, parsed: false, matches: 0 });
    assertEquals((await serviceClient().from("own_pages").select("url").eq("tracked_query_id", tq.id)).data, []);
    assert((await serviceClient().from("own_matches").select("level").eq("tracked_query_id", tq.id)).data?.length === 0);
  } finally {
    await stub.close();
    await cleanup(users, [series.id]);
  }
});
