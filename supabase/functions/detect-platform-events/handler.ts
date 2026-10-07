// detect-platform-events (cron, daily): computes the day's Google-wide AI Overview metrics across
// every series, records a platform event when one moves far outside its recent range, and raises
// "lost" citation events, held back on platform-event days so a Google-wide shift is not reported
// as the user's loss.
import { must, serviceClient } from "../_shared/db.ts";
import { fail, json, requireCron } from "../_shared/http.ts";

const DAY_MS = 86_400_000;
/** Trailing days the day is compared with, and how many of them must exist. */
export const BASELINE_DAYS = 14;
export const MIN_BASELINE_DAYS = 7;
/** A shift must exceed this many standard deviations and this absolute change. */
export const SIGMAS = 3;
export const MIN_CHANGE: Record<PlatformMetric, number> = {
  presence_rate: 0.1,
  citations_per_render: 1,
  domain_turnover: 0.1,
};
/** Days with fewer renders across all series are too small to judge. */
export const MIN_RENDERS = 20;

export type PlatformMetric = "presence_rate" | "citations_per_render" | "domain_turnover";
const METRICS: PlatformMetric[] = ["presence_rate", "citations_per_render", "domain_turnover"];

export interface PlatformDaily {
  day: string;
  series_count: number;
  renders: number;
  presence_rate: number | null;
  citations_per_render: number | null;
  domain_turnover: number | null;
}

export interface Baseline {
  value: number | null;
  mean: number | null;
  sd: number | null;
  days: number;
  shifted: boolean;
}

export interface DetectSummary {
  day: string;
  metrics: PlatformDaily;
  baseline: Record<PlatformMetric, Baseline> | null;
  shifted: PlatformMetric[];
  event: boolean;
  platform_notifications: number;
  lost: number;
  held: number;
  lost_notifications: number;
}

export interface DetectOptions {
  day?: string;
  now?: Date;
  /** Limits lost-event checks and platform-event notifications to these tracked queries (tests). */
  trackedQueryIds?: string[];
}

function yesterday(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/** Compares each metric with the trailing days; a shift is beyond SIGMAS deviations and MIN_CHANGE. */
export function compareWithBaseline(today: PlatformDaily, history: PlatformDaily[]): Record<PlatformMetric, Baseline> {
  const out = {} as Record<PlatformMetric, Baseline>;
  for (const m of METRICS) {
    const values = history.map((h) => num(h[m])).filter((v): v is number => v !== null);
    const value = num(today[m]);
    if (values.length < 2 || value === null) {
      out[m] = { value, mean: null, sd: null, days: values.length, shifted: false };
      continue;
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
    const delta = Math.abs(value - mean);
    out[m] = {
      value,
      mean: round(mean),
      sd: round(sd),
      days: values.length,
      shifted: delta > SIGMAS * sd && delta >= MIN_CHANGE[m],
    };
  }
  return out;
}

function round(x: number): number {
  return Math.round(x * 10000) / 10000;
}

const LABELS: Record<PlatformMetric, string> = {
  presence_rate: "how often an AI Overview appears",
  citations_per_render: "sources cited per overview",
  domain_turnover: "share of cited sites that are new this week",
};

function fmt(m: PlatformMetric, v: number | null): string {
  if (v === null) return "n/a";
  return m === "citations_per_render" ? v.toFixed(1) : `${Math.round(v * 100)}%`;
}

function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export async function detectPlatformEvents(opts: DetectOptions = {}): Promise<DetectSummary> {
  const db = serviceClient();
  const now = opts.now ?? new Date();
  const day = opts.day ?? yesterday(now);
  const scope = opts.trackedQueryIds ?? null;

  // 1. The day's platform metrics (upserted into platform_daily).
  const metrics = must(await db.rpc("compute_platform_daily", { p_day: day }), "compute_platform_daily") as PlatformDaily;

  // 2. Compare with the trailing days.
  const history = must(
    await db.from("platform_daily").select("*").gte("day", addDays(day, -BASELINE_DAYS)).lt("day", day).order("day"),
    "load platform history",
  ) as PlatformDaily[];
  const summary: DetectSummary = {
    day, metrics, baseline: null, shifted: [], event: false, platform_notifications: 0, lost: 0, held: 0, lost_notifications: 0,
  };
  if (history.length >= MIN_BASELINE_DAYS && metrics.renders >= MIN_RENDERS) {
    summary.baseline = compareWithBaseline(metrics, history);
    summary.shifted = METRICS.filter((m) => summary.baseline![m].shifted);
  }

  // 3. Record the event once and tell every user with an active query.
  if (summary.shifted.length) {
    const inserted = must(
      await db.from("platform_events")
        .upsert({ day, metrics: { ...metrics, baseline: summary.baseline, shifted: summary.shifted } }, { onConflict: "day", ignoreDuplicates: true })
        .select("id"),
      "record platform event",
    ) as { id: string }[];
    summary.event = true;
    if (inserted.length) summary.platform_notifications = await notifyPlatformEvent(day, summary, scope);
  }

  // 4. Lost citations, held back when Google changed overviews that day or the day before.
  const ref = new Date(Math.min(now.getTime(), Date.parse(`${addDays(day, 1)}T00:00:00Z`)));
  const candidates = must(
    await db.rpc("lost_candidates", { p_ref: ref.toISOString(), p_tracked_query_ids: scope }),
    "lost_candidates",
  ) as { tracked_query_id: string; user_id: string; display_keyword: string; latest_snapshot_id: string; present_renders: number }[];
  if (candidates.length) {
    const events = must(
      await db.from("platform_events").select("day").in("day", [day, addDays(day, -1)]),
      "load platform events",
    ) as { day: string }[];
    const held = events.length > 0;
    for (const c of candidates) {
      must(
        await db.from("citation_events").insert({
          tracked_query_id: c.tracked_query_id, snapshot_id: c.latest_snapshot_id, kind: "lost", held_for_platform_event: held,
        }),
        "insert lost event",
      );
      summary.lost++;
      if (held) {
        summary.held++;
        continue;
      }
      must(
        await db.from("notifications").insert({
          user_id: c.user_id,
          tracked_query_id: c.tracked_query_id,
          kind: "lost",
          title: `Your page dropped out of the AI Overview for “${c.display_keyword}”`,
          body: `None of the ${c.present_renders} AI Overviews captured in the last 2 days cited your page. We'll tell you if it comes back.`,
          link: `/queries/${c.tracked_query_id}/tracking`,
        }),
        "insert lost notification",
      );
      summary.lost_notifications++;
    }
  }

  return summary;
}

async function notifyPlatformEvent(day: string, summary: DetectSummary, scope: string[] | null): Promise<number> {
  const db = serviceClient();
  let q = db.from("tracked_queries").select("user_id").neq("status", "paused");
  if (scope) q = q.in("id", scope);
  const rows = must(await q, "load users") as { user_id: string }[];
  const users = [...new Set(rows.map((r) => r.user_id))];
  if (!users.length) return 0;
  const changes = summary.shifted.map((m) => {
    const b = summary.baseline![m];
    return `${LABELS[m]} moved to ${fmt(m, b.value)} (usually ${fmt(m, b.mean)})`;
  });
  const title = `Google changed AI Overviews on ${longDay(day)}`;
  const body = `Across every query we track, ${changes.join("; ")}. Lost-citation alerts for that day are held back so a Google-wide change isn't reported as your loss.`;
  for (let i = 0; i < users.length; i += 500) {
    must(
      await db.from("notifications").insert(users.slice(i, i + 500).map((user_id) => ({ user_id, kind: "platform_event", title, body, link: "/queries" }))),
      "insert platform notifications",
    );
  }
  return users.length;
}

export async function handle(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;
  let day: string | undefined;
  const text = await req.text();
  if (text.trim()) {
    let body: { day?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return fail("Send a JSON body.");
    }
    if (body?.day !== undefined && body.day !== null) {
      if (typeof body.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.day) || Number.isNaN(Date.parse(`${body.day}T00:00:00Z`))) {
        return fail('day must be "YYYY-MM-DD".');
      }
      day = body.day;
    }
  }
  return json(await detectPlatformEvents({ day }));
}
