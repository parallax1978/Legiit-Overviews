// HTTP helpers shared by Edge Functions.
import { createClient, type User } from "@supabase/supabase-js";
import { env } from "./env.ts";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

/** For scheduled functions invoked by pg_cron/pg_net: requires the x-cron-secret header. */
export function requireCron(req: Request): Response | null {
  const got = req.headers.get("x-cron-secret");
  if (!got || got !== env.cronSecret()) return fail("unauthorized", 401);
  return null;
}

/** For functions called by the app with the user's session: returns the user or a 401 response. */
export async function requireUser(req: Request): Promise<{ user: User } | { response: Response }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { response: fail("unauthorized", 401) };
  const client = createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { response: fail("unauthorized", 401) };
  return { user: data.user };
}

/** Wraps a handler so thrown errors become 500 JSON responses and are logged. */
export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    try {
      return await fn(req);
    } catch (e) {
      console.error(e);
      return fail(e instanceof Error ? e.message : String(e), 500);
    }
  };
}
