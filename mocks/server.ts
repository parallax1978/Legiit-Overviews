// Local stand-in for DataForSEO (/v3/...) and the Anthropic API (/anthropic/v1/...) on one port.
//
//   deno run -A mocks/server.ts
//
// Env: MOCK_PORT (8787), MOCK_POSTBACK ("off" disables postbacks), MOCK_POSTBACK_DELAY_MS (1500),
// MOCK_BATCH_DELAY_MS (0), MOCK_FAIL_RATE (0, share of batch results returned as errored),
// MOCK_QUIET ("1" silences request logs). GET /__mock/state shows counters.

import { createAnthropicMock } from "./anthropic.ts";
import { createDataForSeoMock } from "./dataforseo.ts";

export interface MockOptions {
  port: number;
  hostname: string;
  postback: boolean;
  postbackDelayMs: number;
  batchDelayMs: number;
  failRate: number;
  quiet: boolean;
}

function num(name: string, fallback: number): number {
  const v = Deno.env.get(name);
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Options from MOCK_* environment variables. */
export function optionsFromEnv(): MockOptions {
  return {
    port: num("MOCK_PORT", 8787),
    hostname: Deno.env.get("MOCK_HOSTNAME") || "0.0.0.0",
    postback: (Deno.env.get("MOCK_POSTBACK") ?? "").toLowerCase() !== "off",
    postbackDelayMs: num("MOCK_POSTBACK_DELAY_MS", 1500),
    batchDelayMs: num("MOCK_BATCH_DELAY_MS", 0),
    failRate: Math.max(0, Math.min(1, num("MOCK_FAIL_RATE", 0))),
    quiet: ["1", "true", "yes"].includes((Deno.env.get("MOCK_QUIET") ?? "").toLowerCase()),
  };
}

const DEFAULTS: MockOptions = { port: 8787, hostname: "0.0.0.0", postback: true, postbackDelayMs: 1500, batchDelayMs: 0, failRate: 0, quiet: false };

/** The request handler with its state; startMockServer wraps it in Deno.serve. */
export function createMockHandler(options: Partial<MockOptions> = {}) {
  const opts = { ...DEFAULTS, ...options };
  const dfs = createDataForSeoMock(opts);
  const anthropic = createAnthropicMock(opts);
  const startedAt = new Date();

  function state() {
    return {
      started_at: startedAt.toISOString(),
      options: { postback: opts.postback, postback_delay_ms: opts.postbackDelayMs, batch_delay_ms: opts.batchDelayMs, fail_rate: opts.failRate },
      dataforseo: dfs.state(),
      anthropic: anthropic.state(),
    };
  }

  async function route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/{2,}/g, "/");
    if (req.method === "GET" && (path === "/health" || path === "/")) return Response.json({ ok: true, service: "legiit-overviews-mock" });
    if (req.method === "GET" && path === "/__mock/state") return Response.json(state());
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const origin = `${proto}://${req.headers.get("host") ?? url.host}`;
    if (path === "/anthropic" || path.startsWith("/anthropic/")) {
      const res = await anthropic.handle(req, path.slice("/anthropic".length), `${origin}/anthropic`);
      if (res) return res;
    } else if (path.startsWith("/v1/")) {
      const res = await anthropic.handle(req, path, origin);
      if (res) return res;
    }
    const res = await dfs.handle(req, path);
    if (res) return res;
    return Response.json({ error: `mock: no route for ${req.method} ${path}` }, { status: 404 });
  }

  async function handler(req: Request): Promise<Response> {
    const t0 = performance.now();
    let res: Response;
    try {
      res = await route(req);
    } catch (e) {
      console.error("[mock]", e);
      res = Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
    if (!opts.quiet) console.log(`[mock] ${req.method} ${new URL(req.url).pathname} ${res.status} ${Math.round(performance.now() - t0)}ms`);
    return res;
  }

  return { handler, state, close: () => dfs.close(), options: opts };
}

export interface MockServer {
  url: string; // http://127.0.0.1:<port>
  port: number;
  state: () => ReturnType<ReturnType<typeof createMockHandler>["state"]>;
  close: () => Promise<void>;
}

/** Starts the mock. Port 0 picks a free port (tests). */
export function startMockServer(options: Partial<MockOptions> = {}): MockServer {
  const mock = createMockHandler(options);
  const server = Deno.serve({
    port: mock.options.port,
    hostname: mock.options.hostname,
    onListen: ({ port }) => {
      if (!mock.options.quiet) console.log(`[mock] DataForSEO at http://127.0.0.1:${port}, Anthropic at http://127.0.0.1:${port}/anthropic`);
    },
  }, mock.handler);
  const port = server.addr.port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    state: mock.state,
    close: async () => {
      await mock.close();
      await server.shutdown();
    },
  };
}

if (import.meta.main) {
  const server = startMockServer(optionsFromEnv());
  const stop = async () => {
    await server.close();
    Deno.exit(0);
  };
  Deno.addSignalListener("SIGINT", stop);
  Deno.addSignalListener("SIGTERM", stop);
}
