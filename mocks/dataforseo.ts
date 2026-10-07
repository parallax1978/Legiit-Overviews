// Mock DataForSEO routes: SERP live/task_post/task_get, Labs related keywords and On-Page content
// parsing, with response envelopes shaped like the real API (see _shared/fixtures/). task_post keeps
// tasks in memory and POSTs each result, gzip-compressed, to the task's postback_url after a delay.
// The envelope helpers are exported so scripts/demo.ts can build postbacks exactly the same way.

import {
  canHaveOverview,
  pageContent,
  pageFor,
  pageMarkdown,
  relatedKeywordsFor,
  seedKeywordInfo,
  serpResult,
} from "./scenario.ts";

const VERSION = "0.1.20260901";

/** One task in a DataForSEO response envelope. */
export interface DfsTaskOut {
  id: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  result_count: number;
  path: string[];
  data: Record<string, unknown>;
  result: unknown[] | null;
}

/** The top-level envelope every endpoint returns. */
export function envelope(tasks: DfsTaskOut[], status_code = 20000, status_message = "Ok."): Record<string, unknown> {
  return {
    version: VERSION,
    status_code,
    status_message,
    time: `${(0.05 + tasks.length * 0.01).toFixed(4)} sec.`,
    cost: Math.round(tasks.reduce((a, t) => a + t.cost, 0) * 1e6) / 1e6,
    tasks_count: tasks.length,
    tasks_error: tasks.filter((t) => t.status_code >= 40000).length,
    tasks,
  };
}

export function taskOut(
  id: string,
  status_code: number,
  status_message: string,
  path: string[],
  data: Record<string, unknown>,
  result: unknown[] | null,
  cost = 0,
): DfsTaskOut {
  return { id, status_code, status_message, time: "0.0123 sec.", cost, result_count: result?.length ?? 0, path, data, result };
}

/** DataForSEO-style task id: "MMDDHHmm-1535-0066-0000-<12 hex>". */
export function newTaskId(at = new Date()): string {
  const iso = at.toISOString();
  const head = iso.slice(5, 7) + iso.slice(8, 10) + iso.slice(11, 13) + iso.slice(14, 16);
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `${head}-1535-0066-0000-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const SERP_DATA = { api: "serp", se: "google", se_type: "organic" };

/** The `data` DataForSEO echoes for a SERP task: the posted parameters plus api/function fields. */
export function serpTaskData(fn: string, posted: Record<string, unknown>): Record<string, unknown> {
  return { ...SERP_DATA, function: fn, ...posted };
}

/**
 * The body DataForSEO POSTs to a postback_url (postback_data "advanced"): one task with its original
 * parameters (including tag) in `data` and the SERP result.
 */
export function postbackBody(id: string, posted: Record<string, unknown>, result: unknown): Record<string, unknown> {
  return envelope([
    taskOut(id, 20000, "Ok.", ["v3", "serp", "google", "organic", "task_get", "advanced", id], serpTaskData("task_get", posted), [result], 0.0012),
  ]);
}

/** gzip-compresses a JSON document, as DataForSEO does for postbacks. */
export async function gzipJson(body: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([JSON.stringify(body)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface DataForSeoMockOptions {
  /** Send postbacks for task_post tasks (MOCK_POSTBACK != "off"). */
  postback: boolean;
  /** Delay before a posted task is ready and its postback is sent. */
  postbackDelayMs: number;
  quiet: boolean;
}

interface StoredTask {
  id: string;
  posted: Record<string, unknown>;
  postedAt: number;
  readyAt: number;
  result: Record<string, unknown>;
  postback: "none" | "pending" | "sent" | "failed";
}

const MAX_TASKS = 5000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function readTasks(req: Request): Promise<Record<string, unknown>[] | null> {
  try {
    const body = await req.json();
    return Array.isArray(body) ? body : body && typeof body === "object" ? [body] : null;
  } catch {
    return null;
  }
}

function missingSerpField(t: Record<string, unknown>): string | null {
  if (typeof t.keyword !== "string" || !t.keyword.trim()) return "keyword";
  if (t.location_code === undefined && t.location_name === undefined && t.location_coordinate === undefined) return "location_code";
  if (t.language_code === undefined && t.language_name === undefined) return "language_code";
  return null;
}

function serpParams(t: Record<string, unknown>, at: Date) {
  return {
    keyword: String(t.keyword),
    location_code: typeof t.location_code === "number" ? t.location_code : 2840,
    language_code: typeof t.language_code === "string" ? t.language_code : "en",
    device: t.device === "mobile" ? "mobile" : "desktop",
    at,
  };
}

/** Routes under /v3 plus counters for /__mock/state. */
export function createDataForSeoMock(opts: DataForSeoMockOptions) {
  const tasks = new Map<string, StoredTask>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const inflight = new Set<Promise<void>>();
  const counters = {
    live: 0,
    task_post_requests: 0,
    tasks_posted: 0,
    task_get: 0,
    postbacks_sent: 0,
    postbacks_failed: 0,
    related_keywords: 0,
    content_parsing: 0,
  };
  const log = (...a: unknown[]) => {
    if (!opts.quiet) console.log("[dataforseo]", ...a);
  };

  function remember(task: StoredTask) {
    tasks.set(task.id, task);
    if (tasks.size > MAX_TASKS) tasks.delete(tasks.keys().next().value!);
  }

  async function sendPostback(task: StoredTask): Promise<void> {
    const raw = String(task.posted.postback_url);
    const url = raw.replaceAll("$id", task.id).replaceAll("$tag", encodeURIComponent(String(task.posted.tag ?? "")));
    try {
      const body = await gzipJson(postbackBody(task.id, task.posted, task.result));
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "content-encoding": "gzip" },
        body,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
      task.postback = "sent";
      counters.postbacks_sent++;
      log(`postback ${task.id} tag=${task.posted.tag ?? "-"} -> ${res.status}`);
    } catch (e) {
      task.postback = "failed";
      counters.postbacks_failed++;
      console.error(`[dataforseo] postback failed for task ${task.id} (tag ${task.posted.tag ?? "-"}) to ${url}: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function sendPingback(task: StoredTask): Promise<void> {
    const url = String(task.posted.pingback_url).replaceAll("$id", task.id).replaceAll("$tag", encodeURIComponent(String(task.posted.tag ?? "")));
    try {
      const res = await fetch(url);
      await res.body?.cancel();
    } catch (e) {
      console.error(`[dataforseo] pingback failed for task ${task.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  function schedule(task: StoredTask) {
    const wantsPostback = opts.postback && typeof task.posted.postback_url === "string";
    const wantsPingback = opts.postback && typeof task.posted.pingback_url === "string";
    if (!wantsPostback && !wantsPingback) return;
    task.postback = wantsPostback ? "pending" : "none";
    const timer = setTimeout(() => {
      timers.delete(timer);
      const p = (async () => {
        if (wantsPostback) await sendPostback(task);
        if (wantsPingback) await sendPingback(task);
      })();
      inflight.add(p);
      p.finally(() => inflight.delete(p));
    }, Math.max(0, task.readyAt - Date.now()));
    timers.add(timer);
  }

  async function live(req: Request): Promise<Response> {
    const posted = await readTasks(req);
    if (!posted?.length) return json(envelope([], 40000, "Invalid request body."), 400);
    counters.live++;
    const now = new Date();
    const out = posted.map((t) => {
      const id = newTaskId(now);
      const path = ["v3", "serp", "google", "organic", "live", "advanced"];
      const missing = missingSerpField(t);
      if (missing) return taskOut(id, 40501, `Invalid Field: '${missing}'.`, path, serpTaskData("live", t), null);
      log(`live "${t.keyword}" ${t.device ?? "desktop"}`);
      return taskOut(id, 20000, "Ok.", path, serpTaskData("live", t), [serpResult(serpParams(t, now))], 0.004);
    });
    return json(envelope(out));
  }

  async function taskPost(req: Request): Promise<Response> {
    const posted = await readTasks(req);
    if (!posted?.length) return json(envelope([], 40000, "Invalid request body."), 400);
    if (posted.length > 100) return json(envelope([], 40000, "You can set only 100 tasks per request."), 400);
    counters.task_post_requests++;
    const now = new Date();
    const out = posted.map((t) => {
      const id = newTaskId(now);
      const path = ["v3", "serp", "google", "organic", "task_post"];
      const missing = missingSerpField(t);
      if (missing) return taskOut(id, 40501, `Invalid Field: '${missing}'.`, path, serpTaskData("task_post", t), null);
      const task: StoredTask = {
        id,
        posted: t,
        postedAt: now.getTime(),
        readyAt: now.getTime() + opts.postbackDelayMs,
        result: serpResult(serpParams(t, now)),
        postback: "none",
      };
      remember(task);
      schedule(task);
      counters.tasks_posted++;
      return taskOut(id, 20100, "Task Created.", path, serpTaskData("task_post", t), null, 0.0012);
    });
    log(`task_post ${out.length} task(s)`);
    return json(envelope(out));
  }

  function taskGet(id: string): Response {
    counters.task_get++;
    const path = ["v3", "serp", "google", "organic", "task_get", "advanced", id];
    const task = tasks.get(id);
    if (!task) return json(envelope([taskOut(id, 40400, "Not Found.", path, {}, null)]));
    if (Date.now() < task.readyAt) return json(envelope([taskOut(id, 40602, "Task In Queue.", path, serpTaskData("task_get", task.posted), null)]));
    return json(envelope([taskOut(id, 20000, "Ok.", path, serpTaskData("task_get", task.posted), [task.result], 0)]));
  }

  async function relatedKeywords(req: Request): Promise<Response> {
    const posted = await readTasks(req);
    if (!posted?.length) return json(envelope([], 40000, "Invalid request body."), 400);
    counters.related_keywords++;
    const out = posted.map((t) => {
      const id = newTaskId();
      const path = ["v3", "dataforseo_labs", "google", "related_keywords", "live"];
      const data = { api: "dataforseo_labs", function: "related_keywords", se_type: "google", ...t };
      if (typeof t.keyword !== "string" || !t.keyword.trim()) return taskOut(id, 40501, "Invalid Field: 'keyword'.", path, data, null);
      const location = typeof t.location_code === "number" ? t.location_code : 2840;
      const language = typeof t.language_code === "string" ? t.language_code : "en";
      const limit = typeof t.limit === "number" ? t.limit : 100;
      const seed = seedKeywordInfo(t.keyword);
      const seedData = keywordData(String(t.keyword), location, language, seed.search_volume, seed.ai_overview);
      const related = relatedKeywordsFor(t.keyword);
      // Like the real API, items[0] is the seed itself at depth 0, followed by its siblings at depth 1.
      const items = [
        { se_type: "google", keyword_data: seedData, depth: 0, related_keywords: related.slice(0, 8).map((x) => x.keyword) },
        ...related.map((r) => ({
          se_type: "google",
          keyword_data: keywordData(r.keyword, location, language, r.search_volume, r.ai_overview),
          depth: 1,
          related_keywords: related.filter((x) => x !== r).slice(0, 4).map((x) => x.keyword),
        })),
      ].slice(0, Math.max(1, limit));
      return taskOut(id, 20000, "Ok.", path, data, [{
        se_type: "google",
        seed_keyword: t.keyword,
        seed_keyword_data: t.include_seed_keyword ? seedData : null,
        location_code: location,
        language_code: language,
        total_count: related.length + 1,
        items_count: items.length,
        items,
      }], 0.0103);
    });
    log(`related_keywords "${posted[0].keyword}"`);
    return json(envelope(out));
  }

  async function contentParsing(req: Request): Promise<Response> {
    const posted = await readTasks(req);
    if (!posted?.length) return json(envelope([], 40000, "Invalid request body."), 400);
    counters.content_parsing++;
    const out = posted.map((t) => {
      const id = newTaskId();
      const path = ["v3", "on_page", "content_parsing", "live"];
      const data = { api: "on_page", function: "content_parsing", ...t };
      let valid = typeof t.url === "string";
      try {
        if (valid) new URL(String(t.url));
      } catch {
        valid = false;
      }
      if (!valid) return taskOut(id, 40501, "Invalid Field: 'url'.", path, data, null);
      const page = pageFor(String(t.url));
      log(`content_parsing ${t.url}`);
      return taskOut(id, 20000, "Ok.", path, data, [{
        crawl_progress: "finished",
        crawl_status: null,
        items_count: 1,
        items: [{
          type: "content_parsing_element",
          fetch_time: new Date().toISOString().slice(0, 19).replace("T", " ") + " +00:00",
          status_code: 200,
          page_content: pageContent(page),
          page_as_markdown: t.markdown_view === false ? null : pageMarkdown(page),
        }],
      }], 0.000125);
    });
    return json(envelope(out));
  }

  /** Handles a /v3 request; returns null for paths it doesn't own. */
  async function handle(req: Request, path: string): Promise<Response | null> {
    if (!path.startsWith("/v3/")) return null;
    if (!/^Basic\s+\S+/i.test(req.headers.get("authorization") ?? "")) {
      return json(envelope([], 40100, "You are not authorized to access this resource."), 401);
    }
    if (req.method === "POST" && path === "/v3/serp/google/organic/live/advanced") return await live(req);
    if (req.method === "POST" && path === "/v3/serp/google/organic/task_post") return await taskPost(req);
    const get = path.match(/^\/v3\/serp\/google\/organic\/task_get\/advanced\/([^/]+)$/);
    if (req.method === "GET" && get) return taskGet(decodeURIComponent(get[1]));
    if (req.method === "POST" && path === "/v3/dataforseo_labs/google/related_keywords/live") return await relatedKeywords(req);
    if (req.method === "POST" && path === "/v3/on_page/content_parsing/live") return await contentParsing(req);
    return json(envelope([], 40400, "Not Found."), 404);
  }

  function state() {
    const byPostback = { none: 0, pending: 0, sent: 0, failed: 0 };
    let ready = 0;
    const now = Date.now();
    for (const t of tasks.values()) {
      byPostback[t.postback]++;
      if (now >= t.readyAt) ready++;
    }
    return { ...counters, tasks_stored: tasks.size, tasks_ready: ready, tasks_by_postback: byPostback };
  }

  /** Cancels pending postbacks and waits for in-flight ones (tests call this before exiting). */
  async function close(): Promise<void> {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    await Promise.allSettled([...inflight]);
  }

  return { handle, state, close };
}

function keywordData(keyword: string, location: number, language: string, volume: number, aiOverview: boolean) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8 - i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, search_volume: volume };
  });
  const serpTypes = ["organic", "people_also_ask", "related_searches", "video", "images"];
  if (aiOverview) serpTypes.splice(0, 0, "ai_overview");
  return {
    se_type: "google",
    keyword,
    location_code: location,
    language_code: language,
    keyword_info: {
      se_type: "google",
      last_updated_time: "2026-10-01 08:12:44 +00:00",
      competition: 0.62,
      competition_level: "MEDIUM",
      cpc: 6.4,
      search_volume: volume,
      low_top_of_page_bid: 2.1,
      high_top_of_page_bid: 9.8,
      categories: [10007, 10019],
      monthly_searches: months,
      search_volume_trend: { monthly: 0, quarterly: 5, yearly: 12 },
    },
    clickstream_keyword_info: null,
    keyword_properties: {
      se_type: "google",
      core_keyword: null,
      synonym_clustering_algorithm: "text_processing",
      keyword_difficulty: 48,
      detected_language: language,
      is_another_language: false,
    },
    serp_info: {
      se_type: "google",
      check_url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=100&hl=${language}&gl=US&gws_rd=cr&ie=UTF-8&oe=UTF-8&glp=1`,
      serp_item_types: serpTypes,
      se_results_count: 120000000,
      last_updated_time: "2026-09-28 03:41:10 +00:00",
      previous_updated_time: "2026-08-14 22:09:51 +00:00",
    },
    avg_backlinks_info: null,
    search_intent_info: {
      se_type: "google",
      main_intent: canHaveOverview(keyword) ? "commercial" : "navigational",
      foreign_intent: ["informational"],
      last_updated_time: "2026-03-02 03:54:21 +00:00",
    },
    keyword_info_normalized_with_bing: null,
    keyword_info_normalized_with_clickstream: null,
  };
}
