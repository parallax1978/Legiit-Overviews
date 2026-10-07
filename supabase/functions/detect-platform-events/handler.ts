// detect-platform-events (cron, daily): computes the day's Google-wide AI Overview metrics across
// every series, records a platform event when one moves far outside its recent range, and raises
// "lost" citation events, held back on platform-event days so a Google-wide shift is not reported
// as the user's loss and released (with their alert) on the first quiet day the page is still out.
import { must, serviceClient } from "../_shared/db.ts";
import { fail, json, requireCron } from "../_shared/http.ts";
import { selectAll } from "../_shared/tracking.ts";

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
/** Days with fewer renders, or fewer series, across the pool are too small to stand for Google. */
export const MIN_RENDERS = 20;
export const MIN_SERIES = 20;
/** The least spread citations_per_render is given; the two rates use their day's sampling noise. */
export const MIN_SD_CITATIONS = 0.25;

export type PlatformMetric = "presence_rate" | "citations_per_render" | "domain_turnover";
const METRICS: PlatformMetric[] = ["presence_rate", "citations_per_render", "domain_turnover"];

export interface PlatformDaily {
  day: string;
  series_count: number;
  renders: number;
  /** (series, domain) pairs domain_turnover is a share of. */
  pairs: number | null;
  presence_rate: number | null;
  citations_per_render: number | null;
  domain_turnover: number | null;
}

export interface Baseline {
  value: number | null;
  mean: number | null;
  sd: number | null;
  /** The spread the day is judged against when the baseline's sd is smaller than its sampling noise. */
  noise: number | null;
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
  released: number;
  lost_notifications: number;
}

export interface DetectOptions {
  day?: string;
  now?: Date;
  /** Limits lost-event checks and platform-event notifications to these tracked queries (tests). */
  trackedQueryIds?: string[];
}

interface Loss {
  tracked_query_id: string;
  user_id: string;
  display_keyword: string;
  own_url_key: string | null;
  latest_snapshot_id: string;
  present_renders: number;
  held_event_id: string | null;
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

/**
 * The day's own sampling noise around the baseline mean: for the rates the binomial deviation over
 * the day's renders or pairs (the rate smoothed by one success and one failure, so a baseline flat at
 * 0 or 1 still has some), so a flat baseline (sd 0) never turns an ordinary move into a shift.
 */
function noiseFloor(m: PlatformMetric, mean: number, today: PlatformDaily): number {
  if (m === "citations_per_render") return MIN_SD_CITATIONS;
  const n = m === "presence_rate" ? today.renders : today.pairs ?? 0;
  if (!(n > 0)) return 0;
  const p = (Math.min(Math.max(mean, 0), 1) * n + 1) / (n + 2);
  return Math.sqrt(p * (1 - p) / n);
}

/**
 * Whether the day can be judged at all: enough baseline days, and a pool of renders and series large
 * enough to stand for Google rather than for one query's ordinary variation.
 */
export function canJudge(today: PlatformDaily, history: PlatformDaily[]): boolean {
  return history.length >= MIN_BASELINE_DAYS && today.renders >= MIN_RENDERS && today.series_count >= MIN_SERIES;
}

/** Compares each metric with the trailing days; a shift is beyond SIGMAS deviations (at least the day's noise) and MIN_CHANGE. */
export function compareWithBaseline(today: PlatformDaily, history: PlatformDaily[]): Record<PlatformMetric, Baseline> {
  const out = {} as Record<PlatformMetric, Baseline>;
  for (const m of METRICS) {
    const values = history.map((h) => num(h[m])).filter((v): v is number => v !== null);
    const value = num(today[m]);
    if (values.length < 2 || value === null) {
      out[m] = { value, mean: null, sd: null, noise: null, days: values.length, shifted: false };
      continue;
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
    const noise = noiseFloor(m, mean, today);
    const delta = Math.abs(value - mean);
    out[m] = {
      value,
      mean: round(mean),
      sd: round(sd),
      noise: round(noise),
      days: values.length,
      shifted: delta > SIGMAS * Math.max(sd, noise) && delta >= MIN_CHANGE[m],
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

  // 2. Compare with the trailing days when the pool is large enough to stand for Google.
  const history = must(
    await db.from("platform_daily").select("*").gte("day", addDays(day, -BASELINE_DAYS)).lt("day", day).order("day"),
    "load platform history",
  ) as PlatformDaily[];
  const summary: DetectSummary = {
    day, metrics, baseline: null, shifted: [], event: false, platform_notifications: 0, lost: 0, held: 0, released: 0, lost_notifications: 0,
  };
  if (canJudge(metrics, history)) {
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

  // 4. Lost citations, dated at the end of the day judged, held back when Google changed overviews
  //    that day or the day before. A loss held earlier is released, with its alert, on the first
  //    quiet day the page is still out; a citation in between regains it instead.
  const ref = new Date(Math.min(now.getTime(), Date.parse(`${addDays(day, 1)}T00:00:00Z`)));
  const candidates = await selectAll<Loss>((from, to) =>
    db.rpc("citation_losses", { p_ref: ref.toISOString(), p_tracked_query_ids: scope }).order("tracked_query_id").range(from, to)
  );
  if (candidates.length) {
    const events = must(
      await db.from("platform_events").select("day").in("day", [day, addDays(day, -1)]),
      "load platform events",
    ) as { day: string }[];
    const held = events.length > 0;
    for (const c of candidates) {
      if (c.held_event_id) {
        if (held) continue;
        const released = must(
          await db.from("citation_events")
            .update({ held_for_platform_event: false, snapshot_id: c.latest_snapshot_id, created_at: ref.toISOString() })
            .eq("id", c.held_event_id)
            .eq("held_for_platform_event", true)
            .select("id"),
          "release lost event",
        ) as { id: string }[];
        if (!released.length) continue; // released by a run that overlapped this one
        summary.released++;
      } else {
        must(
          await db.from("citation_events").insert({
            tracked_query_id: c.tracked_query_id,
            snapshot_id: c.latest_snapshot_id,
            kind: "lost",
            own_url_key: c.own_url_key,
            held_for_platform_event: held,
            created_at: ref.toISOString(),
          }),
          "insert lost event",
        );
        summary.lost++;
        if (held) {
          summary.held++;
          continue;
        }
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

/** One notification per user with a non-paused query, written in SQL so no row cap can skip users. */
async function notifyPlatformEvent(day: string, summary: DetectSummary, scope: string[] | null): Promise<number> {
  const changes = summary.shifted.map((m) => {
    const b = summary.baseline![m];
    return `${LABELS[m]} moved to ${fmt(m, b.value)} (usually ${fmt(m, b.mean)})`;
  });
  const title = `Google changed AI Overviews on ${longDay(day)}`;
  const body = `Across every query we track, ${changes.join("; ")}. Lost-citation alerts for that day are held back so a Google-wide change isn't reported as your loss.`;
  return must(
    await serviceClient().rpc("platform_event_notifications", { p_title: title, p_body: body, p_tracked_query_ids: scope }),
    "platform notifications",
  ) as number;
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
