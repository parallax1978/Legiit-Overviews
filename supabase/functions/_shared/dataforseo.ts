// DataForSEO client. Base URL is configurable so local development can point at the mock server.
import { env } from "./env.ts";

export interface SerpTaskParams {
  keyword: string;
  location_code: number;
  language_code: string;
  device: "desktop" | "mobile";
  tag?: string;
}

/** Envelope every DataForSEO endpoint returns. */
export interface DfsResponse<R = unknown> {
  status_code: number;
  status_message: string;
  cost?: number;
  tasks: DfsTask<R>[];
}

export interface DfsTask<R = unknown> {
  id: string;
  status_code: number; // 20000 ok, 20100 created; 40602 in queue; other 4xx/5xx errors
  status_message: string;
  cost?: number;
  data: Record<string, unknown> & { tag?: string; keyword?: string };
  result: R[] | null;
}

export const DFS_OK = 20000;
export const DFS_CREATED = 20100;
/** task_get codes that mean "not ready yet". */
export const DFS_PENDING_CODES = new Set([40601, 40602]);

export class DataForSeoError extends Error {
  constructor(message: string, public readonly code?: number) {
    super(message);
  }
}

function authHeader(): string {
  return "Basic " + btoa(`${env.dataforseoLogin()}:${env.dataforseoPassword()}`);
}

/**
 * One request, retried up to 3 times on 429 (rejected before any work was done). A 5xx is retried
 * only when `retryOn5xx`: a gateway can answer 502 after DataForSEO created and charged the tasks,
 * so task-creating POSTs (task_post, Live) are never sent twice; their captures stay pending and the
 * sweeper resubmits them once.
 */
async function call<R>(method: "GET" | "POST", path: string, body?: unknown, retryOn5xx = method === "GET", attempt = 0): Promise<DfsResponse<R>> {
  const res = await fetch(`${env.dataforseoBaseUrl()}${path}`, {
    method,
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if ((res.status === 429 || (retryOn5xx && res.status >= 500)) && attempt < 3) {
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return call<R>(method, path, body, retryOn5xx, attempt + 1);
  }
  const text = await res.text();
  let parsed: DfsResponse<R>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataForSeoError(`DataForSEO ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  if (!res.ok || parsed.status_code !== DFS_OK) {
    throw new DataForSeoError(`DataForSEO ${path}: ${parsed.status_code} ${parsed.status_message}`, parsed.status_code);
  }
  return parsed;
}

function serpTask(p: SerpTaskParams) {
  return {
    keyword: p.keyword,
    location_code: p.location_code,
    language_code: p.language_code,
    device: p.device,
    os: p.device === "mobile" ? "android" : "windows",
    depth: 20,
    load_async_ai_overview: true,
    ...(p.tag ? { tag: p.tag } : {}),
  };
}

/** Synchronous SERP capture (used when a query is added). Returns the first task. */
export async function serpLive(p: SerpTaskParams): Promise<DfsTask> {
  const r = await call("POST", "/v3/serp/google/organic/live/advanced", [serpTask(p)]);
  return r.tasks[0];
}

/** Queues up to 100 SERP tasks with a postback. Returns tasks in input order. */
export async function serpTaskPost(tasks: SerpTaskParams[], postbackUrl: string): Promise<DfsTask[]> {
  if (tasks.length > 100) throw new Error("serpTaskPost accepts at most 100 tasks");
  const body = tasks.map((t) => ({ ...serpTask(t), priority: 1, postback_url: postbackUrl, postback_data: "advanced" }));
  const r = await call("POST", "/v3/serp/google/organic/task_post", body);
  return r.tasks;
}

/** Fetches a queued task's result. Check task.status_code: DFS_OK, a pending code, or an error. */
export async function serpTaskGet(taskId: string): Promise<DfsTask> {
  const r = await call("GET", `/v3/serp/google/organic/task_get/advanced/${encodeURIComponent(taskId)}`);
  return r.tasks[0];
}

export interface RelatedKeyword {
  keyword: string;
  search_volume: number | null;
  has_ai_overview: boolean;
}

/** Labs related keywords: the seed plus siblings, flagged when Google showed an AI Overview for them. */
export async function relatedKeywords(keyword: string, location_code: number, language_code: string, limit = 50): Promise<{ seed: RelatedKeyword | null; related: RelatedKeyword[] }> {
  // A cheap one-off with no resubmission path: a 5xx is retried, a rare double charge costs less than lost siblings.
  const r = await call<any>("POST", "/v3/dataforseo_labs/google/related_keywords/live", [{
    keyword, location_code, language_code, depth: 1, limit, include_seed_keyword: true,
  }], true);
  const result = r.tasks[0]?.result?.[0];
  const toRk = (kd: any): RelatedKeyword | null => kd ? ({
    keyword: kd.keyword,
    search_volume: kd.keyword_info?.search_volume ?? null,
    has_ai_overview: Array.isArray(kd.serp_info?.serp_item_types) && kd.serp_info.serp_item_types.includes("ai_overview"),
  }) : null;
  const seed = toRk(result?.seed_keyword_data);
  const related = (result?.items ?? []).map((i: any) => toRk(i.keyword_data)).filter(Boolean) as RelatedKeyword[];
  return { seed, related };
}

export interface ParsedPage {
  url: string;
  status_code: number | null;
  page_content: any; // DataForSEO page_content (header, footer, main_topic[], secondary_topic[], ...)
  markdown: string | null; // page_as_markdown
}

/** Parses a page into structured content and markdown. */
export async function contentParsing(url: string): Promise<ParsedPage> {
  // Same as relatedKeywords: cheap, and a page that fails to parse is worse than a rare double charge.
  const r = await call<any>("POST", "/v3/on_page/content_parsing/live", [{
    url, enable_javascript: true, markdown_view: true,
  }], true);
  const task = r.tasks[0];
  if (task.status_code !== DFS_OK) throw new DataForSeoError(`content_parsing ${url}: ${task.status_code} ${task.status_message}`, task.status_code);
  const item = task.result?.[0]?.items?.[0];
  if (!item) throw new DataForSeoError(`content_parsing ${url}: empty result`);
  return {
    url,
    status_code: item.status_code ?? null,
    page_content: item.page_content ?? null,
    markdown: item.page_as_markdown ?? null,
  };
}
