// Test support for the Claude batch pipeline: an in-process stub of the Anthropic Message Batches API
// and helpers that seed (and remove) a throwaway series in the local database. Used by *_test.ts only.
import { must, serviceClient } from "../db.ts";
import type { ExtractInput, ExtractOutput } from "../schemas.ts";
import type { ParsedSentence } from "../types.ts";

export type StubOutcome =
  | { type: "succeeded"; output: unknown; stop_reason?: string }
  | { type: "refusal" }
  | { type: "errored"; error_type?: string; message?: string }
  | { type: "expired" }
  | { type: "canceled" };

/** Decides the result of one request; `data` is the parsed JSON between the prompt's <data> tags. */
export type Responder = (customId: string, data: any, params: any) => StubOutcome;

export interface StubBatch {
  id: string;
  requests: { custom_id: string; params: any }[];
  created_at: string;
}

export interface StubAnthropic {
  url: string;
  batches: Map<string, StubBatch>;
  responder: Responder;
  /** When non-zero, batch creation fails with this HTTP status. */
  failCreate: number;
  processing: "in_progress" | "ended";
  /** Emit every result line twice. */
  duplicateLines: boolean;
  /** custom_ids whose result line is left out. */
  dropLines: Set<string>;
  reset(): void;
}

let stub: StubAnthropic | null = null;

const JSON_HEADERS = { "content-type": "application/json" };

/** The prompt's <data> JSON. */
export function dataOf(params: any): any {
  const content = params?.messages?.[0]?.content;
  const text = typeof content === "string" ? content : content?.map((b: any) => b.text ?? "").join("") ?? "";
  const m = /<data>\n?([\s\S]*?)\n?<\/data>/.exec(text);
  return m ? JSON.parse(m[1]) : null;
}

function message(model: string, text: string, stopReason: string) {
  return {
    id: `msg_stub_${crypto.randomUUID().slice(0, 8)}`,
    type: "message",
    role: "assistant",
    model,
    content: text ? [{ type: "text", text, citations: null }] : [],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 800 },
  };
}

function resultLine(s: StubAnthropic, req: { custom_id: string; params: any }) {
  const o = s.responder(req.custom_id, dataOf(req.params), req.params);
  const model = req.params?.model ?? "stub";
  switch (o.type) {
    case "succeeded":
      return { custom_id: req.custom_id, result: { type: "succeeded", message: message(model, JSON.stringify(o.output), o.stop_reason ?? "end_turn") } };
    case "refusal":
      return { custom_id: req.custom_id, result: { type: "succeeded", message: message(model, "", "refusal") } };
    case "errored":
      return {
        custom_id: req.custom_id,
        result: { type: "errored", error: { type: "error", error: { type: o.error_type ?? "api_error", message: o.message ?? "stub error" } } },
      };
    default:
      return { custom_id: req.custom_id, result: { type: o.type } };
  }
}

function batchObject(s: StubAnthropic, b: StubBatch) {
  const ended = s.processing === "ended";
  return {
    id: b.id,
    type: "message_batch",
    processing_status: ended ? "ended" : "in_progress",
    request_counts: { processing: ended ? 0 : b.requests.length, succeeded: ended ? b.requests.length : 0, errored: 0, canceled: 0, expired: 0 },
    created_at: b.created_at,
    ended_at: ended ? new Date().toISOString() : null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    archived_at: null,
    cancel_initiated_at: null,
    results_url: ended ? `${s.url}/v1/messages/batches/${b.id}/results` : null,
  };
}

/**
 * Starts (once per process) a stub of POST /v1/messages/batches, GET /v1/messages/batches/{id},
 * its results JSONL and cancel, and points ANTHROPIC_BASE_URL at it. Call before the first Claude call.
 */
export function stubAnthropic(): StubAnthropic {
  if (stub) return stub;
  const s: StubAnthropic = {
    url: "",
    batches: new Map(),
    responder: () => ({ type: "errored", message: "no responder set" }),
    failCreate: 0,
    processing: "ended",
    duplicateLines: false,
    dropLines: new Set(),
    reset() {
      this.responder = () => ({ type: "errored", message: "no responder set" });
      this.failCreate = 0;
      this.processing = "ended";
      this.duplicateLines = false;
      this.dropLines = new Set();
    },
  };
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const path = new URL(req.url).pathname;
    const m = /^\/v1\/messages\/batches(?:\/([^/]+)(?:\/(results|cancel))?)?$/.exec(path);
    if (!m) return new Response(JSON.stringify({ type: "error", error: { type: "not_found_error", message: path } }), { status: 404, headers: JSON_HEADERS });
    const [, id, sub] = m;
    if (req.method === "POST" && !id) {
      const body = await req.json();
      if (s.failCreate) {
        return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "stub refused the batch" } }), {
          status: s.failCreate,
          headers: JSON_HEADERS,
        });
      }
      const b: StubBatch = { id: `msgbatch_stub_${crypto.randomUUID().replaceAll("-", "")}`, requests: body.requests, created_at: new Date().toISOString() };
      s.batches.set(b.id, b);
      return new Response(JSON.stringify({ ...batchObject(s, b), processing_status: "in_progress", results_url: null }), { headers: JSON_HEADERS });
    }
    const b = id ? s.batches.get(id) : undefined;
    if (!b) return new Response(JSON.stringify({ type: "error", error: { type: "not_found_error", message: `no batch ${id}` } }), { status: 404, headers: JSON_HEADERS });
    if (req.method === "POST" && sub === "cancel") return new Response(JSON.stringify(batchObject(s, b)), { headers: JSON_HEADERS });
    if (req.method === "GET" && !sub) return new Response(JSON.stringify(batchObject(s, b)), { headers: JSON_HEADERS });
    if (req.method === "GET" && sub === "results") {
      const lines: string[] = [];
      for (const r of b.requests) {
        if (s.dropLines.has(r.custom_id)) continue;
        const line = JSON.stringify(resultLine(s, r));
        lines.push(line);
        if (s.duplicateLines) lines.push(line);
      }
      return new Response(lines.join("\n") + "\n", { headers: { "content-type": "application/binary" } });
    }
    return new Response("method not allowed", { status: 405 });
  });
  server.unref();
  s.url = `http://127.0.0.1:${server.addr.port}`;
  Deno.env.set("ANTHROPIC_BASE_URL", s.url);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) Deno.env.set("ANTHROPIC_API_KEY", "test-key");
  stub = s;
  return s;
}

// ------------------------------------------------------------------ canned outputs

/** Entity names the extract stub recognises, longest first so "Tally Forms" wins over "Tally". */
export const STUB_ENTITY_NAMES = ["Google Forms", "Tally Forms", "Typeform", "Jotform", "Tally"];

const labelKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[\s.]+$/, "").trim();

/**
 * A deterministic stand-in for task A: one claim per sentence (matched to a known claim with the
 * same label, else a new label equal to the sentence), entities from STUB_ENTITY_NAMES.
 */
export function extractEcho(input: ExtractInput): ExtractOutput {
  const claims: ExtractOutput["claims"] = input.sentences.filter((s) => s.kind !== "heading").map((s) => {
    const known = input.known_claims.find((c) => labelKey(c.label) === labelKey(s.text));
    return { sentence: s.i, text: s.text, type: "fact", group_ref: known?.ref ?? null, new_label: known ? null : s.text };
  });
  const entities = new Map<string, ExtractOutput["entities"][number]>();
  for (const s of input.sentences) {
    let text = s.text;
    for (const name of STUB_ENTITY_NAMES) {
      const re = new RegExp(`\\b${name}\\b`);
      if (!re.test(text)) continue;
      text = text.replace(re, " ");
      const known = input.known_entities.find((e) =>
        e.name.toLowerCase() === name.toLowerCase() || e.aliases.some((a) => a.toLowerCase() === name.toLowerCase())
      );
      const prev = entities.get(name);
      const role = /\bbest\b/i.test(s.text) ? "recommended" : "mentioned";
      if (prev) {
        prev.sentences.push(s.i);
        if (role === "recommended") prev.role = role;
      } else {
        entities.set(name, { entity_ref: known?.ref ?? null, name, role, label: role === "recommended" ? "best option" : null, sentences: [s.i] });
      }
    }
  }
  return { claims, entities: [...entities.values()], format_labels: ["bullets"], answer_lead_sentence: input.sentences[0]?.i ?? null };
}

// ------------------------------------------------------------------ seeding

export const TEST_PREFIX = "claude-pipeline";

/** Sentences as ingest writes them: [text, citation indexes]. */
export function sentences(...rows: [string, number[]][]): ParsedSentence[] {
  return rows.map(([text, citations], i) => ({ i, text, block: i, kind: "list_item", citations }));
}

/** A series nobody captures (next_capture_at far in the future). */
export async function seedSeries(label: string): Promise<string> {
  const row = must(
    await serviceClient().from("series").insert({
      keyword: `${TEST_PREFIX} ${label} ${crypto.randomUUID().slice(0, 8)}`,
      location_code: 2840,
      language_code: "en",
      device: "desktop",
      next_capture_at: "2999-01-01T00:00:00Z",
    }).select("id").single(),
    "seed series",
  ) as { id: string };
  return row.id;
}

let clock = Date.parse("2026-09-01T00:00:00Z");

export async function seedSnapshot(seriesId: string, opts: {
  sentences: ParsedSentence[];
  extraction?: string;
  same_as?: string | null;
  captured_at?: string;
}): Promise<string> {
  clock += 3 * 3600_000;
  const row = must(
    await serviceClient().from("snapshots").insert({
      series_id: seriesId,
      captured_at: opts.captured_at ?? new Date(clock).toISOString(),
      status: "present",
      sentences: opts.sentences,
      content_hash: crypto.randomUUID(),
      same_as: opts.same_as ?? null,
      formats: { word_count: 20, has_table: false, list_items: opts.sentences.length, headings: 0, sentences: opts.sentences.length },
      extraction: opts.extraction ?? "pending",
    }).select("id").single(),
    "seed snapshot",
  ) as { id: string };
  return row.id;
}

/** A confirmed auth user for tracked queries. */
export async function seedUser(): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `${TEST_PREFIX}-${crypto.randomUUID().slice(0, 8)}@example.com`,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`seed user: ${error?.message}`);
  return data.user.id;
}

/** Removes everything a test created. */
export async function cleanup(opts: { seriesIds?: string[]; batchIds?: string[]; pageKeys?: string[]; userIds?: string[] }): Promise<void> {
  const db = serviceClient();
  if (opts.batchIds?.length) must(await db.from("batches").delete().in("id", opts.batchIds), "delete batches");
  for (const id of opts.seriesIds ?? []) {
    must(await db.from("batch_items").delete().eq("target_id", id), "delete series batch items");
    must(await db.from("tracked_queries").delete().eq("series_id", id), "delete tracked queries");
    must(await db.from("series").delete().eq("id", id), "delete series");
  }
  if (opts.pageKeys?.length) must(await db.from("pages").delete().in("url_key", opts.pageKeys), "delete pages");
  for (const id of opts.userIds ?? []) await db.auth.admin.deleteUser(id);
}

/** Every batch id the stub has created (for cleanup). */
export function stubBatchIds(s: StubAnthropic): string[] {
  return [...s.batches.keys()];
}
