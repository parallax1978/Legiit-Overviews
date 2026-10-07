import { assert, assertEquals } from "@std/assert";
import { serviceClient } from "../_shared/db.ts";
import { digestLine, emailHtml, handle, runNotify } from "./handler.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

Deno.test("digestLine summarises renders, changes and events", () => {
  const m = {
    renders: 8, present: 7, presence_rate: 0.875,
    daily: [
      { claims_added: [], claims_dropped: [], entities_added: [], entities_dropped: [], citations_added: [], citations_dropped: [] },
      {
        claims_added: [{}, {}], claims_dropped: [], entities_added: [{}], entities_dropped: [{}, {}],
        citations_added: [], citations_dropped: [{}],
      },
    ],
  } as any;
  assertEquals(
    digestLine({ display_keyword: "best crm", device: "mobile" }, m, ["cited again"]),
    "“best crm” (mobile): 8 captures, overview on 7 (88%). New: 2 claims, 1 entity. Dropped: 2 entities, 1 source. Your page: cited again.",
  );
  const quiet = { renders: 1, present: 0, presence_rate: 0, daily: [] } as any;
  assertEquals(digestLine({ display_keyword: "x", device: "desktop" }, quiet, []), "“x” (desktop): 1 capture, overview on 0 (0%). No changes in claims, entities or sources.");
});

Deno.test("emailHtml: branded card with an escaped body and a button to the app", () => {
  const html = emailHtml({ kind: "first_seen", title: "Cited <today>", body: "Line one\nLine & two", link: "/queries/abc/tracking" }, "https://app.example.com/");
  assert(html.includes("Cited &lt;today&gt;"));
  assert(html.includes("Line &amp; two"));
  assert(html.includes('href="https://app.example.com/queries/abc/tracking"'));
  assert(html.includes("background:#8a12dc"));
  assert(html.includes("Inter"));
  assert(!emailHtml({ kind: "digest", title: "t", body: "b", link: null }, "https://x").includes("<a "));
});

Deno.test("notify rejects calls without the cron secret", async () => {
  assertEquals((await handle(new Request("http://x", { method: "POST" }))).status, 401);
});

Deno.test("notify: one digest per user per day after 13:00 UTC, emails only with a Resend key", async () => {
  const db = serviceClient();
  const tag = `nt${crypto.randomUUID().slice(0, 8)}`;
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const at = (h: number) => new Date(today.getTime() + h * HOUR);
  const now = at(13.5);
  const users: string[] = [];
  const seriesIds: string[] = [];
  const hadKey = Deno.env.get("RESEND_API_KEY");
  Deno.env.delete("RESEND_API_KEY");
  try {
    for (const who of ["busy", "quiet"]) {
      const { data, error } = await db.auth.admin.createUser({ email: `${who}-${tag}@example.com`, password: `pw-${tag}-Aa1!`, email_confirm: true });
      if (error) throw error;
      users.push(data.user!.id);
    }
    const series = (await db.from("series").insert([0, 1].map((i) => ({
      keyword: `${tag} digest ${i}`, location_code: 2840, language_code: "en", device: "desktop", next_capture_at: "2030-01-01",
    }))).select("id").throwOnError()).data!;
    seriesIds.push(...series.map((s: { id: string }) => s.id));
    const tqs = (await db.from("tracked_queries").insert([
      { user_id: users[0], series_id: seriesIds[0], display_keyword: "digest query" },
      { user_id: users[1], series_id: seriesIds[1], display_keyword: "quiet query" },
    ]).select("id, user_id").throwOnError()).data!;
    const tqBusy = tqs.find((q: { user_id: string }) => q.user_id === users[0])!.id;

    // Yesterday afternoon the overview cited A and B; today it cites A and C; the 12:00 render had none.
    // A render 25 hours ago is outside the digest window.
    const hours = [-25, -9, -6, -3, 0, 3, 6, 9, 12];
    const snaps = (await db.from("snapshots").insert(hours.map((h) => ({
      series_id: seriesIds[0], captured_at: at(h).toISOString(), status: h === 12 ? "absent" : "present",
      content_hash: h === 12 ? null : h < 0 ? "y" : "t", extraction: h === 12 ? "none" : "done",
    }))).select("id, captured_at, status").throwOnError()).data!;
    const cites: Record<string, unknown>[] = [];
    for (const s of snaps.filter((x: { status: string }) => x.status === "present")) {
      const keys = Date.parse(s.captured_at) < today.getTime() ? ["a", "b"] : ["a", "c"];
      keys.forEach((k, idx) => cites.push({ snapshot_id: s.id, idx, url: `https://${k}-${tag}.com/`, url_key: `${k}-${tag}.com`, host: `${k}-${tag}.com`, reg_domain: `${k}-${tag}.com` }));
    }
    await db.from("citations").insert(cites).throwOnError();
    await db.from("citation_events").insert([
      { tracked_query_id: tqBusy, kind: "first_seen", level: "exact_url", held_for_platform_event: false, created_at: at(11).toISOString() },
      { tracked_query_id: tqBusy, kind: "lost", level: null, held_for_platform_event: true, created_at: at(10).toISOString() },
    ]).throwOnError();
    // An old notification that must never be emailed.
    await db.from("notifications").insert({ user_id: users[0], kind: "report_ready", title: "Old", body: "old", link: "/queries", created_at: new Date(now.getTime() - 4 * DAY).toISOString() }).throwOnError();

    const before = await runNotify({ now: at(12.9), userIds: users });
    assertEquals(before.digests, 0, "no digest before 13:00 UTC");

    const first = await runNotify({ now, userIds: users });
    assertEquals(first.digests, 1, "the quiet user had nothing to report");
    assertEquals(first.email_enabled, false);
    assertEquals(first.emailed, 0);
    const digests = (await db.from("notifications").select("*").in("user_id", users).eq("kind", "digest").throwOnError()).data!;
    assertEquals(digests.length, 1);
    assertEquals(digests[0].user_id, users[0]);
    assertEquals(digests[0].body, "“digest query” (desktop): 8 captures, overview on 7 (88%). New: 1 source. Dropped: 1 source. Your page: cited for the first time.");
    assertEquals(digests[0].link, "/queries");
    assertEquals(digests[0].emailed_at, null, "nothing is emailed without a Resend key");

    const second = await runNotify({ now: at(13.75), userIds: users });
    assertEquals(second.digests, 0, "one digest a day");

    // With a key, unsent notifications from the last 3 days are emailed once.
    Deno.env.set("RESEND_API_KEY", "re_test");
    const sent: { url: string; headers: Headers; body: any }[] = [];
    const fakeFetch = ((url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return Promise.resolve(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    }) as typeof fetch;
    const emailed = await runNotify({ now: at(13.8), userIds: users, fetch: fakeFetch });
    assertEquals(emailed.emailed, 1);
    assertEquals(sent[0].url, "https://api.resend.com/emails");
    assertEquals(sent[0].headers.get("authorization"), "Bearer re_test");
    assertEquals(sent[0].headers.get("idempotency-key"), `notification-${digests[0].id}`);
    assertEquals(sent[0].body.to, [`busy-${tag}@example.com`]);
    assertEquals(sent[0].body.subject, digests[0].title);
    assert(sent[0].body.html.includes(`${Deno.env.get("APP_URL")}/queries`));
    const marked = (await db.from("notifications").select("title, emailed_at").in("user_id", users).throwOnError()).data!;
    assertEquals(marked.find((n: { title: string }) => n.title === "Old")!.emailed_at, null, "older than 3 days");
    assert(marked.find((n: { title: string }) => n.title !== "Old")!.emailed_at);
    const again = await runNotify({ now: at(13.9), userIds: users, fetch: fakeFetch });
    assertEquals(again.emailed, 0);
  } finally {
    if (hadKey) Deno.env.set("RESEND_API_KEY", hadKey);
    else Deno.env.delete("RESEND_API_KEY");
    for (const id of users) await db.auth.admin.deleteUser(id);
    if (seriesIds.length) await db.from("series").delete().in("id", seriesIds);
  }
});
