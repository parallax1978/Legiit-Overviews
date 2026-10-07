import { assert, assertEquals } from "@std/assert";
import { serviceClient } from "../_shared/db.ts";
import { compareWithBaseline, detectPlatformEvents, handle, type PlatformDaily } from "./handler.ts";

const DAY = 86_400_000;

function daily(day: string, presence: number | null, cpr: number | null = 4, turnover: number | null = 0): PlatformDaily {
  return { day, series_count: 3, renders: 24, presence_rate: presence, citations_per_render: cpr, domain_turnover: turnover };
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

Deno.test("detect-platform-events validates its input", async () => {
  const headers = { "x-cron-secret": Deno.env.get("CRON_SECRET")!, "content-type": "application/json" };
  assertEquals((await handle(new Request("http://x", { method: "POST" }))).status, 401);
  assertEquals((await handle(new Request("http://x", { method: "POST", headers, body: '{"day":"yesterday"}' }))).status, 400);
});

Deno.test("detect-platform-events: a seeded Google-wide shift records an event and holds the lost alert", async () => {
  const db = serviceClient();
  const tag = `pe${crypto.randomUUID().slice(0, 8)}`;
  // Days far in the past so no other data shares them: 2004-03-01 .. 2004-03-15.
  const days = Array.from({ length: 15 }, (_, i) => new Date(Date.UTC(2004, 2, 1) + i * DAY).toISOString().slice(0, 10));
  const shiftDay = days[14];
  const { data: u, error } = await db.auth.admin.createUser({ email: `${tag}@example.com`, password: `pw-${tag}-Aa1!`, email_confirm: true });
  if (error) throw error;
  const userId = u.user!.id;
  const seriesIds: string[] = [];
  try {
    // Three series, 8 captures a day. Days 0-13: 7 of 8 overviews present, each citing the same four
    // domains. Day 14: 2 of 8 present, citing four domains never seen before.
    const series = (await db.from("series").insert([0, 1, 2].map((i) => ({
      keyword: `${tag} query ${i}`, location_code: 2840, language_code: "en", device: "desktop", next_capture_at: "2030-01-01",
    }))).select("id").throwOnError()).data!;
    seriesIds.push(...series.map((s: { id: string }) => s.id));
    const snaps: Record<string, unknown>[] = [];
    for (const sid of seriesIds) {
      days.forEach((day, d) => {
        for (let k = 0; k < 8; k++) {
          const present = d < 14 ? k < 7 : k < 2;
          snaps.push({
            series_id: sid, captured_at: new Date(Date.parse(`${day}T00:00:00Z`) + k * 3 * 3_600_000 + 60_000).toISOString(),
            status: present ? "present" : "absent", content_hash: present ? `h${d}` : null, extraction: present ? "done" : "none",
          });
        }
      });
    }
    const inserted: { id: string; series_id: string; captured_at: string; status: string }[] = [];
    for (let i = 0; i < snaps.length; i += 200) {
      inserted.push(...(await db.from("snapshots").insert(snaps.slice(i, i + 200)).select("id, series_id, captured_at, status").throwOnError()).data!);
    }
    const citations: Record<string, unknown>[] = [];
    for (const s of inserted.filter((x) => x.status === "present")) {
      const shifted = s.captured_at.startsWith(shiftDay);
      for (let j = 0; j < 4; j++) {
        const domain = shifted ? `new${j}-${tag}.com` : `old${j}-${tag}.com`;
        citations.push({ snapshot_id: s.id, idx: j, url: `https://${domain}/p`, url_key: `${domain}/p`, host: domain, reg_domain: domain });
      }
    }
    for (let i = 0; i < citations.length; i += 500) await db.from("citations").insert(citations.slice(i, i + 500)).throwOnError();

    // Two tracked queries whose page was first seen earlier and is now cited nowhere, one still cited.
    const tqs = (await db.from("tracked_queries").insert(seriesIds.map((sid, i) => ({
      user_id: userId, series_id: sid, display_keyword: `query ${i}`, own_url: `https://own-${tag}.com/${i}`, own_url_key: `own-${tag}.com/${i}`,
    }))).select("id, series_id").throwOnError()).data!;
    const tqOf = (i: number) => tqs.find((q: { series_id: string }) => q.series_id === seriesIds[i])!.id;
    await db.from("citation_events").insert([0, 1, 2].map((i) => ({ tracked_query_id: tqOf(i), kind: "first_seen", level: "exact_url" }))).throwOnError();
    const recent = (i: number, from: string) => inserted.filter((s) => s.series_id === seriesIds[i] && s.status === "present" && s.captured_at >= from);
    await db.from("own_matches").insert([
      ...recent(0, days[12]).map((s) => ({ tracked_query_id: tqOf(0), snapshot_id: s.id, level: null })),
      ...recent(2, days[13]).map((s, n) => ({ tracked_query_id: tqOf(2), snapshot_id: s.id, level: n === 0 ? "same_domain" : null })),
    ]).throwOnError();

    // History: days 0-13 build the baseline. Query 1's loss is checked on day 13 (no event): notified.
    for (const day of days.slice(0, 13)) {
      const s = await detectPlatformEvents({ day, now: new Date(Date.parse(`${day}T00:00:00Z`) + 1.1 * DAY), trackedQueryIds: [] });
      assertEquals(s.event, false, day);
    }
    const quiet = await detectPlatformEvents({ day: days[13], now: new Date(Date.parse(`${days[14]}T00:20:00Z`)), trackedQueryIds: [tqOf(1)] });
    assertEquals(quiet.metrics.renders, 24);
    assertEquals(quiet.metrics.series_count, 3);
    assertEquals(quiet.metrics.presence_rate, 0.875);
    assertEquals(quiet.metrics.citations_per_render, 4);
    assertEquals(quiet.metrics.domain_turnover, 0);
    assertEquals(quiet.event, false);
    assertEquals(quiet.lost, 1);
    assertEquals(quiet.held, 0);
    assertEquals(quiet.lost_notifications, 1);

    // Day 14: presence falls from 0.875 to 0.25 and every cited domain is new.
    const s = await detectPlatformEvents({ day: shiftDay, now: new Date(Date.parse(`${shiftDay}T00:00:00Z`) + DAY + 20 * 60_000), trackedQueryIds: [tqOf(0), tqOf(2)] });
    assertEquals(s.metrics.presence_rate, 0.25);
    assertEquals(s.metrics.domain_turnover, 1);
    assertEquals(s.metrics.citations_per_render, 4);
    assertEquals(s.shifted, ["presence_rate", "domain_turnover"]);
    assertEquals(s.event, true);
    assertEquals(s.baseline!.presence_rate.mean, 0.875);
    assertEquals(s.platform_notifications, 1, "one notification per user");
    assertEquals(s.lost, 1, "query 2 is still cited once in the last 48 hours");
    assertEquals(s.held, 1);
    assertEquals(s.lost_notifications, 0);

    const event = (await db.from("platform_events").select("*").eq("day", shiftDay).single().throwOnError()).data!;
    assertEquals(event.metrics.shifted, ["presence_rate", "domain_turnover"]);
    const lost = (await db.from("citation_events").select("tracked_query_id, kind, held_for_platform_event, snapshot_id")
      .in("tracked_query_id", [tqOf(0), tqOf(1), tqOf(2)]).eq("kind", "lost").throwOnError()).data!;
    assertEquals(lost.length, 2);
    assertEquals(lost.find((e: { tracked_query_id: string }) => e.tracked_query_id === tqOf(0))!.held_for_platform_event, true);
    assertEquals(lost.find((e: { tracked_query_id: string }) => e.tracked_query_id === tqOf(1))!.held_for_platform_event, false);
    assert(lost.every((e: { snapshot_id: string | null }) => e.snapshot_id), "the event points at the latest render");
    const notes = (await db.from("notifications").select("kind, tracked_query_id, link").eq("user_id", userId).order("kind").throwOnError()).data!;
    assertEquals(notes.map((n: { kind: string }) => n.kind), ["lost", "platform_event"]);
    assertEquals(notes[0].link, `/queries/${tqOf(1)}/tracking`);

    // Running the day again changes nothing: the event exists and the losses are recorded.
    const again = await detectPlatformEvents({ day: shiftDay, now: new Date(Date.parse(`${shiftDay}T00:00:00Z`) + DAY + 30 * 60_000), trackedQueryIds: [tqOf(0), tqOf(1), tqOf(2)] });
    assertEquals(again.event, true);
    assertEquals(again.platform_notifications, 0);
    assertEquals(again.lost, 0);
  } finally {
    await db.auth.admin.deleteUser(userId);
    if (seriesIds.length) await db.from("series").delete().in("id", seriesIds);
    await db.from("platform_events").delete().in("day", days);
    await db.from("platform_daily").delete().in("day", days);
  }
});
