import { assert, assertEquals, assertRejects } from "@std/assert";
import { must, serviceClient } from "./db.ts";
import { ingestTask } from "./ingest.ts";
import { normalizeUrl } from "./normalize.ts";
import { matchSnapshot, parseOwnPage, refreshOwnPages, rematch } from "./tracking.ts";
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
} from "./capture_testkit.ts";

const db = () => serviceClient();
const HOUR = 3_600_000;
const OWN_URL = "https://www.jotform.com/blog/best-form-builders/";
const OWN_PAGE = `# The 12 best online form builders

Choosing a form builder starts with what you need to collect.

## Our top pick

Jotform offers over 10,000 templates and a free plan that includes 5 forms and 100 monthly submissions.

## Pricing

Paid plans start at $34 per month.
`;

/** DataForSEO's datetime format. */
function dfsDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " +00:00");
}

function resultAt(fixture: string, at: Date): any {
  return { ...fixtureResult(fixture), datetime: dfsDate(at) };
}

async function ingestAt(seriesId: string, fixture: string, at: Date): Promise<string> {
  const capture = await createCapture(seriesId, { scheduled_at: at.toISOString() });
  const r = await ingestTask(capture.id, okTask(capture.id, resultAt(fixture, at)));
  return r.snapshot_id!;
}

async function events(tqId: string) {
  return must(await db().from("citation_events").select("*").eq("tracked_query_id", tqId).order("created_at"), "events") as any[];
}

async function notifications(tqId: string) {
  return must(await db().from("notifications").select("*").eq("tracked_query_id", tqId).order("created_at"), "notifications") as any[];
}

Deno.test("matchSnapshot picks the best level, the quoted heading and brands", () => {
  const tq = { id: "t", own_url_key: normalizeUrl(OWN_URL), brand_names: ["Tally Forms", "Jotform"] };
  const page = { markdown: OWN_PAGE, resolved_url: null };
  const passage = "Jotform offers over 10,000 templates and a free plan that includes 5 forms and 100 monthly submissions.";
  const citations = [
    { idx: 0, url_key: "jotform.com/pricing", passage: null },
    { idx: 1, url_key: "jotform.com/blog/best-form-builders", passage },
    { idx: 2, url_key: "jotform.com/blog/best-form-builders/page-2", passage: null },
  ];
  assertEquals(matchSnapshot(tq, page, citations, "Jotform is popular."), {
    level: "exact_url",
    citation_idx: 1,
    brand_mentioned: true,
    brand_name: "Jotform",
    quoted_heading: "Our top pick",
  });
  assertEquals(matchSnapshot(tq, page, [citations[2]], "").level, "path_prefix");
  assertEquals(matchSnapshot(tq, page, [{ idx: 4, url_key: "help.jotform.com/x", passage }], "").level, "same_domain");
  assertEquals(matchSnapshot(tq, page, [{ idx: 4, url_key: "help.jotform.com/x", passage }], "").quoted_heading, null);
  assertEquals(matchSnapshot(tq, page, [{ idx: 0, url_key: "typeform.com", passage: null }], "Tally forms are free").brand_name, "Tally Forms");
  assertEquals(matchSnapshot(tq, page, [], "Jotformation").brand_mentioned, false);

  const medium = { id: "m", own_url_key: "medium.com/@me/my-post", brand_names: [] };
  assertEquals(matchSnapshot(medium, null, [{ idx: 0, url_key: "medium.com/@other/post", passage: null }], "").level, null);
  const redirected = { markdown: null, resolved_url: "https://www.jotform.com/blog/best-form-builders-2026/" };
  assertEquals(matchSnapshot(tq, redirected, [{ idx: 3, url_key: "jotform.com/blog/best-form-builders-2026", passage }], "").level, "exact_url");
});

Deno.test("a capture cited at exact_url creates one first_seen event and notification, even when ingested twice", async () => {
  const series = await createSeries(uniqueKeyword("tracking"));
  const users: TestUser[] = [];
  try {
    const user = await createUser("tracking");
    users.push(user);
    const tq = await createTrackedQuery(user.id, series.id, {
      display_keyword: "Best Form Builder",
      own_url: OWN_URL,
      own_url_key: normalizeUrl(OWN_URL),
      brand_names: ["Typeform"],
    });
    must(await db().from("own_pages").insert({ tracked_query_id: tq.id, url: OWN_URL, parsed_at: new Date().toISOString(), markdown: OWN_PAGE }), "own page");
    // Someone else tracking the same series without an own page gets no rows.
    const other = await createUser("tracking-other");
    users.push(other);
    const otherTq = await createTrackedQuery(other.id, series.id);

    const now = Date.now();
    const capture = await createCapture(series.id, { scheduled_at: new Date(now - 6 * HOUR).toISOString() });
    const task = okTask(capture.id, resultAt("synthetic-form-builders.json", new Date(now - 6 * HOUR)));
    const first = await ingestTask(capture.id, task);
    await ingestTask(capture.id, task);

    const match = must(await db().from("own_matches").select("*").eq("tracked_query_id", tq.id), "matches") as any[];
    assertEquals(match.length, 1);
    assertEquals([match[0].snapshot_id, match[0].level, match[0].quoted_heading, match[0].brand_mentioned], [first.snapshot_id, "exact_url", "Our top pick", true]);
    const cited = must(await db().from("citations").select("url_key").eq("snapshot_id", first.snapshot_id).eq("idx", match[0].citation_idx).single(), "citation") as any;
    assertEquals(cited.url_key, "jotform.com/blog/best-form-builders");
    assertEquals((await db().from("own_matches").select("*").eq("tracked_query_id", otherTq.id)).data, []);

    let ev = await events(tq.id);
    assertEquals(ev.map((e) => e.kind).sort(), ["brand_mention", "first_seen"]);
    const firstSeen = ev.find((e) => e.kind === "first_seen");
    assertEquals([firstSeen.level, firstSeen.quoted_heading, firstSeen.snapshot_id], ["exact_url", "Our top pick", first.snapshot_id]);
    assertEquals(new Date(firstSeen.created_at).getTime(), new Date(now - 6 * HOUR).setMilliseconds(0), "timed at the render");
    let notes = await notifications(tq.id);
    const cites = notes.filter((n) => n.kind === "first_seen");
    assertEquals(cites.length, 1);
    assertEquals(cites[0].title, "Cited: Best Form Builder");
    assertEquals(cites[0].body, "Google's AI Overview cited your page (exact URL) under “Our top pick”.");
    assertEquals(cites[0].link, `/queries/${tq.id}/tracking`);
    assertEquals(cites[0].user_id, user.id);

    // A later capture citing the page again is not news.
    await ingestAt(series.id, "synthetic-form-builders.json", new Date(now - 3 * HOUR));
    assertEquals((await events(tq.id)).length, 2);

    // After a lost event, the next citation is a regain.
    must(await db().from("citation_events").insert({ tracked_query_id: tq.id, kind: "lost", created_at: new Date(now - 2 * HOUR).toISOString() }), "lost");
    const regainedSnap = await ingestAt(series.id, "synthetic-form-builders.json", new Date(now - HOUR));
    ev = await events(tq.id);
    const regained = ev.filter((e) => e.kind === "regained");
    assertEquals(regained.length, 1);
    assertEquals(regained[0].snapshot_id, regainedSnap);
    notes = await notifications(tq.id);
    assertEquals(notes.filter((n) => n.kind === "regained").map((n) => n.title), ["Cited again: Best Form Builder"]);
    assertEquals(notes.filter((n) => n.kind === "first_seen").length, 1);
  } finally {
    await cleanup(users, [series.id]);
  }
});

Deno.test("rematch rebuilds 28 days of matches with one history event", async () => {
  const series = await createSeries(uniqueKeyword("rematch"));
  const users: TestUser[] = [];
  try {
    const user = await createUser("rematch");
    users.push(user);
    const tq = await createTrackedQuery(user.id, series.id, { display_keyword: "best form builder" });
    const now = Date.now();
    await ingestAt(series.id, "synthetic-form-builders.json", new Date(now - 40 * 24 * HOUR));
    const absent = await ingestAt(series.id, "synthetic-absent.json", new Date(now - 5 * 24 * HOUR));
    const firstCited = await ingestAt(series.id, "synthetic-form-builders.json", new Date(now - 3 * 24 * HOUR));
    // Cites jotform.com/help/...: the same host as the own page.
    const sameHost = await ingestAt(series.id, "synthetic-sections.json", new Date(now - 2 * 24 * HOUR));
    const lastCited = await ingestAt(series.id, "synthetic-form-builders.json", new Date(now - 24 * HOUR));
    assertEquals(await events(tq.id), [], "no own page yet, so nothing matched");

    must(await db().from("tracked_queries").update({ own_url: OWN_URL, own_url_key: normalizeUrl(OWN_URL) }).eq("id", tq.id), "set url");
    assertEquals(await rematch(tq.id), 3);
    const rows = must(await db().from("own_matches").select("snapshot_id, level").eq("tracked_query_id", tq.id), "rows") as any[];
    assertEquals(rows.length, 4, "four renders in the window");
    assertEquals(rows.filter((r) => r.level === "exact_url").map((r) => r.snapshot_id).sort(), [firstCited, lastCited].sort());
    assertEquals(rows.find((r) => r.snapshot_id === sameHost).level, "same_host");
    assertEquals(rows.find((r) => r.snapshot_id === absent).level, null);

    const ev = await events(tq.id);
    assertEquals(ev.length, 1);
    assertEquals([ev[0].kind, ev[0].snapshot_id], ["first_seen", firstCited]);
    assertEquals(new Date(ev[0].created_at).getTime(), new Date(now - 3 * 24 * HOUR).setMilliseconds(0));
    assertEquals((await notifications(tq.id)).length, 1);

    assertEquals(await rematch(tq.id), 3);
    assertEquals((await events(tq.id)).length, 1);
    assertEquals((await notifications(tq.id)).length, 1);

    must(await db().from("tracked_queries").update({ own_url: null, own_url_key: null, brand_names: [] }).eq("id", tq.id), "clear");
    assertEquals(await rematch(tq.id), 0);
    assertEquals((await db().from("own_matches").select("*").eq("tracked_query_id", tq.id)).data, []);
  } finally {
    await cleanup(users, [series.id]);
  }
});

Deno.test("own pages are parsed, reset when a new URL fails, and refreshed weekly", async () => {
  const series = await createSeries(uniqueKeyword("own-page"));
  const users: TestUser[] = [];
  const good = "https://example.com/forms/best-builders";
  const stub = startStubDfs({ pages: { [good]: OWN_PAGE } });
  try {
    const user = await createUser("own-page");
    users.push(user);
    const tq = await createTrackedQuery(user.id, series.id, { own_url: good, own_url_key: normalizeUrl(good) });
    const page = async () => must(await db().from("own_pages").select("*").eq("tracked_query_id", tq.id).maybeSingle(), "own page") as any;

    assertEquals((await parseOwnPage(tq.id))!.url, good);
    let row = await page();
    assertEquals(row.markdown, OWN_PAGE);
    assertEquals(row.outline.map((o: any) => o.text), ["The 12 best online form builders", "Our top pick", "Pricing"]);
    assert(row.parsed_at);

    const missing = "https://example.com/forms/missing";
    must(await db().from("tracked_queries").update({ own_url: missing }).eq("id", tq.id), "set url");
    await assertRejects(() => parseOwnPage(tq.id));
    row = await page();
    assertEquals([row.url, row.markdown, row.parsed_at], [missing, null, null]);

    must(await db().from("tracked_queries").update({ own_url: good }).eq("id", tq.id), "set url");
    const old = new Date(Date.now() - 8 * 24 * HOUR).toISOString();
    must(await db().from("own_pages").update({ url: good, parsed_at: old, markdown: "stale" }).eq("tracked_query_id", tq.id), "age");
    assertEquals(await refreshOwnPages(5, [series.id]), { parsed: 1, failed: 0 });
    row = await page();
    assertEquals(row.markdown, OWN_PAGE);
    assert(Date.parse(row.parsed_at) > Date.now() - HOUR);

    must(await db().from("tracked_queries").update({ own_url: missing }).eq("id", tq.id), "set url");
    must(await db().from("own_pages").update({ url: missing, parsed_at: old }).eq("tracked_query_id", tq.id), "age");
    assertEquals(await refreshOwnPages(5, [series.id]), { parsed: 0, failed: 1 });
    row = await page();
    assertEquals(row.markdown, OWN_PAGE, "a failed re-parse keeps the old content");
    assert(Date.parse(row.parsed_at) > Date.now() - HOUR);

    must(await db().from("tracked_queries").update({ own_url: null }).eq("id", tq.id), "clear url");
    assertEquals(await parseOwnPage(tq.id), null);
    assertEquals(await page(), null);
  } finally {
    await stub.close();
    await cleanup(users, [series.id]);
  }
});
