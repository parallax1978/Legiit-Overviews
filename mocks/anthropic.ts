// Mock Anthropic Messages and Message Batches API (shapes follow @anthropic-ai/sdk 0.131). Messages
// carry one text block of JSON from fake-claude.ts. Batches end at once or after a delay; results_url
// is absolute and built from the request's Host header, so the SDK's batches.results() works from the
// host (127.0.0.1:8787) and from the edge runtime container (host.docker.internal:8787) alike.

import { exampleFromSchema, fakeOutput, type FakeTask } from "./fake-claude.ts";

export interface AnthropicMockOptions {
  /** How long a batch stays in_progress (MOCK_BATCH_DELAY_MS). */
  batchDelayMs: number;
  /** Share of batch results returned as errored (MOCK_FAIL_RATE). */
  failRate: number;
  quiet: boolean;
}

type Json = Record<string, any>;

interface StoredBatch {
  id: string;
  createdAt: number;
  endsAt: number;
  cancelInitiatedAt: number | null;
  results: { custom_id: string; result: Json }[];
}

function randomId(prefix: string, n = 24): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return prefix + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": randomId("req_mock_"), ...headers },
  });
}

function apiError(status: number, type: string, message: string): Response {
  return json({ type: "error", error: { type, message }, request_id: randomId("req_mock_") }, status);
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b: any) => (typeof b?.text === "string" ? b.text : "")).join("\n");
  return "";
}

/** A message for request bodies the real API would reject, or null. */
function validate(params: Json): string | null {
  if (!params || typeof params !== "object") return "body must be a JSON object";
  if (typeof params.model !== "string" || !params.model) return "model: Field required";
  if (typeof params.max_tokens !== "number" || params.max_tokens < 1) return "max_tokens: Field required";
  if (!Array.isArray(params.messages) || !params.messages.length) return "messages: at least one message is required";
  if (params.stream) return "the mock does not support streaming";
  return null;
}

/** Routes under /v1/messages (mounted at /anthropic) plus counters for /__mock/state. */
export function createAnthropicMock(opts: AnthropicMockOptions) {
  const batches = new Map<string, StoredBatch>();
  const cachedSystems = new Set<string>();
  const counters = {
    messages: 0,
    batches_created: 0,
    batch_requests: 0,
    batch_results_errored: 0,
    by_task: {} as Record<string, number>,
  };
  const log = (...a: unknown[]) => {
    if (!opts.quiet) console.log("[anthropic]", ...a);
  };

  /** Builds a Message for a request body, or throws with an invalid_request_error message. */
  function respond(params: Json, serviceTier: "standard" | "batch"): Json {
    let task: FakeTask | "unknown" | "text" = "text";
    let output: unknown;
    const schema = params.output_config?.format?.schema;
    if (schema) {
      const fake = fakeOutput(params);
      if (fake) {
        task = fake.task;
        output = fake.output;
      } else {
        task = "unknown";
        output = exampleFromSchema(schema);
      }
    }
    counters.by_task[task] = (counters.by_task[task] ?? 0) + 1;
    const text = output === undefined ? "This is the Legiit Overviews mock of the Anthropic API." : JSON.stringify(output);

    const system = textOf(params.system);
    const cached = Array.isArray(params.system) && params.system.some((b: any) => b?.cache_control);
    const systemTokens = Math.ceil(system.length / 4);
    let cacheCreation = 0;
    let cacheRead = 0;
    if (cached && systemTokens) {
      if (cachedSystems.has(system)) cacheRead = systemTokens;
      else {
        cachedSystems.add(system);
        cacheCreation = systemTokens;
      }
    }
    const userTokens = Math.ceil(params.messages.map((m: Json) => textOf(m.content)).join("\n").length / 4) + 8;
    const outputTokens = Math.max(1, Math.ceil(text.length / 3.6));
    return {
      id: randomId("msg_mock_"),
      type: "message",
      role: "assistant",
      model: params.model,
      content: [{ type: "text", text, citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      stop_details: null,
      container: null,
      diagnostics: null,
      usage: {
        input_tokens: userTokens + (cached ? 0 : systemTokens),
        output_tokens: Math.min(outputTokens, params.max_tokens),
        cache_creation_input_tokens: cacheCreation,
        cache_read_input_tokens: cacheRead,
        cache_creation: { ephemeral_5m_input_tokens: cacheCreation, ephemeral_1h_input_tokens: 0 },
        output_tokens_details: { thinking_tokens: 0 },
        inference_geo: "global",
        server_tool_use: null,
        service_tier: serviceTier,
      },
    };
  }

  async function createMessage(req: Request): Promise<Response> {
    let params: Json;
    try {
      params = await req.json();
    } catch {
      return apiError(400, "invalid_request_error", "body is not valid JSON");
    }
    const problem = validate(params);
    if (problem) return apiError(400, "invalid_request_error", problem);
    counters.messages++;
    try {
      const message = respond(params, "standard");
      log(`message ${params.model} -> ${message.usage.output_tokens} output tokens`);
      return json(message);
    } catch (e) {
      return apiError(400, "invalid_request_error", e instanceof Error ? e.message : String(e));
    }
  }

  function batchView(b: StoredBatch, base: string): Json {
    // cancelInitiatedAt is only set while the batch is still in progress, so canceled means ended early.
    const canceled = b.cancelInitiatedAt !== null;
    const ended = canceled || Date.now() >= b.endsAt;
    const counts = { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 };
    for (const r of b.results) {
      if (!ended) counts.processing++;
      else if (canceled) counts.canceled++;
      else counts[r.result.type as "succeeded" | "errored"]++;
    }
    const endedAt = !ended ? null : canceled ? b.cancelInitiatedAt! : b.endsAt;
    return {
      id: b.id,
      type: "message_batch",
      processing_status: ended ? "ended" : "in_progress",
      request_counts: counts,
      created_at: new Date(b.createdAt).toISOString(),
      expires_at: new Date(b.createdAt + 24 * 3600 * 1000).toISOString(),
      ended_at: endedAt === null ? null : new Date(endedAt).toISOString(),
      archived_at: null,
      cancel_initiated_at: b.cancelInitiatedAt === null ? null : new Date(b.cancelInitiatedAt).toISOString(),
      results_url: ended ? `${base}/v1/messages/batches/${b.id}/results` : null,
    };
  }

  async function createBatch(req: Request, base: string): Promise<Response> {
    let body: Json;
    try {
      body = await req.json();
    } catch {
      return apiError(400, "invalid_request_error", "body is not valid JSON");
    }
    const requests = body?.requests;
    if (!Array.isArray(requests) || !requests.length) return apiError(400, "invalid_request_error", "requests: at least one request is required");
    if (requests.length > 100_000) return apiError(400, "invalid_request_error", "requests: at most 100,000 requests per batch");
    const ids = new Set<string>();
    for (const r of requests) {
      if (typeof r?.custom_id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(r.custom_id)) {
        return apiError(400, "invalid_request_error", `requests: invalid custom_id ${JSON.stringify(r?.custom_id)}`);
      }
      if (ids.has(r.custom_id)) return apiError(400, "invalid_request_error", `requests: duplicate custom_id ${r.custom_id}`);
      ids.add(r.custom_id);
      const problem = validate(r.params);
      if (problem) return apiError(400, "invalid_request_error", `requests.${r.custom_id}.params: ${problem}`);
    }
    const id = randomId("msgbatch_mock_");
    const now = Date.now();
    const results = requests.map((r: Json) => {
      if (opts.failRate > 0 && hash01(`${id}|${r.custom_id}`) < opts.failRate) {
        counters.batch_results_errored++;
        return {
          custom_id: r.custom_id,
          result: { type: "errored", error: { type: "error", error: { type: "api_error", message: "Mock failure (MOCK_FAIL_RATE)." }, request_id: null } },
        };
      }
      try {
        return { custom_id: r.custom_id, result: { type: "succeeded", message: respond(r.params, "batch") } };
      } catch (e) {
        counters.batch_results_errored++;
        return {
          custom_id: r.custom_id,
          result: { type: "errored", error: { type: "error", error: { type: "invalid_request_error", message: e instanceof Error ? e.message : String(e) }, request_id: null } },
        };
      }
    });
    const batch: StoredBatch = { id, createdAt: now, endsAt: now + opts.batchDelayMs, cancelInitiatedAt: null, results };
    batches.set(id, batch);
    counters.batches_created++;
    counters.batch_requests += requests.length;
    log(`batch ${id}: ${requests.length} request(s)`);
    return json(batchView(batch, base));
  }

  function results(b: StoredBatch, base: string): Response {
    const view = batchView(b, base);
    if (view.processing_status !== "ended") return apiError(400, "invalid_request_error", `Batch ${b.id} is still processing.`);
    const canceled = b.cancelInitiatedAt !== null;
    const lines = b.results.map((r) => JSON.stringify(canceled ? { custom_id: r.custom_id, result: { type: "canceled" } } : r));
    return new Response(lines.join("\n") + "\n", { headers: { "content-type": "application/binary", "request-id": randomId("req_mock_") } });
  }

  /**
   * Handles a request whose path, with any /anthropic prefix removed, is `path`. `base` is the
   * absolute URL the caller used for the API root (scheme, Host header and prefix).
   */
  async function handle(req: Request, path: string, base: string): Promise<Response | null> {
    if (!path.startsWith("/v1/messages")) return null;
    if (!req.headers.get("x-api-key") && !req.headers.get("authorization")) {
      return apiError(401, "authentication_error", "x-api-key header is required");
    }
    if (req.method === "POST" && path === "/v1/messages") return await createMessage(req);
    if (req.method === "POST" && path === "/v1/messages/batches") return await createBatch(req, base);
    if (req.method === "GET" && path === "/v1/messages/batches") {
      const data = [...batches.values()].reverse().map((b) => batchView(b, base));
      return json({ data, has_more: false, first_id: data[0]?.id ?? null, last_id: data[data.length - 1]?.id ?? null });
    }
    const m = path.match(/^\/v1\/messages\/batches\/([^/]+)(\/results|\/cancel)?$/);
    if (m) {
      const b = batches.get(decodeURIComponent(m[1]));
      if (!b) return apiError(404, "not_found_error", `No batch with id ${m[1]}`);
      if (req.method === "GET" && !m[2]) return json(batchView(b, base));
      if (req.method === "GET" && m[2] === "/results") return results(b, base);
      if (req.method === "POST" && m[2] === "/cancel") {
        if (Date.now() < b.endsAt && b.cancelInitiatedAt === null) b.cancelInitiatedAt = Date.now();
        return json(batchView(b, base));
      }
      if (req.method === "DELETE" && !m[2]) {
        batches.delete(b.id);
        return json({ id: b.id, type: "message_batch_deleted" });
      }
    }
    return apiError(404, "not_found_error", `No route for ${req.method} ${path}`);
  }

  function state() {
    let inProgress = 0;
    const now = Date.now();
    for (const b of batches.values()) if (b.cancelInitiatedAt === null && now < b.endsAt) inProgress++;
    return { ...counters, batches_stored: batches.size, batches_in_progress: inProgress };
  }

  return { handle, state };
}
