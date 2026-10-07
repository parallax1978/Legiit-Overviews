import { assert, assertEquals } from "@std/assert";
import { serviceClient } from "../_shared/db.ts";
import { normalizeUrl } from "../_shared/normalize.ts";
import { buildReports, EXTRACTION_WAIT_MS, handle, type PageDetail, pageUrl, selectPages } from "./handler.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

Deno.test("selectPages: top 10 non-platform sources plus the own page", () => {
  const sources = Array.from({ length: 13 }, (_, i) => ({
    url_key: `site${i}.com/p`, url: `https://site${i}.com/p`, reg_domain: `site${i}.com`, title: null,
    renders: 13 - i, share: (13 - i) / 13, bucket: "rotating" as const, platform: i === 1, organic_top10_share: 0,
  }));
  const { refs, shares } = selectPages(sources, { url: "https://www.Own.com/page/" });
  assertEquals(refs.length, 11);
  assert(!refs.some((r) => r.url_key === "site1.com/p"), "platform sources are left out");
  assertEquals(refs[9].url_key, "site10.com/p");
  assertEquals(refs[10], { url_key: "own.com/page", url: "https://www.Own.com/page/" });
  assertEquals(shares.get("own.com/page"), 0);
  // An own page that is already among the top sources is not added twice.
  assertEquals(selectPages(sources, { url: "https://site0.com/p" }).refs.length, 10);
});

Deno.test("pageUrl: only a URL that normalises to the key is fetched", () => {
  assertEquals(pageUrl("a.com/x", { url: "https://www.a.com/x/" }, "https://a.com/x?utm_source=g"), "https://www.a.com/x/");
  // A stored URL under someone else's key is passed over for the cited URL, then the key itself.
  assertEquals(pageUrl("a.com/x", { url: "https://attacker.example/x" }, "https://a.com/x?utm_source=g"), "https://a.com/x?utm_source=g");
  assertEquals(pageUrl("a.com/x", { url: "https://attacker.example/x" }, undefined), "https://a.com/x");
  assertEquals(pageUrl("A.com/X Y", undefined, undefined), null);
});

Deno.test("build-reports rejects calls without the cron secret", async () => {
  const res = await handle(new Request("http://x/build-reports", { method: "POST" }));
  assertEquals(res.status, 401);
});

Deno.test("build-reports: creation rules, page selection, passages and stage moves", async (t) => {
  const db = serviceClient();
  const tag = `br${crypto.randomUUID().slice(0, 8)}`;
  const host = `${tag}.example.com`;
  const urlFor = (i: number) => `https://${host}/page-${i}`;
  const passageFor = (i: number) => `Passage number ${i} says the best form builder is Jotform for most teams.`;
  const ownUrl = `https://own-${host}/our-page`;
  const victimKey = `victim-${host}/best-page`;

  // Stub DataForSEO: page i holds its passage under "Section i"; page 9 is gone (HTTP 404).
  const parsed: string[] = [];
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const url: string = (await req.json())[0].url;
    parsed.push(url);
    const i = Number(url.match(/page-(\d+)$/)?.[1] ?? -1);
    const markdown = `# Best form builders\n\nIntro text about form builders.\n\n## Section ${i}\n\n${passageFor(i)}\n\n## Other\n\nMore text.\n`;
    return Response.json({
      status_code: 20000, status_message: "Ok.", tasks: [{
        id: "t", status_code: 20000, status_message: "Ok.", data: {},
        result: [{ items: [{ status_code: i === 9 ? 404 : 200, page_content: null, page_as_markdown: markdown }] }],
      }],
    });
  });
  Deno.env.set("DATAFORSEO_BASE_URL", `http://127.0.0.1:${server.addr.port}`);

  const now = new Date(Math.floor(Date.now() / HOUR) * HOUR);
  const { data: created, error: userError } = await db.auth.admin.createUser({ email: `${tag}@example.com`, password: `pw-${tag}-x1!`, email_confirm: true });
  if (userError) throw userError;
  const userId = created.user!.id;
  const seriesIds: string[] = [];
  try {
    // Series A: 4 days of history. Series B: 8 days, 8 captures a day, citing 12 pages at falling
    // rates (page i in captures where n % 12 >= i) plus YouTube in every capture.
    const series = (await db.from("series").insert([
      { keyword: `${tag} short history`, location_code: 2840, language_code: "en", device: "desktop", next_capture_at: "2030-01-01" },
      { keyword: `${tag} long history`, location_code: 2840, language_code: "en", device: "desktop", next_capture_at: "2030-01-01" },
    ]).select("id").throwOnError()).data!;
    const [sa, sb] = series.map((s: { id: string }) => s.id);
    seriesIds.push(sa, sb);

    const snapsA = Array.from({ length: 4 }, (_, n) => ({
      series_id: sa, captured_at: new Date(now.getTime() - 4 * DAY + n * DAY).toISOString(), status: "present", content_hash: `a${n}`, extraction: "done",
    }));
    // The last capture of series B is still being extracted.
    const snapsB = Array.from({ length: 64 }, (_, n) => ({
      series_id: sb, captured_at: new Date(now.getTime() - 8 * DAY + n * 3 * HOUR + HOUR).toISOString(), status: "present", content_hash: `b${n % 5}`,
      extraction: n === 63 ? "pending" : "done",
    }));
    // An error render before the history starts must not count as history.
    snapsA.unshift({ series_id: sa, captured_at: new Date(now.getTime() - 9 * DAY).toISOString(), status: "error", content_hash: "", extraction: "none" });
    const insertedA = (await db.from("snapshots").insert(snapsA).select("id, captured_at").throwOnError()).data!;
    const insertedB = (await db.from("snapshots").insert(snapsB).select("id, captured_at").order("captured_at").throwOnError()).data!;
    const citations: Record<string, unknown>[] = [];
    insertedB.forEach((s: { id: string }, n: number) => {
      let idx = 0;
      for (let i = 0; i < 12; i++) {
        if (n % 12 >= i) {
          citations.push({ snapshot_id: s.id, idx: idx++, url: urlFor(i), url_key: normalizeUrl(urlFor(i)), host, reg_domain: "example.com", passage: passageFor(i) });
        }
      }
      citations.push({ snapshot_id: s.id, idx: idx++, url: "https://www.youtube.com/watch?v=zz", url_key: "youtube.com/watch?v=zz", host: "youtube.com", reg_domain: "youtube.com", passage: null });
    });
    insertedA.filter((_: unknown, i: number) => i > 0).forEach((s: { id: string }) => {
      citations.push({ snapshot_id: s.id, idx: 0, url: urlFor(20), url_key: normalizeUrl(urlFor(20)), host, reg_domain: "example.com", passage: passageFor(20) });
    });
    await db.from("citations").insert(citations).throwOnError();

    const tqs = (await db.from("tracked_queries").insert([
      { user_id: userId, series_id: sa, display_keyword: "short history" },
      // own_url_key is user-writable: it must never decide which cached page the own URL is stored under.
      { user_id: userId, series_id: sb, display_keyword: "long history", own_url: ownUrl, own_url_key: victimKey },
    ]).select("id, series_id").throwOnError()).data!;
    const tqA = tqs.find((q: { series_id: string }) => q.series_id === sa)!.id;
    const tqB = tqs.find((q: { series_id: string }) => q.series_id === sb)!.id;
    const scope = [tqA, tqB];
    const reportOf = async (tq: string, kind: string) =>
      (await db.from("reports").select("*").eq("tracked_query_id", tq).eq("kind", kind).maybeSingle().throwOnError()).data;

    await t.step("day 4 gets a preliminary report, day 8 only a full one; metrics wait for extraction", async () => {
      let s = await buildReports({ now, trackedQueryIds: scope, parseBudget: 0 });
      assertEquals(s.created.map((c) => `${c.tracked_query_id === tqA ? "A" : "B"}:${c.kind}`).sort(), ["A:preliminary", "B:full"]);
      assertEquals([s.metrics, s.waiting_extraction], [1, 1]);
      assertEquals((await reportOf(tqB, "full")).metrics, null, "a capture in the window is still being extracted");
      // Past the wait, the metrics are computed anyway, counting the capture as not yet extracted.
      s = await buildReports({ now: new Date(now.getTime() + EXTRACTION_WAIT_MS + HOUR), trackedQueryIds: [tqB], parseBudget: 0 });
      assertEquals([s.metrics, s.waiting_extraction], [1, 0]);
      const pre = await reportOf(tqA, "preliminary");
      assertEquals(Date.parse(pre.window_end), now.getTime());
      assertEquals(Date.parse(pre.window_start), now.getTime() - 3 * DAY);
      assertEquals(pre.renders, 3, "captures at days -3, -2, -1 fall in the 3-day window");
      assertEquals(pre.metrics.renders, 3);
      const full = await reportOf(tqB, "full");
      assertEquals(Date.parse(full.window_start), now.getTime() - 7 * DAY);
      assertEquals(full.renders, 56);
      assertEquals(full.metrics.present, 56);
      assertEquals([full.metrics.extracted, full.metrics.extraction_pending], [55, 1]);
      assertEquals(await reportOf(tqB, "preliminary"), null, "a query past day 7 skips the preliminary report");
    });

    await t.step("a second run creates nothing", async () => {
      const s = await buildReports({ now: new Date(now.getTime() + HOUR), trackedQueryIds: scope, parseBudget: 0 });
      assertEquals(s.created, []);
      const { count } = await db.from("reports").select("id", { count: "exact", head: true }).in("tracked_query_id", scope);
      assertEquals(count, 2);
    });

    await t.step("page selection: top 10 non-platform pages plus the own page, passages located", async () => {
      // A cached row stored under page 0's key with another URL (written before keys were checked).
      await db.from("pages").insert({
        url_key: normalizeUrl(urlFor(0)), url: `https://attacker-${host}/x`, reg_domain: "example.com", parse_status: "ok",
        parsed_at: new Date().toISOString(), markdown: "Attacker content", tag_status: "done",
      }).throwOnError();
      const s = await buildReports({ now, trackedQueryIds: [tqB], parseBudget: 20 });
      assertEquals(s.parsed, 10);
      assertEquals(s.parse_failed, 1);
      assertEquals(parsed.length, 11);
      const full = await reportOf(tqB, "full");
      assertEquals(full.stage, "pages", "pages are parsed but not tagged yet");
      const expected = [...Array.from({ length: 10 }, (_, i) => normalizeUrl(urlFor(i))), normalizeUrl(ownUrl)];
      assertEquals(full.page_urls, expected);
      const details = full.page_details as PageDetail[];
      assertEquals(details.map((d) => d.ref), expected.map((_, i) => `P${i + 1}`));
      assertEquals(details[0].share, 1);
      assertEquals(details[10].share, 0);
      assertEquals(details[10].passages, [], "the own page was never cited");
      assertEquals(details[3].passages.length, 1);
      assertEquals(details[3].passages[0].found, true);
      assertEquals(details[3].passages[0].heading, "Section 3");
      assertEquals(details[3].passages[0].url_key, expected[3]);
      assertEquals(details[9].passages[0].found, false, "page 9 failed to parse");
      // The own page is cached under its URL's key, never the stored own_url_key; the foreign row is re-parsed.
      const { data: victim } = await db.from("pages").select("url_key").eq("url_key", victimKey).throwOnError();
      assertEquals(victim, []);
      assert(!parsed.some((u) => u.includes("attacker")));
      const { data: page0 } = await db.from("pages").select("url, markdown, tag_status").eq("url_key", normalizeUrl(urlFor(0))).single().throwOnError();
      assertEquals([page0!.url, page0!.tag_status], [urlFor(0), "none"]);
      assert(page0!.markdown.includes(passageFor(0)));
    });

    await t.step("the report moves to the brief once every parsed page is tagged", async () => {
      const keys = (await reportOf(tqB, "full")).page_urls as string[];
      await db.from("pages").update({ tag_status: "done" }).in("url_key", keys.slice(0, 5)).eq("parse_status", "ok").throwOnError();
      let s = await buildReports({ now, trackedQueryIds: [tqB] });
      assertEquals(s.waiting, 1);
      assertEquals(s.parsed, 0, "nothing is parsed twice");
      assertEquals((await reportOf(tqB, "full")).stage, "pages");
      await db.from("pages").update({ tag_status: "failed" }).in("url_key", keys.slice(5)).eq("parse_status", "ok").throwOnError();
      s = await buildReports({ now, trackedQueryIds: [tqB] });
      assertEquals(s.advanced, 1);
      const full = await reportOf(tqB, "full");
      assertEquals(full.stage, "brief");
      assertEquals(full.brief_submitted, false);
    });

    await t.step("a report whose pages have not settled 6 hours after they were attempted moves on anyway", async () => {
      // Never attempted (no parse budget): no escape, however old the report.
      let s = await buildReports({ now: new Date(now.getTime() + 7 * HOUR), trackedQueryIds: [tqA], parseBudget: 0 });
      assertEquals([s.waiting, s.forced], [1, 0]);
      // Parsed but not tagged: the clock starts at the parse.
      s = await buildReports({ now: new Date(), trackedQueryIds: [tqA] });
      assertEquals([s.parsed, s.waiting], [1, 1]);
      s = await buildReports({ now: new Date(Date.now() + 5 * HOUR), trackedQueryIds: [tqA], parseBudget: 0 });
      assertEquals([s.waiting, s.forced], [1, 0]);
      s = await buildReports({ now: new Date(Date.now() + 7 * HOUR), trackedQueryIds: [tqA], parseBudget: 0 });
      assertEquals(s.forced, 1);
      const pre = await reportOf(tqA, "preliminary");
      assertEquals(pre.stage, "brief");
      assertEquals(pre.page_urls, [normalizeUrl(urlFor(20))]);
    });

    await t.step("a full report waits for 10 present renders in its window; a refresh comes once history reaches 28 days", async () => {
      let s = await buildReports({ now: new Date(now.getTime() + 4 * DAY), trackedQueryIds: [tqA], parseBudget: 0 });
      assertEquals(s.created, [], "series A has only 3 present renders in the 7-day window");
      // Series B is captured once a day for 20 more days, so its history passes day 28.
      await db.from("snapshots").insert(Array.from({ length: 20 }, (_, d) => ({
        series_id: sb, captured_at: new Date(now.getTime() + (d + 1) * DAY).toISOString(), status: "present", content_hash: "b-later", extraction: "done",
      }))).throwOnError();
      const at = new Date(now.getTime() + 20 * DAY + 2 * HOUR);
      s = await buildReports({ now: at, trackedQueryIds: [tqB], parseBudget: 0 });
      assertEquals(s.created.map((c) => c.kind), ["refresh"]);
      const refresh = await reportOf(tqB, "refresh");
      assertEquals(Date.parse(refresh.window_end) - Date.parse(refresh.window_start), 28 * DAY);
      s = await buildReports({ now: new Date(at.getTime() + DAY), trackedQueryIds: [tqB], parseBudget: 0 });
      assertEquals(s.created, [], "never within 7 days of the latest refresh");
    });
  } finally {
    await db.auth.admin.deleteUser(userId);
    if (seriesIds.length) await db.from("series").delete().in("id", seriesIds);
    await db.from("pages").delete().like("url_key", `%${host}%`);
    await server.shutdown();
  }
});
