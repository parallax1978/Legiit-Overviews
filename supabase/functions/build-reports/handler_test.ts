import { assert, assertEquals } from "@std/assert";
import { serviceClient } from "../_shared/db.ts";
import { normalizeUrl } from "../_shared/normalize.ts";
import { buildReports, handle, type PageDetail, selectPages } from "./handler.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

Deno.test("selectPages: top 10 non-platform sources plus the own page", () => {
  const sources = Array.from({ length: 13 }, (_, i) => ({
    url_key: `site${i}.com/p`, url: `https://site${i}.com/p`, reg_domain: `site${i}.com`, title: null,
    renders: 13 - i, share: (13 - i) / 13, bucket: "rotating" as const, platform: i === 1, organic_top10_share: 0,
  }));
  const { refs, shares } = selectPages(sources, { url: "https://www.Own.com/page/", url_key: null });
  assertEquals(refs.length, 11);
  assert(!refs.some((r) => r.url_key === "site1.com/p"), "platform sources are left out");
  assertEquals(refs[9].url_key, "site10.com/p");
  assertEquals(refs[10], { url_key: "own.com/page", url: "https://www.Own.com/page/" });
  assertEquals(shares.get("own.com/page"), 0);
  // An own page that is already among the top sources is not added twice.
  assertEquals(selectPages(sources, { url: "https://site0.com/p", url_key: "site0.com/p" }).refs.length, 10);
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
    const snapsB = Array.from({ length: 64 }, (_, n) => ({
      series_id: sb, captured_at: new Date(now.getTime() - 8 * DAY + n * 3 * HOUR + HOUR).toISOString(), status: "present", content_hash: `b${n % 5}`, extraction: "done",
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
      { user_id: userId, series_id: sb, display_keyword: "long history", own_url: ownUrl, own_url_key: normalizeUrl(ownUrl) },
    ]).select("id, series_id").throwOnError()).data!;
    const tqA = tqs.find((q: { series_id: string }) => q.series_id === sa)!.id;
    const tqB = tqs.find((q: { series_id: string }) => q.series_id === sb)!.id;
    const scope = [tqA, tqB];
    const reportOf = async (tq: string, kind: string) =>
      (await db.from("reports").select("*").eq("tracked_query_id", tq).eq("kind", kind).maybeSingle().throwOnError()).data;

    await t.step("day 4 gets a preliminary report, day 8 only a full one", async () => {
      const s = await buildReports({ now, trackedQueryIds: scope, parseBudget: 0 });
      assertEquals(s.created.map((c) => `${c.tracked_query_id === tqA ? "A" : "B"}:${c.kind}`).sort(), ["A:preliminary", "B:full"]);
      const pre = await reportOf(tqA, "preliminary");
      assertEquals(Date.parse(pre.window_end), now.getTime());
      assertEquals(Date.parse(pre.window_start), now.getTime() - 3 * DAY);
      assertEquals(pre.renders, 3, "captures at days -3, -2, -1 fall in the 3-day window");
      assertEquals(pre.metrics.renders, 3);
      const full = await reportOf(tqB, "full");
      assertEquals(Date.parse(full.window_start), now.getTime() - 7 * DAY);
      assertEquals(full.renders, 56);
      assertEquals(full.metrics.present, 56);
      assertEquals(await reportOf(tqB, "preliminary"), null, "a query past day 7 skips the preliminary report");
      assertEquals(s.metrics, 2);
    });

    await t.step("a second run creates nothing", async () => {
      const s = await buildReports({ now: new Date(now.getTime() + HOUR), trackedQueryIds: scope, parseBudget: 0 });
      assertEquals(s.created, []);
      const { count } = await db.from("reports").select("id", { count: "exact", head: true }).in("tracked_query_id", scope);
      assertEquals(count, 2);
    });

    await t.step("page selection: top 10 non-platform pages plus the own page, passages located", async () => {
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

    await t.step("a report whose pages have not settled after 6 hours moves on anyway", async () => {
      const later = new Date(now.getTime() + 7 * HOUR);
      let s = await buildReports({ now: new Date(now.getTime() + 2 * HOUR), trackedQueryIds: [tqA], parseBudget: 0 });
      assertEquals(s.waiting, 1);
      s = await buildReports({ now: later, trackedQueryIds: [tqA], parseBudget: 0 });
      assertEquals(s.forced, 1);
      const pre = await reportOf(tqA, "preliminary");
      assertEquals(pre.stage, "brief");
      assertEquals(pre.page_urls, [normalizeUrl(urlFor(20))]);
    });

    await t.step("history past day 7 adds the full report; 28 days after it, a refresh", async () => {
      let s = await buildReports({ now: new Date(now.getTime() + 4 * DAY), trackedQueryIds: scope, parseBudget: 0 });
      assertEquals(s.created.map((c) => `${c.tracked_query_id === tqA ? "A" : "B"}:${c.kind}`), ["A:full"]);
      s = await buildReports({ now: new Date(now.getTime() + 27 * DAY), trackedQueryIds: [tqB], parseBudget: 0 });
      assertEquals(s.created, []);
      s = await buildReports({ now: new Date(now.getTime() + 28 * DAY), trackedQueryIds: [tqB], parseBudget: 0 });
      assertEquals(s.created.map((c) => c.kind), ["refresh"]);
      const refresh = await reportOf(tqB, "refresh");
      assertEquals(Date.parse(refresh.window_end) - Date.parse(refresh.window_start), 28 * DAY);
    });
  } finally {
    await db.auth.admin.deleteUser(userId);
    if (seriesIds.length) await db.from("series").delete().in("id", seriesIds);
    await db.from("pages").delete().like("url_key", `%${host}%`);
    await server.shutdown();
  }
});
