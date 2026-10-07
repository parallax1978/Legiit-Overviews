// Demo driver: runs the real pipeline end to end against the local Supabase stack and the mock
// server, so the app has a tracked query with a week of history, claims, a report and own-page
// tracking to show.
//
//   deno run -A mocks/server.ts                       # in another terminal
//   deno run -A --env-file=supabase/functions/.env.test scripts/demo.ts [--days 8] [--keyword "best form builder"]
//
// Steps: demo user -> add-query -> back-filled captures delivered through dataforseo-postback exactly
// as DataForSEO posts them -> submit/collect batches until extraction is done -> build-reports until
// the report is ready -> detect-platform-events per day -> set-own-page -> a second query without an
// overview -> summary. Safe to re-run: existing captures are skipped and every step is idempotent.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gzipJson, postbackBody } from "../mocks/dataforseo.ts";
import { demoOwnPage, serpResult, SLOT_MS } from "../mocks/scenario.ts";

const EMAIL = "demo@legiit.local";
const PASSWORD = "demo-password-123";
const LOCATION = 2840;
const LANGUAGE = "en";
const DEVICE = "desktop";
const WATCH_KEYWORD = "no overview test keyword";
const DAY_MS = 86_400_000;
/** Demo task ids are v4 UUIDs; the mock's own ids are not, so re-runs only re-post the demo's captures. */
const DEMO_TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Args {
  days: number;
  keyword: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { days: 8, keyword: "best form builder" };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    const value = () => inline ?? argv[++i];
    if (flag === "--days") out.days = Number(value());
    else if (flag === "--keyword") out.keyword = String(value() ?? "").trim();
    else if (flag === "--help" || flag === "-h") {
      console.log('Usage: deno run -A --env-file=supabase/functions/.env.test scripts/demo.ts [--days 8] [--keyword "best form builder"]');
      Deno.exit(0);
    } else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!Number.isFinite(out.days) || out.days < 1 || out.days > 60) throw new Error("--days must be between 1 and 60");
  if (!out.keyword) throw new Error("--keyword must not be empty");
  return out;
}

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name}. Run with --env-file=supabase/functions/.env.test`);
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (ms: number) => new Date(ms).toISOString();

function step(title: string) {
  console.log(`\n== ${title}`);
}

/** Clients, secrets and function calls for one demo run. */
export class Demo {
  readonly url = need("SUPABASE_URL");
  readonly anonKey = need("SUPABASE_ANON_KEY");
  readonly cronSecret = need("CRON_SECRET");
  readonly postbackSecret = need("POSTBACK_SECRET");
  readonly functionsUrl = (Deno.env.get("FUNCTIONS_PUBLIC_URL") || `${this.url}/functions/v1`).replace(/\/+$/, "");
  readonly admin: SupabaseClient = createClient(this.url, need("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  token = "";

  async post(name: string, body: unknown, headers: Record<string, string>): Promise<any> {
    const res = await fetch(`${this.functionsUrl}/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      // keep the text
    }
    if (!res.ok) {
      const detail = typeof data === "string" ? data : JSON.stringify(data);
      throw new Error(`${name}: HTTP ${res.status} ${detail.slice(0, 400)}`);
    }
    return data;
  }

  cron(name: string, body: unknown = {}) {
    return this.post(name, body, { "x-cron-secret": this.cronSecret });
  }

  user(name: string, body: unknown) {
    return this.post(name, body, { authorization: `Bearer ${this.token}`, apikey: this.anonKey });
  }

  async count(table: string, filter: (q: any) => any): Promise<number> {
    const { count, error } = await filter(this.admin.from(table).select("*", { count: "exact", head: true }));
    if (error) throw new Error(`count ${table}: ${error.message}`);
    return count ?? 0;
  }
}

async function checkMock() {
  const base = Deno.env.get("DATAFORSEO_BASE_URL");
  if (!base) return;
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/__mock/state`);
    await res.body?.cancel();
    console.log(`mock server: ${base} (${res.status})`);
  } catch {
    console.warn(`mock server not reachable at ${base}; start it with: deno run -A mocks/server.ts`);
  }
}

/** Creates (or reuses) the demo user and signs in for a JWT. */
export async function signIn(d: Demo) {
  const created = await d.admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (created.error && !/already|exists|registered/i.test(created.error.message)) throw new Error(`create demo user: ${created.error.message}`);
  const anon = createClient(d.url, d.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign in as ${EMAIL}: ${error?.message ?? "no session"}`);
  d.token = data.session.access_token;
  console.log(`${created.error ? "reusing" : "created"} ${EMAIL} (${data.user.id})`);
}

/** Calls add-query for one keyword on desktop in the US. */
export async function addQuery(d: Demo, keyword: string) {
  const r = await d.user("add-query", { keyword, location_code: LOCATION, language_code: LANGUAGE, devices: [DEVICE] });
  const res = r.results?.[0];
  if (!res?.tracked_query_id) throw new Error(`add-query returned no result: ${JSON.stringify(r).slice(0, 300)}`);
  console.log(`"${keyword}": tracked query ${res.tracked_query_id}, series ${res.series_id}, status ${res.status}, overview ${res.overview_present ? "present" : "absent"}${res.is_new_series ? ", new series" : ""}`);
  if (res.capture_error) console.warn(`  live capture failed: ${res.capture_error}`);
  if (r.siblings?.length) console.log(`  siblings with an overview: ${r.siblings.map((s: any) => s.keyword).join(", ")}`);
  return res as { tracked_query_id: string; series_id: string; status: string };
}

interface CaptureRow {
  id: string;
  scheduled_at: string;
  status: string;
  task_id: string | null;
  source: string;
}

/** Slots aligned with the series' schedule (next_capture_at minus whole 3-hour steps) in the window. */
export function slotTimes(anchor: number, from: number, to: number): number[] {
  let t = anchor - Math.ceil((anchor - from) / SLOT_MS) * SLOT_MS;
  if (t < from) t += SLOT_MS;
  const out: number[] = [];
  for (; t < to; t += SLOT_MS) out.push(t);
  return out;
}

/** Inserts captures for past slots and delivers each one through dataforseo-postback, gzip, like DataForSEO. */
export async function backfill(d: Demo, seriesId: string, days: number): Promise<number[]> {
  const { data: series, error } = await d.admin.from("series").select("id, keyword, location_code, language_code, device, next_capture_at").eq("id", seriesId).single();
  if (error || !series) throw new Error(`load series: ${error?.message}`);
  const now = Date.now();
  const slots = slotTimes(Date.parse(series.next_capture_at), now - days * DAY_MS, now - 60_000);

  const existing = new Map<number, CaptureRow>();
  for (let i = 0; i < slots.length; i += 200) {
    const part = slots.slice(i, i + 200);
    const { data, error } = await d.admin.from("captures").select("id, scheduled_at, status, task_id, source")
      .eq("series_id", seriesId).gte("scheduled_at", iso(part[0])).lte("scheduled_at", iso(part[part.length - 1]));
    if (error) throw new Error(`load captures: ${error.message}`);
    for (const c of data as CaptureRow[]) existing.set(Date.parse(c.scheduled_at), c);
  }

  const missing = slots.filter((t) => !existing.has(t));
  const inserted: CaptureRow[] = [];
  for (let i = 0; i < missing.length; i += 100) {
    const rows = missing.slice(i, i + 100).map((t) => ({
      series_id: seriesId,
      scheduled_at: iso(t),
      source: "scheduled",
      task_id: crypto.randomUUID(),
      status: "submitted",
      attempts: 1,
      submitted_at: iso(Date.now()),
    }));
    const { data, error } = await d.admin.from("captures").upsert(rows, { onConflict: "series_id,scheduled_at", ignoreDuplicates: true })
      .select("id, scheduled_at, status, task_id, source");
    if (error) throw new Error(`insert captures: ${error.message}`);
    inserted.push(...(data as CaptureRow[]));
  }
  // Earlier runs' captures that never got their postback are delivered again (ingest is idempotent).
  const stranded = [...existing.values()].filter((c) => c.status === "submitted" && c.task_id && DEMO_TASK_ID.test(c.task_id));
  const toPost = [...inserted, ...stranded].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  console.log(`${slots.length} slots over ${days} days: ${existing.size} already captured, ${inserted.length} new, ${stranded.length} re-delivered`);

  const postbackUrl = `${d.functionsUrl}/dataforseo-postback?secret=${encodeURIComponent(d.postbackSecret)}`;
  const totals: Record<string, number> = {};
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < toPost.length) {
      const c = toPost[next++];
      const at = new Date(c.scheduled_at);
      const posted = {
        keyword: series.keyword,
        location_code: series.location_code,
        language_code: series.language_code,
        device: series.device,
        os: series.device === "mobile" ? "android" : "windows",
        depth: 20,
        load_async_ai_overview: true,
        priority: 1,
        tag: c.id,
        postback_url: postbackUrl,
        postback_data: "advanced",
      };
      const result = serpResult({ keyword: series.keyword, location_code: series.location_code, language_code: series.language_code, device: series.device, at });
      try {
        const res = await fetch(postbackUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "content-encoding": "gzip" },
          body: await gzipJson(postbackBody(c.task_id ?? crypto.randomUUID(), posted, result)),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
        for (const [k, v] of Object.entries(body)) if (typeof v === "number") totals[k] = (totals[k] ?? 0) + v;
      } catch (e) {
        failed++;
        console.error(`  postback for ${c.scheduled_at} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (toPost.length) console.log(`postbacks: ${JSON.stringify(totals)}${failed ? `, ${failed} failed` : ""}`);
  return slots;
}

/** Alternates submit-batches and collect-batches until no snapshot of the series is pending or submitted. */
export async function runExtraction(d: Demo, seriesId: string) {
  const open = () => d.count("snapshots", (q) => q.eq("series_id", seriesId).in("extraction", ["pending", "submitted"]));
  let left = await open();
  for (let round = 1; round <= 40 && left > 0; round++) {
    const submitted = await d.cron("submit-batches");
    await sleep(500);
    const collected = await d.cron("collect-batches");
    const before = left;
    left = await open();
    console.log(`round ${round}: ${left} snapshot(s) still pending or submitted  submit=${brief(submitted)} collect=${brief(collected)}`);
    if (left === before && round >= 5) await sleep(1500);
  }
  const failed = await d.count("snapshots", (q) => q.eq("series_id", seriesId).eq("extraction", "failed"));
  if (left) console.warn(`extraction did not finish: ${left} snapshot(s) open, ${failed} failed`);
  else console.log(`extraction done${failed ? ` (${failed} failed)` : ""}`);
}

function brief(x: unknown): string {
  const s = JSON.stringify(x);
  return s.length > 160 ? s.slice(0, 157) + "..." : s;
}

/** Runs build-reports with batch rounds until every report of the query is ready or failed (20 rounds). */
export async function runReports(d: Demo, trackedQueryId: string, seriesId: string) {
  const reports = async () => {
    const { data, error } = await d.admin.from("reports").select("id, kind, stage, error, page_urls, renders, brief_checks")
      .eq("tracked_query_id", trackedQueryId).order("created_at");
    if (error) throw new Error(`load reports: ${error.message}`);
    return data as { id: string; kind: string; stage: string; error: string | null; page_urls: string[]; renders: number; brief_checks: any }[];
  };
  console.log(`build-reports: ${brief(await d.cron("build-reports"))}`);
  let list = await reports();
  // Reports are created from history alone, so none now means none after more rounds either.
  for (let round = 1; round <= 20 && list.length; round++) {
    if (list.every((r) => r.stage === "ready" || r.stage === "failed")) break;
    await d.cron("submit-batches");
    await sleep(500);
    await d.cron("collect-batches");
    await d.cron("build-reports");
    list = await reports();
    console.log(`round ${round}: ${list.map((r) => `${r.kind}=${r.stage}`).join(", ")}`);
  }
  if (!list.length) {
    const { data } = await d.admin.from("snapshots").select("captured_at").eq("series_id", seriesId).neq("status", "error").order("captured_at").limit(1);
    const first = data?.[0]?.captured_at;
    const days = first ? (Date.now() - Date.parse(first)) / DAY_MS : 0;
    console.warn(`no report: history is ${days.toFixed(1)} days (a preliminary report needs 3, the full report 7)`);
    return list;
  }
  for (const r of list) {
    if (r.stage === "ready") {
      const checks = r.brief_checks?.checks?.filter((c: any) => !c.passed).map((c: any) => c.name) ?? [];
      console.log(`${r.kind} report ready (${r.renders} renders, ${r.page_urls.length} pages)${checks.length ? `; failed checks: ${checks.join(", ")}` : ""}`);
      continue;
    }
    console.warn(`${r.kind} report is at stage ${r.stage}${r.error ? `: ${r.error}` : ""}`);
    if (r.page_urls.length) {
      const { data: pages } = await d.admin.from("pages").select("url_key, parse_status, tag_status, parse_error").in("url_key", r.page_urls);
      for (const p of pages ?? []) console.warn(`  ${p.url_key}: parse ${p.parse_status}, tag ${p.tag_status}${p.parse_error ? ` (${p.parse_error})` : ""}`);
    }
    const { data: items } = await d.admin.from("batch_items").select("kind, status, error").eq("status", "failed").limit(5);
    for (const it of items ?? []) console.warn(`  failed ${it.kind} batch item: ${it.error}`);
  }
  return list;
}

/** detect-platform-events for every completed back-filled day. */
export async function platformEvents(d: Demo, slots: number[]) {
  const today = new Date().toISOString().slice(0, 10);
  const days = [...new Set(slots.map((t) => iso(t).slice(0, 10)))].filter((day) => day < today).sort();
  let events = 0;
  for (const day of days) {
    const r = await d.cron("detect-platform-events", { day });
    if (r?.event) events++;
  }
  console.log(`checked ${days.length} day(s): ${events} platform event(s)`);
}

export async function summary(d: Demo, trackedQueryId: string, seriesId: string, reports: { kind: string; stage: string }[]) {
  const renders = await d.count("snapshots", (q) => q.eq("series_id", seriesId).neq("status", "error"));
  const present = await d.count("snapshots", (q) => q.eq("series_id", seriesId).eq("status", "present"));
  const groups = await d.count("claim_groups", (q) => q.eq("series_id", seriesId).is("merged_into", null));
  const merged = await d.count("claim_groups", (q) => q.eq("series_id", seriesId).not("merged_into", "is", null));
  const { data: ents } = await d.admin.from("entities").select("name, aliases").eq("series_id", seriesId).is("merged_into", null).order("created_at");
  const cited = await d.count("own_matches", (q) => q.eq("tracked_query_id", trackedQueryId).not("level", "is", null));
  const brand = await d.count("own_matches", (q) => q.eq("tracked_query_id", trackedQueryId).eq("brand_mentioned", true));
  const { data: events } = await d.admin.from("citation_events").select("kind").eq("tracked_query_id", trackedQueryId);
  const eventCounts: Record<string, number> = {};
  for (const e of events ?? []) eventCounts[e.kind] = (eventCounts[e.kind] ?? 0) + 1;

  step("Summary");
  const rows: [string, string][] = [
    ["renders", `${renders} (${present} with an overview, ${renders ? Math.round((present / renders) * 100) : 0}%)`],
    ["claim groups", `${groups}${merged ? ` (+${merged} merged)` : ""}`],
    ["entities", `${ents?.length ?? 0}: ${(ents ?? []).slice(0, 8).map((e: any) => e.aliases?.length ? `${e.name} (${e.aliases.join(", ")})` : e.name).join(", ")}${(ents?.length ?? 0) > 8 ? ", ..." : ""}`],
    ["reports", reports.map((r) => `${r.kind}: ${r.stage}`).join(", ") || "none"],
    ["own page", `cited in ${cited} render(s), brand named in ${brand}; events ${JSON.stringify(eventCounts)}`],
    ["app", `${Deno.env.get("APP_URL") ?? "http://localhost:3000"}/queries/${trackedQueryId}  (sign in as ${EMAIL} / ${PASSWORD})`],
  ];
  for (const [k, v] of rows) console.log(`${k.padEnd(13)} ${v}`);
}

async function main() {
  const args = parseArgs(Deno.args);
  const d = new Demo();
  console.log(`Legiit Overviews demo: "${args.keyword}", ${args.days} days, functions at ${d.functionsUrl}`);
  await checkMock();

  step("Demo user");
  await signIn(d);

  step("Add query");
  const tq = await addQuery(d, args.keyword);

  step("Back-fill captures through dataforseo-postback");
  const slots = await backfill(d, tq.series_id, args.days);

  step("Extraction (submit-batches / collect-batches)");
  await runExtraction(d, tq.series_id);

  step("Reports (build-reports)");
  const reports = await runReports(d, tq.tracked_query_id, tq.series_id);

  step("Platform events (detect-platform-events)");
  await platformEvents(d, slots);

  step("Own page (set-own-page)");
  const own = demoOwnPage(args.keyword);
  const set = await d.user("set-own-page", { tracked_query_id: tq.tracked_query_id, own_url: own.url, brand_names: [own.brand] });
  console.log(`${own.url} with brand "${own.brand}": parsed ${set.parsed}, ${set.matches} match(es) re-computed`);

  step("A query without an overview");
  await addQuery(d, WATCH_KEYWORD);

  await summary(d, tq.tracked_query_id, tq.series_id, reports);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    console.error(`\ndemo failed: ${e instanceof Error ? e.message : e}`);
    if (e instanceof Error && /HTTP 501|not implemented/i.test(e.message)) console.error("That function is still a stub; deploy its handler and re-run.");
    if (e instanceof Error && /HTTP 401/.test(e.message)) console.error("Check that CRON_SECRET and POSTBACK_SECRET in .env.test match supabase/functions/.env.");
    Deno.exit(1);
  }
}
