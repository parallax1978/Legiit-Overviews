import { assert, assertEquals } from "@std/assert";
import { serviceClient } from "../_shared/db.ts";
import { canJudge, compareWithBaseline, detectPlatformEvents, handle, MIN_SERIES, type PlatformDaily } from "./handler.ts";

const DAY = 86_400_000;

function daily(day: string, presence: number | null, cpr: number | null = 4, turnover: number | null = 0, size = { series: 3, renders: 24, pairs: 12 }): PlatformDaily {
  return {
    day, series_count: size.series, renders: size.renders, pairs: size.pairs,
    presence_rate: presence, citations_per_render: cpr, domain_turnover: turnover,
  };
}

Deno.test("compareWithBaseline: 3 sigma and a minimum change", () => {
  const flat = Array.from({ length: 10 }, (_, i) => daily(`2001-01-${10 + i}`, 0.8));
  // A flat history has sd 0: small moves are noise, big ones are shifts.
  assertEquals(compareWithBaseline(daily("2001-01-20", 0.85), flat).presence_rate.shifted, false);
  assertEquals(compareWithBaseline(daily("2001-01-20", 0.5), flat).presence_rate.shifted, true);
  const noisy = [0.6, 0.9, 0.7, 0.95, 0.65, 0.85, 0.75].map((v, i) => daily(`2001-02-0${i + 1}`, v));
  // mean 5.4 / 7 = 0.7714, sample sd sqrt(0.104286 / 6) = 0.1318: 0.45 is 2.4 sd away, inside the band.
  const b = compareWithBaseline(daily("2001-02-08", 0.45), noisy).presence_rate;
  assertEquals(b.mean, 0.7714);
  assertEquals(b.sd, 0.1318);
  assertEquals(b.shifted, false);
  assertEquals(compareWithBaseline(daily("2001-02-08", 0.3), noisy).presence_rate.shifted, true);
  assertEquals(compareWithBaseline(daily("2001-02-08", null), noisy).presence_rate.shifted, false);
});

Deno.test("compareWithBaseline: a flat baseline is judged against the day's sampling noise", () => {
  // Presence flat at 0.5 over 24 renders a day: sd 0, but 24 renders move by sqrt(0.25 / 24) = 0.102
  // by chance, so 0.35 (1.5 noise away) is ordinary and only a move past 3 x 0.102 is a shift.
  const flat = Array.from({ length: 10 }, (_, i) => daily(`2001-03-${10 + i}`, 0.5));
  const ordinary = compareWithBaseline(daily("2001-03-20", 0.35), flat).presence_rate;
  assertEquals([ordinary.sd, ordinary.noise, ordinary.shifted], [0, 0.1021, false]);
  assertEquals(compareWithBaseline(daily("2001-03-20", 0.1), flat).presence_rate.shifted, true);
  // Turnover flat at 0 still has some noise: the rate is smoothed by one new and one old pair.
  const none = Array.from({ length: 10 }, (_, i) => daily(`2001-04-${10 + i}`, 0.8, 4, 0, { series: 20, renders: 160, pairs: 80 }));
  const turnover = compareWithBaseline(daily("2001-04-20", 0.8, 4, 0.0375, { series: 20, renders: 160, pairs: 80 }), none).domain_turnover;
  assert(turnover.noise! > 0);
  assertEquals(turnover.shifted, false, "3 new pairs of 80 is below the minimum change");
});

Deno.test("canJudge: a day needs 7 baseline days and a pool of 20 renders and 20 series", () => {
  const big = { series: MIN_SERIES, renders: 160, pairs: 80 };
  const history = Array.from({ length: 7 }, (_, i) => daily(`2001-05-0${i + 1}`, 0.8, 4, 0, big));
  assertEquals(canJudge(daily("2001-05-08", 0.5, 4, 0, big), history), true);
  // Three series, however many renders: one query's ordinary week would read as a Google-wide change.
  assertEquals(canJudge(daily("2001-05-08", 0.5, 4, 0, { series: 3, renders: 24, pairs: 12 }), history), false);
  assertEquals(canJudge(daily("2001-05-08", 0.5, 4, 0, { series: MIN_SERIES, renders: 19, pairs: 80 }), history), false);
  assertEquals(canJudge(daily("2001-05-08", 0.5, 4, 0, big), history.slice(1)), false);
});

Deno.test("detect-platform-events validates its input", async () => {
  const headers = { "x-cron-secret": Deno.env.get("CRON_SECRET")!, "content-type": "application/json" };
  assertEquals((await handle(new Request("http://x", { method: "POST" }))).status, 401);
  assertEquals((await handle(new Request("http://x", { method: "POST", headers, body: '{"day":"yesterday"}' }))).status, 400);
});

Deno.test("detect-platform-events: a seeded Google-wide shift records an event, holds the lost alert and releases it on a quiet day", async () => {
  const db = serviceClient();
  const tag = `pe${crypto.randomUUID().slice(0, 8)}`;
  // Days far in the past so no other data shares them: 2004-03-01 .. 2004-03-17. Days 0-14 carry the
  // pool; days 15 and 16 have too few renders to judge, so they are quiet.
  const days = Array.from({ length: 17 }, (_, i) => new Date(Date.UTC(2004, 2, 1) + i * DAY).toISOString().slice(0, 10));
  const shiftDay = days[14];
  const at = (d: number, hours: number) => new Date(Date.parse(`${days[d]}T00:00:00Z`) + hours * 3_600_000).toISOString();
  const { data: u, error } = await db.auth.admin.createUser({ email: `${tag}@example.com`, password: `pw-${tag}-Aa1!`, email_confirm: true });
  if (error) throw error;
  const userId = u.user!.id;
  const seriesIds: string[] = [];
  try {
    // MIN_SERIES series, 4 captures a day. Days 0-13: 3 of 4 overviews present, each citing the same
    // four domains. Day 14: 1 of 4 present, citing four domains never seen before.
    const series = (await db.from("series").insert(Array.from({ length: MIN_SERIES }, (_, i) => ({
      keyword: `${tag} query ${i}`, location_code: 2840, language_code: "en", device: "desktop", next_capture_at: "2030-01-01",
    }))).select("id, keyword").throwOnError()).data!;
    seriesIds.push(...series.sort((a: { keyword: string }, b: { keyword: string }) => a.keyword.localeCompare(b.keyword, "en", { numeric: true })).map((s: { id: string }) => s.id));
    const snaps: Record<string, unknown>[] = [];
    for (const sid of seriesIds) {
      for (let d = 0; d < 15; d++) {
        for (let k = 0; k < 4; k++) {
          const present = d < 14 ? k < 3 : k < 1;
          snaps.push({
            series_id: sid, captured_at: at(d, k * 6 + 1 / 60),
            status: present ? "present" : "absent", content_hash: present ? `h${d}` : null, extraction: present ? "done" : "none",
          });
        }
      }
    }
    // Series 0 keeps being captured after the shift (too few renders for the pool to be judged).
    snaps.push({ series_id: seriesIds[0], captured_at: at(16, 6), status: "present", content_hash: "h16", extraction: "done" });
    const inserted: { id: string; series_id: string; captured_at: string; status: string }[] = [];
    for (let i = 0; i < snaps.length; i += 300) {
      inserted.push(...(await db.from("snapshots").insert(snaps.slice(i, i + 300)).select("id, series_id, captured_at, status").throwOnError()).data!);
    }
    const citations: Record<string, unknown>[] = [];
    for (const s of inserted.filter((x) => x.status === "present")) {
      const shifted = s.captured_at >= `${shiftDay}T`;
      for (let j = 0; j < 4; j++) {
        const domain = shifted ? `new${j}-${tag}.com` : `old${j}-${tag}.com`;
        citations.push({ snapshot_id: s.id, idx: j, url: `https://${domain}/p`, url_key: `${domain}/p`, host: domain, reg_domain: domain });
      }
    }
    for (let i = 0; i < citations.length; i += 500) await db.from("citations").insert(citations.slice(i, i + 500)).throwOnError();

    // Tracked queries on series 0-5, each page first seen earlier:
    //   0  out since day 12 (matched, never cited): lost on the shift day, held, released on day 16
    //   1  out since day 12: lost on quiet day 13
    //   2  still cited once on day 13: not lost
    //   3  its URL changed since it was seen: the new page was never cited, so it cannot be lost
    //   4  renders not matched for it (e.g. ingested while paused): not evidence of a loss
    //   5  cited by a render captured after the day judged but before the check ran: not lost
    const key = (i: number) => `own-${tag}.com/${i}`;
    const tqs = (await db.from("tracked_queries").insert([0, 1, 2, 3, 4, 5].map((i) => ({
      user_id: userId, series_id: seriesIds[i], display_keyword: `query ${i}`, own_url: `https://${key(i)}`,
      own_url_key: i === 3 ? `${key(i)}-new` : key(i),
    }))).select("id, series_id").throwOnError()).data!;
    const tqOf = (i: number) => tqs.find((q: { series_id: string }) => q.series_id === seriesIds[i])!.id;
    await db.from("citation_events").insert([0, 1, 2, 3, 4, 5].map((i) => ({
      tracked_query_id: tqOf(i), kind: "first_seen", level: "exact_url", own_url_key: key(i), created_at: at(0, 1),
    }))).throwOnError();
    const presentOf = (i: number, from: string) => inserted.filter((s) => s.series_id === seriesIds[i] && s.status === "present" && s.captured_at >= from);
    await db.from("own_matches").insert([
      ...[0, 1, 3].flatMap((i) => presentOf(i, days[12]).map((s) => ({ tracked_query_id: tqOf(i), snapshot_id: s.id, level: null }))),
      ...presentOf(2, days[13]).map((s, n) => ({ tracked_query_id: tqOf(2), snapshot_id: s.id, level: n === 0 ? "same_domain" : null })),
      ...presentOf(5, days[12]).map((s) => ({ tracked_query_id: tqOf(5), snapshot_id: s.id, level: s.captured_at >= shiftDay ? "exact_url" : null })),
    ]).throwOnError();

    // History: days 0-12 build the baseline.
    for (const day of days.slice(0, 13)) {
      const s = await detectPlatformEvents({ day, now: new Date(Date.parse(`${day}T00:00:00Z`) + 1.1 * DAY), trackedQueryIds: [] });
      assertEquals(s.event, false, day);
    }
    // Day 13, checked at 00:20 the next morning: query 1 is lost; query 5's 00:01 render cites the page.
    const quiet = await detectPlatformEvents({ day: days[13], now: new Date(`${days[14]}T00:20:00Z`), trackedQueryIds: [tqOf(1), tqOf(5)] });
    assertEquals([quiet.metrics.renders, quiet.metrics.series_count, quiet.metrics.pairs], [80, MIN_SERIES, 80]);
    assertEquals([quiet.metrics.presence_rate, quiet.metrics.citations_per_render, quiet.metrics.domain_turnover], [0.75, 4, 0]);
    assertEquals(quiet.event, false);
    assertEquals([quiet.lost, quiet.held, quiet.lost_notifications], [1, 0, 1]);

    // Day 14: presence falls from 0.75 to 0.25 and every cited domain is new.
    const s = await detectPlatformEvents({ day: shiftDay, now: new Date(`${days[15]}T00:20:00Z`), trackedQueryIds: [0, 2, 3, 4].map(tqOf) });
    assertEquals(s.metrics.presence_rate, 0.25);
    assertEquals(s.metrics.domain_turnover, 1);
    assertEquals(s.metrics.citations_per_render, 4);
    assertEquals(s.shifted, ["presence_rate", "domain_turnover"]);
    assertEquals(s.event, true);
    assertEquals(s.baseline!.presence_rate.mean, 0.75);
    assertEquals(s.platform_notifications, 1, "one notification per user");
    assertEquals([s.lost, s.held, s.lost_notifications], [1, 1, 0], "only query 0 is lost, and its alert is held");

    const event = (await db.from("platform_events").select("*").eq("day", shiftDay).single().throwOnError()).data!;
    assertEquals(event.metrics.shifted, ["presence_rate", "domain_turnover"]);
    const lostEvents = async () => (await db.from("citation_events").select("tracked_query_id, held_for_platform_event, snapshot_id, own_url_key, created_at")
      .in("tracked_query_id", tqs.map((q: { id: string }) => q.id)).eq("kind", "lost").throwOnError()).data!;
    let lost = await lostEvents();
    assertEquals(lost.map((e: { tracked_query_id: string }) => e.tracked_query_id).sort(), [tqOf(0), tqOf(1)].sort());
    const lostOf = (i: number) => lost.find((e: { tracked_query_id: string }) => e.tracked_query_id === tqOf(i))!;
    assertEquals([lostOf(0).held_for_platform_event, lostOf(1).held_for_platform_event], [true, false]);
    assertEquals(Date.parse(lostOf(1).created_at), Date.parse(`${days[14]}T00:00:00Z`), "dated at the end of the day judged");
    assertEquals(lostOf(1).own_url_key, key(1));
    assert(lost.every((e: { snapshot_id: string | null }) => e.snapshot_id), "the event points at the latest render");
    let notes = (await db.from("notifications").select("kind, tracked_query_id, link, body").eq("user_id", userId).order("kind").throwOnError()).data!;
    assertEquals(notes.map((n: { kind: string }) => n.kind), ["lost", "platform_event"]);
    assertEquals(notes[0].link, `/queries/${tqOf(1)}/tracking`);

    // Running the day again changes nothing: the event exists and the losses are recorded.
    const again = await detectPlatformEvents({ day: shiftDay, now: new Date(`${days[15]}T00:30:00Z`), trackedQueryIds: [0, 1, 2, 3, 4].map(tqOf) });
    assertEquals([again.event, again.platform_notifications, again.lost, again.released], [true, 0, 0, 0]);

    // Day 15 follows a platform event, so the held loss stays held.
    const held = await detectPlatformEvents({ day: days[15], now: new Date(`${days[16]}T00:20:00Z`), trackedQueryIds: [tqOf(0)] });
    assertEquals([held.event, held.lost, held.released, held.lost_notifications], [false, 0, 0, 0]);

    // Day 16 is quiet and the page is still out: the loss is released and the user told.
    const released = await detectPlatformEvents({ day: days[16], now: new Date(Date.parse(`${days[16]}T00:00:00Z`) + DAY + 20 * 60_000), trackedQueryIds: [tqOf(0)] });
    assertEquals([released.event, released.lost, released.released, released.lost_notifications], [false, 0, 1, 1]);
    lost = await lostEvents();
    assertEquals(lost.length, 2, "the held event itself is released, not a second one");
    assertEquals(lostOf(0).held_for_platform_event, false);
    assertEquals(Date.parse(lostOf(0).created_at), Date.parse(days[16]) + DAY);
    assertEquals(lostOf(0).snapshot_id, inserted.find((x) => Date.parse(x.captured_at) === Date.parse(at(16, 6)))!.id);
    notes = (await db.from("notifications").select("kind, tracked_query_id, link, body").eq("user_id", userId).eq("kind", "lost").throwOnError()).data!;
    assertEquals(notes.map((n: { tracked_query_id: string }) => n.tracked_query_id).sort(), [tqOf(0), tqOf(1)].sort());
    assertEquals(notes.find((n: { tracked_query_id: string }) => n.tracked_query_id === tqOf(0))!.body, "The AI Overview captured in the last 2 days did not cite your page. We'll tell you if it comes back.");
    const once = await detectPlatformEvents({ day: days[16], now: new Date(Date.parse(`${days[16]}T00:00:00Z`) + DAY + 30 * 60_000), trackedQueryIds: [tqOf(0)] });
    assertEquals([once.lost, once.released, once.lost_notifications], [0, 0, 0]);
  } finally {
    await db.auth.admin.deleteUser(userId);
    if (seriesIds.length) await db.from("series").delete().in("id", seriesIds);
    await db.from("platform_events").delete().in("day", days);
    await db.from("platform_daily").delete().in("day", days);
  }
});
