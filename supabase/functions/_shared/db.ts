// Service-role Supabase client for Edge Functions (bypasses RLS). Never expose to the browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.ts";

let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl(), env.serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** Throws when a Supabase call returned an error; returns data otherwise. */
export function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}
