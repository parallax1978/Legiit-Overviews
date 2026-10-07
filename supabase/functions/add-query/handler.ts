// add-query: validates and normalises the keyword, joins or creates the shared series per device,
// captures it live when the series has no snapshot from the last 3 hours, and creates (or unpauses)
// the caller's tracked query. Suggests sibling queries that trigger an overview when one device had none.
import { type DfsTask, relatedKeywords, serpLive } from "../_shared/dataforseo.ts";
import { must, serviceClient } from "../_shared/db.ts";
import { fail, json, requireUser } from "../_shared/http.ts";
import { ingestTask } from "../_shared/ingest.ts";
import { keywordProblem, normalizeKeyword } from "../_shared/normalize.ts";

const DEVICES = ["desktop", "mobile"] as const;
type Device = typeof DEVICES[number];
const HOUR_MS = 3_600_000;
const RECENT_MS = 3 * HOUR_MS;
const MAX_SIBLINGS = 10;

interface SeriesKey {
  keyword: string;
  location_code: number;
  language_code: string;
  device: Device;
}

export interface DeviceResult {
  device: Device;
  tracked_query_id: string;
  series_id: string;
  status: string;
  is_new_series: boolean;
  overview_present: boolean;
  capture_error?: string;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail("method not allowed", 405);
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("body must be JSON");
  }
  const raw = typeof body?.keyword === "string" ? body.keyword : "";
  const problem = keywordProblem(raw);
  if (problem) return fail(problem);
  const keyword = normalizeKeyword(raw);
  if (!keyword) return fail("Enter a keyword.");

  const locationCode = Number(body?.location_code);
  if (!Number.isInteger(locationCode)) return fail("location_code must be a DataForSEO location code.");
  const db = serviceClient();
  const location = must(
    await db.from("locations").select("code, default_language").eq("code", locationCode).maybeSingle(),
    "load location",
  ) as { code: number; default_language: string } | null;
  if (!location) return fail("Unknown location.");
  const languageCode = typeof body?.language_code === "string" && body.language_code.trim()
    ? body.language_code.trim()
    : location.default_language;
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(languageCode)) return fail("Unknown language_code.");

  const devices = Array.isArray(body?.devices) ? [...new Set(body.devices)] : [];
  if (!devices.length || !devices.every((d): d is Device => DEVICES.includes(d as Device))) {
    return fail("devices must list desktop, mobile or both.");
  }

  const display = raw.trim().replace(/\s+/g, " ");
  const results = await Promise.all(
    devices.map((device) =>
      addDevice(auth.user.id, display, { keyword, location_code: locationCode, language_code: languageCode, device })
    ),
  );
  const siblings = results.some((r) => !r.overview_present) ? await findSiblings(keyword, locationCode, languageCode) : [];
  return json({ results, siblings });
}

async function addDevice(userId: string, display: string, key: SeriesKey): Promise<DeviceResult> {
  const db = serviceClient();
  const inserted = must(
    await db.from("series").upsert(
      { ...key, next_capture_at: new Date(Date.now() + Math.random() * RECENT_MS).toISOString() },
      { onConflict: "keyword,location_code,language_code,device", ignoreDuplicates: true },
    ).select("id"),
    "create series",
  ) as { id: string }[];
  const series = inserted[0] ?? must(await db.from("series").select("id").match(key).single(), "load series") as { id: string };

  let latest = await latestSnapshot(series.id);
  // The tracked query exists before any DataForSEO call, so a failed capture never loses it.
  const tq = await ensureTrackedQuery(userId, series.id, display, latest?.status === "present");

  let captureError: string | undefined;
  if (!latest || Date.parse(latest.captured_at) < Date.now() - RECENT_MS) {
    captureError = await liveCapture(series.id, key);
    latest = await latestSnapshot(series.id);
  }
  const current = must(await db.from("tracked_queries").select("status").eq("id", tq.id).single(), "load tracked query") as { status: string };
  return {
    device: key.device,
    tracked_query_id: tq.id,
    series_id: series.id,
    status: current.status,
    is_new_series: inserted.length > 0,
    overview_present: latest?.status === "present",
    ...(captureError ? { capture_error: captureError } : {}),
  };
}

/** Latest render that is not an error. */
async function latestSnapshot(seriesId: string): Promise<{ status: string; captured_at: string } | null> {
  return must(
    await serviceClient().from("snapshots").select("status, captured_at").eq("series_id", seriesId).neq("status", "error")
      .order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    "load latest snapshot",
  ) as { status: string; captured_at: string } | null;
}

async function ensureTrackedQuery(userId: string, seriesId: string, display: string, present: boolean): Promise<{ id: string }> {
  const db = serviceClient();
  const status = present ? "tracking" : "watching";
  const inserted = must(
    await db.from("tracked_queries").upsert(
      { user_id: userId, series_id: seriesId, display_keyword: display, status },
      { onConflict: "user_id,series_id", ignoreDuplicates: true },
    ).select("id"),
    "create tracked query",
  ) as { id: string }[];
  if (inserted[0]) return inserted[0];
  const existing = must(
    await db.from("tracked_queries").select("id, status").match({ user_id: userId, series_id: seriesId }).single(),
    "load tracked query",
  ) as { id: string; status: string };
  if (existing.status === "paused" || (existing.status === "watching" && present)) {
    must(await db.from("tracked_queries").update({ status }).eq("id", existing.id).eq("status", existing.status), "resume tracked query");
  }
  return existing;
}

/** Live SERP capture through the normal ingest path. Returns an error message when it failed. */
async function liveCapture(seriesId: string, key: SeriesKey): Promise<string | undefined> {
  const db = serviceClient();
  const now = Date.now();
  const rows = must(
    await db.from("captures").upsert(
      {
        series_id: seriesId,
        scheduled_at: new Date(Math.floor(now / 1000) * 1000).toISOString(),
        source: "live",
        status: "submitted",
        attempts: 1,
        submitted_at: new Date(now).toISOString(),
      },
      { onConflict: "series_id,scheduled_at", ignoreDuplicates: true },
    ).select("id"),
    "create capture",
  ) as { id: string }[];
  if (!rows[0]) return undefined; // another request is capturing this series this very second
  const captureId = rows[0].id;

  let task: DfsTask;
  try {
    task = await serpLive({ ...key, tag: captureId });
  } catch (e) {
    // Left pending: the sweeper resubmits it through the scheduled queue.
    const message = e instanceof Error ? e.message : String(e);
    must(await db.from("captures").update({ status: "pending", last_error: message.slice(0, 1000) }).eq("id", captureId), "mark capture pending");
    return message;
  }
  if (task?.id) must(await db.from("captures").update({ task_id: task.id }).eq("id", captureId), "store task id");
  const r = await ingestTask(captureId, task);
  return r.status === "retry" || r.status === "error" ? `${task?.status_code} ${task?.status_message ?? ""}`.trim() : undefined;
}

async function findSiblings(keyword: string, locationCode: number, languageCode: string): Promise<{ keyword: string; search_volume: number | null }[]> {
  try {
    const { related } = await relatedKeywords(keyword, locationCode, languageCode);
    const seen = new Set([keyword]);
    return related
      .filter((r) => r.has_ai_overview)
      .sort((a, b) => (b.search_volume ?? -1) - (a.search_volume ?? -1))
      .filter((r) => {
        const k = normalizeKeyword(r.keyword);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, MAX_SIBLINGS)
      .map((r) => ({ keyword: r.keyword, search_volume: r.search_volume }));
  } catch (e) {
    console.error("related keywords:", e instanceof Error ? e.message : e);
    return [];
  }
}
