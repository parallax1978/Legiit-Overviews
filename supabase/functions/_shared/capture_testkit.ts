// Test support for the capture and tracking tests: a stub DataForSEO server, throwaway users, test
// series and captures, and cleanup. Imported by *_test.ts files only.
import { createClient } from "@supabase/supabase-js";
import type { DfsTask } from "./dataforseo.ts";
import { must, serviceClient } from "./db.ts";
import { env } from "./env.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);

/** One DataForSEO task `result[0]` from a fixture envelope. */
export function fixtureResult(name: string): any {
  return JSON.parse(Deno.readTextFileSync(new URL(name, FIXTURES))).tasks[0].result[0];
}

/** A task as DataForSEO posts it back: status 20000, data.tag = capture id, result from a fixture. */
export function okTask(captureId: string, result: any, keyword = result?.keyword ?? "keyword"): DfsTask {
  return {
    id: crypto.randomUUID(),
    status_code: 20000,
    status_message: "Ok.",
    data: { api: "serp", function: "task_get", se: "google", se_type: "organic", keyword, tag: captureId },
    result: [result],
  };
}

export interface StubOptions {
  /** SERP result for a keyword; null fails the task (40501); "fail" fails the whole request (40200). */
  serp?: (keyword: string, device: string) => any | null | "fail";
  /** Related keywords for the Labs call: [keyword, search_volume, has_ai_overview]. */
  related?: (keyword: string) => [string, number | null, boolean][];
  /** Markdown per URL for content_parsing; a missing URL answers HTTP 404. */
  pages?: Record<string, string>;
  /** Delay before each Live answer, for tests that overlap requests. */
  liveDelayMs?: number;
}

export interface StubDfs {
  url: string;
  calls: { method: string; path: string; body: any }[];
  /** task_post tasks by task id. */
  posted: Map<string, any>;
  /** task_get answers: a status code per task id (e.g. 40602 in queue, 40501 error). Default 20000. */
  taskGetStatus: Map<string, number>;
  count(path: string): number;
  close(): Promise<void>;
}

/** Starts a stub DataForSEO API on a free port and points DATAFORSEO_BASE_URL at it. */
export function startStubDfs(opts: StubOptions = {}): StubDfs {
  const calls: StubDfs["calls"] = [];
  const posted = new Map<string, any>();
  const taskGetStatus = new Map<string, number>();
  const serp = opts.serp ?? ((keyword: string) => ({ ...fixtureResult("synthetic-form-builders.json"), keyword }));
  const envelope = (tasks: unknown[]) => Response.json({ version: "stub", status_code: 20000, status_message: "Ok.", tasks });
  const serpTask = (data: any, status = 20000) => {
    const result = status === 20000 ? serp(data.keyword, data.device) : null;
    if (result === "fail") return "fail" as const;
    return result === null
      ? { id: crypto.randomUUID(), status_code: status === 20000 ? 40501 : status, status_message: "Invalid Field.", data, result: null }
      : { id: crypto.randomUUID(), status_code: 20000, status_message: "Ok.", data, result: [{ ...result, datetime: dfsNow() }] };
  };

  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, async (req) => {
    const path = new URL(req.url).pathname;
    const body = req.method === "POST" ? await req.json() : null;
    calls.push({ method: req.method, path, body });

    if (path === "/v3/serp/google/organic/live/advanced") {
      if (opts.liveDelayMs) await new Promise((r) => setTimeout(r, opts.liveDelayMs));
      const task = serpTask(body[0]);
      if (task === "fail") return Response.json({ status_code: 40200, status_message: "Payment Required.", tasks: [] });
      return envelope([task]);
    }
    if (path === "/v3/serp/google/organic/task_post") {
      return envelope(body.map((data: any) => {
        const id = crypto.randomUUID();
        posted.set(id, data);
        return { id, status_code: 20100, status_message: "Task Created.", data, result: null };
      }));
    }
    const get = path.match(/^\/v3\/serp\/google\/organic\/task_get\/advanced\/(.+)$/);
    if (get) {
      const id = decodeURIComponent(get[1]);
      const data = posted.get(id);
      if (!data) return envelope([{ id, status_code: 40400, status_message: "Not Found.", data: {}, result: null }]);
      const status = taskGetStatus.get(id) ?? 20000;
      if (status !== 20000) return envelope([{ id, status_code: status, status_message: "Stub status.", data, result: null }]);
      const task = serpTask(data);
      return task === "fail" ? Response.json({ status_code: 50000, status_message: "Internal Error.", tasks: [] }) : envelope([{ ...task, id }]);
    }
    if (path === "/v3/dataforseo_labs/google/related_keywords/live") {
      const seed = body[0].keyword;
      const rows = opts.related?.(seed) ?? [];
      const kd = (keyword: string, volume: number | null, ai: boolean) => ({
        keyword,
        keyword_info: { search_volume: volume },
        serp_info: { serp_item_types: ai ? ["organic", "ai_overview"] : ["organic"] },
      });
      const items = rows.map(([k, v, ai]) => ({ se_type: "google", keyword_data: kd(k, v, ai), depth: 1, related_keywords: [] }));
      return envelope([{ id: crypto.randomUUID(), status_code: 20000, status_message: "Ok.", data: body[0], result: [{ seed_keyword: seed, seed_keyword_data: null, items }] }]);
    }
    if (path === "/v3/on_page/content_parsing/live") {
      const url = body[0].url;
      const md = opts.pages?.[url];
      const item = { type: "content_parsing_element", status_code: md === undefined ? 404 : 200, page_content: null, page_as_markdown: md ?? null };
      return envelope([{ id: crypto.randomUUID(), status_code: 20000, status_message: "Ok.", data: body[0], result: [{ items: [item] }] }]);
    }
    return new Response("not found", { status: 404 });
  });

  Deno.env.set("DATAFORSEO_BASE_URL", `http://127.0.0.1:${server.addr.port}`);
  return {
    url: `http://127.0.0.1:${server.addr.port}`,
    calls,
    posted,
    taskGetStatus,
    count: (p: string) => calls.filter((c) => c.path === p).length,
    close: () => server.shutdown(),
  };
}

/** The current time in DataForSEO's datetime format, as a real SERP result carries it. */
function dfsNow(): string {
  return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " +00:00");
}

export const LIVE_PATH = "/v3/serp/google/organic/live/advanced";
export const TASK_POST_PATH = "/v3/serp/google/organic/task_post";
export const RELATED_PATH = "/v3/dataforseo_labs/google/related_keywords/live";

export interface TestUser {
  id: string;
  email: string;
  jwt: string;
}

/** A confirmed user signed in with a password, for calling user functions with a real JWT. */
export async function createUser(label: string): Promise<TestUser> {
  const email = `capture-${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await serviceClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create user: ${error?.message}`);
  const anon = createClient(env.supabaseUrl(), env.anonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error || !session.data.session) throw new Error(`sign in: ${session.error?.message}`);
  return { id: data.user.id, email, jwt: session.data.session.access_token };
}

/** A client that acts as the user (RLS applies). */
export function userClient(user: TestUser) {
  return createClient(env.supabaseUrl(), env.anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.jwt}` } },
  });
}

/** A keyword no other test or agent uses. */
export function uniqueKeyword(label: string): string {
  return `capture test ${label} ${crypto.randomUUID().slice(0, 8)}`;
}

export async function createSeries(keyword: string, fields: Record<string, unknown> = {}): Promise<{ id: string }> {
  return must(
    await serviceClient().from("series").insert({
      keyword,
      location_code: 2840,
      language_code: "en",
      device: "desktop",
      next_capture_at: new Date(Date.now() + 3_600_000).toISOString(),
      ...fields,
    }).select("id").single(),
    "create series",
  ) as { id: string };
}

export async function createCapture(seriesId: string, fields: Record<string, unknown> = {}): Promise<{ id: string }> {
  return must(
    await serviceClient().from("captures").insert({
      series_id: seriesId,
      scheduled_at: new Date().toISOString(),
      status: "submitted",
      attempts: 1,
      submitted_at: new Date().toISOString(),
      ...fields,
    }).select("id").single(),
    "create capture",
  ) as { id: string };
}

export async function createTrackedQuery(userId: string, seriesId: string, fields: Record<string, unknown> = {}): Promise<{ id: string }> {
  return must(
    await serviceClient().from("tracked_queries").insert({
      user_id: userId,
      series_id: seriesId,
      display_keyword: "Test keyword",
      status: "tracking",
      ...fields,
    }).select("id").single(),
    "create tracked query",
  ) as { id: string };
}

/** Deletes users (their tracked queries, events and notifications cascade), series and raw files. */
export async function cleanup(users: TestUser[], seriesIds: string[]): Promise<void> {
  const db = serviceClient();
  if (seriesIds.length) {
    must(await db.from("tracked_queries").delete().in("series_id", seriesIds), "delete tracked queries");
    for (const id of seriesIds) {
      const { data } = await db.storage.from("raw").list(id);
      if (data?.length) await db.storage.from("raw").remove(data.map((f) => `${id}/${f.name}`));
    }
    must(await db.from("snapshots").update({ same_as: null }).in("series_id", seriesIds), "unlink snapshots");
    must(await db.from("series").delete().in("id", seriesIds), "delete series");
  }
  for (const u of users) await db.auth.admin.deleteUser(u.id);
}

/** Series ids for keywords, for cleaning up rows a function created. */
export async function seriesIdsFor(keywords: string[]): Promise<string[]> {
  if (!keywords.length) return [];
  const rows = must(await serviceClient().from("series").select("id").in("keyword", keywords), "find series") as { id: string }[];
  return rows.map((r) => r.id);
}

export function cronRequest(fn: string, body?: unknown): Request {
  return new Request(`http://localhost/${fn}`, {
    method: "POST",
    headers: { "x-cron-secret": env.cronSecret(), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function userRequest(fn: string, user: TestUser | null, body: unknown): Request {
  return new Request(`http://localhost/${fn}`, {
    method: "POST",
    headers: { ...(user ? { Authorization: `Bearer ${user.jwt}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
